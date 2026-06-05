"""
captcha_feeder.py — Live CAPTCHA data collector for the admin trainer panel.

Opens Google's reCAPTCHA demo page in a browser (headless by default),
captures fresh challenge screenshots on demand, uploads them to Supabase,
and returns signed image URLs to the trainer UI.

Usage:
    python scripts/captcha_feeder.py            # headless
    python scripts/captcha_feeder.py --visible  # show browser window
    python scripts/captcha_feeder.py --port 7878

HTTP endpoints (all POST):
    POST /capture   -> captures next CAPTCHA, returns JSON
    POST /status    -> returns {"running": true}

The Vite dev server at localhost:8080 proxies /captcha-feeder/* here.
"""

import os
import json
import time
import uuid
import queue
import threading
import urllib.request
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler


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


# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

SUPABASE_URL = "https://bpjzgapmoyhtgryglcke.supabase.co"
SUPABASE_SERVICE_KEY = _load_env_secret("SUPABASE_SERVICE_KEY")

CAPSOLVER_API_KEY = _load_env_secret("CAPSOLVER_API_KEY")

DEMO_URL = "https://www.google.com/recaptcha/api2/demo"

CHALLENGE_IFRAME = "iframe[src*='recaptcha'][src*='bframe']"
CHECKBOX_IFRAME  = "iframe[src*='recaptcha'][src*='anchor']"
GRID_SELECTOR    = "#rc-imageselect-target"
PROMPT_SELECTOR  = ".rc-imageselect-desc-wrapper"
TILE_SELECTOR    = "td.rc-imageselect-tile"
RELOAD_BUTTON    = "#recaptcha-reload-button"
CHECKBOX_SEL     = ".recaptcha-checkbox-border"


# ─────────────────────────────────────────────
# PLAYWRIGHT WORKER THREAD
# ─────────────────────────────────────────────

_req_queue: queue.Queue = queue.Queue()
_res_queue: queue.Queue = queue.Queue()


