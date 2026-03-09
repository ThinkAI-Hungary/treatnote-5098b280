"""
captcha_solver.py — Standalone AI-powered reCAPTCHA v2 solver

Uses OpenAI GPT-4o to analyze image challenges and solve them.
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
OPENAI_MODEL = "gpt-4.1"
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

CONFIDENCE_THRESHOLD = 0.85  # Skip challenge if AI confidence < 85%
MAX_ROUNDS = 10              # Max verify attempts total
MAX_SKIP_RETRIES = 3         # Max times to skip to a new challenge
MAX_DYNAMIC_RECHECKS = 6     # Max re-checks for dynamic tiles (3x3 only)
DYNAMIC_WAIT_MS = 300        # Initial wait after clicking before polling tile load state

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

def _bbox_to_tiles(x1: float, y1: float, x2: float, y2: float,
                   grid_rows: int, grid_cols: int,
                   min_overlap_fraction: float = 0.30) -> list:
    """
    Convert a bounding box (x1,y1,x2,y2) in percentage coordinates (0-100)
    to tile numbers whose area is covered by the bbox by at least min_overlap_fraction.

    Using a 30% coverage threshold avoids selecting edge tiles that barely
    touch the bbox, which was causing (20,20)→(80,80) to select all 16 tiles.

    Tiles are numbered left-to-right, top-to-bottom (1-indexed).
    """
    tiles = []
    tile_w = 100.0 / grid_cols
    tile_h = 100.0 / grid_rows

    for row in range(1, grid_rows + 1):
        tile_y1 = (row - 1) * tile_h
        tile_y2 = row * tile_h
        for col in range(1, grid_cols + 1):
            tile_x1 = (col - 1) * tile_w
            tile_x2 = col * tile_w

            # Intersection
            ix1 = max(x1, tile_x1)
            iy1 = max(y1, tile_y1)
            ix2 = min(x2, tile_x2)
            iy2 = min(y2, tile_y2)

            if ix2 <= ix1 or iy2 <= iy1:
                continue  # no overlap at all

            intersection_area = (ix2 - ix1) * (iy2 - iy1)
            tile_area = tile_w * tile_h
            overlap_fraction = intersection_area / tile_area

            if overlap_fraction >= min_overlap_fraction:
                tiles.append((row - 1) * grid_cols + col)
    return tiles


def _get_historical_tile_hints(
    challenge_text: str,
    grid_size: int,
    supabase_url: str,
    service_key: str,
) -> str:
    """
    Build a structured hint block for the AI prompt.

    Priority:
      1. captcha_lessons: synthesized DO/DON'T rules for this (category, grid_size) -- 1 clean lesson
      2. Raw ai_error_analysis paragraphs from captcha_vector (up to 3, fallback only)
      3. Tile frequency stats from captcha_vector (always included)

    Returns "" if not configured or no data.
    """
    if not supabase_url or not service_key:
        return ""

    import re as _re
    match = _re.search(r'with\s+([a-zA-Z\s]+?)(?:\s+[Ii]f|\s+that|\s+[Cc]lick|$)', challenge_text)
    if not match:
        return ""
    category = match.group(1).strip().lower()
    if not category:
        return ""

    import urllib.request as _ur, json as _j, urllib.parse as _up

    def _get(path: str, params: dict) -> list:
        q = _up.urlencode(params)
        req = _ur.Request(
            f"{supabase_url}/rest/v1/{path}?{q}",
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Accept": "application/json",
            }
        )
        resp = _ur.urlopen(req, timeout=5)
        return _j.loads(resp.read().decode())

    # ── Step 1: Try captcha_lessons for synthesized rules ─────────────────
    lesson_rules = ""
    try:
        lessons = _get("captcha_lessons", {
            "select": "lesson_rules,source_count",
            "category": f"eq.{category}",
            "grid_size": f"eq.{grid_size}",
            "limit": "1",
        })
        if lessons:
            lesson_rules = lessons[0].get("lesson_rules", "")
            source_count = lessons[0].get("source_count", 0)
            _log("INFO", f"Lesson found for '{category}' (synthesized from {source_count} analyses)")
    except Exception as e:
        _log("DEBUG", f"captcha_lessons query failed: {e}")

    # ── Step 2: captcha_vector for frequency stats + raw analyses ─────────
    rows = []
    try:
        rows = _get("captcha_vector", {
            "select": "ai_final_tiles,human_tiles,ai_error_analysis",
            "challenge_text": f"ilike.*{category}*",
            "grid_size": f"eq.{grid_size}",
            "limit": "200",
            "order": "created_at.desc",
        })
    except Exception as e:
        _log("DEBUG", f"Historical hints query failed: {e}")

    if not rows and not lesson_rules:
        return ""

    n = len(rows)
    tile_scores: dict = {}
    semantic_analyses: list = []

    for row in rows:
        human = row.get("human_tiles") or []
        ai = row.get("ai_final_tiles") or []
        analysis = row.get("ai_error_analysis") or ""

        if human:
            for t in human:
                tile_scores[t] = tile_scores.get(t, 0) + 3
        else:
            for t in ai:
                tile_scores[t] = tile_scores.get(t, 0) + 1

        if analysis and not lesson_rules and len(semantic_analyses) < 3:
            semantic_analyses.append(analysis)

    parts = [f"HISTORICAL DATA ({n} past '{category}' challenges on {grid_size}-tile grids):"]

    if tile_scores:
        max_possible = max(n * 3, 1)
        rates = {t: tile_scores[t] / max_possible for t in tile_scores}
        strong = sorted([t for t, r in rates.items() if r >= 0.35])
        rare = sorted([t for t in range(1, grid_size + 1) if rates.get(t, 0) <= 0.05])
        if strong:
            parts.append(f"  → Tiles selected in ≥35% of past correct answers: {strong}")
        if rare:
            parts.append(f"  → Tiles almost never selected: {rare}")

    # ── Step 3: Inject lesson or raw fallback ─────────────────────────────
    if lesson_rules:
        parts.append(f"\nLESSON FOR '{category.upper()}' (synthesized from {source_count} human-reviewed analyses):")
        parts.append(lesson_rules)
        parts.append("\n  Follow these DO/DON'T rules strictly. They encode the most common AI mistakes for this category.")
    elif semantic_analyses:
        parts.append(f"\nPAST AI ERROR ANALYSIS (from human-reviewed sessions):")
        for i, analysis in enumerate(semantic_analyses, 1):
            parts.append(f"  [{i}] {analysis}")
        parts.append("\n  Study these descriptions carefully — they document specific visual mistakes made in past attempts. Avoid repeating these errors.")
    else:
        parts.append("  Use tile statistics as supporting evidence — trust the image first.")

    hint = "\n".join(parts)
    _log("INFO", f"Historical hints: {n} entries, lesson={'yes' if lesson_rules else 'no'}, raw_analyses={len(semantic_analyses)}")
    return hint


def _build_prompt(grid_size: int, challenge_text: str, historical_hint: str = "") -> str:

    """Build the analysis prompt for the given grid size and challenge."""
    if grid_size == 9:
        grid_layout = "3x3 grid (9 tiles): row 1 = tiles 1,2,3 | row 2 = tiles 4,5,6 | row 3 = tiles 7,8,9"
        grid_rows, grid_cols = 3, 3
        already_selected_note = (
            "IMPORTANT: Some tiles may appear slightly blue/highlighted — those are ALREADY SELECTED. "
            "Only report tiles NOT already selected."
        )
    else:
        grid_layout = (
            "4x4 grid (16 tiles): row 1 = tiles 1,2,3,4 | row 2 = tiles 5,6,7,8 | "
            "row 3 = tiles 9,10,11,12 | row 4 = tiles 13,14,15,16"
        )
        grid_rows, grid_cols = 4, 4
        already_selected_note = ""

    historical_section = f"\n{historical_hint}\n" if historical_hint else ""

    prompt = f"""You are solving a reCAPTCHA v2 image challenge.

