"""
captcha_solver.py — Standalone AI-powered reCAPTCHA v2 solver

Uses OpenAI GPT-4.1 to analyze image challenges and solve them.
Works with any Playwright page. Not tied to any specific application.

Usage:
    from captcha_solver import solve_recaptcha_v2
    result = solve_recaptcha_v2(page, max_attempts=5)
    # Returns: {"solved": bool, "attempts": int, "skipped": int}
"""

import json
import base64
import urllib.request
import urllib.error
from typing import Optional

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

OPENAI_API_KEY = "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"
OPENAI_MODEL = "gpt-4o"
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

CONFIDENCE_THRESHOLD = 0.90  # Skip challenge if AI confidence < 90%
MAX_ROUNDS = 5               # Max rounds per challenge (reCAPTCHA can ask 2-3)
MAX_SKIP_RETRIES = 3         # Max times to skip to a new challenge
MAX_DYNAMIC_RECHECKS = 6     # Max re-checks for dynamic tiles per round

# reCAPTCHA selectors
CHALLENGE_IFRAME_SELECTOR = "iframe[src*='recaptcha'][src*='bframe']"
CHECKBOX_IFRAME_SELECTOR = "iframe[src*='recaptcha'][src*='anchor']"
VERIFY_BUTTON_SELECTOR = "#recaptcha-verify-button"
NEW_CHALLENGE_BUTTON_SELECTOR = "#recaptcha-reload-button"
IMAGE_GRID_SELECTOR = "#rc-imageselect-target"
PROMPT_SELECTOR = ".rc-imageselect-desc-wrapper"
TILE_SELECTOR = "td.rc-imageselect-tile"
CHECKBOX_SELECTOR = ".recaptcha-checkbox-border"
CHECKBOX_CHECKED_SELECTOR = ".recaptcha-checkbox-checked"

# Log callback — can be overridden by caller
_log_fn = None


def _log(level: str, msg: str):
    """Internal logging — delegates to callback if set."""
    if _log_fn:
        _log_fn(level, msg)
    else:
        print(f"[{level}] [CAPTCHA] {msg}")


def set_log_callback(fn):
    """Set a custom logging callback: fn(level: str, message: str)"""
    global _log_fn
    _log_fn = fn


# ─────────────────────────────────────────────
# OPENAI API
# ─────────────────────────────────────────────

ANALYSIS_PROMPT = """You are solving a reCAPTCHA v2 image challenge. Your goal is ACCURACY, not completeness. It is better to miss one tile than to select a wrong one.

The image you receive contains ONLY the tile grid (no UI buttons). The prompt text describing what to find is shown above the grid.

Tile numbering (left-to-right, top-to-bottom):
- 3x3 grid (9 tiles): row 1: 1,2,3 | row 2: 4,5,6 | row 3: 7,8,9
- 4x4 grid (16 tiles): row 1: 1,2,3,4 | row 2: 5,6,7,8 | row 3: 9,10,11,12 | row 4: 13,14,15,16

REALISTIC TILE COUNTS (very important for calibration):
- Most challenges have 2-5 correct tiles in a 3x3, or 3-8 in a 4x4
- If you think more than 70% of tiles match, you are almost certainly wrong - reconsider
- Selecting too many tiles causes an immediate failure; err on the side of fewer tiles

TWO-PASS ANALYSIS PROCESS:

Pass 1 - Inventory each tile:
For EVERY tile (1 through 9 or 16), write one sentence: what is the main subject of this tile?

Pass 2 - Apply strict criteria:
For each tile from Pass 1, ask: does this tile CLEARLY AND UNAMBIGUOUSLY show the requested object?
- CLEAR presence: the object is recognizable and prominent -> SELECT
- AMBIGUOUS: could be the object, could be something else -> DO NOT SELECT
- ABSENT: object is not visible -> DO NOT SELECT
- ALREADY SELECTED (blue tinted / has checkmark overlay): skip it entirely

Object-specific strict rules:
- "bicycles": must see the bicycle frame/wheels clearly; do NOT select if only seeing a road or background
- "traffic lights": must see the signal housing with lights; do NOT select just poles or street signs
- "crosswalks": must see the white painted stripes on the road; do NOT select just a road or sidewalk
- "buses": must see clearly a large public transit bus body; do NOT select cars, vans, or trucks
- "fire hydrants": must see the distinctive red/yellow hydrant shape
- "motorcycles": must see the motorcycle with handlebars visible; do NOT select bicycles
- "cars": must see a car clearly; do NOT select trucks or vans

Output valid JSON only:
{
    "prompt_text": "exact text of challenge prompt",
    "grid_size": 9,
    "tile_inventory": "Tile 1: [what you see]. Tile 2: [what you see]. ... all tiles",
    "selected_tiles": [only tiles with CLEAR unambiguous presence of the object],
    "confidence": 0.0 to 1.0,
    "reasoning": "why these specific tiles were chosen and others rejected"
}"""


