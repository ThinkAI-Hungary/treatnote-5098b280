import asyncio
import sys
import json
from datetime import datetime, timezone
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
import re
import os
import time
import urllib.request
import urllib.error
import urllib.parse

# ------------------------------------------------------------
# VÁLTOZÓK
# ------------------------------------------------------------
UJ_AJANLAT_URL_SABLON: str = "https://{aldomain}.flexi-dent.hu/hu/complex-offers/new-offer?patient={patient}&source=cardboard"
TUTORIAL_MODAL_BEZAR_GOMB_SELECTOR: str = "#offerTutorialModal_FinishButton"
COFF_PATIENT_HIDDEN_SELECTOR: str = "#coff_patient"

SUPABASE_URL: str = "https://bpjzgapmoyhtgryglcke.supabase.co"
SUPABASE_SERVICE_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwanpnYXBtb3lodGdyeWdsY2tlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTMxMDI4MywiZXhwIjoyMDgwODg2MjgzfQ.uBOJ6vZyjryFNULweNFecPdY4ZjslVjsl3HCXiSOI2E"
SUPABASE_TABLA: str = "szotar_kezelesek"
SUPABASE_ON_CONFLICT: str = "telephely_id,category,name"
SUPABASE_SERVICE_ROLE_ENV: str = "SUPABASE_SERVICE_ROLE_KEY"

Debug: bool = False

FLEXI_DOMAIN_SUFFIX: str = "flexi-dent.hu"
FLEXI_UTVONAL: str = "/hu/?msg=no-for-patient"

MAX_VARAKOZAS_MS: int = 7000
UJRA_PROBA_SZUNET_MS: int = 1000
MAX_PROBA: int = 3

EMAIL_SELECTOR: str = "input[name='emailaddress']"
PASS_SELECTOR: str = "input[name='password']"
HIBAABLAK_SELECTOR: str = "#xalert-in"
SIKER_GOMB_SELECTOR: str = "#header-btn-patients"

KOMPLEX_AJANLAT_SELECTOR: str = "#header-btn-complexoffer"
UJ_AJANLAT_SELECTOR: str = "a[href='/hu/complex-offers/new-offer']"
EDITOR_V2_RADIO_SELECTOR: str = "#coff_editor_version_v2"
PACIENS_NEV_INPUT_SELECTOR: str = "#coff_pt_name"
AUTOCOMPLETE_ELEM_SELECTOR: str = ".ui-menu-item-wrapper"
Uj_AJANLAT_LETREHOZAS_SUBMIT_SELECTOR: str = "input[type='submit'][value='Új árajánlat létrehozása']"

SELECT2_PLACEHOLDER_SPAN_SELECTOR: str = "span.select2-selection__rendered[title='Írja be a keresett kezelési tétel nevét...']"
SELECT2_DROPDOWN_RESULTS_SELECTOR: str = "li.select2-results__option"


AMBULATORY_DATA_URL_SABLON: str = "https://{aldomain}.flexi-dent.hu/hu/patients/cardboard/ambulatory-data?id={patient_id}"

ANAMNEZIS_GOMB_SELECTOR_1: str = "button.button_blue[onclick^='addAnamnesis(']"
ANAMNEZIS_GOMB_SELECTOR_2: str = "button.button_blue:has-text('Anamnézis')"

TINYMCE_IFRAME_SELECTOR_1: str = "iframe#pap_history_ifr"
TINYMCE_IFRAME_SELECTOR_2: str = "iframe.tox-edit-area__iframe"

# ------------------------------------------------------------
# ERROR REPORTING BUFFERS
# ------------------------------------------------------------
_log_buffer: list = []
_screenshot_buffer: list = []

# Global vars set during runtime (used in error reports)
_SCRIPT_MODE: str = "szotar"
_ALDOMAIN: str = ""
_EMAIL: str = ""
_TELEPHELY_ID: str = ""
_PACIENS_ID: str = ""

# ------------------------------------------------------------
# SEGÉDFÜGGVÉNYEK
# ------------------------------------------------------------

def ambulatory_data_url_osszerakasa(aldomain: str, paciens_id: str) -> str:
    pid = urllib.parse.quote((paciens_id or "").strip(), safe="")
    return AMBULATORY_DATA_URL_SABLON.format(aldomain=aldomain, patient_id=pid)


def ido_belyeg() -> str:
    return datetime.now().strftime("%Y.%m.%d-%H:%M:%S")


def naploz(szint: str, uzenet: str) -> None:
    if szint == "DEBUG" and not Debug:
        return
    line = f"{ido_belyeg()} [{szint}] {uzenet}"
    _log_buffer.append(line)
    # Write to both stdout (colored) and stderr (plain, for n8n)
    colors = {"OK": "\033[92m", "ERROR": "\033[91m", "DEBUG": "\033[95m", "WARN": "\033[93m"}
    c = colors.get(szint, "")
    print(f"{c}{line}\033[0m", flush=True)
    print(line, file=sys.stderr, flush=True)