CHALLENGE: "{challenge_text}"
GRID LAYOUT: {grid_layout}
{already_selected_note}{historical_section}
IMPORTANT — THE IMAGE IS ANNOTATED:
The screenshot has yellow tile numbers (1 through {grid_size}) and yellow grid lines drawn directly on top of it.
Each tile clearly shows its number in its center. Use these visible numbers — do NOT try to count or estimate tile positions yourself.
Tile 1 = top-left, tile {grid_cols} = top-right, tile {grid_size} = bottom-right.

════════════════════════════════════════
STEP 1 — DETERMINE CHALLENGE TYPE
════════════════════════════════════════

TYPE A — MULTI-IMAGE: Each tile is a COMPLETELY SEPARATE PHOTO (different scenes, lighting, angles). Hard visual borders between clearly distinct images.

TYPE B — SINGLE-IMAGE: ALL tiles form ONE continuous large photo cut into a {grid_rows}×{grid_cols} grid. The cuts are artificial — the scene flows seamlessly across all tile borders.

════════════════════════════════════════
STEP 2A — IF MULTI-IMAGE (TYPE A)
════════════════════════════════════════

Evaluate each tile independently. Select ONLY tiles where the target is CLEARLY and FULLY visible.
- Partial, unclear, or background-only → DO NOT SELECT
- Err on the side of fewer tiles

Object rules:
• "traffic lights": must see the signal housing with 3 colored lights; NOT just a pole
• "bicycles": two-wheeled pedal bike — must see the FRAME + at least one wheel. Partially visible or partially obscured by another vehicle (car, motorcycle) → STILL SELECT if the bicycle frame/wheel is visible. A motorcycle next to or in front of a bicycle does NOT make the tile a non-bicycle tile. Do NOT select tiles showing ONLY cars, trucks, or motorcycles with no bicycle visible.
• "crosswalks": must see white painted stripes on the road surface; NOT just pavement
• "buses": must see a large rectangular bus body; NOT cars, vans, or trucks
• "fire hydrants": must see the red/yellow/silver hydrant shape clearly
• "motorcycles": must see engine block + handlebars clearly; NOT bicycles
• "stairs": must see visible step structure; NOT just a building facade
• "cars": must see a passenger car; NOT trucks, buses, or vans
• "boats": must see watercraft on/in water
• "bridges": must see a bridge span crossing a gap

════════════════════════════════════════
STEP 2B — IF SINGLE-IMAGE (TYPE B)
════════════════════════════════════════

Single-image challenges require TWO PASSES. A tile showing "half a handlebar" or "part of a wheel" looks like nothing meaningful on its own — but once you see the FULL picture first, you know exactly what that fragment belongs to.

── PASS 1: WHOLE IMAGE ANALYSIS ─────────────────────────
Mentally assemble ALL {grid_rows * grid_cols} tiles into one large {grid_rows}×{grid_cols} image.
Look at the COMPLETE assembled image as if it were a single photo.

Answer these questions IN YOUR REASONING FIELD:
a) What do you see in the full image? Describe the complete scene.
b) Is "{challenge_text}" present in the scene? If yes, describe the COMPLETE object — its shape, where it starts and ends in the image, what all its parts look like.
c) Where exactly is the object? Use fractions: "the bicycle spans from the left 20% to the right 70%, vertically from 30% to 80%"
d) If the object is NOT present at all: set object_present=false, bbox=null.

── PASS 2: TILE-BY-TILE WITH FULL CONTEXT ────────────────
Now that you know what the complete object looks like and where it is in the full image:
Go through each tile. Ask: "Does this tile contain ANY part of the object I identified in Pass 1?"

Key rule: A tile that shows even a SMALL FRAGMENT of the object — a wheel edge, a handlebar tip, the corner of a bus roof, the bottom of a traffic light pole — MUST be selected. You know from Pass 1 what these fragments belong to.

→ Select every tile that contains any piece of the object.
→ Do NOT apply "is this tile clearly showing the object by itself?" — that's only for multi-image.
→ Expect to select 3-10 tiles for a 4×4 grid, fewer for a 3×3 grid.

After identifying tiles, also provide the bounding box:
   - x1,y1 = top-left corner of the object in % of full image width/height
   - x2,y2 = bottom-right corner of the object in % of full image width/height