def _call_ai(screenshot_bytes: bytes, challenge_text: str = "") -> Optional[dict]:
    """Send grid screenshot to OpenAI GPT-4o and get tile analysis. Retries on 429."""
    import time as _time

    b64_image = base64.b64encode(screenshot_bytes).decode("utf-8")

    # Build the text portion - include explicit challenge prompt if we have it
    text_part = ANALYSIS_PROMPT
    if challenge_text:
        text_part += f"\n\nCHALLENGE PROMPT (read from page): \"{challenge_text}\""

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": text_part},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{b64_image}",
                            "detail": "high"
                        }
                    }
                ]
            }
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 1024,
    }

    body = json.dumps(payload).encode("utf-8")

    max_retries = 3
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                OPENAI_API_URL,
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                },
            )
            resp = urllib.request.urlopen(req, timeout=60)
            resp_body = resp.read().decode("utf-8")
            resp_data = json.loads(resp_body)

            # Extract the text content from OpenAI response
            text = resp_data["choices"][0]["message"]["content"]
            result = json.loads(text)

            _log("INFO", f"AI válasz: tiles={result.get('selected_tiles')}, "
                 f"confidence={result.get('confidence')}, "
                 f"prompt='{result.get('prompt_text', '?')}'")

            return result

        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                wait = [5, 15, 30][min(attempt, 2)]
                _log("INFO", f"OpenAI rate limit (429), várakozás {wait}s... "
                     f"({attempt + 1}/{max_retries})")
                _time.sleep(wait)
                continue
            _log("ERROR", f"OpenAI API hiba: HTTP {e.code}: {e.reason}")
            return None
        except Exception as e:
            _log("ERROR", f"OpenAI API hiba: {type(e).__name__}: {str(e)[:200]}")
            return None

    return None


# ─────────────────────────────────────────────
# CAPTCHA INTERACTION
# ─────────────────────────────────────────────

def _get_challenge_frame(page):
    """Get the reCAPTCHA challenge iframe (bframe)."""
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        frame.locator(IMAGE_GRID_SELECTOR).wait_for(timeout=3000)
        return frame
    except Exception:
        return None


def _get_checkbox_frame(page):
    """Get the reCAPTCHA checkbox iframe (anchor)."""
    try:
        return page.frame_locator(CHECKBOX_IFRAME_SELECTOR)
    except Exception:
        return None


def _is_checkbox_checked(page) -> bool:
    """Check if the reCAPTCHA checkbox is already checked."""
    try:
        frame = _get_checkbox_frame(page)
        if frame:
            checked = frame.locator(CHECKBOX_CHECKED_SELECTOR)
            return checked.count() > 0
    except Exception:
        pass
    return False


def _click_checkbox(page) -> bool:
    """Click the reCAPTCHA checkbox."""
    try:
        frame = page.frame_locator(CHECKBOX_IFRAME_SELECTOR).first
        checkbox = frame.locator(CHECKBOX_SELECTOR)
        if checkbox.count() > 0:
            checkbox.click(timeout=5000)
            page.wait_for_timeout(2000)
            _log("INFO", "Checkbox kattintva")
            return True
    except Exception as e:
        _log("ERROR", f"Checkbox kattintás hiba: {type(e).__name__}: {str(e)[:120]}")
    return False


def _get_challenge_prompt_text(page) -> str:
    """Extract the challenge prompt text directly from the DOM."""
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        prompt_el = frame.locator(PROMPT_SELECTOR)
        if prompt_el.count() > 0:
            text = prompt_el.inner_text(timeout=2000).strip()
            # Clean up the text (remove extra whitespace/newlines)
            text = " ".join(text.split())
            return text
    except Exception:
        pass
    return ""


def _screenshot_grid(page) -> Optional[bytes]:
    """Screenshot ONLY the tile grid inside the challenge iframe.
    This gives the AI a clean, zoomed-in view of just the tiles.
    Falls back to full iframe screenshot if grid element not found.
    """
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        grid = frame.locator(IMAGE_GRID_SELECTOR)
        if grid.count() > 0:
            return grid.screenshot()
    except Exception:
        pass
    # Fallback: full iframe
    try:
        challenge_iframe = page.locator(CHALLENGE_IFRAME_SELECTOR)
        if challenge_iframe.count() > 0:
            return challenge_iframe.screenshot()
    except Exception:
        pass
    try:
        return page.screenshot()
    except Exception as e:
        _log("ERROR", f"Screenshot hiba: {e}")
        return None


