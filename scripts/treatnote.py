import asyncio
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Callable, Awaitable

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

"-"  # ------------------------------
"-"  # VÁLTOZÓK
"-"
SELECT2_INPUT_OPEN_SELECTOR = "span.select2-container--open input.select2-search__field"
SELECT2_RESULT_SELECTOR = "li.select2-results__option"

FOG_GYORS_NINCS_TALALAT_MS = 1200
FOG_TOTAL_KERESO_MS = 3500
ALAP_URL_SABLON = "https://{domain}.flexi-dent.hu/hu/"
UJ_AJANLAT_URL_SABLON = "https://{domain}.flexi-dent.hu/hu/complex-offers/new-offer?patient={patient}&source=cardboard"

FLEXI_DOMAIN_FALLBACK = os.environ.get("flexi_domain", "").strip()
FLEXI_USERNAME_FALLBACK = os.environ.get("flexi_username", "").strip()
FLEXI_PW_FALLBACK = os.environ.get("flexi_pw", "").strip()
PACIENS_ID_FALLBACK = os.environ.get("PaciensID", "").strip()

HASZNALJ_HEADLESS = True
VIEWPORT = {"width": 1400, "height": 900}

NAVIGACIOS_TIMEOUT_MS = 6000
KATT_TIMEOUT_MS = 3000

GEPELES_DELAY_MS = 1

Debug = (os.environ.get("TREATNOTE_DEBUG", "0").strip() == "1")
DEBUG_OUT = Debug

LOGS: List[str] = []

# Load credentials dynamically from env or .env/.env.local file
def _load_env_secret(key_name: str, default_val: str = "") -> str:
    val = os.environ.get(key_name, "")
    if val:
        return val.strip()
    
    # Fallback to local files
    for filename in [".env.local", ".env"]:
        for path in [
            filename,
            os.path.join(os.path.dirname(__file__), filename),
            os.path.join(os.path.dirname(__file__), "..", filename)
        ]:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if not line or line.startswith("#"):
                                continue
                            parts = line.split("=", 1)
                            if len(parts) == 2 and parts[0].strip() == key_name:
                                return parts[1].strip().strip('"').strip("'")
                except Exception:
                    pass
    return default_val

# ------------------------------------------------------------
# SUPABASE ERROR REPORTING
# ------------------------------------------------------------
SUPABASE_URL: str = "https://bpjzgapmoyhtgryglcke.supabase.co"
SUPABASE_SERVICE_KEY: str = _load_env_secret("SUPABASE_SERVICE_KEY")

_log_buffer: List[str] = []
_screenshot_buffer: List[tuple] = []  # list of (name, png_bytes)

# Set during runtime for richer error context
_DOMAIN: str = ""
_EMAIL_CTX: str = ""
_PACIENS_CTX: str = ""