# ── Supabase Error Reporting ────────────────────────────────────────────────
def supabase_upload_screenshot(name: str, png_bytes: bytes) -> str:
    """Upload a single screenshot to Supabase Storage. Returns the path."""
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
        naploz("INFO", f"[UPLOAD] Screenshot feltöltve: {path} ({resp.status})")
        return path
    except Exception as e:
        naploz("ERROR", f"[UPLOAD] Screenshot hiba: {type(e).__name__}: {str(e)[:200]}")
        return ""


def upload_error_report(summary: str, severity: str = "error") -> None:
    """Upload all buffered screenshots + full log to Supabase error_logs table."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        naploz("ERROR", "[UPLOAD] Supabase vars missing, error log not saved")
        return

    # Upload screenshots
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
        "email": _EMAIL or "Unknown",
        "telephely_id": _TELEPHELY_ID or "Unknown",
        "patient_id": _PACIENS_ID or "Unknown",
        "mode": _SCRIPT_MODE,
        "screenshot_count": len(_screenshot_buffer),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    body = json.dumps({
        "script_name": f"szotar.py ({_SCRIPT_MODE})",
        "domain": _ALDOMAIN or "Unknown",
        "severity": severity,
        "summary": summary,
        "full_log": full_log,
        "screenshot_urls": screenshot_urls,
        "metadata": metadata,
    }).encode("utf-8")

    insert_url = f"{SUPABASE_URL}/rest/v1/error_logs"
    try:
        req = urllib.request.Request(
            insert_url,
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
        naploz("INFO", f"[UPLOAD] Error log elmentve ({resp.status})")
    except Exception as e:
        naploz("ERROR", f"[UPLOAD] Error log mentés hiba: {type(e).__name__}: {str(e)[:200]}")


async def screenshot(page, leiras: str) -> None:
    """Capture screenshot to in-memory buffer."""
    try:
        png_bytes = await page.screenshot(full_page=True)
        _screenshot_buffer.append((leiras, png_bytes))
        naploz("INFO", f"[SCREENSHOT] {leiras} ({len(png_bytes)} bytes)")
    except Exception as e:
        naploz("ERROR", f"[SCREENSHOT] {leiras} hiba: {e}")


# ── Original helper functions ───────────────────────────────────────────────

async def tutorial_modal_bezarasa_ha_van(page, lepes: str) -> None:
    try:
        gomb = await page.wait_for_selector(TUTORIAL_MODAL_BEZAR_GOMB_SELECTOR, timeout=1500, state="visible")
        await gomb.click(timeout=1500)
        naploz("INFO", f"Tutorial modal bezárva | {lepes}")
        await page.wait_for_timeout(200)
    except Exception:
        return


def uj_arajanlat_url_osszerakasa(aldomain: str, paciens_nev: str) -> str:
    patient = urllib.parse.quote((paciens_nev or "").strip(), safe="")
    return UJ_AJANLAT_URL_SABLON.format(aldomain=aldomain, patient=patient)


def select2_csoportositas_es_tisztitas(nyers: list[dict]) -> list[dict]:
    placeholder = "Írja be a keresett kezelési tétel nevét..."
    eredmeny: list[dict] = []
    latott: set[tuple[str, str]] = set()

    aktualis_kategoria = ""

    for item in nyers:
        szoveg = (item.get("text") or "").strip()
        if not szoveg:
            continue
        if szoveg == placeholder:
            continue

        is_group = bool(item.get("isGroup", False))
        is_selectable = bool(item.get("isSelectable", False))
        aria_disabled = (item.get("ariaDisabled") or "").strip().lower()

        if not is_group and (not is_selectable) and aria_disabled == "true":
            if not re.search(r"\bHUF\b", szoveg, flags=re.IGNORECASE):
                is_group = True

        if is_group:
            aktualis_kategoria = szoveg
            continue

        tiszta = hufos_zarojel_torles(szoveg).strip()
        if not tiszta:
            continue

        kategori = (aktualis_kategoria or "").strip()
        kulcs = (kategori, tiszta)
        if kulcs in latott:
            continue
        latott.add(kulcs)

        eredmeny.append({"category": kategori, "kezelesnev": tiszta})

    return eredmeny


def supabase_sorok_keszitese(telephely_id: str, opciok: list[dict]) -> list[dict]:
    sorok: list[dict] = []
    tid = (telephely_id or "").strip()

    for o in opciok:
        nev = (o.get("kezelesnev") or "").strip()
        kategori = (o.get("category") or "").strip()

        if not nev:
            continue

        sorok.append(
            {
                "telephely_id": tid,
                "name": nev,
                "category": kategori,
            }
        )

    return sorok


def supabase_upsert_szotar_kezelesek(treatments: list[dict], service_role_kulcs: str) -> dict:
    kulcs = (service_role_kulcs or "").strip()
    if not kulcs:
        return {"ok": False, "hiba": "Hiányzó supabase service role key"}

    if not treatments:
        return {"ok": True, "beszurt": 0}

    query = urllib.parse.urlencode({"on_conflict": SUPABASE_ON_CONFLICT})
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLA}?{query}"

    fejlecek = {
        "apikey": kulcs,
        "Authorization": f"Bearer {kulcs}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    adat = json.dumps(treatments, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=adat, headers=fejlecek, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=MAX_VARAKOZAS_MS / 1000) as resp:
            status = getattr(resp, "status", 200)
            if 200 <= status < 300:
                return {"ok": True, "beszurt": len(treatments)}
            return {"ok": False, "hiba": f"HTTP status: {status}"}

    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return {"ok": False, "hiba": f"HTTPError {e.code}: {body}"}

    except urllib.error.URLError as e:
        return {"ok": False, "hiba": f"URLError: {e}"}


def hufos_zarojel_torles(szoveg: str) -> str:
    if szoveg is None:
        return ""
    s = re.sub(r"\([^)]*\bHUF\b[^)]*\)", "", str(szoveg), flags=re.IGNORECASE)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s


def select2_szovegek_kibontasa_es_tisztitasa(opciok_szoveg: list[str]) -> list[str]:
    placeholder = "Írja be a keresett kezelési tétel nevét..."
    eredmeny: list[str] = []
    latott: set[str] = set()

    for txt in opciok_szoveg:
        if not txt:
            continue
        for sor in str(txt).splitlines():
            s = sor.strip()
            if not s:
                continue
            if s == placeholder:
                continue
            s = hufos_zarojel_torles(s)
            if not s:
                continue
            if s not in latott:
                latott.add(s)
                eredmeny.append(s)

    return eredmeny


def normalizal_aldomaint(aldomain: str) -> str:
    if aldomain is None:
        return ""
    s = str(aldomain).strip()
    s = s.replace("https://", "").replace("http://", "")
    s = s.split("/")[0].strip()
    if s.endswith("."):
        s = s[:-1]
    suffix = f".{FLEXI_DOMAIN_SUFFIX}"
    if s.endswith(suffix):
        s = s[: -len(suffix)]
    if "." in s:
        s = s.split(".")[0]
    return s


def flexi_url_osszerakasa(aldomain: str) -> str:
    return f"https://{aldomain}.{FLEXI_DOMAIN_SUFFIX}{FLEXI_UTVONAL}"


async def varakozas(page, ms: int) -> None:
    await page.wait_for_timeout(min(int(ms), MAX_VARAKOZAS_MS))


async def oldal_teljes_betoltese(page, lepes: str) -> None:
    try:
        await page.wait_for_load_state("domcontentloaded", timeout=MAX_VARAKOZAS_MS)
        await page.wait_for_load_state("networkidle", timeout=MAX_VARAKOZAS_MS)
        naploz("DEBUG", f"Oldal betöltve: {lepes}")
    except PlaywrightTimeoutError:
        raise PlaywrightTimeoutError(f"Timeout > {MAX_VARAKOZAS_MS}ms (oldal betöltés) a lépésnél: {lepes}")


async def elem_megvarasa_probal(page, selector: str, lepes: str):
    utolso = None
    for proba in range(1, MAX_PROBA + 1):
        try:
            naploz("DEBUG", f"Elem keresése: {selector} (próba {proba}/{MAX_PROBA}) | {lepes}")
            el = await page.wait_for_selector(selector, timeout=1000, state="visible")
            return el
        except Exception as e:
            utolso = e
            if proba < MAX_PROBA:
                await varakozas(page, UJRA_PROBA_SZUNET_MS)
    raise PlaywrightTimeoutError(f"Nem található elem 3 próbából (1 mp várakozással): {selector} | {lepes}") from utolso


async def kattintas_es_visszajelzes(page, selector: str, lepes: str, kovetkezo_selector: str | None = None, var_networkidle: bool = False) -> None:
    el = await elem_megvarasa_probal(page, selector, lepes)
    try:
        await el.click(timeout=MAX_VARAKOZAS_MS)
        naploz("INFO", f"Kattintás sikeres: {selector} | {lepes}")
    except PlaywrightTimeoutError:
        raise PlaywrightTimeoutError(f"Timeout > {MAX_VARAKOZAS_MS}ms (kattintás) a lépésnél: {lepes}")

    if var_networkidle:
        await oldal_teljes_betoltese(page, f"{lepes} -> betöltés")

    if kovetkezo_selector:
        await elem_megvarasa_probal(page, kovetkezo_selector, f"{lepes} -> visszajelzés")


async def mezobe_iras_es_autocomplete_kivalasztas(page, input_selector: str, szoveg: str, lepes: str) -> None:
    inp = await elem_megvarasa_probal(page, input_selector, lepes)
    try:
        await inp.click(timeout=MAX_VARAKOZAS_MS)
        await inp.fill("", timeout=MAX_VARAKOZAS_MS)
        await inp.type(szoveg, delay=30, timeout=MAX_VARAKOZAS_MS)
    except PlaywrightTimeoutError:
        raise PlaywrightTimeoutError(f"Timeout > {MAX_VARAKOZAS_MS}ms (írás) a lépésnél: {lepes}")

    try:
        await page.wait_for_selector(AUTOCOMPLETE_ELEM_SELECTOR, timeout=MAX_VARAKOZAS_MS, state="visible")
    except PlaywrightTimeoutError:
        raise PlaywrightTimeoutError(f"Timeout > {MAX_VARAKOZAS_MS}ms (autocomplete megjelenés) a lépésnél: {lepes}")

    elso = page.locator(AUTOCOMPLETE_ELEM_SELECTOR).first
    try:
        await elso.click(timeout=MAX_VARAKOZAS_MS)
    except PlaywrightTimeoutError:
        raise PlaywrightTimeoutError(f"Timeout > {MAX_VARAKOZAS_MS}ms (autocomplete kiválasztás) a lépésnél: {lepes}")


async def login_ellenorzes(page, lepes: str) -> int:
    for proba in range(1, MAX_PROBA + 1):
        naploz("DEBUG", f"Login ellenőrzés (próba {proba}/{MAX_PROBA}) | {lepes}")

        try:
            if await page.is_visible(HIBAABLAK_SELECTOR):
                naploz("ERROR", "Hibaablak látható -> sikertelen login")
                return 0
        except Exception:
            pass

        try:
            await page.wait_for_selector(SIKER_GOMB_SELECTOR, timeout=2000, state="visible")
            naploz("OK", "Siker gomb megjelent -> sikeres login")
            return 1
        except Exception:
            pass

        if proba < MAX_PROBA:
            await varakozas(page, UJRA_PROBA_SZUNET_MS)

    naploz("ERROR", "Login nem egyértelmű -> sikertelen")
    return 0


async def select2_opciok_listazasa(page, lepes: str) -> list[dict]:
    naploz("INFO", f"Select2 dropdown megnyitása | {lepes}")
    await kattintas_es_visszajelzes(
        page,
        SELECT2_PLACEHOLDER_SPAN_SELECTOR,
        lepes=lepes,
        kovetkezo_selector=SELECT2_DROPDOWN_RESULTS_SELECTOR,
        var_networkidle=False,
    )

    naploz("INFO", "Select2 opciók kiolvasása JS evaluate-tal...")
    nyers = await page.evaluate(
        """
        () => {
            const container = document.querySelector('.select2-results__options');
            if (!container) return [];

            const els = Array.from(container.querySelectorAll('li'));
            const res = [];

            for (const el of els) {
                const cls = el.className || '';
                if (!cls.includes('select2-results__')) continue;

                const strongGroup = el.querySelector('strong.select2-results__group');
                const text = (strongGroup ? strongGroup.innerText : el.innerText || '').trim();

                const ariaSelectedAttr = el.getAttribute('aria-selected');
                const hasAriaSelected = ariaSelectedAttr !== null;
                const isSelectable = hasAriaSelected;

                const ariaDisabled = el.getAttribute('aria-disabled') || '';

                const role = el.getAttribute('role') || '';
                const isGroup = !!strongGroup || cls.includes('select2-results__group') || role === 'group';

                res.push({
                    text,
                    isGroup,
                    isSelectable,
                    ariaDisabled,
                    className: cls,
                    role
                });
            }

            return res.filter(x => x.text && x.text.length > 0);
        }
        """
    )

    naploz("INFO", f"Select2: {len(nyers)} nyers elem kiolvasva")
    result = select2_csoportositas_es_tisztitas(nyers)
    naploz("INFO", f"Select2: {len(result)} tisztított kezelés")
    return result


# ------------------------------------------------------------
# MUNKACSOPORT
# ------------------------------------------------------------

async def folyamat_anamnezis_kiolvasas(aldomain: str, email: str, jelszo: str, paciens_id: str) -> dict:
    url_login = flexi_url_osszerakasa(aldomain)
    amb_url = ambulatory_data_url_osszerakasa(aldomain, paciens_id)

    naploz("INFO", f"=== ANAMNÉZIS MÓD ===")
    naploz("INFO", f"Aldomain: {aldomain}")
    naploz("INFO", f"Páciens ID: {paciens_id}")
    naploz("INFO", f"URL (login): {url_login}")
    naploz("INFO", f"URL (ambulatory): {amb_url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = await browser.new_page()
        page.set_default_timeout(MAX_VARAKOZAS_MS)
        page.set_default_navigation_timeout(MAX_VARAKOZAS_MS)

        lepes = "inditas_anamnezis"
        try:
            # 1) Login oldal
            lepes = "anamnezis_oldal_megnyitasa_login"
            naploz("INFO", f"Lépés: {lepes}")
            await page.goto(url_login, timeout=MAX_VARAKOZAS_MS, wait_until="domcontentloaded")
            await oldal_teljes_betoltese(page, lepes)
            await screenshot(page, "anamnezis_login_page")

            # 2) Login mezők
            lepes = "anamnezis_login_mezok"
            naploz("INFO", f"Lépés: {lepes}")
            await elem_megvarasa_probal(page, EMAIL_SELECTOR, lepes)
            await elem_megvarasa_probal(page, PASS_SELECTOR, lepes)

            # 3) Login kitöltés + Enter
            lepes = "anamnezis_login_kitoltes"
            naploz("INFO", f"Lépés: {lepes}")
            await page.fill(EMAIL_SELECTOR, email)
            await page.fill(PASS_SELECTOR, jelszo)
            await page.press(PASS_SELECTOR, "Enter")

            # 4) Login visszajelzés
            lepes = "anamnezis_login_visszajelzes"
            naploz("INFO", f"Lépés: {lepes}")
            siker = await login_ellenorzes(page, lepes)
            if siker != 1:
                await screenshot(page, "anamnezis_login_failed")
                upload_error_report("Anamnézis: Sikertelen bejelentkezés")
                return {"ok": False, "lepes": lepes, "hiba": "Sikertelen bejelentkezés", "anamnezis_szoveg": ""}
            await screenshot(page, "anamnezis_logged_in")

            # 5) Ambulatory-data oldal megnyitása
            lepes = "anamnezis_ambulatory_megnyitasa"
            naploz("INFO", f"Lépés: {lepes} -> {amb_url}")
            await page.goto(amb_url, timeout=MAX_VARAKOZAS_MS, wait_until="domcontentloaded")
            await oldal_teljes_betoltese(page, lepes)
            await screenshot(page, "anamnezis_ambulatory_opened")

            # 6) Anamnézis gomb kattintás (két selectorral próbáljuk)
            lepes = "anamnezis_gomb_kattintas"
            naploz("INFO", f"Lépés: {lepes}")
            try:
                await kattintas_es_visszajelzes(
                    page,
                    ANAMNEZIS_GOMB_SELECTOR_1,
                    lepes=lepes,
                    kovetkezo_selector=None,
                    var_networkidle=False,
                )
            except Exception:
                naploz("WARN", f"Első selector nem működött, próba: {ANAMNEZIS_GOMB_SELECTOR_2}")
                await kattintas_es_visszajelzes(
                    page,
                    ANAMNEZIS_GOMB_SELECTOR_2,
                    lepes=lepes,
                    kovetkezo_selector=None,
                    var_networkidle=False,
                )

            # +1) várunk 1 mp-et, hogy a TinyMCE biztosan felálljon
            await page.wait_for_timeout(1000)
            await screenshot(page, "anamnezis_after_button_click")

            # 7) TinyMCE iframe megvárása
            lepes = "anamnezis_iframe_megvaras"
            naploz("INFO", f"Lépés: {lepes}")
            iframe_el = None
            try:
                iframe_el = await elem_megvarasa_probal(page, TINYMCE_IFRAME_SELECTOR_1, lepes)
            except Exception:
                naploz("WARN", f"Első iframe selector nem jött be, próba: {TINYMCE_IFRAME_SELECTOR_2}")
                iframe_el = await elem_megvarasa_probal(page, TINYMCE_IFRAME_SELECTOR_2, lepes)

            frame = await iframe_el.content_frame()
            if frame is None:
                await screenshot(page, "anamnezis_iframe_none")
                upload_error_report("Anamnézis: Iframe content_frame None")
                return {"ok": False, "lepes": lepes, "hiba": "Iframe content_frame None", "anamnezis_szoveg": ""}

            # 8) Szöveg kiolvasása
            lepes = "anamnezis_szoveg_kiolvasas"
            naploz("INFO", f"Lépés: {lepes}")
            await frame.wait_for_selector("body", timeout=MAX_VARAKOZAS_MS, state="visible")
            szoveg = await frame.inner_text("body", timeout=MAX_VARAKOZAS_MS)
            szoveg = (szoveg or "").strip()

            naploz("OK", f"Anamnézis szöveg kiolvasva ({len(szoveg)} karakter)")
            await screenshot(page, "anamnezis_completed")
            return {"ok": True, "lepes": "kesz_anamnezis", "hiba": "", "anamnezis_szoveg": szoveg, "paciens_id": paciens_id}

        except PlaywrightTimeoutError as e:
            naploz("ERROR", f"Timeout @ {lepes}: {e}")
            await screenshot(page, f"timeout_{lepes}")
            upload_error_report(f"Anamnézis timeout @ {lepes}: {str(e)[:100]}")
            return {"ok": False, "lepes": lepes, "hiba": str(e), "anamnezis_szoveg": "", "paciens_id": paciens_id}
        except Exception as e:
            naploz("ERROR", f"Hiba @ {lepes}: {type(e).__name__}: {e}")
            await screenshot(page, f"error_{lepes}")
            upload_error_report(f"Anamnézis error @ {lepes}: {str(e)[:100]}")
            return {"ok": False, "lepes": lepes, "hiba": f"{type(e).__name__}: {e}", "anamnezis_szoveg": "", "paciens_id": paciens_id}
        finally:
            naploz("INFO", "Browser bezárása (anamnézis)...")
            await browser.close()
            naploz("INFO", "Browser bezárva.")


async def folyamat_komplex_ajanlat_es_lista(aldomain: str, email: str, jelszo: str, paciens_nev: str) -> dict:
    url = flexi_url_osszerakasa(aldomain)

    naploz("INFO", f"=== SZÓTÁR MÓD ===")
    naploz("INFO", f"Aldomain: {aldomain}")
    naploz("INFO", f"Páciens név: {paciens_nev}")
    naploz("INFO", f"URL: {url}")

    COFF_PATIENT_HIDDEN_SELECTOR = "#coff_patient"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = await browser.new_page()
        page.set_default_timeout(MAX_VARAKOZAS_MS)
        page.set_default_navigation_timeout(MAX_VARAKOZAS_MS)

        lepes = "indítás"
        try:
            # 1) Login oldal megnyitása
            lepes = "oldal_megnyitasa"
            naploz("INFO", f"Lépés: {lepes}")
            await page.goto(url, timeout=MAX_VARAKOZAS_MS, wait_until="domcontentloaded")
            await oldal_teljes_betoltese(page, lepes)
            await screenshot(page, "login_page")

            # 2) Login mezők
            lepes = "login_mezok"
            naploz("INFO", f"Lépés: {lepes}")
            await elem_megvarasa_probal(page, EMAIL_SELECTOR, lepes)
            await elem_megvarasa_probal(page, PASS_SELECTOR, lepes)

            # 3) Login kitöltés + Enter
            lepes = "login_kitoltes"
            naploz("INFO", f"Lépés: {lepes}")
            await page.fill(EMAIL_SELECTOR, email)
            await page.fill(PASS_SELECTOR, jelszo)
            await page.press(PASS_SELECTOR, "Enter")

            # 4) Login visszajelzés
            lepes = "login_visszajelzes"
            naploz("INFO", f"Lépés: {lepes}")
            siker = await login_ellenorzes(page, lepes)
            if siker != 1:
                await screenshot(page, "login_failed")
                upload_error_report("Szótár: Sikertelen bejelentkezés")
                return {"ok": False, "lepes": lepes, "hiba": "Sikertelen bejelentkezés", "opciok": []}
            await screenshot(page, "logged_in")

            # 5) Új árajánlat oldal
            lepes = "uj_arajanlat_url_goto_patient_param"
            naploz("INFO", f"Lépés: {lepes}")
            if not paciens_nev.strip():
                upload_error_report("Szótár: Hiányzó probapaciens_neve")
                return {"ok": False, "lepes": lepes, "hiba": "Hiányzó probapaciens_neve", "opciok": []}

            uj_url = uj_arajanlat_url_osszerakasa(aldomain, paciens_nev)
            naploz("INFO", f"Új árajánlat URL: {uj_url}")

            await page.goto(uj_url, timeout=MAX_VARAKOZAS_MS, wait_until="domcontentloaded")
            await oldal_teljes_betoltese(page, lepes)
            await screenshot(page, "new_offer_page")

            if "/hu/complex-offers/new-offer" not in (page.url or ""):
                naploz("ERROR", f"Redirect / rossz URL: {page.url}")
                await screenshot(page, "wrong_url_redirect")
                upload_error_report(f"Szótár: Redirect — {page.url}")
                return {"ok": False, "lepes": lepes, "hiba": f"Redirect / rossz URL: {page.url}", "opciok": []}

            # 6) Tutorial modal bezárás
            await tutorial_modal_bezarasa_ha_van(page, lepes)

            # 7) V2 radio kiválasztása (some versions don't have this)
            lepes = "editor_v2_kivalasztas"
            naploz("INFO", f"Lépés: {lepes}")
            try:
                await kattintas_es_visszajelzes(
                    page,
                    EDITOR_V2_RADIO_SELECTOR,
                    lepes=lepes,
                    kovetkezo_selector=Uj_AJANLAT_LETREHOZAS_SUBMIT_SELECTOR,
                    var_networkidle=False,
                )
                await screenshot(page, "v2_radio_selected")
            except Exception:
                naploz("WARN", "V2 radio nem található — folytatás nélküle.")

            # 8) Radio után is beugorhat modal
            await tutorial_modal_bezarasa_ha_van(page, lepes)

            # 9) Hidden patient id check
            try:
                hidden_val = await page.get_attribute(COFF_PATIENT_HIDDEN_SELECTOR, "value")
            except Exception:
                hidden_val = None
            naploz("INFO", f"coff_patient hidden value: {hidden_val}")

            # 10) Új árajánlat létrehozása (submit)
            lepes = "uj_arajanlat_letrehozas_submit"
            naploz("INFO", f"Lépés: {lepes}")
            await kattintas_es_visszajelzes(
                page,
                Uj_AJANLAT_LETREHOZAS_SUBMIT_SELECTOR,
                lepes=lepes,
                kovetkezo_selector=SELECT2_PLACEHOLDER_SPAN_SELECTOR,
                var_networkidle=True,
            )
            await screenshot(page, "offer_created")

            # 11) Select2 opciók listázása
            lepes = "select2_opciok_listazasa"
            naploz("INFO", f"Lépés: {lepes}")
            opciok = await select2_opciok_listazasa(page, lepes)
            await screenshot(page, "select2_options_listed")

            naploz("OK", f"Szótár kész — {len(opciok)} kezelés kiolvasva")
            return {"ok": True, "lepes": "kesz", "hiba": "", "opciok": opciok}

        except PlaywrightTimeoutError as e:
            naploz("ERROR", f"Timeout @ {lepes}: {e}")
            await screenshot(page, f"timeout_{lepes}")
            upload_error_report(f"Szótár timeout @ {lepes}: {str(e)[:100]}")
            return {"ok": False, "lepes": lepes, "hiba": str(e), "opciok": []}
        except Exception as e:
            naploz("ERROR", f"Hiba @ {lepes}: {type(e).__name__}: {e}")
            await screenshot(page, f"error_{lepes}")
            upload_error_report(f"Szótár error @ {lepes}: {str(e)[:100]}")
            return {"ok": False, "lepes": lepes, "hiba": f"{type(e).__name__}: {e}", "opciok": []}
        finally:
            naploz("INFO", "Browser bezárása (szótár)...")
            await browser.close()
            naploz("INFO", "Browser bezárva.")


# ------------------------------------------------------------
# RUN
# ------------------------------------------------------------

def futtatas() -> None:
    global _SCRIPT_MODE, _ALDOMAIN, _EMAIL, _TELEPHELY_ID, _PACIENS_ID

    # ÚJ MÓD: ANAMNEZIS
    if len(sys.argv) >= 2 and (sys.argv[1] or "").strip().upper() == "ANAMNEZIS":
        _SCRIPT_MODE = "anamnezis"

        if len(sys.argv) < 6:
            naploz("ERROR", "ANAMNEZIS mód: hiányzó argumentumok: ANAMNEZIS aldomain email jelszo paciens_id")
            upload_error_report("Anamnézis: Hiányzó argumentumok")
            print(json.dumps({"ok": False, "hiba": "Hiányzó argumentumok (ANAMNEZIS mód)"}, ensure_ascii=False))
            return

        aldomain_raw = sys.argv[2]
        email = sys.argv[3]
        jelszo = sys.argv[4]
        paciens_id = sys.argv[5]

        aldomain = normalizal_aldomaint(aldomain_raw)
        _ALDOMAIN = aldomain
        _EMAIL = email
        _PACIENS_ID = paciens_id

        naploz("INFO", f"Bemenet: ANAMNEZIS mód | aldomain={aldomain} | paciens_id={paciens_id}")

        if not aldomain:
            naploz("ERROR", "Hiányzó / üres aldomain (ANAMNEZIS mód)")
            upload_error_report("Anamnézis: Hiányzó aldomain")
            print(json.dumps({"ok": False, "hiba": "Hiányzó / üres aldomain"}, ensure_ascii=False))
            return

        if not email or not jelszo:
            naploz("ERROR", "Hiányzó email vagy jelszó (ANAMNEZIS mód)")
            upload_error_report("Anamnézis: Hiányzó email/jelszó")
            print(json.dumps({"ok": False, "hiba": "Hiányzó email vagy jelszó"}, ensure_ascii=False))
            return

        if not (paciens_id or "").strip():
            naploz("ERROR", "Hiányzó paciens_id (ANAMNEZIS mód)")
            upload_error_report("Anamnézis: Hiányzó paciens_id")
            print(json.dumps({"ok": False, "hiba": "Hiányzó paciens_id"}, ensure_ascii=False))
            return

        eredmeny = asyncio.run(folyamat_anamnezis_kiolvasas(aldomain, email, jelszo, paciens_id))

        if not eredmeny.get("ok", False):
            naploz("ERROR", f"ANAMNEZIS sikertelen | lepes={eredmeny.get('lepes')} | hiba={eredmeny.get('hiba')}")
            print("")  # stdout: üres szöveg hiba esetén
            return

        naploz("OK", "ANAMNÉZIS mód sikeresen befejezve")
        print((eredmeny.get("anamnezis_szoveg") or "").strip())
        return

    # RÉGI MÓD: SZÓTÁR
    _SCRIPT_MODE = "szotar"

    if len(sys.argv) < 7:
        naploz("ERROR", "Hiányzó argumentumok: telephely_id aldomain email jelszo paciens_nev supabase_service_role_key")
        upload_error_report("Szótár: Hiányzó argumentumok")
        print(json.dumps({"ok": False, "hiba": "Hiányzó argumentumok", "beszurt": 0}, ensure_ascii=False))
        return

    telephely_id = (sys.argv[1] or "").strip()
    aldomain_raw = sys.argv[2]
    email = sys.argv[3]
    jelszo = sys.argv[4]
    paciens_nev = sys.argv[5]
    supabase_kulcs = sys.argv[6]

    aldomain = normalizal_aldomaint(aldomain_raw)
    _ALDOMAIN = aldomain
    _EMAIL = email
    _TELEPHELY_ID = telephely_id

    naploz("INFO", f"Bemenet: SZÓTÁR mód | aldomain={aldomain} | telephely_id={telephely_id} | paciens_nev={paciens_nev}")

    if not telephely_id:
        naploz("ERROR", "Hiányzó telephely_id")
        upload_error_report("Szótár: Hiányzó telephely_id")
        print(json.dumps({"ok": False, "hiba": "Hiányzó telephely_id", "beszurt": 0}, ensure_ascii=False))
        return

    if not aldomain:
        naploz("ERROR", "Hiányzó / üres aldomain")
        upload_error_report("Szótár: Hiányzó aldomain")
        print(json.dumps({"ok": False, "hiba": "Hiányzó / üres aldomain", "beszurt": 0}, ensure_ascii=False))
        return

    if not email or not jelszo:
        naploz("ERROR", "Hiányzó email vagy jelszó")
        upload_error_report("Szótár: Hiányzó email/jelszó")
        print(json.dumps({"ok": False, "hiba": "Hiányzó email vagy jelszó", "beszurt": 0}, ensure_ascii=False))
        return

    eredmeny = asyncio.run(folyamat_komplex_ajanlat_es_lista(aldomain, email, jelszo, paciens_nev))

    if not eredmeny.get("ok", False):
        naploz("ERROR", f"Sikertelen folyamat | lepes={eredmeny.get('lepes')} | hiba={eredmeny.get('hiba')}")
        # Error report already uploaded inside the async function
        print(json.dumps({"ok": False, "hiba": eredmeny.get("hiba", "Ismeretlen hiba"), "beszurt": 0}, ensure_ascii=False))
        return

    opciok = eredmeny.get("opciok", [])
    naploz("INFO", f"Supabase upsert: {len(opciok)} kezelés...")
    treatments = supabase_sorok_keszitese(telephely_id, opciok)

    feltoltes = supabase_upsert_szotar_kezelesek(treatments, supabase_kulcs)
    if not feltoltes.get("ok", False):
        naploz("ERROR", f"Supabase feltöltés sikertelen: {feltoltes.get('hiba')}")
        upload_error_report(f"Szótár: Supabase upsert hiba — {feltoltes.get('hiba', '')[:100]}")
        kimenet = {
            "ok": False,
            "hiba": feltoltes.get("hiba", "Supabase hiba"),
            "beszurt": 0,
            "telephely_id": telephely_id,
            "feltoltott_tartalom": treatments,
        }
        print(json.dumps(kimenet, ensure_ascii=False))
        return

    naploz("OK", f"Supabase upsert sikeres: {feltoltes.get('beszurt', 0)} sor")

    # Safe stale-row deletion: new data is confirmed in DB, now clean up old entries
    # Use (name, category) tuples — the upsert conflict key is (telephely_id, category, name)
    uj_kulcsok = {(t["name"], t.get("category", "")) for t in treatments}
    naploz("INFO", f"[CLEANUP] {len(treatments)} aktív kezelés — elavult sorok keresése...")

    try:
        fetch_url = (
            f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLA}"
            f"?telephely_id=eq.{urllib.parse.quote(telephely_id)}&select=id,name,category"
        )
        req = urllib.request.Request(
            fetch_url,
            headers={
                "apikey": supabase_kulcs,
                "Authorization": f"Bearer {supabase_kulcs}",
                "Accept": "application/json",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            regi_sorok = json.loads(resp.read().decode("utf-8"))

        stale_ids = [
            row["id"] for row in regi_sorok
            if (row.get("name"), row.get("category", "")) not in uj_kulcsok
        ]

        if stale_ids:
            naploz("INFO", f"[CLEANUP] {len(stale_ids)} elavult sor törlése...")
            BATCH = 200
            torolve = 0
            for i in range(0, len(stale_ids), BATCH):
                batch = stale_ids[i : i + BATCH]
                id_filter = "in.(" + ",".join(batch) + ")"
                del_url = (
                    f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLA}"
                    f"?id={urllib.parse.quote(id_filter)}"
                )
                del_req = urllib.request.Request(
                    del_url,
                    headers={
                        "apikey": supabase_kulcs,
                        "Authorization": f"Bearer {supabase_kulcs}",
                        "Prefer": "return=minimal",
                    },
                    method="DELETE",
                )
                with urllib.request.urlopen(del_req, timeout=15):
                    torolve += len(batch)
            naploz("OK", f"[CLEANUP] {torolve} elavult sor törölve")
        else:
            naploz("INFO", "[CLEANUP] Nincs elavult sor")
    except Exception as e:
        naploz("WARN", f"[CLEANUP] Törlés sikertelen (upsert OK): {type(e).__name__}: {str(e)[:200]}")

    kimenet = {
        "ok": True,
        "beszurt": feltoltes.get("beszurt", 0),
        "telephely_id": telephely_id,
        "feltoltott_tartalom": treatments,
    }
    print(json.dumps(kimenet, ensure_ascii=False))


if __name__ == "__main__":
    try:
        futtatas()
    except SystemExit as e:
        sys.exit(e.code)
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        upload_error_report(f"Top-level crash: {str(e)[:100]}")
        sys.exit(1)
