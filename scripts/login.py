import sys
import io
import os
import json
import base64
import urllib.request
import urllib.parse
import http.cookiejar
from html.parser import HTMLParser
from datetime import datetime, timezone

"------------------------------------------------------------"
# VÁLTOZÓK
"------------------------------------------------------------"

Debug: bool = True
FLEXI_DOMAIN_SUFFIX: str = "flexi-dent.hu"
JELSZO_KIIRASA: bool = True
TIMEOUT_SEC: int = 10

PLAYWRIGHT_FALLBACK: bool = True

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

SIKER_MARKER: str = "header-btn-patients"
HIBA_MARKER: str = "xalert-in"

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

# Supabase config for error reporting (hardcoded)
SUPABASE_URL = "https://bpjzgapmoyhtgryglcke.supabase.co"
SUPABASE_SERVICE_KEY = _load_env_secret("SUPABASE_SERVICE_KEY")

# In-memory log buffer
_log_buffer: list = []

# In-memory screenshot buffer: list of (name, bytes)
_screenshot_buffer: list = []


"------------------------------------------------------------"
# SEGÉDFÜGGVÉNYEK
"------------------------------------------------------------"

def naploz(szint: str, uzenet: str) -> None:
    if szint == "DEBUG" and not Debug:
        return
    line = f"[{szint}] {uzenet}"
    _log_buffer.append(line)
    print(line, file=sys.stderr, flush=True)


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
    return f"https://{aldomain}.{FLEXI_DOMAIN_SUFFIX}/"


class FormActionParser(HTMLParser):
    """Find the login form's action URL and any hidden fields."""
    def __init__(self):
        super().__init__()
        self.action = None
        self.hidden_fields: dict = {}
        self._in_form = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form":
            self._in_form = True
            self.action = a.get("action", "")
        if self._in_form and tag == "input" and a.get("type") == "hidden":
            name = a.get("name")
            value = a.get("value", "")
            if name:
                self.hidden_fields[name] = value

    def handle_endtag(self, tag):
        if tag == "form":
            self._in_form = False


"------------------------------------------------------------"
# SUPABASE UPLOAD FUNCTIONS
"------------------------------------------------------------"

def supabase_upload_screenshot(name: str, png_bytes: bytes) -> str:
    """Upload a screenshot to Supabase Storage, return the path."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        naploz("ERROR", "[UPLOAD] Supabase env vars hiányoznak")
        return ""

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = f"{timestamp}/{name}.png"
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


def supabase_insert_error_log(
    script_name: str,
    domain: str,
    severity: str,
    summary: str,
    full_log: str,
    screenshot_paths: list,
    metadata: dict,
    company_name: str = "",
    telephely_name: str = "",
    username: str = "",
    user_id: str = "",
) -> None:
    """Insert an error log record into Supabase."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        naploz("ERROR", "[UPLOAD] Supabase env vars hiányoznak, error log nem lett elmentve")
        return

    insert_url = f"{SUPABASE_URL}/rest/v1/error_logs"

    # Convert storage paths to full signed URLs for easy viewing
    screenshot_urls = []
    for path in screenshot_paths:
        if path:
            screenshot_urls.append(f"{SUPABASE_URL}/storage/v1/object/error-screenshots/{path}")

    body = json.dumps({
        "script_name": script_name,
        "domain": domain,
        "severity": severity,
        "summary": summary,
        "full_log": full_log,
        "screenshot_urls": screenshot_urls,
        "metadata": metadata,
        "company_name": company_name or None,
        "telephely_name": telephely_name or None,
        "username": username or None,
        "user_id": user_id or None,
    }).encode("utf-8")

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