def _screenshot_challenge(page) -> Optional[bytes]:
    """Alias kept for backwards compat — now calls _screenshot_grid."""
    return _screenshot_grid(page)


def _click_tiles(page, tile_numbers: list, grid_size: int):
    """Click specific tiles in the challenge grid."""
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        tiles = frame.locator(TILE_SELECTOR)
        total = tiles.count()

        if total == 0:
            _log("ERROR", "Nincs tile elem a gridben")
            return

        _log("INFO", f"Grid elemek: {total}, kattintandó: {tile_numbers}")

        for tile_num in sorted(tile_numbers):
            idx = tile_num - 1
            if 0 <= idx < total:
                try:
                    tiles.nth(idx).click(timeout=2000)
                    page.wait_for_timeout(300)
                except Exception as e:
                    _log("ERROR", f"Tile {tile_num} kattintás hiba: {str(e)[:80]}")

        page.wait_for_timeout(500)
    except Exception as e:
        _log("ERROR", f"Tile kattintás hiba: {type(e).__name__}: {str(e)[:120]}")


def _click_verify(page) -> bool:
    """Click the Verify button."""
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        verify = frame.locator(VERIFY_BUTTON_SELECTOR)
        if verify.count() > 0 and verify.is_visible():
            verify.click(timeout=3000)
            page.wait_for_timeout(2000)
            _log("INFO", "Verify gomb kattintva")
            return True
    except Exception as e:
        _log("ERROR", f"Verify kattintás hiba: {str(e)[:120]}")
    return False


def _click_new_challenge(page) -> bool:
    """Click 'Get a new challenge' button to skip."""
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        reload_btn = frame.locator(NEW_CHALLENGE_BUTTON_SELECTOR)
        if reload_btn.count() > 0:
            reload_btn.click(timeout=3000)
            page.wait_for_timeout(2000)
            _log("INFO", "Új challenge kérve (skip)")
            return True
    except Exception as e:
        _log("ERROR", f"Új challenge kérés hiba: {str(e)[:120]}")
    return False


def _is_challenge_visible(page) -> bool:
    """Check if the image challenge is currently visible."""
    try:
        challenge_iframe = page.locator(CHALLENGE_IFRAME_SELECTOR)
        if challenge_iframe.count() > 0 and challenge_iframe.is_visible():
            return True
    except Exception:
        pass
    return False


# ─────────────────────────────────────────────
# MAIN SOLVER
# ─────────────────────────────────────────────