════════════════════════════════════════
STEP 3 — OUTPUT
════════════════════════════════════════

Output valid JSON only:
{{
    "challenge_type": "multi_image" or "single_image",
    "challenge_type_reasoning": "one sentence: what visual property made you classify it this way",
    "prompt_text": "exact challenge prompt text",
    "grid_size": {grid_size},
    "tile_inventory": "Tile 1: [description]. ... (all {grid_size} tiles)",
    "object_bbox_pct": {{"x1": 0-100, "y1": 0-100, "x2": 0-100, "y2": 0-100}} or null,
    "object_present": true or false,
    "selected_tiles": [
        for multi_image: tile numbers where object is CLEARLY AND FULLY visible,
        for single_image: tile numbers from PASS 2 — every tile containing ANY fragment of the identified object
    ],
    "confidence": 0.0 to 1.0,
    "reasoning": "for single_image: describe Pass 1 (full scene + object location) then Pass 2 (each selected tile and what fragment it contains)"
}}"""
    return prompt





def _annotate_grid_screenshot(image_bytes: bytes, grid_size: int) -> bytes:
    """
    Overlay tile numbers and grid lines onto the grid screenshot.
    Example: for a 3x3 grid, draws a 3x3 grid with numbers 1-9 in each cell center.
    This eliminates AI position-to-tile-number mapping errors (e.g. 'upper left'
    getting mis-mapped to tile 5 instead of tile 1).

    Falls back to original bytes if PIL is not available.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io
    except ImportError:
        return image_bytes  # PIL not available, use raw screenshot

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        draw = ImageDraw.Draw(img)

        grid_cols = 3 if grid_size == 9 else 4
        grid_rows = grid_cols
        cell_w = w / grid_cols
        cell_h = h / grid_rows

        # Try to get a bold font; fall back to default
        font_size = max(18, int(min(cell_w, cell_h) * 0.25))
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except Exception:
            try:
                font = ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()

        for row in range(grid_rows):
            for col in range(grid_cols):
                tile_num = row * grid_cols + col + 1
                cx = int(col * cell_w + cell_w * 0.5)
                cy = int(row * cell_h + cell_h * 0.5)

                # Draw grid cell border
                x0, y0 = int(col * cell_w), int(row * cell_h)
                x1, y1 = int((col + 1) * cell_w), int((row + 1) * cell_h)
                draw.rectangle([x0, y0, x1, y1], outline=(255, 255, 0), width=3)

                label = str(tile_num)
                try:
                    bbox = draw.textbbox((cx, cy), label, font=font, anchor="mm")
                    pad = 6
                    draw.rounded_rectangle(
                        [bbox[0]-pad, bbox[1]-pad, bbox[2]+pad, bbox[3]+pad],
                        radius=4, fill=(0, 0, 0, 200)
                    )
                    draw.text((cx, cy), label, fill=(255, 255, 0), font=font, anchor="mm")
                except Exception:
                    # Fallback for older PIL without rounded_rectangle/anchor
                    draw.text((cx - font_size // 2, cy - font_size // 2), label,
                              fill=(255, 255, 0), font=font)

        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()
    except Exception:
        return image_bytes  # any failure → use original


def _screenshot_tile_via_playwright(page, tile_num: int, grid_size: int) -> Optional[bytes]:
    """
    Screenshot a single tile element directly via Playwright — no PIL needed.
    Returns PNG bytes for the tile, or None on failure.
    """
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        tiles = frame.locator(TILE_SELECTOR)
        idx = tile_num - 1
        return tiles.nth(idx).screenshot(timeout=3000)
    except Exception as e:
        _log("INFO", f"Tile {tile_num} screenshot hiba: {str(e)[:60]}")
        return None


# Per-category Phase 2 discriminator phrases.
# Injected into every per-tile verification prompt to target the most common repeat errors.
_CATEGORY_DISCRIMINATORS: dict = {
    "traffic lights": (
        "IMPORTANT: Only say YES if this tile shows an actual traffic light LENS, SIGNAL HOUSING "
        "or clearly lit signal face. Do NOT select tiles showing only a bare vertical pole, mounting "
        "bracket, wire, or hardware — these are NOT traffic lights."
    ),
    "traffic light": (
        "IMPORTANT: Only say YES if this tile shows an actual traffic light LENS, SIGNAL HOUSING "
        "or clearly lit signal face. Do NOT select tiles showing only a bare vertical pole, mounting "
        "bracket, wire, or hardware — these are NOT traffic lights."
    ),
    "motorcycles": (
        "IMPORTANT: Only say YES if this tile shows part of the MOTORCYCLE VEHICLE ITSELF (wheel, "
        "frame, body, engine, seat, handlebars). Do NOT select tiles showing only the rider's clothing, "
        "helmet, or jacket — those are the RIDER, not the motorcycle. Do NOT select tiles showing only "
        "a curved shadow or a tiny mirror sliver at the very tile edge."
    ),
    "motorcycle": (
        "IMPORTANT: Only say YES if this tile shows part of the MOTORCYCLE VEHICLE ITSELF (wheel, "
        "frame, body, engine, seat, handlebars). Do NOT select tiles showing only the rider's clothing, "
        "helmet, or jacket — those are the RIDER, not the motorcycle. Do NOT select tiles showing only "
        "a curved shadow or a tiny mirror sliver at the very tile edge."
    ),
    "stairs": (
        "IMPORTANT: Only say YES if this tile clearly shows STAIR STEPS — horizontal treads with "
        "visible vertical risers. Do NOT select tiles showing only railings, handrail posts, flat "
        "platforms, fence lines, parallel shadows, or landscaping borders. Those are NOT stairs."
    ),
    "crosswalks": (
        "IMPORTANT: Only say YES if this tile contains clearly visible CROSSWALK STRIPES — thick "
        "parallel white lines characteristic of a pedestrian crossing. Do NOT select tiles showing "
        "only light-colored stonework, curb edges, lane markings, or unmarked pavement adjacent to "
        "the crosswalk."
    ),
    "crosswalk": (
        "IMPORTANT: Only say YES if this tile contains clearly visible CROSSWALK STRIPES — thick "
        "parallel white lines characteristic of a pedestrian crossing. Do NOT select tiles showing "
        "only light-colored stonework, curb edges, lane markings, or unmarked pavement adjacent to "
        "the crosswalk."
    ),
    "buses": (
        "IMPORTANT: Only say YES if this tile shows a clear part of the BUS BODY itself (windows, "
        "side panels, wheels, destination board, headlights). Do NOT select tiles showing only "
        "adjacent buildings, fences, shadows, empty pavement, or background objects near the bus."
    ),
    "bus": (
        "IMPORTANT: Only say YES if this tile shows a clear part of the BUS BODY itself (windows, "
        "side panels, wheels, destination board, headlights). Do NOT select tiles showing only "
        "adjacent buildings, fences, shadows, empty pavement, or background objects near the bus."
    ),
    "bicycles": (
        "IMPORTANT: Only say YES if this tile shows a BICYCLE WHEEL, FRAME, HANDLEBAR, PEDAL, or "
        "CHAIN. Do NOT select tiles showing only metal railings, fences, or crosshatched structures "
        "— their diagonal line patterns look similar but are NOT bicycle parts."
    ),
    "bicycle": (
        "IMPORTANT: Only say YES if this tile shows a BICYCLE WHEEL, FRAME, HANDLEBAR, PEDAL, or "
        "CHAIN. Do NOT select tiles showing only metal railings, fences, or crosshatched structures "
        "— their diagonal line patterns look similar but are NOT bicycle parts."
    ),
}


def _get_category_discriminator(challenge_text: str) -> str:
    """Extract category from challenge text and return discriminator phrase if one exists."""
    import re as _re
    m = _re.search(r'with\s+([a-zA-Z\s]+?)(?:\s+[Ii]f|\s+that|\s+[Cc]lick|$)', challenge_text)
    if not m:
        return ""
    category = m.group(1).strip().lower()
    return _CATEGORY_DISCRIMINATORS.get(category, "")


def _call_ai_single_tile(tile_bytes: bytes, tile_num: int,
                          challenge_text: str, object_context: str) -> dict:
    """
    Ask the AI if a single tile contains any part of the target object.
    object_context is Phase 1's scene description so the AI knows what fragment to look for.
    Returns {tile_num, contains_object, confidence, what_you_see}.
    Injects a category-specific discriminator to reduce the most common per-category errors.
    """
    b64 = base64.b64encode(tile_bytes).decode("utf-8")
    discriminator = _get_category_discriminator(challenge_text)
    prompt = f"""You are verifying ONE individual tile from a reCAPTCHA challenge.

TARGET OBJECT: "{challenge_text}"

FULL-IMAGE CONTEXT (from Phase 1 analysis):
{object_context}
{f"{chr(10)}{discriminator}{chr(10)}" if discriminator else ""}
Does this single tile show ANY VISIBLE PART of the target object?
Even a tiny fragment (edge, wheel rim, corner, partial outline) counts as YES.
Only say NO if this tile clearly shows only background with no trace of the object.

Output valid JSON only:
{{
    "contains_object": true or false,
    "confidence": 0.0 to 1.0,
    "what_you_see": "one sentence describing what is visible in this tile"
}}"""

    payload = {
        "model": OPENAI_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {
                "url": f"data:image/png;base64,{b64}",
                "detail": "high"
            }}
        ]}],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 200,
    }

    body = json.dumps(payload).encode("utf-8")
    try:
        req = urllib.request.Request(
            OPENAI_API_URL, data=body, method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENAI_API_KEY}",
            }
        )
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(json.loads(resp.read().decode("utf-8"))["choices"][0]["message"]["content"])
        result["tile_num"] = tile_num
        return result
    except Exception as e:
        return {"tile_num": tile_num, "contains_object": False, "confidence": 0.0,
                "what_you_see": f"error: {str(e)[:60]}"}