def upload_error_report(
    script_name: str,
    domain: str,
    eredmeny: int,
    email: str = "",
    company_name: str = "",
    telephely_name: str = "",
    username: str = "",
    user_id: str = "",
) -> None:
    """Upload all buffered screenshots + full log to Supabase."""
    if eredmeny == 1:
        return  # Success — no need to log

    severity = "error" if eredmeny == 0 else "warning"
    summary = f"Login {'sikertelen' if eredmeny == 0 else 'nem egyértelmű'}: {domain}"

    # Upload screenshots
    screenshot_paths = []
    for name, png_bytes in _screenshot_buffer:
        path = supabase_upload_screenshot(name, png_bytes)
        if path:
            screenshot_paths.append(path)

    # Full log text
    full_log = "\n".join(_log_buffer)

    # Metadata
    metadata = {
        "email": email,
        "exit_code": eredmeny,
        "screenshot_count": len(_screenshot_buffer),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    supabase_insert_error_log(
        script_name=script_name,
        domain=domain,
        severity=severity,
        summary=summary,
        full_log=full_log,
        screenshot_paths=screenshot_paths,
        metadata=metadata,
        company_name=company_name,
        telephely_name=telephely_name,
        username=username,
        user_id=user_id,
    )


"------------------------------------------------------------"
# MÓDSZER 1: Közvetlen HTTP POST (stdlib)
"------------------------------------------------------------"

def bejelentkezes_http(aldomain: str, email: str, jelszo: str) -> int:
    url = flexi_url_osszerakasa(aldomain)
    naploz("INFO", f"[HTTP] URL: {url}")
    naploz("INFO", f"[HTTP] email='{email}', jelszo='{jelszo if JELSZO_KIIRASA else '***'}'")

    try:
        cookie_jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(cookie_jar),
            urllib.request.HTTPRedirectHandler(),
        )

        naploz("INFO", "[HTTP] GET login page...")
        get_req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        get_resp = opener.open(get_req, timeout=TIMEOUT_SEC)
        get_body = get_resp.read().decode("utf-8", errors="replace")
        naploz("INFO", f"[HTTP] GET status: {get_resp.status}")

        if get_resp.status != 200:
            naploz("ERROR", f"[HTTP] GET failed: {get_resp.status}")
            return -1

        # Check for captcha
        get_lower = get_body.lower()
        captcha_words = ["recaptcha", "captcha", "g-recaptcha", "sitekey"]
        for word in captcha_words:
            if word in get_lower:
                idx = get_lower.index(word)
                snippet = get_body[max(0, idx-100):idx+200].replace('\n', ' ').replace('\t', ' ')
                naploz("INFO", f"[HTTP] CAPTCHA: '{word}' → ...{snippet}...")

        has_captcha = any(w in get_lower for w in captcha_words)
        naploz("INFO", f"[HTTP] Captcha az oldalon: {has_captcha}")

        parser = FormActionParser()
        parser.feed(get_body)

        if parser.action:
            post_url = urllib.parse.urljoin(get_resp.url, parser.action)
        else:
            post_url = get_resp.url

        naploz("INFO", f"[HTTP] Form action: {post_url}")
        naploz("DEBUG", f"[HTTP] Hidden fields: {parser.hidden_fields}")

        form_data = {
            **parser.hidden_fields,
            "screen_w": "1920",
            "screen_h": "1080",
            "emailaddress": email,
            "password": jelszo,
        }

        naploz("INFO", "[HTTP] POSTing login form...")
        encoded_data = urllib.parse.urlencode(form_data).encode("utf-8")
        post_req = urllib.request.Request(
            post_url,
            data=encoded_data,
            method="POST",
            headers={
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": get_resp.url,
                "Origin": f"https://{aldomain}.{FLEXI_DOMAIN_SUFFIX}",
            },
        )
        post_resp = opener.open(post_req, timeout=TIMEOUT_SEC)
        post_body = post_resp.read().decode("utf-8", errors="replace")
        naploz("INFO", f"[HTTP] POST status: {post_resp.status}, Final URL: {post_resp.url}")

        if SIKER_MARKER in post_body:
            naploz("INFO", "[HTTP] Döntés: 1 (siker)")
            return 1
        elif HIBA_MARKER in post_body:
            naploz("ERROR", "[HTTP] Döntés: 0 (hibaablak)")
            return 0
        else:
            naploz("INFO", f"[HTTP] Nem egyértelmű (body: {len(post_body)} byte)")
            # Search for clues
            body_lower = post_body.lower()
            for word in ["hibás", "hiba", "captcha", "xalert", "error"]:
                if word in body_lower:
                    idx = body_lower.index(word)
                    snippet = post_body[max(0, idx-60):idx+100].replace('\n', ' ').replace('\t', ' ')
                    naploz("DEBUG", f"[HTTP] Talált: '{word}' → ...{snippet}...")
            return -1

    except Exception as e:
        naploz("ERROR", f"[HTTP] Kivétel: {type(e).__name__}: {str(e)[:200]}")
        return -1


"------------------------------------------------------------"
# MÓDSZER 2: Playwright fallback (in-memory screenshots)
"------------------------------------------------------------"

HEADLESS: bool = True
MAX_VARAKOZAS_MS: int = 7000
UJRA_PROBA_SZUNET_MS: int = 2000
MAX_PROBA: int = 2

EMAIL_SELECTOR: str = "input[name='emailaddress']"
PASS_SELECTOR: str = "input[name='password']"
HIBAABLAK_SELECTOR: str = "#xalert-in"
SIKER_GOMB_SELECTOR: str = "#header-btn-patients"
LOGIN_GOMB_SELECTOR: str = "input[type='submit'][value='Bejelentkezés'].form-control.btn.btn-success.mb-5"