def solve_recaptcha_v2(
    page,
    max_attempts: int = 5,
    screenshot_callback=None,
) -> dict:
    """
    Solve a reCAPTCHA v2 challenge on the given Playwright page.

    Handles dynamic tiles: in 3x3 grids, after clicking a correct tile it
    fades out and a new tile slides in. The solver re-analyzes and clicks
    new matching tiles before pressing Verify.

    Args:
        page: Playwright page object with a visible reCAPTCHA
        max_attempts: Maximum number of Verify clicks
        screenshot_callback: Optional fn(page, label) to capture screenshots

    Returns:
        dict with keys:
            - solved (bool): Whether the CAPTCHA was solved
            - attempts (int): Number of verify attempts made
            - skipped (int): Number of challenges skipped (low confidence)
    """

    def ss(label: str):
        """Take screenshot if callback provided."""
        if screenshot_callback:
            screenshot_callback(page, f"captcha_{label}")

    result = {"solved": False, "attempts": 0, "skipped": 0}

    _log("INFO", "reCAPTCHA v2 megoldás indítása...")

    # Step 1: Click checkbox if not already checked
    if not _is_checkbox_checked(page):
        _click_checkbox(page)
        page.wait_for_timeout(1000)
        ss("checkbox_utan")

    # Check if checkbox alone solved it (no image challenge)
    if _is_checkbox_checked(page) and not _is_challenge_visible(page):
        _log("INFO", "Checkbox egyedul megoldotta a CAPTCHA-t!")
        result["solved"] = True
        ss("megoldva_checkbox")
        return result

    # Step 2: Image challenge appeared - solve it
    if not _is_challenge_visible(page):
        _log("ERROR", "Nincs látható image challenge")
        ss("nincs_challenge")
        return result

    skipped = 0
    attempts = 0

    for attempt in range(max_attempts * MAX_ROUNDS):
        if attempts >= max_attempts:
            _log("INFO", f"Max kísérletek elérve ({max_attempts})")
            break

        # Check if already solved
        if not _is_challenge_visible(page):
            if _is_checkbox_checked(page):
                _log("INFO", "CAPTCHA megoldva!")
                result["solved"] = True
                break
            else:
                _log("INFO", "Challenge eltunt de nincs megoldva")
                break

        # Extract challenge prompt text from DOM before screenshotting
        challenge_prompt_text = _get_challenge_prompt_text(page)
        if challenge_prompt_text:
            _log("INFO", f"DOM prompt: '{challenge_prompt_text}'")

        # Screenshot only the tile grid
        ss(f"round_{attempt + 1}")
        challenge_screenshot = _screenshot_challenge(page)
        if not challenge_screenshot:
            _log("ERROR", "Nem sikerult screenshotot kesziteni")
            break

        # Send to AI with the challenge text
        _log("INFO", f"AI elemzes kuldes... (round {attempt + 1})")
        analysis = _call_ai(challenge_screenshot, challenge_prompt_text)

        if not analysis:
            _log("ERROR", "AI nem valaszolt")
            break

        confidence = analysis.get("confidence", 0)
        selected_tiles = analysis.get("selected_tiles", [])
        prompt_text = analysis.get("prompt_text", "?")

        _log("INFO", f"Challenge: '{prompt_text}' | "
             f"Tiles: {selected_tiles} | "
             f"Confidence: {confidence:.0%}")

        # Confidence gate
        if confidence < CONFIDENCE_THRESHOLD:
            _log("INFO", f"Confidence ({confidence:.0%}) < {CONFIDENCE_THRESHOLD:.0%}, skip...")
            skipped += 1
            result["skipped"] = skipped

            if skipped >= MAX_SKIP_RETRIES:
                _log("INFO", f"Max skip elérve, utolsó próba")
            else:
                _click_new_challenge(page)
                page.wait_for_timeout(1500)
                continue

        if not selected_tiles:
            _log("ERROR", "AI nem talalt tile-okat")
            _click_new_challenge(page)
            skipped += 1
            result["skipped"] = skipped
            page.wait_for_timeout(1500)
            continue

        # Click the identified tiles
        grid_size = analysis.get("grid_size", 9)
        _click_tiles(page, selected_tiles, grid_size)
        ss(f"tiles_kattintva_{attempt + 1}")

        # ──── Dynamic tile handling (3x3 grids) ────
        # After clicking, new tiles may slide in. Re-analyze
        # and click new matching tiles before pressing Verify.
        if grid_size == 9:
            for recheck in range(MAX_DYNAMIC_RECHECKS):
                page.wait_for_timeout(2500)  # Wait for tile animation

                recheck_ss = _screenshot_challenge(page)
                if not recheck_ss:
                    break

                _log("INFO", f"Dinamikus tile ellenorzes ({recheck + 1}/{MAX_DYNAMIC_RECHECKS})...")
                recheck_analysis = _call_ai(recheck_ss, challenge_prompt_text)

                if not recheck_analysis:
                    break

                new_tiles = recheck_analysis.get("selected_tiles", [])
                new_confidence = recheck_analysis.get("confidence", 0)

                _log("INFO", f"Ujra-elemzes: tiles={new_tiles}, "
                     f"confidence={new_confidence:.0%}")

                if new_tiles and new_confidence >= CONFIDENCE_THRESHOLD:
                    _log("INFO", f"Uj dinamikus tile-ok: {new_tiles}")
                    _click_tiles(page, new_tiles, grid_size)
                    ss(f"dynamic_{attempt + 1}_{recheck + 1}")
                else:
                    _log("INFO", "Nincs tobb uj tile -> Verify")
                    break

        # Click Verify
        _click_verify(page)
        attempts += 1
        result["attempts"] = attempts

        # Wait and check result
        page.wait_for_timeout(2000)
        ss(f"verify_utan_{attempt + 1}")

        # Check if solved
        if not _is_challenge_visible(page):
            if _is_checkbox_checked(page):
                _log("INFO", f"CAPTCHA megoldva {attempts} kiserlet utan!")
                result["solved"] = True
                break
            else:
                page.wait_for_timeout(1000)
                if _is_checkbox_checked(page):
                    _log("INFO", "CAPTCHA megoldva!")
                    result["solved"] = True
                    break

        _log("INFO", "Meg nem megoldva, kovetkezo round...")

    result["attempts"] = attempts
    result["skipped"] = skipped

    if result["solved"]:
        _log("INFO", f"SIKERES megoldas | Kiserletek: {attempts}, Skip: {skipped}")
    else:
        _log("ERROR", f"SIKERTELEN megoldas | Kiserletek: {attempts}, Skip: {skipped}")

    ss("vege")
    return result