def _verify_tiles_parallel(page, grid_size: int,
                            challenge_text: str, object_context: str,
                            tile_confidence_threshold: float = 0.75) -> set:
    """
    Phase 2: Screenshot every tile via Playwright (no PIL) and send all in parallel
    to the AI for individual verification.
    Uses object_context (from Phase 1 reasoning) so each tile call knows what fragment to look for.
    Returns set of tile numbers confirmed to contain the target object.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    # Screenshot all tiles via Playwright element screenshots
    tile_crops: dict = {}
    for tile_num in range(1, grid_size + 1):
        tile_bytes = _screenshot_tile_via_playwright(page, tile_num, grid_size)
        if tile_bytes:
            tile_crops[tile_num] = tile_bytes

    if not tile_crops:
        _log("INFO", "Tile screenshot sikertelen, Phase 2 atugras")
        return set()

    _log("INFO", f"Phase 2: {len(tile_crops)} tile parhuzamos AI ellenorzes...")

    confirmed: set = set()
    tested: set = set()  # tiles that Phase 2 actually ran (successfully got AI response)
    with ThreadPoolExecutor(max_workers=min(grid_size, 12)) as executor:
        futures = {
            executor.submit(_call_ai_single_tile, crop, tile_num, challenge_text, object_context): tile_num
            for tile_num, crop in tile_crops.items()
        }
        for future in as_completed(futures):
            result = future.result()
            tile_num = result.get("tile_num")
            contains = result.get("contains_object", False)
            confidence = result.get("confidence", 0.0)
            what_see = result.get("what_you_see", "")
            had_error = what_see.startswith("error:")
            mark = "\u2713" if (contains and confidence >= tile_confidence_threshold) else "\u2717"
            _log("INFO", f"  Tile {tile_num:2d}: {mark} ({confidence:.0%}) — {what_see[:60]}")
            if not had_error:
                tested.add(tile_num)  # only count as tested if AI actually responded
            if contains and confidence >= tile_confidence_threshold:
                confirmed.add(tile_num)

    _log("INFO", f"Phase 2 eredmeny: confirmed={sorted(confirmed)}, tested={len(tested)} tile")
    return confirmed, tested


def _call_ai(screenshot_bytes: bytes, challenge_text: str = "", grid_size: int = 9, historical_hint: str = "") -> Optional[dict]:
    """Send annotated grid screenshot to OpenAI GPT-4.1 and get tile analysis. Retries on 429."""
    import time as _time

    # Annotate the screenshot with tile numbers before sending to AI
    annotated = _annotate_grid_screenshot(screenshot_bytes, grid_size)
    b64_image = base64.b64encode(annotated).decode("utf-8")
    prompt = _build_prompt(grid_size, challenge_text, historical_hint)

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
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
        "max_tokens": 1500,
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
            resp = urllib.request.urlopen(req, timeout=45)
            resp_body = resp.read().decode("utf-8")
            resp_data = json.loads(resp_body)

            # Extract content — guard against null content (streaming edge case)
            text = resp_data["choices"][0]["message"].get("content")
            if not text:
                _log("ERROR", "OpenAI valasz: ures content mezo")
                return None

            result = json.loads(text)

            _log("INFO", f"AI valasz: tiles={result.get('selected_tiles')}, "
                 f"confidence={result.get('confidence')}, "
                 f"prompt='{result.get('prompt_text', '?')}'")

            return result

        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                wait = [5, 15, 30][min(attempt, 2)]
                _log("INFO", f"OpenAI rate limit (429), varakozas {wait}s... ({attempt + 1}/{max_retries})")
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
        _log("ERROR", f"Checkbox kattintas hiba: {type(e).__name__}: {str(e)[:120]}")
    return False


def _get_challenge_prompt_text(page) -> str:
    """Extract the challenge prompt text directly from the DOM."""
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        prompt_el = frame.locator(PROMPT_SELECTOR)
        if prompt_el.count() > 0:
            text = prompt_el.inner_text(timeout=2000).strip()
            text = " ".join(text.split())
            return text
    except Exception:
        pass
    return ""


def _count_actual_tiles(page) -> int:
    """Count the actual number of tiles in the DOM. Returns 9, 16, or 0."""
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        tiles = frame.locator(TILE_SELECTOR)
        count = tiles.count()
        return count
    except Exception:
        return 0


def _screenshot_grid(page) -> Optional[bytes]:
    """Screenshot ONLY the tile grid inside the challenge iframe."""
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
    """Alias kept for backwards compat."""
    return _screenshot_grid(page)


def _click_tiles(page, tile_numbers: list, total_tiles: int):
    """Click specific tiles in the challenge grid. Returns successfully clicked set."""
    clicked = set()
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        tiles = frame.locator(TILE_SELECTOR)
        actual_count = tiles.count()

        if actual_count == 0:
            _log("ERROR", "Nincs tile elem a gridben")
            return clicked

        _log("INFO", f"Grid elemek: {actual_count}, kattintando: {tile_numbers}")

        for tile_num in sorted(tile_numbers):
            idx = tile_num - 1
            if 0 <= idx < actual_count:
                try:
                    tiles.nth(idx).click(timeout=2000)
                    page.wait_for_timeout(250)
                    clicked.add(tile_num)
                except Exception as e:
                    _log("ERROR", f"Tile {tile_num} kattintas hiba: {str(e)[:80]}")

        page.wait_for_timeout(400)
    except Exception as e:
        _log("ERROR", f"Tile kattintas hiba: {type(e).__name__}: {str(e)[:120]}")
    return clicked


def _wait_for_tiles_stable(page, max_wait_ms: int = 700) -> bool:
    """
    Poll until all tile images in the challenge iframe have finished loading.
    Checks img.complete + img.naturalWidth > 0 inside the bframe.
    Returns True when stable, False if timed out.
    Max wait is capped at max_wait_ms (default 700ms), polling every 150ms.
    """
    import time as _t
    deadline = _t.time() + max_wait_ms / 1000.0
    while _t.time() < deadline:
        try:
            frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
            # Count tile img elements that are NOT yet fully loaded
            not_loaded = frame.locator("td.rc-imageselect-tile img").evaluate_all(
                "imgs => imgs.filter(img => !img.complete || img.naturalWidth === 0).length"
            )
            if not_loaded == 0:
                return True
        except Exception:
            pass  # frame not ready yet
        page.wait_for_timeout(150)
    return False  # timed out — proceed anyway


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
        _log("ERROR", f"Verify kattintas hiba: {str(e)[:120]}")
    return False


def _click_new_challenge(page) -> bool:
    """Click 'Get a new challenge' button to skip."""
    try:
        frame = page.frame_locator(CHALLENGE_IFRAME_SELECTOR)
        reload_btn = frame.locator(NEW_CHALLENGE_BUTTON_SELECTOR)
        if reload_btn.count() > 0:
            reload_btn.click(timeout=3000)
            page.wait_for_timeout(2000)
            _log("INFO", "Uj challenge kerve (skip)")
            return True
    except Exception as e:
        _log("ERROR", f"Uj challenge keres hiba: {str(e)[:120]}")
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
# CAPTCHA VECTOR DB UPLOAD
# ─────────────────────────────────────────────

def save_captcha_vector(
    domain: str,
    session_id: str,
    attempt_round: int,
    challenge_text: str,
    challenge_type: str,
    grid_size: int,
    screenshot_bytes: bytes,
    p1_tiles: list,
    p2_tiles: list,
    final_tiles: list,
    supabase_url: str = "",
    supabase_service_key: str = "",
) -> Optional[str]:
    """
    Upload grid screenshot to Supabase Storage and insert a captcha_vector row.
    Returns the row ID (uuid str) on success, None on failure.
    Accepts supabase_url/supabase_service_key directly, or falls back to env vars.
    """
    import os
    supabase_url = supabase_url or os.environ.get("SUPABASE_URL", "")
    service_key = supabase_service_key or os.environ.get("SUPABASE_SERVICE_KEY", "")

    if not supabase_url or not service_key:
        _log("INFO", "SUPABASE_URL/SERVICE_KEY nincs beallitva, captcha_vector feltoltes atugras")
        return None

    try:
        import uuid as _uuid
        import time as _t
        row_id = str(_uuid.uuid4())
        timestamp = int(_t.time())
        storage_path = f"{domain}/{session_id}/round_{attempt_round}_{timestamp}.png"

        # Upload screenshot to captcha-grids bucket
        upload_url = f"{supabase_url}/storage/v1/object/captcha-grids/{storage_path}"
        upload_req = urllib.request.Request(
            upload_url,
            data=screenshot_bytes,
            method="POST",
            headers={
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "image/png",
            }
        )
        upload_resp = urllib.request.urlopen(upload_req, timeout=15)
        if upload_resp.status not in (200, 201):
            _log("INFO", f"captcha-grids feltoltes hiba: {upload_resp.status}")
            return None

        screenshot_url = f"{supabase_url}/storage/v1/object/captcha-grids/{storage_path}"

        # Insert row into captcha_vector table
        row = {
            "id": row_id,
            "session_id": session_id,
            "attempt_round": attempt_round,
            "domain": domain,
            "challenge_text": challenge_text,
            "challenge_type": challenge_type,
            "grid_size": grid_size,
            "grid_screenshot_url": screenshot_url,
            "ai_phase1_tiles": p1_tiles,
            "ai_phase2_tiles": p2_tiles,
            "ai_final_tiles": final_tiles,
        }
        insert_req = urllib.request.Request(
            f"{supabase_url}/rest/v1/captcha_vector",
            data=json.dumps(row).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            }
        )
        urllib.request.urlopen(insert_req, timeout=10)
        _log("INFO", f"captcha_vector mentes OK: {row_id[:8]}... round={attempt_round}")
        return row_id
    except Exception as e:
        _log("INFO", f"captcha_vector mentes hiba: {str(e)[:80]}")
        return None


# ─────────────────────────────────────────────
# MAIN SOLVER
# ─────────────────────────────────────────────

def solve_recaptcha_v2(
    page,
    max_attempts: int = 10,
    screenshot_callback=None,
    **kwargs,
) -> dict:
    """
    Solve a reCAPTCHA v2 challenge on the given Playwright page.

    Key behavior:
    - Uses actual DOM tile count (not AI's reported grid_size) to determine
      grid type and whether dynamic tile replacement can occur.
    - Dynamic tile loop ONLY runs for 3x3 grids (9 tiles), where reCAPTCHA
      actually replaces tiles after clicking. 4x4 grids never do this.
    - Tracks already-clicked tiles to avoid re-clicking them in rechecks.
    - Passes the actual grid size to the AI so it knows the correct layout.

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
        if screenshot_callback:
            screenshot_callback(page, f"captcha_{label}")

    result = {"solved": False, "attempts": 0, "skipped": 0}

    _log("INFO", "reCAPTCHA v2 megoldas inditasa...")

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

    # Step 2: Image challenge appeared
    if not _is_challenge_visible(page):
        _log("ERROR", "Nincs lathato image challenge")
        ss("nincs_challenge")
        return result

    skipped = 0
    attempts = 0

    for attempt in range(max_attempts * MAX_ROUNDS):
        if attempts >= max_attempts:
            _log("INFO", f"Max kiserletek eleve ({max_attempts}) — leallas")
            break
        # Per-round upload tracking vars (initialized for all challenge types)
        _p1_tiles_for_upload: list = []
        _p2_tiles_for_upload: list = []

        # Check if already solved
        if not _is_challenge_visible(page):
            if _is_checkbox_checked(page):
                _log("INFO", "CAPTCHA megoldva!")
                result["solved"] = True
                break
            else:
                _log("INFO", "Challenge eltunt de nincs megoldva")
                break

        # ── Count actual DOM tiles (authoritative grid size) ────────────────
        actual_tile_count = _count_actual_tiles(page)
        is_3x3 = (actual_tile_count == 9)
        is_4x4 = (actual_tile_count == 16)
        actual_grid_size = actual_tile_count if actual_tile_count in (9, 16) else 9

        _log("INFO", f"Aktualis grid: {actual_tile_count} tile ({'3x3' if is_3x3 else '4x4' if is_4x4 else 'ismeretlen'})")

        # Extract challenge prompt text from DOM
        challenge_prompt_text = _get_challenge_prompt_text(page)
        if challenge_prompt_text:
            _log("INFO", f"DOM prompt: '{challenge_prompt_text}'")

        ss(f"round_{attempt + 1}")
        challenge_screenshot = _screenshot_challenge(page)
        if not challenge_screenshot:
            _log("ERROR", "Nem sikerult screenshotot kesziteni")
            break

        # Fetch historical tile hints from captcha_vector for this category
        historical_hint = _get_historical_tile_hints(
            challenge_text=challenge_prompt_text,
            grid_size=actual_grid_size,
            supabase_url=kwargs.get("supabase_url", ""),
            service_key=kwargs.get("supabase_service_key", ""),
        )

        # Send to AI — pass the actual grid size so it uses correct numbering
        _log("INFO", f"AI elemzes kuldes... (round {attempt + 1}, grid={actual_grid_size})")
        analysis = _call_ai(challenge_screenshot, challenge_prompt_text, actual_grid_size, historical_hint)

        if not analysis:
            _log("ERROR", "AI nem valaszolt")
            break

        confidence = analysis.get("confidence", 0)
        selected_tiles = analysis.get("selected_tiles", [])
        prompt_text = analysis.get("prompt_text", "?")
        challenge_type = analysis.get("challenge_type", "multi_image")
        challenge_type_reason = analysis.get("challenge_type_reasoning", "")

        _log("INFO", f"Challenge type: {challenge_type} — {challenge_type_reason}")

        # ── For single-image: use AI's Pass 2 tiles, with bbox as fallback ────
        if challenge_type == "single_image":
            bbox = analysis.get("object_bbox_pct")
            object_present = analysis.get("object_present", True)
            grid_rows = 3 if actual_grid_size == 9 else 4
            grid_cols = grid_rows

            if not object_present:
                _log("INFO", "AI: nincs objektum a kepben, skip")
                _click_new_challenge(page)
                skipped += 1
                result["skipped"] = skipped
                page.wait_for_timeout(1500)
                continue

            ai_tiles = [t for t in selected_tiles if isinstance(t, int) and 1 <= t <= actual_grid_size]

            if ai_tiles:
                # AI performed Pass 2 and gave explicit tile selections — use them directly
                selected_tiles = ai_tiles
                _log("INFO", f"Single-image: AI Pass 2 tiles = {selected_tiles}")
                if bbox and isinstance(bbox, dict):
                    bx1, by1 = float(bbox.get("x1", 0)), float(bbox.get("y1", 0))
                    bx2, by2 = float(bbox.get("x2", 100)), float(bbox.get("y2", 100))
                    _log("INFO", f"  BBox cross-check: ({bx1},{by1})→({bx2},{by2})")
            elif bbox and isinstance(bbox, dict):
                # Fallback: AI didn't give tiles, compute from bbox
                bx1 = float(bbox.get("x1", 0))
                by1 = float(bbox.get("y1", 0))
                bx2 = float(bbox.get("x2", 100))
                by2 = float(bbox.get("y2", 100))
                bbox_area_pct = (bx2 - bx1) * (by2 - by1) / 10000
                if bbox_area_pct > 0.5:
                    _log("INFO", f"BBox tul nagy ({bbox_area_pct:.0%}) — skip")
                    _click_new_challenge(page)
                    skipped += 1
                    result["skipped"] = skipped
                    page.wait_for_timeout(1500)
                    continue
                selected_tiles = _bbox_to_tiles(bx1, by1, bx2, by2, grid_rows, grid_cols)
                _log("INFO", f"BBox fallback: ({bx1},{by1})→({bx2},{by2}) [{bbox_area_pct:.0%}] → tiles {selected_tiles}")
            else:
                _log("INFO", "Nincs tiles es bbox — skip")
                _click_new_challenge(page)
                skipped += 1
                result["skipped"] = skipped
                page.wait_for_timeout(1500)
                continue

            # ── Phase 1 tile count sanity check ───────────────────────────────
            # If AI selected >60% of tiles, it's almost certainly over-selecting.
            # Fall back to bbox approach (more geometric, less hallucinatory).
            max_sane_tiles = int(actual_grid_size * 0.6)
            if len(selected_tiles) > max_sane_tiles:
                _log("INFO", f"Phase 1 tul sok tilet valasztott ({len(selected_tiles)}/{actual_grid_size} > 60%) — bbox fallback")
                if bbox and isinstance(bbox, dict):
                    bx1 = float(bbox.get("x1", 0))
                    by1 = float(bbox.get("y1", 0))
                    bx2 = float(bbox.get("x2", 100))
                    by2 = float(bbox.get("y2", 100))
                    bbox_area_pct = (bx2 - bx1) * (by2 - by1) / 10000
                    if bbox_area_pct > 0.5:
                        _log("INFO", f"BBox is tul nagy ({bbox_area_pct:.0%}) — skip")
                        _click_new_challenge(page)
                        skipped += 1
                        result["skipped"] = skipped
                        page.wait_for_timeout(1500)
                        continue
                    selected_tiles = _bbox_to_tiles(bx1, by1, bx2, by2, grid_rows, grid_cols)
                    _log("INFO", f"BBox fallback: ({bx1},{by1})→({bx2},{by2}) → tiles {selected_tiles}")
                else:
                    _log("INFO", "Nincs bbox a fallbackhoz — skip")
                    _click_new_challenge(page)
                    skipped += 1
                    result["skipped"] = skipped
                    page.wait_for_timeout(1500)
                    continue

            # ── Phase 1 tile count sanity check ───────────────────────────────
            # If AI selected >60% of all tiles it's almost certainly over-selecting.
            # Fall back to bbox (more geometric, less hallucinatory).
            max_sane_tiles = int(actual_grid_size * 0.6)
            if len(selected_tiles) > max_sane_tiles:
                _log("INFO", f"Phase 1 tul sok tilet valasztott ({len(selected_tiles)}/{actual_grid_size} > 60%) — bbox fallback")
                if bbox and isinstance(bbox, dict):
                    bx1 = float(bbox.get("x1", 0))
                    by1 = float(bbox.get("y1", 0))
                    bx2 = float(bbox.get("x2", 100))
                    by2 = float(bbox.get("y2", 100))
                    bbox_area_pct = (bx2 - bx1) * (by2 - by1) / 10000
                    if bbox_area_pct > 0.5:
                        _log("INFO", f"BBox is tul nagy ({bbox_area_pct:.0%}) — skip")
                        _click_new_challenge(page)
                        skipped += 1
                        result["skipped"] = skipped
                        page.wait_for_timeout(1500)
                        continue
                    selected_tiles = _bbox_to_tiles(bx1, by1, bx2, by2, grid_rows, grid_cols)
                    _log("INFO", f"BBox override: ({bx1},{by1})→({bx2},{by2}) → tiles {selected_tiles}")
                else:
                    _log("INFO", "Nincs bbox a fallbackhoz — skip")
                    _click_new_challenge(page)
                    skipped += 1
                    result["skipped"] = skipped
                    page.wait_for_timeout(1500)
                    continue

            # ── Phase 2: Parallel per-tile verification ────────────────────────
            # Extract object context from Phase 1's reasoning to give each tile call
            # the full-picture knowledge (e.g. "a red bus spans the center-right area")
            object_context = analysis.get("reasoning", "")
            if not object_context:
                object_context = f"Challenge: '{challenge_prompt_text}'. Challenge type: single_image."

            phase2_confirmed, phase2_tested = _verify_tiles_parallel(
                page, actual_grid_size,
                challenge_prompt_text, object_context
            )

            # ── Filter merge: Phase 2 is the authority ─────────────────────────
            # - Tiles Phase 2 confirmed (YES) → always include
            # - Tiles Phase 2 explicitly rejected (tested but said NO) → remove from P1
            # - Tiles Phase 2 couldn't test (error/timeout) → keep from P1 (benefit of doubt)
            phase1_set = set(selected_tiles)
            phase2_rejected = phase2_tested - phase2_confirmed  # tested but said NO
            phase2_no_opinion = phase1_set - phase2_tested       # P1 had these, P2 didn't test

            merged = phase2_confirmed | phase2_no_opinion
            _log("INFO", f"Merge: P1={sorted(phase1_set)} P2_yes={sorted(phase2_confirmed)} "
                         f"P2_rejected={sorted(phase2_rejected)} -> final={sorted(merged)}")
            selected_tiles = sorted(merged)
            # Store for captcha_vector upload
            _p1_tiles_for_upload = sorted(phase1_set)
            _p2_tiles_for_upload = sorted(phase2_confirmed)


        _log("INFO", f"Challenge: '{prompt_text}' | Tiles: {selected_tiles} | Confidence: {confidence:.0%}")

        # Sanity check: for multi_image only — reject if AI selects all/near-all tiles.
        if challenge_type == "multi_image":
            max_sane = actual_grid_size - 1
            if len(selected_tiles) > max_sane:
                _log("ERROR", f"AI tul sok tilet valasztott MULTI_IMAGE modban ({len(selected_tiles)}/{actual_grid_size}) — skip")
                _click_new_challenge(page)
                skipped += 1
                result["skipped"] = skipped
                page.wait_for_timeout(1500)
                continue

        # Confidence gate
        if confidence < CONFIDENCE_THRESHOLD:
            _log("INFO", f"Confidence ({confidence:.0%}) < {CONFIDENCE_THRESHOLD:.0%}, skip...")
            skipped += 1
            result["skipped"] = skipped
            if skipped < MAX_SKIP_RETRIES:
                _click_new_challenge(page)
                page.wait_for_timeout(1500)
                continue

        if not selected_tiles:
            _log("ERROR", "AI nem talalt tile-okat, skip")
            _click_new_challenge(page)
            skipped += 1
            result["skipped"] = skipped
            page.wait_for_timeout(1500)
            continue

        # ── Save to captcha_vector DB ──────────────────────────────────────
        if challenge_screenshot:
            save_captcha_vector(
                domain=kwargs.get("domain", "unknown"),
                session_id=kwargs.get("session_id", ""),
                attempt_round=attempt + 1,
                challenge_text=challenge_prompt_text,
                challenge_type=challenge_type,
                grid_size=actual_grid_size,
                screenshot_bytes=challenge_screenshot,
                p1_tiles=_p1_tiles_for_upload if challenge_type == "single_image" else selected_tiles,
                p2_tiles=_p2_tiles_for_upload if challenge_type == "single_image" else [],
                final_tiles=selected_tiles,
                supabase_url=kwargs.get("supabase_url", ""),
                supabase_service_key=kwargs.get("supabase_service_key", ""),
            )

        # Click the identified tiles — track what we've clicked
        all_clicked: set = set()
        newly_clicked = _click_tiles(page, selected_tiles, actual_grid_size)
        all_clicked.update(newly_clicked)
        ss(f"tiles_kattintva_{attempt + 1}")



        # ── Dynamic tile handling — ONLY for real 3x3 grids ────────────────
        # reCAPTCHA only replaces individual tiles in 3x3 grids, never 4x4.
        if is_3x3:
            # Stagnation detection: only compares within the DYNAMIC phase.
            # Init to empty so the first dynamic result never falsely
            # matches the initial batch (those slots now show new images).
            dynamic_clicked: set = set()
            prev_new_tiles: set = set()  # intentionally empty — not set(selected_tiles)
            for recheck in range(MAX_DYNAMIC_RECHECKS):
                # Short base wait, then poll until replacement images are fully loaded
                page.wait_for_timeout(DYNAMIC_WAIT_MS)
                stable = _wait_for_tiles_stable(page, max_wait_ms=700)
                if not stable:
                    _log("INFO", "Tile betoltes timeout, kepernyo keszitese ertekesitheto allapotban")

                recheck_ss = _screenshot_challenge(page)
                if not recheck_ss:
                    break

                _log("INFO", f"Dinamikus tile ellenorzes ({recheck + 1}/{MAX_DYNAMIC_RECHECKS})...")
                recheck_analysis = _call_ai(recheck_ss, challenge_prompt_text, actual_grid_size)

                if not recheck_analysis:
                    _log("ERROR", "AI nem valaszolt a recheck-ben, leallitas")
                    break

                new_tiles_raw = set(recheck_analysis.get("selected_tiles", []))
                new_confidence = recheck_analysis.get("confidence", 0)

                # Only block tiles clicked in THIS dynamic phase — not the initial
                # batch, since those slots now show replacement images.
                truly_new_tiles = new_tiles_raw - dynamic_clicked

                _log("INFO", f"Ujra-elemzes: uj={sorted(truly_new_tiles)}, "
                     f"dinamikusan-kattintott={sorted(dynamic_clicked)}, confidence={new_confidence:.0%}")

                if not truly_new_tiles:
                    _log("INFO", "Nincs tobb uj tile -> Verify")
                    break

                if new_confidence < CONFIDENCE_THRESHOLD:
                    _log("INFO", f"Alacsony confidence a recheck-ben ({new_confidence:.0%}) -> Verify")
                    break

                # Stagnation: same tiles as the PREVIOUS dynamic round (not initial)
                if prev_new_tiles and truly_new_tiles == prev_new_tiles:
                    _log("INFO", f"Stagnalo tile kivalasztas ({sorted(truly_new_tiles)}) -> Verify")
                    break

                _log("INFO", f"Uj dinamikus tile-ok: {sorted(truly_new_tiles)}")
                newly_clicked = _click_tiles(page, list(truly_new_tiles), actual_grid_size)
                dynamic_clicked.update(newly_clicked)
                all_clicked.update(newly_clicked)
                prev_new_tiles = truly_new_tiles
                ss(f"dynamic_{attempt + 1}_{recheck + 1}")
        else:
            _log("INFO", f"4x4 grid — dinamikus tile loop atugras (4x4 gridnel nincs tile csere)")

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

    _log("INFO" if result["solved"] else "ERROR",
         f"{'SIKERES' if result['solved'] else 'SIKERTELEN'} megoldas | "
         f"Kiserletek: {attempts}, Skip: {skipped}")

    result["attempts"] = attempts
    result["skipped"] = skipped
    ss("vege")
    return result