def supabase_upload_screenshot(name: str, png_bytes: bytes) -> str:
    """Upload screenshot to Supabase Storage. Returns the path or empty string."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = f"{ts}/{name}.png"
    upload_url = f"{SUPABASE_URL}/storage/v1/object/error-screenshots/{path}"
    try:
        req = urllib.request.Request(
            upload_url,
            data=png_bytes,
            method="POST",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "image/png",
                "x-upsert": "true",
            },
        )
        resp = urllib.request.urlopen(req, timeout=15)
        print(f"[INFO] [UPLOAD] Screenshot: {path} ({resp.status})", flush=True)
        return path
    except Exception as e:
        print(f"[WARN] [UPLOAD] Screenshot hiba: {type(e).__name__}: {str(e)[:200]}", flush=True)
        return ""


def upload_error_report(summary: str, severity: str = "error") -> None:
    """Upload buffered screenshots + full log to Supabase error_logs table."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return

    screenshot_paths = []
    for name, png_bytes in _screenshot_buffer:
        path = supabase_upload_screenshot(name, png_bytes)
        if path:
            screenshot_paths.append(path)

    full_log = "\n".join(_log_buffer)
    screenshot_urls = [
        f"{SUPABASE_URL}/storage/v1/object/error-screenshots/{p}" for p in screenshot_paths
    ]

    metadata = {
        "domain": _DOMAIN or "Unknown",
        "email": _EMAIL_CTX or "Unknown",
        "paciens_id": _PACIENS_CTX or "Unknown",
        "screenshot_count": len(_screenshot_buffer),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    body = json.dumps({
        "script_name": "treatnote.py",
        "domain": _DOMAIN or "Unknown",
        "severity": severity,
        "summary": summary,
        "full_log": full_log,
        "screenshot_urls": screenshot_urls,
        "metadata": metadata,
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/error_logs",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        resp = urllib.request.urlopen(req, timeout=15)
        print(f"[INFO] [UPLOAD] Error log elmentve ({resp.status})", flush=True)
    except Exception as e:
        print(f"[WARN] [UPLOAD] Error log mentés hiba: {type(e).__name__}: {str(e)[:200]}", flush=True)


async def screenshot(page, leiras: str) -> None:
    """Capture screenshot into memory buffer."""
    try:
        png = await page.screenshot(full_page=False)
        _screenshot_buffer.append((leiras, png))
        print(f"[INFO] [SCREENSHOT] {leiras} ({len(png)} bytes)", flush=True)
    except Exception as e:
        print(f"[WARN] [SCREENSHOT] Nem sikerült: {type(e).__name__}: {e}", flush=True)

"-"  # ------------------------------
"-"  # SEGÉDFÜGGVÉNYEK
"-"


def flexi_adatok_kiszedi(payload: Any, argv_domain: str, argv_user: str, argv_pw: str) -> Dict[str, str]:
    if isinstance(payload, dict) and isinstance(payload.get("body"), dict):
        payload = payload["body"]
    domain = (argv_domain or "").strip()
    user = (argv_user or "").strip()
    pw = (argv_pw or "").strip()

    if isinstance(payload, dict):
        v = payload.get("flexi_domain")
        if isinstance(v, str) and v.strip():
            domain = domain or v.strip()

        v = payload.get("flexi_username")
        if isinstance(v, str) and v.strip():
            user = user or v.strip()

        v = payload.get("flexi_pw")
        if isinstance(v, str) and v.strip():
            pw = pw or v.strip()

        for k in ("domain", "flexiDomain", "FLEXI_DOMAIN"):
            v = payload.get(k)
            if isinstance(v, str) and v.strip():
                domain = domain or v.strip()
                break
        for k in ("username", "user", "flexiUser", "FLEXI_USERNAME"):
            v = payload.get(k)
            if isinstance(v, str) and v.strip():
                user = user or v.strip()
                break
        for k in ("password", "pw", "pass", "flexiPass", "FLEXI_PW"):
            v = payload.get(k)
            if isinstance(v, str) and v.strip():
                pw = pw or v.strip()
                break

    if not domain:
        domain = (FLEXI_DOMAIN_FALLBACK or "").strip()
    if not user:
        user = (FLEXI_USERNAME_FALLBACK or "").strip()
    if not pw:
        pw = (FLEXI_PW_FALLBACK or "").strip()

    return {"flexi_domain": domain, "flexi_username": user, "flexi_pw": pw}


async def select2_input_torol_ha_nyitva(page) -> None:
    try:
        inp = page.locator(SELECT2_INPUT_OPEN_SELECTOR).first
        if await inp.count() == 0:
            return
        if not await inp.is_visible():
            return
        await inp.click(timeout=KATT_TIMEOUT_MS)
        await page.keyboard.press("Control+A")
        await page.keyboard.press("Backspace")
    except Exception:
        return


async def select2_bezar(page) -> None:
    try:
        await page.keyboard.press("Escape")
    except Exception:
        pass

def ido_belyeg() -> str:
    return time.strftime("%Y.%m.%d-%H:%M:%S")


def naploz(uzenet: str) -> None:
    ts = ido_belyeg()
    LOGS.append(f"{ts} {uzenet}")


def kiir(szint: str, uzenet: str) -> None:
    if szint == "DEBUG" and not Debug:
        return
    print(f"[{szint}] {ido_belyeg()} {uzenet}")


def normalizal(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def ar_sufix_levag(s: str) -> str:
    return re.sub(r"\s*\(\s*[\d\s.,]+?\s*huf\s*\)\s*$", "", s, flags=re.IGNORECASE).strip()


def tokenek_egyezeshez(s: str) -> List[str]:
    s = normalizal(ar_sufix_levag(s))
    parts = [p for p in re.split(r"[^\wáéíóöőúüű]+", s) if p]
    return [p for p in parts if len(p) >= 3]


def payload_betoltese_stdinbol() -> Any:
    raw = sys.stdin.read()
    if not raw or not raw.strip():
        raise RuntimeError("EMPTY_STDIN")
    return json.loads(raw)


def kicsomagol_payload(j: Any) -> Any:
    if isinstance(j, list) and j and isinstance(j[0], dict):
        elso = j[0]

        if "json" in elso and isinstance(elso["json"], dict):
            return elso["json"]

        if "output" in elso:
            return elso

        return elso

    return j


def vizit_terv_kicsomagolasa(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload

    jeloltek = [
        payload.get("output"),
        payload.get("original"),
        payload.get("output_json"),
        payload.get("outputJson"),
        payload.get("outputJSON"),
        payload,
    ]

    for c in jeloltek:
        if isinstance(c, dict) and any(isinstance(k, str) and k.lower().startswith("vizit_") for k in c.keys()):
            return c

    return payload


def kezeles_nev_tisztit(name: str) -> str:
    if not isinstance(name, str):
        return ""
    s = ar_sufix_levag(name).strip()

    m = re.search(r"\s*\(([^)]{1,60})\)\s*$", s)
    if m:
        inside = normalizal(m.group(1))
        if inside not in ("gratisz", "grátis", "gratis"):
            s = re.sub(r"\s*\([^)]{1,60}\)\s*$", "", s).strip()

    s = re.sub(r"\s+", " ", s).strip()
    return s


def paciens_id_kiszedi(payload: Any, argv_paciens: str) -> str:
    if isinstance(argv_paciens, str) and argv_paciens.strip():
        return argv_paciens.strip().lstrip("#")

    if isinstance(payload, dict):
        for kulcs in ("PaciensID", "paciens_id", "patient_id", "PACIENS_ID"):
            v = payload.get(kulcs)
            if isinstance(v, str) and v.strip():
                return v.strip().lstrip("#")

    fb = (PACIENS_ID_FALLBACK or "").strip().lstrip("#")
    if fb:
        return fb

    return ""


def kivesz_adatokat_vizitenkent(payload: Any) -> List[Dict[str, Any]]:
    if not payload:
        return []

    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        payload = payload[0]

    if not isinstance(payload, dict):
        return []

    if isinstance(payload.get("vizitek"), list):
        items = payload.get("vizitek", [])
        vizit_map: Dict[str, Dict[str, List[str]]] = {}

        for it in items:
            if not isinstance(it, dict):
                continue

            v = it.get("vizit")
            fog = it.get("fog")
            nev = it.get("name")

            if v is None or fog is None or not isinstance(nev, str) or not nev.strip():
                continue

            v_key = str(v).strip()
            fog_key = str(fog).strip()
            if not fog_key.isdigit():
                continue

            nev_tiszta = kezeles_nev_tisztit(nev)
            if not nev_tiszta:
                continue

            vizit_map.setdefault(v_key, {}).setdefault(fog_key, []).append(nev_tiszta)

        def vizit_sort_key(k: str) -> int:
            m = re.search(r"\d+", k)
            return int(m.group()) if m else 0

        vizit_kulcsok = sorted(vizit_map.keys(), key=vizit_sort_key)
        vizitek: List[Dict[str, Any]] = []

        for vk in vizit_kulcsok:
            fog_adatok = vizit_map.get(vk, {})
            if fog_adatok:
                vizitek.append({"vizit": vk, "kezelesek": fog_adatok})

        return vizitek

    plan = vizit_terv_kicsomagolasa(payload)
    if not isinstance(plan, dict):
        return []

    nyers: Dict[str, Any] = {}
    for k, v in plan.items():
        if isinstance(k, str) and k.lower().startswith("vizit_") and isinstance(v, dict):
            nyers[k] = v

    def vizit_sort_key(k: str) -> int:
        m = re.search(r"\d+", k)
        return int(m.group()) if m else 0

    vizit_kulcsok = sorted(nyers.keys(), key=vizit_sort_key)
    vizitek: List[Dict[str, Any]] = []

    for vk in vizit_kulcsok:
        vt = nyers[vk]
        if not isinstance(vt, dict):
            continue

        fog_adatok: Dict[str, List[str]] = {}

        a_schema = False
        for tooth_key, tooth_obj in vt.items():
            if isinstance(tooth_key, str) and tooth_key.isdigit() and isinstance(tooth_obj, dict):
                if isinstance(tooth_obj.get("active_properties"), list):
                    a_schema = True
                    break

        if a_schema:
            for tooth_key, tooth_obj in vt.items():
                if not (isinstance(tooth_key, str) and tooth_key.isdigit() and isinstance(tooth_obj, dict)):
                    continue
                props = tooth_obj.get("active_properties", [])
                if not isinstance(props, list):
                    continue
                tiszt = [kezeles_nev_tisztit(t) for t in props if isinstance(t, str) and t.strip()]
                tiszt = [t for t in tiszt if t]
                if tiszt:
                    fog_adatok[tooth_key] = tiszt

        else:
            for cat, groups in vt.items():
                if cat == "fazis":
                    continue
                if not isinstance(groups, list):
                    continue

                for g in groups:
                    if not isinstance(g, dict):
                        continue

                    fogak = g.get("fogak", [])
                    kez = g.get("kezelesek", [])

                    if not isinstance(fogak, list) or not isinstance(kez, list):
                        continue

                    kez_tiszta = [kezeles_nev_tisztit(x) for x in kez if isinstance(x, str) and x.strip()]
                    kez_tiszta = [x for x in kez_tiszta if x]
                    if not kez_tiszta:
                        continue

                    for f in fogak:
                        f_str = str(f).strip()
                        if not f_str.isdigit():
                            continue
                        fog_adatok.setdefault(f_str, []).extend(kez_tiszta)

        if fog_adatok:
            vizitek.append({"vizit": vk, "kezelesek": fog_adatok})

    return vizitek



def out_json(ok: int, step: str, error: Optional[str] = None, url: Optional[str] = None) -> None:
    resp = {"ok": ok, "step": step}
    if error:
        resp["error"] = error
    if url:
        resp["url"] = url
    if DEBUG_OUT:
        resp["logs"] = LOGS
    print(json.dumps(resp, ensure_ascii=False))


async def ujraprobal(action_name: str, fn: Callable[[], Awaitable[Any]], tries: int = 3, delay_ms: int = 3000):
    last_exc: Optional[Exception] = None
    for attempt in range(1, tries + 1):
        try:
            naploz(f"{action_name} START attempt {attempt}/{tries}")
            kiir("DEBUG", f"{action_name} START attempt {attempt}/{tries}")
            res = await fn()
            naploz(f"{action_name} OK attempt {attempt}/{tries}")
            kiir("DEBUG", f"{action_name} OK attempt {attempt}/{tries}")
            return res
        except Exception as e:
            last_exc = e
            naploz(f"{action_name} FAIL attempt {attempt}/{tries}: {type(e).__name__}: {e}")
            kiir("DEBUG", f"{action_name} FAIL attempt {attempt}/{tries}: {type(e).__name__}: {e}")
            if attempt < tries:
                naploz(f"{action_name} WAIT {delay_ms}ms")
                kiir("DEBUG", f"{action_name} WAIT {delay_ms}ms")
                await asyncio.sleep(delay_ms / 1000)
    raise last_exc if last_exc else RuntimeError(f"{action_name}_UNKNOWN_FAIL")


async def lep(action_name: str, fn: Callable[[], Awaitable[Any]]) -> Any:
    naploz(f"STEP {action_name} ->")
    kiir("DEBUG", f"STEP {action_name} ->")
    try:
        res = await fn()
        naploz(f"STEP {action_name} <- OK")
        kiir("DEBUG", f"STEP {action_name} <- OK")
        return res
    except Exception as e:
        naploz(f"STEP {action_name} <- FAIL {type(e).__name__}: {e}")
        kiir("DEBUG", f"STEP {action_name} <- FAIL {type(e).__name__}: {e}")
        raise


async def gyors_gepeles(loc, szoveg: str) -> None:
    await lep("INPUT wait visible", lambda: loc.wait_for(state="visible", timeout=KATT_TIMEOUT_MS))
    await lep("INPUT click", lambda: loc.click(timeout=KATT_TIMEOUT_MS))
    try:
        await lep("INPUT ctrl+a", lambda: loc.press("Control+A"))
        await lep("INPUT backspace", lambda: loc.press("Backspace"))
    except Exception:
        naploz("INPUT select/clear skipped")
        kiir("DEBUG", "INPUT select/clear skipped")
    await lep("INPUT type", lambda: loc.type(szoveg, delay=GEPELES_DELAY_MS))


async def gyors_gepeles_selector(page, selector: str, szoveg: str) -> None:
    loc = page.locator(selector).first
    await gyors_gepeles(loc, szoveg)


async def playwright_esemenyek_kapcsolasa(page) -> None:
    def _console(msg):
        try:
            naploz(f"PW console: {msg.type} {msg.text}")
            kiir("DEBUG", f"PW console: {msg.type} {msg.text}")
        except Exception:
            pass

    def _pageerror(err):
        try:
            naploz(f"PW pageerror: {err}")
            kiir("DEBUG", f"PW pageerror: {err}")
        except Exception:
            pass

    def _requestfailed(req):
        try:
            naploz(f"PW requestfailed: {req.method} {req.url} {req.failure}")
            kiir("DEBUG", f"PW requestfailed: {req.method} {req.url} {req.failure}")
        except Exception:
            pass

    async def _response(resp):
        try:
            st = resp.status
            if st >= 400:
                naploz(f"PW response {st}: {resp.request.method} {resp.url}")
                kiir("DEBUG", f"PW response {st}: {resp.request.method} {resp.url}")
        except Exception:
            pass

    page.on("console", _console)
    page.on("pageerror", _pageerror)
    page.on("requestfailed", _requestfailed)
    page.on("response", lambda r: asyncio.create_task(_response(r)))


"-"  # ------------------------------
"-"  # MUNKACSOPORT
"-"

async def navigal_bejelentkezik(page, flexi_domain: str, flexi_username: str, flexi_pw: str) -> None:
    alap_url = ALAP_URL_SABLON.format(domain=flexi_domain)

    naploz(f"LOGIN goto {alap_url}")
    kiir("INFO", "Bejelentkezés: oldal megnyitása")
    await lep("LOGIN goto", lambda: page.goto(alap_url, wait_until="domcontentloaded", timeout=NAVIGACIOS_TIMEOUT_MS))
    try:
        await lep("LOGIN wait networkidle", lambda: page.wait_for_load_state("networkidle", timeout=NAVIGACIOS_TIMEOUT_MS))
    except Exception:
        naploz("LOGIN networkidle skipped")
        kiir("DEBUG", "LOGIN networkidle skipped")

    await screenshot(page, "login_page")

    naploz("LOGIN type username")
    kiir("DEBUG", "Bejelentkezés: username gépelése")
    await lep("LOGIN input email", lambda: gyors_gepeles_selector(page, "input[name='emailaddress']", flexi_username))

    naploz("LOGIN type password")
    kiir("DEBUG", "Bejelentkezés: jelszó gépelése")
    await lep("LOGIN input password", lambda: gyors_gepeles_selector(page, "input[name='password']", flexi_pw))

    naploz("LOGIN submit (Enter)")
    kiir("DEBUG", "Bejelentkezés: Enter")
    await lep("LOGIN press Enter", lambda: page.press("input[name='password']", "Enter"))

    for i in range(12):
        naploz(f"LOGIN check loop {i+1}/12")
        kiir("DEBUG", f"LOGIN check loop {i+1}/12")

        try:
            if await page.locator("#xalert-in").is_visible():
                await screenshot(page, "login_fail")
                raise RuntimeError("LOGIN_FAIL")
        except RuntimeError:
            raise
        except Exception:
            pass

        try:
            if await page.locator("#header-btn-patients").is_visible():
                naploz("LOGIN ok")
                kiir("OK", "Bejelentkezés sikeres")
                await screenshot(page, "logged_in")
                return
        except Exception:
            pass

        await page.wait_for_timeout(1000)

    await screenshot(page, "login_timeout")
    raise RuntimeError("LOGIN_TIMEOUT")



async def megy_uj_arajanlat_urlre_es_letrehoz(page, flexi_domain: str, paciens_id_szam: str) -> None:
    url = UJ_AJANLAT_URL_SABLON.format(domain=flexi_domain, patient=paciens_id_szam)

    naploz(f"NEW_OFFER_URL goto {url}")
    kiir("INFO", f"Új árajánlat oldal megnyitása: {paciens_id_szam}")
    await lep("NEW_OFFER_URL goto", lambda: page.goto(url, wait_until="domcontentloaded", timeout=NAVIGACIOS_TIMEOUT_MS))
    try:
        await lep("NEW_OFFER_URL wait networkidle", lambda: page.wait_for_load_state("networkidle", timeout=NAVIGACIOS_TIMEOUT_MS))
    except Exception:
        naploz("NEW_OFFER_URL networkidle skipped")
        kiir("DEBUG", "NEW_OFFER_URL networkidle skipped")

    if "/hu/complex-offers/new-offer" not in (page.url or ""):
        raise RuntimeError(f"NEW_OFFER_URL_REDIRECT:{page.url}")

    # V2 radio — optional: some Flexi-Dent versions don't have this button
    naploz("NEW_OFFER_URL select v2 radio (optional)")
    kiir("DEBUG", "Új árajánlat: v2 kiválasztása (ha van)")
    try:
        radio = page.locator("input#coff_editor_version_v2").first
        if await radio.count() > 0:
            await lep("NEW_OFFER_URL radio visible", lambda: radio.wait_for(state="visible", timeout=KATT_TIMEOUT_MS))
            await lep("NEW_OFFER_URL radio click", lambda: radio.click(timeout=KATT_TIMEOUT_MS))
            naploz("NEW_OFFER_URL v2 radio clicked")
            kiir("DEBUG", "NEW_OFFER_URL v2 radio clicked")
        else:
            naploz("NEW_OFFER_URL v2 radio not found — proceeding without it")
            kiir("DEBUG", "NEW_OFFER_URL v2 radio not found — proceeding without it")
    except Exception as e:
        naploz(f"NEW_OFFER_URL v2 radio skipped: {type(e).__name__}: {e}")
        kiir("DEBUG", f"NEW_OFFER_URL v2 radio skipped: {type(e).__name__}: {e}")

    naploz("NEW_OFFER_URL submit create")
    kiir("DEBUG", "Új árajánlat: létrehozás")
    submit = page.locator('input[type="submit"][value="Új árajánlat létrehozása"]').first
    await lep("NEW_OFFER_URL submit visible", lambda: submit.wait_for(state="visible", timeout=KATT_TIMEOUT_MS))
    await lep("NEW_OFFER_URL submit click", lambda: submit.click(timeout=KATT_TIMEOUT_MS))

    try:
        await lep("NEW_OFFER_URL wait networkidle 2", lambda: page.wait_for_load_state("networkidle", timeout=NAVIGACIOS_TIMEOUT_MS))
    except Exception:
        naploz("NEW_OFFER_URL networkidle2 skipped")
        kiir("DEBUG", "NEW_OFFER_URL networkidle2 skipped")



async def hozzaad_uj_vizitet(page) -> None:
    async def _do():
        naploz("ADD_VISIT click")
        kiir("INFO", "Új vizit hozzáadása")
        btn = page.locator("#complexOfferEditorAddNewVisitButtonAfter").last
        await lep("ADD_VISIT btn visible", lambda: btn.wait_for(state="visible", timeout=KATT_TIMEOUT_MS))
        await lep("ADD_VISIT btn click", lambda: btn.click(timeout=KATT_TIMEOUT_MS))
        await lep("ADD_VISIT wait 1200ms", lambda: page.wait_for_timeout(1200))

    await ujraprobal("ADD_VISIT", _do, tries=3, delay_ms=3000)


async def dom_scan_fog(page, fog: str) -> bool:
    sel = f"div#tooth-{fog}"
    try:
        return await page.evaluate(
            """
            sel => {
              const el = document.querySelector(sel);
              if (!el) return false;
              if (!el.isConnected) return false;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden') return false;
              const r = el.getBoundingClientRect();
              if (!r || r.width === 0 || r.height === 0) return false;
              return true;
            }
            """,
            sel
        )
    except Exception:
        return False


async def kattint_fogra(page, fog: str) -> None:
    async def _do():
        sel = f"div#tooth-{fog}"
        for i in range(6):
            naploz(f"TOOTH {fog} scan {i+1}/6")
            kiir("DEBUG", f"TOOTH {fog} scan {i+1}/6")
            if await dom_scan_fog(page, fog):
                await lep(f"TOOTH {fog} click", lambda: page.click(sel, timeout=KATT_TIMEOUT_MS, force=True))
                await lep(f"TOOTH {fog} wait 80ms", lambda: page.wait_for_timeout(80))
                return
            await page.wait_for_timeout(250)
        raise RuntimeError("FOG_KATT_FAIL")

    await ujraprobal(f"TOOTH_{fog}", _do, tries=3, delay_ms=3000)


async def kezeli_grafikus_modal(page, timeout_ms: int = 800) -> bool:
    try:
        deadline = time.time() + (timeout_ms / 1000.0)

        while time.time() < deadline:
            modal = page.locator("#xmodal-in-signSelect")
            try:
                if await modal.count() == 0:
                    await page.wait_for_timeout(50)
                    continue

                mod_first = modal.first
                if not await mod_first.is_visible():
                    await page.wait_for_timeout(50)
                    continue

                naploz("MODAL signSelect visible")
                kiir("DEBUG", "MODAL signSelect visible")

                btn = page.locator("#addTeethSignForTreatmentFinishButton").first
                await lep("MODAL finish btn visible", lambda: btn.wait_for(state="visible", timeout=3000))
                await lep("MODAL finish btn click", lambda: btn.click(timeout=3000))

                await page.wait_for_timeout(200)
                naploz("MODAL handled")
                kiir("DEBUG", "MODAL handled")
                return True

            except Exception:
                await page.wait_for_timeout(50)
                continue

        return False

    except Exception:
        return False


async def select2_megnyit_es_input(page, vizit_index: int):
    try:
        already = page.locator("span.select2-container--open input.select2-search__field").first
        if await already.count() > 0 and await already.is_visible():
            await lep("SELECT2 input visible (already open)", lambda: already.wait_for(state="visible", timeout=KATT_TIMEOUT_MS))
            return already
    except Exception:
        pass

    jeloltek = page.locator('span.select2-selection__rendered[title*="Írja be a keresett kezelési tétel nevét"]')
    db = await jeloltek.count()
    naploz(f"SELECT2 jeloltek db={db} vizit_index={vizit_index}")
    kiir("DEBUG", f"SELECT2 jeloltek db={db} vizit_index={vizit_index}")

    if db == 0:
        raise RuntimeError("SELECT2_NINCS_JELOLT")

    if db > vizit_index:
        span = jeloltek.nth(vizit_index)
    else:
        span = jeloltek.last

    await lep("SELECT2 span visible", lambda: span.wait_for(state="visible", timeout=KATT_TIMEOUT_MS))
    try:
        await lep("SELECT2 scroll into view", lambda: span.scroll_into_view_if_needed())
    except Exception:
        naploz("SELECT2 scroll skipped")
        kiir("DEBUG", "SELECT2 scroll skipped")

    await kezeli_grafikus_modal(page, timeout_ms=800)

    try:
        await lep("SELECT2 span click", lambda: span.click(timeout=KATT_TIMEOUT_MS))
    except Exception:
        await kezeli_grafikus_modal(page, timeout_ms=2000)
        await lep("SELECT2 span click retry", lambda: span.click(timeout=KATT_TIMEOUT_MS))

    try:
        await lep(
            "SELECT2 open overlay wait",
            lambda: page.wait_for_selector("span.select2-container--open input.select2-search__field", timeout=KATT_TIMEOUT_MS)
        )
    except Exception:
        try:
            await page.keyboard.press("Escape")
        except Exception:
            pass
        await kezeli_grafikus_modal(page, timeout_ms=1200)
        await lep("SELECT2 span click retry2", lambda: span.click(timeout=KATT_TIMEOUT_MS))
        await lep(
            "SELECT2 open overlay wait retry2",
            lambda: page.wait_for_selector("span.select2-container--open input.select2-search__field", timeout=KATT_TIMEOUT_MS)
        )

    inp = page.locator("span.select2-container--open input.select2-search__field").first
    await lep("SELECT2 input visible", lambda: inp.wait_for(state="visible", timeout=KATT_TIMEOUT_MS))
    return inp


async def kivalaszt_kezelest_select2(page, kezeles_nev: str, vizit_index: int) -> Dict[str, Any]:
    async def _do():
        naploz(f"SELECT2 open for: {kezeles_nev} | visit_index={vizit_index}")
        kiir("DEBUG", f"Select2 nyitás: vizit_index={vizit_index} kezeles={kezeles_nev}")

        try:
            search_input = await select2_megnyit_es_input(page, vizit_index)
        except Exception as e:
            try:
                await select2_bezar(page)
            except Exception:
                pass
            return {"ok": False, "hiba": f"SELECT2_OPEN_FAIL:{type(e).__name__}:{e}"}

        try:
            await lep("SELECT2 input click", lambda: search_input.click(timeout=KATT_TIMEOUT_MS))
            await lep("SELECT2 clear", lambda: select2_input_torol_ha_nyitva(page))
            await lep("SELECT2 type", lambda: page.keyboard.type(kezeles_nev, delay=GEPELES_DELAY_MS))
        except Exception as e:
            naploz(f"SELECT2 typing issue: {type(e).__name__}: {e}")
            kiir("DEBUG", f"SELECT2 typing issue: {type(e).__name__}: {e}")
            await select2_bezar(page)
            return {"ok": False, "hiba": f"SELECT2_TYPE_FAIL:{type(e).__name__}:{e}"}

        results = page.locator(SELECT2_RESULT_SELECTOR)
        target_norm = normalizal(ar_sufix_levag(kezeles_nev))
        target_tokens = tokenek_egyezeshez(kezeles_nev)

        start = time.time()
        gyors_deadline = start + (FOG_GYORS_NINCS_TALALAT_MS / 1000.0)
        total_deadline = start + (FOG_TOTAL_KERESO_MS / 1000.0)

        best_index: Optional[int] = None
        volt_eredmeny = False

        while time.time() < total_deadline:
            cnt = 0
            try:
                cnt = await results.count()
            except Exception:
                cnt = 0

            if cnt > 0:
                volt_eredmeny = True

            if cnt > 0 and time.time() < gyors_deadline:
                for i in range(min(cnt, 3)):
                    try:
                        txt0 = (await results.nth(i).inner_text()).strip()
                    except Exception:
                        continue
                    if "nincs találat" in normalizal(txt0):
                        await select2_input_torol_ha_nyitva(page)
                        return {"ok": False, "hiba": f"NINCS_TALALAT:{kezeles_nev}"}

            if cnt > 0:
                for i in range(cnt):
                    it = results.nth(i)
                    try:
                        txt = (await it.inner_text()).strip()
                    except Exception:
                        continue
                    if not txt:
                        continue

                    low = normalizal(ar_sufix_levag(txt))
                    if "nincs találat" in low:
                        continue

                    if target_norm and (target_norm in low or low in target_norm):
                        best_index = i
                        break

                    if target_tokens and all(t in low for t in target_tokens):
                        best_index = i
                        break

                if best_index is not None:
                    break

            if (not volt_eredmeny) and (time.time() >= gyors_deadline):
                await select2_input_torol_ha_nyitva(page)
                return {"ok": False, "hiba": f"NINCS_TALALAT_GYORS:{kezeles_nev}"}

            await page.wait_for_timeout(150)

        if best_index is None:
            sample: List[str] = []
            try:
                cnt2 = await results.count()
                for i in range(min(cnt2, 6)):
                    try:
                        sample.append((await results.nth(i).inner_text()).strip())
                    except Exception:
                        pass
            except Exception:
                pass
            await select2_input_torol_ha_nyitva(page)
            return {"ok": False, "hiba": f"NINCS_TALALAT:{kezeles_nev}", "sample": sample}

        pick = results.nth(best_index)
        try:
            await lep("SELECT2 pick click", lambda: pick.click(timeout=KATT_TIMEOUT_MS, force=True))
        except Exception as e:
            await select2_input_torol_ha_nyitva(page)
            return {"ok": False, "hiba": f"SELECT2_PICK_FAIL:{type(e).__name__}:{e}"}

        await kezeli_grafikus_modal(page)
        return {"ok": True, "hiba": ""}

    return await ujraprobal("KEZELES_SELECT2", _do, tries=2, delay_ms=500)


async def vegrehajt_vizit(page, fog_kezelesek: Dict[str, List[str]], vizit_index: int) -> None:
    fogak = sorted(fog_kezelesek.keys(), key=lambda x: int(x))
    naploz(f"VISIT_EXEC start vizit_index={vizit_index} fog_db={len(fogak)}")
    kiir("DEBUG", f"VISIT_EXEC start vizit_index={vizit_index} fog_db={len(fogak)}")

    if not hasattr(page, "_treatnote_report"):
        setattr(page, "_treatnote_report", {"bement": [], "kihagyott": []})
    report = getattr(page, "_treatnote_report")

    kovetkezo_fog_mar_kattintva: Optional[str] = None

    for fog_index, fog in enumerate(fogak):
        naploz(f"TOOTH start {fog} | visit_index={vizit_index}")
        kiir("INFO", f"Fog: {fog} (vizit_index={vizit_index})")

        if kovetkezo_fog_mar_kattintva == fog:
            kovetkezo_fog_mar_kattintva = None
        else:
            await kattint_fogra(page, fog)

        kez_lista = fog_kezelesek.get(fog, []) or []
        kez_db = len(kez_lista)
        naploz(f"TOOTH {fog} treatments db={kez_db}")
        kiir("DEBUG", f"TOOTH {fog} treatments db={kez_db}")

        for kez_i, kez in enumerate(kez_lista):
            utolso_e = (kez_i == kez_db - 1)

            naploz(f"TOOTH {fog} add treatment: {kez}")
            kiir("DEBUG", f"  Kezelés hozzáadás: {kez}")

            eredm = await kivalaszt_kezelest_select2(page, kez, vizit_index)

            if eredm.get("ok", False):
                report["bement"].append({"vizit_index": vizit_index, "fog": fog, "kezeles": kez})
                naploz(f"TOOTH {fog} treatment added OK: {kez}")
                kiir("DEBUG", f"  Kezelés OK: {kez}")
                continue

            hiba = eredm.get("hiba", "ISMERETLEN")
            report["kihagyott"].append({"vizit_index": vizit_index, "fog": fog, "kezeles": kez, "hiba": hiba})
            naploz(f"SKIP treatment: {kez} | {hiba}")
            kiir("ERROR", f"SKIP: {kez} | {hiba}")

            if not utolso_e:
                continue

            await select2_bezar(page)

            van_kov_fog = (fog_index + 1) < len(fogak)
            if van_kov_fog:
                kov_fog = fogak[fog_index + 1]
                await kattint_fogra(page, kov_fog)
                kovetkezo_fog_mar_kattintva = kov_fog

        if kovetkezo_fog_mar_kattintva is None:
            await kattint_fogra(page, fog)

        naploz(f"TOOTH done {fog}")
        kiir("OK", f"Fog kész: {fog}")

    naploz(f"VISIT_EXEC done vizit_index={vizit_index}")
    kiir("DEBUG", f"VISIT_EXEC done vizit_index={vizit_index}")


async def feldolgoz(page, payload: Any) -> None:
    vizitek = kivesz_adatokat_vizitenkent(payload)
    naploz(f"VISITS count={len(vizitek)}")
    kiir("INFO", f"Vizitek száma: {len(vizitek)}")

    for idx, v in enumerate(vizitek):
        naploz(f"VISIT start idx={idx} key={v.get('vizit')}")
        kiir("INFO", f"Vizit: {idx+1}")

        if idx > 0:
            await hozzaad_uj_vizitet(page)

        await vegrehajt_vizit(page, v["kezelesek"], vizit_index=idx)
        naploz(f"VISIT done idx={idx}")
        kiir("DEBUG", f"VISIT done idx={idx}")


"-"  # ------------------------------
"-"  # RUN
"-"

async def main() -> int:
    if len(sys.argv) < 4:
        out_json(0, "ARGS", "MISSING_FLEXI_DOMAIN_OR_USERNAME_OR_PASSWORD")
        return 0

    argv_domain = (sys.argv[1] or "").strip()
    argv_user = (sys.argv[2] or "").strip()
    argv_pw = (sys.argv[3] or "").strip()
    argv_paciens = (sys.argv[4] if len(sys.argv) >= 5 else "").strip()

    try:
        payload_raw = payload_betoltese_stdinbol()
        payload = kicsomagol_payload(payload_raw)
        naploz("PAYLOAD OK")
        kiir("DEBUG", "PAYLOAD OK")
    except Exception as e:
        out_json(0, "PAYLOAD", f"{type(e).__name__}: {e}")
        return 0
    flexi = flexi_adatok_kiszedi(payload, argv_domain, argv_user, argv_pw)
    flexi_domain = flexi["flexi_domain"]
    flexi_username = flexi["flexi_username"]
    flexi_pw = flexi["flexi_pw"]

    naploz(f"FLEXI domain={flexi_domain}")
    kiir("DEBUG", f"FLEXI domain={flexi_domain}")

    if not flexi_domain or not flexi_username or not flexi_pw:
        out_json(0, "ARGS", "EMPTY_FLEXI_DOMAIN_OR_USERNAME_OR_PASSWORD")
        return 0
    paciens_id_szam = paciens_id_kiszedi(payload, argv_paciens)
    naploz(f"PACIENS_ID resolved={paciens_id_szam}")
    kiir("DEBUG", f"PACIENS_ID resolved={paciens_id_szam}")

    # Set error reporting context
    global _DOMAIN, _EMAIL_CTX, _PACIENS_CTX
    _DOMAIN = flexi_domain
    _EMAIL_CTX = flexi_username
    _PACIENS_CTX = paciens_id_szam

    if not paciens_id_szam:
        out_json(0, "PACIENS_ID", "RuntimeError: PACIENS_ID_HIANY")
        return 0

    try:
        async with async_playwright() as p:
            naploz("BROWSER launch")
            kiir("INFO", "Böngésző indítása")
            browser = await p.chromium.launch(headless=HASZNALJ_HEADLESS, args=["--no-sandbox"])
            context = await browser.new_context(viewport=VIEWPORT, ignore_https_errors=True)
            page = await context.new_page()

            await playwright_esemenyek_kapcsolasa(page)

            try:
                await ujraprobal("LOGIN", lambda: navigal_bejelentkezik(page, flexi_domain, flexi_username, flexi_pw), tries=3, delay_ms=3000)
                await ujraprobal("NEW_OFFER_URL", lambda: megy_uj_arajanlat_urlre_es_letrehoz(page, flexi_domain, paciens_id_szam), tries=3, delay_ms=3000)
                await ujraprobal("PROCESS", lambda: feldolgoz(page, payload), tries=3, delay_ms=3000)

                kiir("OK", "Futás vége: siker")
                rep = getattr(page, "_treatnote_report", {"bement": [], "kihagyott": []})
                resp = {"ok": 1, "step": "DONE", "url": page.url, "report": rep}
                if DEBUG_OUT:
                    resp["logs"] = LOGS
                print(json.dumps(resp, ensure_ascii=False))
                return 0

            except PlaywrightTimeoutError as e:
                kiir("ERROR", f"Timeout: {type(e).__name__}: {e}")
                naploz(f"TIMEOUT: {type(e).__name__}: {e}")
                await screenshot(page, "timeout_error")
                rep = getattr(page, "_treatnote_report", {"bement": [], "kihagyott": []})
                upload_error_report(f"treatnote.py timeout: {str(e)[:200]}")
                resp = {"ok": 0, "step": "TIMEOUT", "error": f"{type(e).__name__}: {e}", "url": getattr(page, "url", None), "report": rep}
                if DEBUG_OUT:
                    resp["logs"] = LOGS
                print(json.dumps(resp, ensure_ascii=False))
                return 0

            except Exception as e:
                kiir("ERROR", f"Futás hiba: {type(e).__name__}: {e}")
                naploz(f"RUN ERROR: {type(e).__name__}: {e}")
                await screenshot(page, "run_error")
                rep = getattr(page, "_treatnote_report", {"bement": [], "kihagyott": []})
                upload_error_report(f"treatnote.py run error: {type(e).__name__}: {str(e)[:200]}")
                resp = {"ok": 0, "step": "RUN", "error": f"{type(e).__name__}: {e}", "url": getattr(page, "url", None), "report": rep}
                if DEBUG_OUT:
                    resp["logs"] = LOGS
                print(json.dumps(resp, ensure_ascii=False))
                return 0

            finally:
                try:
                    await context.close()
                except Exception:
                    pass
                try:
                    await browser.close()
                except Exception:
                    pass

    except Exception as e:
        kiir("ERROR", f"Váratlan hiba: {type(e).__name__}: {e}")
        naploz(f"UNEXPECTED: {type(e).__name__}: {e}")
        upload_error_report(f"treatnote.py unexpected crash: {type(e).__name__}: {str(e)[:200]}")
        out_json(0, "UNEXPECTED", f"{type(e).__name__}: {e}")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