def bejelentkezes_playwright(aldomain: str, email: str, jelszo: str) -> int:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

    url = flexi_url_osszerakasa(aldomain)
    naploz("INFO", f"[PLAYWRIGHT] Fallback: {url}")

    ss_num = [0]

    def screenshot(page, leiras: str):
        """Capture screenshot to in-memory buffer."""
        ss_num[0] += 1
        name = f"{ss_num[0]:02d}_{leiras}"
        try:
            png_bytes = page.screenshot(full_page=True)
            _screenshot_buffer.append((name, png_bytes))
            naploz("INFO", f"[SCREENSHOT] {name} ({len(png_bytes)} bytes)")
        except Exception as e:
            naploz("ERROR", f"[SCREENSHOT] {name} hiba: {e}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.set_default_timeout(MAX_VARAKOZAS_MS)
        page.set_default_navigation_timeout(MAX_VARAKOZAS_MS)

        try:
            try:
                from playwright_stealth import stealth_sync
                stealth_sync(page)
                naploz("INFO", "[PLAYWRIGHT] Stealth patch alkalmazva")
            except ImportError:
                pass

            # 1. Page load
            page.goto(url, wait_until="domcontentloaded", timeout=MAX_VARAKOZAS_MS)
            page.wait_for_timeout(1000)
            screenshot(page, "oldal_betoltve")

            # 2. Wait for fields
            page.wait_for_selector(EMAIL_SELECTOR, timeout=MAX_VARAKOZAS_MS)
            page.wait_for_selector(PASS_SELECTOR, timeout=MAX_VARAKOZAS_MS)
            screenshot(page, "mezok_megtalalva")

            # 3. Fill email
            page.fill(EMAIL_SELECTOR, email)
            page.wait_for_timeout(500)
            screenshot(page, "email_kitoltve")

            # 4. Fill password
            page.fill(PASS_SELECTOR, jelszo)
            page.wait_for_timeout(500)
            screenshot(page, "jelszo_kitoltve")

            # 5. reCAPTCHA — Capsolver token injection
            try:
                import time as _ct
                import requests as _req

                CAP_KEY = _load_env_secret("CAPSOLVER_API_KEY")

                # Extract sitekey from .g-recaptcha or iframe src
                _sitekey = None
                try:
                    _sitekey = page.get_attribute(".g-recaptcha", "data-sitekey", timeout=3000)
                except Exception:
                    pass
                if not _sitekey:
                    try:
                        _iframe_src = page.locator("iframe[src*='recaptcha'][src*='anchor']").first.get_attribute("src", timeout=3000)
                        if _iframe_src and "k=" in _iframe_src:
                            import urllib.parse as _up2
                            _p = _up2.parse_qs(_up2.urlparse(_iframe_src).query)
                            _sitekey = (_p.get("k") or _p.get("sitekey") or [None])[0]
                    except Exception:
                        pass

                if not _sitekey:
                    naploz("INFO", "[CAPTCHA] Sitekey nem talalhato, captcha atugras")
                else:
                    naploz("INFO", f"[CAPTCHA] Sitekey: {_sitekey} — Capsolver task inditas...")
                    _cr = _req.post("https://api.capsolver.com/createTask", json={
                        "clientKey": CAP_KEY,
                        "task": {
                            "type": "ReCaptchaV2TaskProxyLess",
                            "websiteURL": url,
                            "websiteKey": _sitekey,
                            "isInvisible": False,
                        }
                    }, timeout=30).json()

                    if _cr.get("errorId") != 0:
                        naploz("ERROR", f"[CAPTCHA] Capsolver hiba: {_cr.get('errorDescription')}")
                    else:
                        _task_id = _cr["taskId"]
                        naploz("INFO", f"[CAPTCHA] Task: {_task_id} — polling...")
                        _token = None
                        _deadline = _ct.time() + 120
                        _attempt = 0
                        while _ct.time() < _deadline:
                            _ct.sleep(3)
                            _attempt += 1
                            _pr = _req.post("https://api.capsolver.com/getTaskResult", json={
                                "clientKey": CAP_KEY, "taskId": _task_id
                            }, timeout=15).json()
                            _st = _pr.get("status")
                            naploz("INFO", f"[CAPTCHA] Poll #{_attempt} — {_st}")
                            if _st == "ready":
                                _token = _pr.get("solution", {}).get("gRecaptchaResponse")
                                break
                            elif _st != "processing":
                                naploz("ERROR", f"[CAPTCHA] Task meghiusult: {_pr.get('errorDescription')}")
                                break

                        if _token:
                            naploz("INFO", f"[CAPTCHA] Token megerkezett ({len(_token)} char) — injektalas...")
                            page.evaluate("""(t) => {
                                document.querySelectorAll('#g-recaptcha-response, [name="g-recaptcha-response"]')
                                    .forEach(e => { e.innerHTML = t; e.value = t; });
                                try {
                                    const cfg = window.___grecaptcha_cfg;
                                    if (cfg && cfg.clients)
                                        for (const k of Object.keys(cfg.clients))
                                            for (const k2 of Object.keys(cfg.clients[k])) {
                                                const cb = cfg.clients[k][k2];
                                                if (cb && typeof cb.callback === 'function') cb.callback(t);
                                            }
                                } catch(e) {}
                            }""", _token)
                            page.wait_for_timeout(2000)
                            naploz("INFO", "[CAPTCHA] Token injektalva")
                            screenshot(page, "captcha_megoldva")
                        else:
                            naploz("ERROR", "[CAPTCHA] Token nem erkezett meg")
                            screenshot(page, "captcha_timeout")

            except Exception as e:
                naploz("ERROR", f"[CAPTCHA] Capsolver hiba: {type(e).__name__}: {str(e)[:200]}")
                screenshot(page, "captcha_hiba")

            # 6. Before login click
            screenshot(page, "login_elott")

            # 7. Click login
            try:
                page.click(LOGIN_GOMB_SELECTOR, timeout=MAX_VARAKOZAS_MS)
                page.wait_for_timeout(2000)
                screenshot(page, "login_utan")
            except Exception as e:
                naploz("ERROR", f"[PLAYWRIGHT] Login kattintás hiba: {type(e).__name__}: {str(e)[:120]}")
                screenshot(page, "login_hiba")
                return 0

            # 8. Check result
            screenshot(page, "eredmeny")

            try:
                if page.is_visible(HIBAABLAK_SELECTOR):
                    screenshot(page, "hibaablak")
                    return 0
            except Exception:
                pass

            try:
                page.wait_for_selector(SIKER_GOMB_SELECTOR, timeout=3000)
                screenshot(page, "siker")
                return 1
            except Exception:
                screenshot(page, "nincs_siker")

            return 0

        except PlaywrightTimeoutError:
            naploz("ERROR", "[PLAYWRIGHT] TimeoutError")
            screenshot(page, "timeout")
            return 0
        except Exception as e:
            naploz("ERROR", f"[PLAYWRIGHT] {type(e).__name__}: {str(e)[:200]}")
            try:
                screenshot(page, "kivetel")
            except Exception:
                pass
            return 0
        finally:
            browser.close()


"------------------------------------------------------------"
# RUN
"------------------------------------------------------------"

def futtatas() -> None:
    naploz("INFO", f"Indítás | argv: {sys.argv}")

    if len(sys.argv) < 4:
        naploz("ERROR", "Hiányzó argumentumok: kell min. 3 (aldomain, email, jelszó) + opcionális (cég, telephely, username, user_id)")
        print("0")
        return

    aldomain = normalizal_aldomaint(sys.argv[1])
    email = sys.argv[2]
    jelszo = sys.argv[3]

    # Optional args: company, telephely, username, user_id
    company_name = sys.argv[4] if len(sys.argv) > 4 else ""
    telephely_name = sys.argv[5] if len(sys.argv) > 5 else ""
    username = sys.argv[6] if len(sys.argv) > 6 else ""
    user_id = sys.argv[7] if len(sys.argv) > 7 else ""

    naploz("INFO", f"Aldomain: '{sys.argv[1]}' → '{aldomain}'")
    if company_name:
        naploz("INFO", f"Cég: '{company_name}', Telephely: '{telephely_name}', User: '{username}' ({user_id})")

    if not aldomain:
        naploz("ERROR", "Üres aldomain")
        print("0")
        return

    # Try direct HTTP first
    eredmeny = bejelentkezes_http(aldomain, email, jelszo)

    # If HTTP was inconclusive, fall back to Playwright
    if eredmeny == -1 and PLAYWRIGHT_FALLBACK:
        naploz("INFO", "HTTP nem egyértelmű, Playwright fallback...")
        eredmeny = bejelentkezes_playwright(aldomain, email, jelszo)

    eredmeny = max(eredmeny, 0)
    naploz("INFO", f"Végső kimenet: {eredmeny}")

    # Upload error report to Supabase (only on failure)
    upload_error_report(
        script_name="login",
        domain=aldomain,
        eredmeny=eredmeny,
        email=email,
        company_name=company_name,
        telephely_name=telephely_name,
        username=username,
        user_id=user_id,
    )

    print(str(eredmeny))


if __name__ == "__main__":
    import sys as _sys
    print("[DEBUG] login.py script started", file=_sys.stderr, flush=True)
    try:
        futtatas()
    except Exception as _ex:
        print(f"[FATAL] Unhandled exception: {type(_ex).__name__}: {_ex}", file=_sys.stderr, flush=True)
        print("0")