def _playwright_worker(headless: bool):
    """Runs in its own thread — owns the Playwright browser."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[FEEDER] ERROR: playwright not installed. Run: pip install playwright && playwright install chromium")
        _res_queue.put(("error", "playwright not installed"))
        return

    print(f"[FEEDER] Starting browser (headless={headless})...")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)

        def new_page():
            p = browser.new_page(viewport={"width": 1280, "height": 900})
            try:
                from playwright_stealth import stealth_sync
                stealth_sync(p)
            except ImportError:
                pass
            p.goto(DEMO_URL, wait_until="domcontentloaded")
            p.wait_for_timeout(2000)
            return p

        page = new_page()
        print("[FEEDER] Browser ready.")

        has_challenge = False

        while True:
            cmd = _req_queue.get()
            if cmd == "STOP":
                break

            # cmd is now a dict: {"type": "single_image" | "multi_image" | None}
            if not isinstance(cmd, dict):
                _res_queue.put(("error", f"unknown command: {cmd}"))
                continue

            requested_type = cmd.get("type")  # None means any

            # Check if page is still alive; recreate if not
            try:
                _ = page.url
            except Exception:
                print("[FEEDER] Page was closed — reopening...")
                try:
                    page = new_page()
                    has_challenge = False
                    print("[FEEDER] Page reopened.")
                except Exception as e2:
                    _res_queue.put(("error", f"Could not reopen page: {e2}"))
                    continue

            # Try up to 6 times to get the requested challenge type
            # PEEK first (no DB write), then SAVE only when type matches
            result = None
            last_error = None
            for attempt in range(6):
                try:
                    peek = _peek_challenge(page, has_challenge)
                    has_challenge = True
                    got_type = peek["challenge_type"]

                    if requested_type and got_type != requested_type:
                        print(f"[FEEDER] Got type '{got_type}', wanted '{requested_type}' — skipping (not saved)")
                        # Just reload to get a new challenge; don't save anything
                        try:
                            frame = page.frame_locator(CHALLENGE_IFRAME)
                            btn = frame.locator(RELOAD_BUTTON)
                            if btn.count() > 0:
                                btn.click(timeout=3000)
                                page.wait_for_timeout(1500)
                            else:
                                raise Exception("no reload")
                        except Exception:
                            page.reload(wait_until="domcontentloaded")
                            page.wait_for_timeout(2000)
                            has_challenge = False
                            _trigger_challenge(page)
                        continue

                    # Type matches — save to Supabase now
                    result = _save_capture(peek)
                    break
                except Exception as e:
                    last_error = e
                    print(f"[FEEDER] Capture error (attempt {attempt+1}): {e}")
                    try:
                        page.reload(wait_until="domcontentloaded")
                        page.wait_for_timeout(2000)
                        has_challenge = False
                    except Exception:
                        try:
                            page = new_page()
                            has_challenge = False
                            print("[FEEDER] Page recreated after error.")
                        except Exception as e3:
                            print(f"[FEEDER] Could not recreate page: {e3}")

            if result is not None:
                _res_queue.put(("ok", result))
            else:
                _res_queue.put(("error", str(last_error or "No matching challenge found")))

        browser.close()
        print("[FEEDER] Browser closed.")


def _peek_challenge(page, has_challenge: bool) -> dict:
    """Navigate to next challenge, screenshot it. Does NOT write to Supabase."""

    # ── Get a fresh challenge ──────────────────────────────────────────────
    if has_challenge:
        try:
            frame = page.frame_locator(CHALLENGE_IFRAME)
            btn = frame.locator(RELOAD_BUTTON)
            if btn.count() > 0:
                btn.click(timeout=3000)
                page.wait_for_timeout(1800)
            else:
                raise RuntimeError("No reload button")
        except Exception:
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            _trigger_challenge(page)
    else:
        _trigger_challenge(page)

    # Wait for challenge
    try:
        page.locator(CHALLENGE_IFRAME).wait_for(state="visible", timeout=8000)
        page.wait_for_timeout(500)
    except Exception:
        raise RuntimeError("Challenge iframe did not appear")

    # ── Read metadata ──────────────────────────────────────────────────────
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME)
        challenge_text = frame.locator(PROMPT_SELECTOR).inner_text(timeout=2000).strip()
        challenge_text = " ".join(challenge_text.split())
    except Exception:
        challenge_text = "Unknown challenge"

    try:
        frame = page.frame_locator(CHALLENGE_IFRAME)
        tile_count = frame.locator(TILE_SELECTOR).count()
        grid_size = tile_count if tile_count in (9, 16) else 16
    except Exception:
        grid_size = 16

    challenge_type = "multi_image" if "images" in challenge_text.lower() else "single_image"
    print(f"[FEEDER] Challenge: '{challenge_text}' | {grid_size} tiles | {challenge_type}")

    # ── Screenshot ────────────────────────────────────────────────────────
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME)
        img_src = frame.locator('.rc-image-tile-wrapper img').first.get_attribute('src')
        if not img_src:
            raise Exception("No image src found")
        if img_src.startswith('/'):
            img_src = "https://www.google.com" + img_src
            
        import requests
        session = requests.Session()
        for cookie in page.context.cookies():
            session.cookies.set(cookie['name'], cookie['value'], domain=cookie['domain'])
            
        img_res = session.get(img_src, timeout=10)
        screenshot_bytes = img_res.content
    except Exception as e:
        raise RuntimeError(f"Payload extraction failed: {e}")

    return {
        "challenge_text": challenge_text,
        "challenge_type": challenge_type,
        "grid_size": grid_size,
        "screenshot_bytes": screenshot_bytes,
    }


def _save_capture(peek: dict) -> dict:
    """Upload screenshot to Supabase and insert captcha_vector row."""
    row_id = str(uuid.uuid4())
    ts = int(time.time())
    storage_path = f"google-demo/feeder/{ts}_{row_id[:8]}.png"

    _supabase_upload(storage_path, peek["screenshot_bytes"])
    screenshot_url = f"{SUPABASE_URL}/storage/v1/object/captcha-grids/{storage_path}"

    row = {
        "id": row_id,
        "session_id": f"feeder-{ts}",
        "attempt_round": 1,
        "domain": "google-demo",
        "challenge_text": peek["challenge_text"],
        "challenge_type": peek["challenge_type"],
        "grid_size": peek["grid_size"],
        "grid_screenshot_url": screenshot_url,
        "ai_phase1_tiles": [],
        "ai_phase2_tiles": [],
        "ai_final_tiles": [],
    }
    _supabase_insert("captcha_vector", row)
    signed_url = _supabase_sign(storage_path)

    print(f"[FEEDER] Saved: {row_id[:8]} ({peek['grid_size']} tiles)")
    return {
        "id": row_id,
        "storage_path": storage_path,
        "challenge_text": peek["challenge_text"],
        "challenge_type": peek["challenge_type"],
        "grid_size": peek["grid_size"],
        "signed_url": signed_url,
    }


def _trigger_challenge(page):
    """Click checkbox on a fresh/reloaded page to trigger the challenge."""
    max_tries = 3
    for attempt in range(max_tries):
        try:
            cb_frame = page.frame_locator(CHECKBOX_IFRAME).first
            cb = cb_frame.locator(CHECKBOX_SEL)
            cb.wait_for(state="visible", timeout=5000)
            cb.click(timeout=5000)
            page.wait_for_timeout(3000)

            # Check for challenge
            if page.locator(CHALLENGE_IFRAME).count() > 0:
                return  # success

            # No challenge appeared (Google passed without image) — reload and retry
            print(f"[FEEDER] No challenge on attempt {attempt + 1}, reloading...")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
        except Exception as e:
            print(f"[FEEDER] Checkbox error on attempt {attempt + 1}: {e}")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(2000)

    raise RuntimeError("Could not trigger CAPTCHA challenge after retries")


# ─────────────────────────────────────────────
# AI SOLVING HELPERS
# ─────────────────────────────────────────────

import re as _re
import urllib.parse as _urlparse

def _parse_category(challenge_text: str) -> str:
    """Extract key noun from challenge text (Hungarian or English)."""
    # Strip common prefixes
    text = challenge_text.lower()
    for prefix in ["válassza ki az összes olyan négyzetet, amelyen ",
                   "válassza ki az összes olyan képet, amely ",
                   "válassza ki az összes olyan képet, amelyen ",
                   "jelölje ki az összes olyan négyzetet, amelyen ",
                   "select all squares with ", "select all images with ",
                   "click all images showing "]:
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    # Take first meaningful word(s)
    m = _re.match(r'^([\w\s]+?)(?:\s+látható|\s+ábrázol|\s+showing|$)', text.strip())
    return m.group(1).strip() if m else text.split()[0] if text else ""


def _fetch_lessons(challenge_text: str, grid_size: int) -> str:
    """Fetch synthesized lesson from captcha_lessons for this category/grid_size."""
    category = _parse_category(challenge_text)
    if not category:
        return ""
    try:
        url = (f"{SUPABASE_URL}/rest/v1/captcha_lessons"
               f"?category=eq.{_urlparse.quote(category)}"
               f"&grid_size=eq.{grid_size}&select=lesson_rules&limit=1")
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
        })
        resp = urllib.request.urlopen(req, timeout=5)
        rows = json.loads(resp.read().decode())
        if rows and rows[0].get("lesson_rules"):
            return f"\nLESSON FOR {category.upper()}:\n{rows[0]['lesson_rules']}\n"
    except Exception:
        pass
    return ""


def _ai_solve(storage_path: str, challenge_text: str, grid_size: int) -> list:
    """Download grid image from Supabase, send to Capsolver, return list of 1-indexed tile numbers."""
    import base64

    # Download image
    if not storage_path.endswith('.png'):
        storage_path += '.png'
        
    dl_req = urllib.request.Request(
        f"{SUPABASE_URL}/storage/v1/object/captcha-grids/{storage_path}",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
        })
    img_bytes = urllib.request.urlopen(dl_req, timeout=10).read()
    img_b64 = base64.b64encode(img_bytes).decode('utf-8')

    # Map Hungarian categories to English Google /m/ identifiers for Capsolver
    cat = _parse_category(challenge_text).lower()
    mapping = {
        "lámpa": "/m/015qff",
        "gyalogátkelő": "/m/015qbp",
        "tűzcsap": "/m/01pns0",
        "lépcső": "/m/01lynh",
        "híd": "/m/015kr",
        "busz": "/m/01bjv",          # Match before auto
        "motor": "/m/04_sv",         # Match before kerekpar
        "kerékpár": "/m/0199g",
        "autó": "/m/0k4j",
        "hajó": "/m/019jd",
        "kémény": "/m/01jk_4",
        "pálma": "/m/0cdl1",
        "hegy": "/m/09d_r",
        "traktor": "/m/0130jx",
    }
    question = cat
    for k, v in mapping.items():
        if k in cat:
            question = v
            break

    payload = {
        "clientKey": CAPSOLVER_API_KEY,
        "task": {
            "type": "ReCaptchaV2Classification",
            "image": img_b64,
            "question": question
        }
    }

    req = urllib.request.Request(
        "https://api.capsolver.com/createTask",
        data=json.dumps(payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )

    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode('utf-8'))

        if data.get("errorId") == 0 and data.get("status") == "ready":
            solution = data.get("solution", {})
            objects = solution.get("objects", [])
            # Capsolver returns 0-indexed tile coordinates, we need 1-indexed for the UI/DB
            return sorted([n + 1 for n in objects])

        print(f"[FEEDER] Capsolver response error/not ready: {data}")
    except Exception as e:
        err_msg = e.read().decode('utf-8') if hasattr(e, 'read') else str(e)
        print(f"[FEEDER] Capsolver API Request failed: {err_msg}")

    return []


# ─────────────────────────────────────────────
# SUPABASE HELPERS
# ─────────────────────────────────────────────

def _supabase_upload(path: str, data: bytes):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/storage/v1/object/captcha-grids/{path}",
        data=data, method="POST",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "image/png",
        }
    )
    urllib.request.urlopen(req, timeout=15)


def _supabase_insert(table: str, row: dict):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}",
        data=json.dumps(row).encode(), method="POST",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
    )
    urllib.request.urlopen(req, timeout=10)


def _supabase_sign(path: str) -> str:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/storage/v1/object/sign/captcha-grids/{path}",
        data=json.dumps({"expiresIn": 7200}).encode(), method="POST",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
        }
    )
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read().decode())
    signed = data.get("signedURL") or data.get("signedUrl") or ""
    return f"{SUPABASE_URL}/storage/v1{signed}" if signed.startswith("/") else signed


# ─────────────────────────────────────────────
# HTTP SERVER
# ─────────────────────────────────────────────

class FeederHandler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path == "/status":
            self._json(200, {"running": True})
        elif self.path == "/capture":
            # Parse optional JSON body for type filter
            requested_type = None
            content_len = int(self.headers.get("Content-Length", 0))
            if content_len > 0:
                try:
                    body = json.loads(self.rfile.read(content_len).decode())
                    requested_type = body.get("type")  # "single_image" | "multi_image" | None
                except Exception:
                    pass
            type_label = f" (type={requested_type})" if requested_type else ""
            print(f"[FEEDER] /capture requested{type_label}")
            _req_queue.put({"type": requested_type})
            try:
                status, result = _res_queue.get(timeout=60)
                if status == "ok":
                    self._json(200, result)
                else:
                    self._json(500, {"error": result})
            except queue.Empty:
                self._json(504, {"error": "Timeout waiting for CAPTCHA"})
        elif self.path == "/ai-capture":
            # Capture + AI solve with current lessons
            requested_type = None
            content_len = int(self.headers.get("Content-Length", 0))
            if content_len > 0:
                try:
                    body = json.loads(self.rfile.read(content_len).decode())
                    requested_type = body.get("type")
                except Exception:
                    pass
            type_label = f" (type={requested_type})" if requested_type else ""
            print(f"[FEEDER] /ai-capture requested{type_label}")
            _req_queue.put({"type": requested_type})
            try:
                status, capture = _res_queue.get(timeout=60)
                if status != "ok":
                    self._json(500, {"error": capture})
                    return
                # Run AI solve in this thread (no Playwright needed)
                try:
                    ai_tiles = _ai_solve(
                        capture["storage_path"],
                        capture["challenge_text"],
                        capture["grid_size"],
                    )
                    # Save AI tiles to Supabase
                    upd_req = urllib.request.Request(
                        f"{SUPABASE_URL}/rest/v1/captcha_vector?id=eq.{capture['id']}",
                        data=json.dumps({"ai_final_tiles": ai_tiles}).encode(),
                        method="PATCH",
                        headers={
                            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                            "apikey": SUPABASE_SERVICE_KEY,
                            "Content-Type": "application/json",
                            "Prefer": "return=minimal",
                        }
                    )
                    urllib.request.urlopen(upd_req, timeout=10)
                    print(f"[FEEDER] AI tiles: {ai_tiles}")
                    self._json(200, {**capture, "ai_tiles": ai_tiles})
                except Exception as e:
                    print(f"[FEEDER] AI solve failed: {e}")
                    self._json(200, {**capture, "ai_tiles": [], "ai_error": str(e)})
            except queue.Empty:
                self._json(504, {"error": "Timeout waiting for CAPTCHA"})
        else:
            self._json(404, {"error": "Not found"})

    def _json(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[FEEDER] {self.address_string()} {fmt % args}")


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CAPTCHA Feeder Server")
    parser.add_argument("--port",    type=int, default=7878)
    parser.add_argument("--visible", action="store_true", help="Show browser window")
    args = parser.parse_args()

    headless = not args.visible

    # Start Playwright in background thread
    pw_thread = threading.Thread(target=_playwright_worker, args=(headless,), daemon=True)
    pw_thread.start()

    print(f"[FEEDER] Starting HTTP server on port {args.port}...")
    print(f"[FEEDER] Vite proxy: /captcha-feeder -> http://localhost:{args.port}")
    print(f"[FEEDER] Press Ctrl+C to stop.\n")

    server = HTTPServer(("", args.port), FeederHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[FEEDER] Stopping...")
        _req_queue.put("STOP")
        server.server_close()
