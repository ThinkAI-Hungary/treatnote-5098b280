import sys
import os
import json
import time
import urllib.request
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeoutError

# ---------------------------------------------------------------------------
# Usage:
#   python status.py '<DOMAIN>' '<PATIENT_ID>' '<JSON_DATA>' '<EMAIL>' '<PASSWORD>'
# ---------------------------------------------------------------------------

# ── Config ──────────────────────────────────────────────────────────────────
SLOWMO_MS        = 100     # breathing room between Playwright ops (increased for safety)
CLICK_TIMEOUT_MS = 3000    # 3s per attempt — fast retries, 3 attempts = 9s max
NAV_TIMEOUT_MS   = 30000
TOOTH_PAUSE      = 1.0     # pause between teeth (increased)
BUTTON_PAUSE     = 0.2     # pause between button clicks (increased)

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

SUPABASE_URL = "https://bpjzgapmoyhtgryglcke.supabase.co"
SUPABASE_SERVICE_KEY = _load_env_secret("SUPABASE_SERVICE_KEY")

_log_buffer: list = []
_screenshot_buffer: list = []


# ── Logging ─────────────────────────────────────────────────────────────────
def log(msg: str, level: str = "INFO") -> None:
    colors = {"OK": "\033[92m", "ERROR": "\033[91m", "DEBUG": "\033[95m", "WARN": "\033[93m"}
    c = colors.get(level, "")
    line = f"[{level}] {time.strftime('%H:%M:%S')} {msg}"
    _log_buffer.append(line)
    print(f"{c}{line}\033[0m", flush=True)
    # Also write to stderr so n8n Execute Command captures diagnostic output
    print(line, file=sys.stderr, flush=True)

# ── Supabase Error Reporting ────────────────────────────────────────────────
def supabase_upload_screenshot(name: str, png_bytes: bytes) -> str:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log("[UPLOAD] Supabase env vars hiányoznak", "ERROR")
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
        log(f"[UPLOAD] Screenshot feltöltve: {path} ({resp.status})", "INFO")
        return path
    except Exception as e:
        log(f"[UPLOAD] Screenshot hiba: {type(e).__name__}: {str(e)[:200]}", "ERROR")
        return ""


def upload_error_report(summary: str, severity: str = "error") -> None:
    """Upload all buffered screenshots + full log to Supabase."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log("[UPLOAD] Supabase env vars hiányoznak, error log nem lett elmentve", "ERROR")
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

    # Safely get globals
    email_val = globals().get("EMAIL", "Unknown")
    patient_id_val = globals().get("PATIENT_ID", "Unknown")
    domain_val = globals().get("DOMAIN", "Unknown")

    metadata = {
        "email": email_val,
        "patient_id": patient_id_val,
        "screenshot_count": len(_screenshot_buffer),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    body = json.dumps({
        "script_name": "status.py",
        "domain": domain_val,
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
        log(f"[UPLOAD] Error log elmentve ({resp.status})", "INFO")
    except Exception as e:
        log(f"[UPLOAD] Error log mentés hiba: {type(e).__name__}: {str(e)[:200]}", "ERROR")


# ── Argument Parsing ─────────────────────────────────────────────────────────
if len(sys.argv) < 4:
    log("Usage: status.py <domain> <patient_id> <json_data> [email] [password]", "ERROR")
    sys.exit(1)

arg_domain     = sys.argv[1].strip()
arg_patient_id = sys.argv[2].strip()
arg_json_raw   = sys.argv[3].strip()
arg_email      = sys.argv[4].strip() if len(sys.argv) > 4 else ""
arg_password   = sys.argv[5].strip() if len(sys.argv) > 5 else ""

try:
    ROOT_DATA = json.loads(arg_json_raw)
    if isinstance(ROOT_DATA, list):
        ROOT_DATA = ROOT_DATA[0]
    STATUS_DATA = ROOT_DATA.get("status_data", ROOT_DATA)
except json.JSONDecodeError as e:
    log(f"JSON parse error: {e}", "ERROR")
    sys.exit(1)

META = ROOT_DATA.get("metadata", {})

DOMAIN     = arg_domain     or META.get("domain")     or ROOT_DATA.get("domain")     or ROOT_DATA.get("flexi_domain") or ""
PATIENT_ID = arg_patient_id or META.get("paciensId")  or ROOT_DATA.get("PaciensID")  or ""
EMAIL      = arg_email      or META.get("email")      or ROOT_DATA.get("flexi_username") or ""
PASSWORD   = arg_password   or META.get("password")    or ROOT_DATA.get("flexi_pw")   or ""

if not all([DOMAIN, PATIENT_ID, EMAIL, PASSWORD]):
    log(f"Missing info — DOMAIN={DOMAIN!r}  ID={PATIENT_ID!r}  "
        f"EMAIL={EMAIL!r}  PW={'***' if PASSWORD else 'None'}", "ERROR")
    sys.exit(1)


# ── Full Dental Mapping (complete, from old script) ──────────────────────────
MAPPING: dict[str, str] = {
    # --- Általános ---
    "Foghiany": "missing", "Tejfog": "milk_tooth", "Barazdazaras": "fissure",
    "Parapulpalis_csap": "parapulpal_pin", "Radix": "radix",
    "Lecsiszolt_fog": "resected_tooth", "Rezekalt_fog": "resected_tooth_ok",
    "Csontpotlas": "bone_graft",

    # --- Implant ---
    "Nobel": "implant_nobel", "AlphaBio": "implant_alphabio",
    "IDEGEN": "implant_foreign", "Ankylos": "implant_ankylos",
    "SGS": "implant_sgs", "Straumann": "implant_straumann",
    "Astra": "implant_astra", "Anyridge": "implant_anyridge",
    "Nobel_Active": "implant_nobel_active", "Nobel_On1": "implant_nobel_on1",
    "Nobel_Replace": "implant_nobel_replace", "Camlog": "implant_camlog",
    "Conelog": "implant_conelog", "Camlog_Isy": "implant_camlog_Isy",
    "Denti": "implant_denti",

    # --- Felépítmények ---
    "Altalanos_felepitmeny_-_Implant_Felepitmenyek": "implant_head",
    "Bredent_Multi_unit_(egyenes)_-_Implant_Felepitmenyek": "implant_bredent_straight",
    "Bredent_Multi_unit_(szogtort_-_bal)_-_Implant_Felepitmenyek": "implant_bredent_bent_left",
    "Bredent_Multi_unit_(szogtort_-_jobb)_-_Implant_Felepitmenyek": "implant_bredent_bent_right",

    # --- Periapicalis ---
    "Granuloma_-_Periapicalis_elv.": "granuloma",
    "Cysta_-_Periapicalis_elv.": "cysta",
    "Elhalt_gyoker_-_Periapicalis_elv.": "deadroot",

    # --- Gyökércsap ---
    "keramia_-_Gyokercsap": "taproot_ceramic", "fem_-_Gyokercsap": "taproot_metal",
    "uvegszalas_-_Gyokercsap": "taproot_fiber", "Kompozit_-_Gyokercsap": "taproot_composite",

    # --- Caries ---
    "Mesialis_-_Caries": "caries_m", "Occlusalis_-_Caries": "caries_o",
    "Distalis_-_Caries": "caries_d", "Gingivo_B._-_Caries": "caries_gb",
    "Buccalis_-_Caries": "caries_lb", "Pal_Ling_-_Caries": "caries_po",
    "Incizalis_-_Caries": "caries_i",
    "Gyok._caries_3_-_Caries": "tooth_root_caries_a",
    "Gyok._caries_2_-_Caries": "tooth_root_caries_b",
    "Gyok._caries_1_-_Caries": "tooth_root_caries_c",

    # --- Tömés (Amalgám) ---
    "Mesialis_-_Tomes_Amalgam": "filling_amalgam_m",
    "Occlusalis_-_Tomes_Amalgam": "filling_amalgam_o",
    "Distalis_-_Tomes_Amalgam": "filling_amalgam_d",
    "Gingivo_B._-_Tomes_Amalgam": "filling_amalgam_gb",
    "Buccalis_-_Tomes_Amalgam": "filling_amalgam_lb",
    "Pal_Ling_-_Tomes_Amalgam": "filling_amalgam_po",
    "Incizalis_-_Tomes_Amalgam": "filling_amalgam_i",

    # --- Tömés (Esztétikus) ---
    "Mesialis_-_Tomes_Esztetikus": "filling_esthetic_m",
    "Occlusalis_-_Tomes_Esztetikus": "filling_esthetic_o",
    "Distalis_-_Tomes_Esztetikus": "filling_esthetic_d",
    "Gingivo_B._-_Tomes_Esztetikus": "filling_esthetic_gb",
    "Buccalis_-_Tomes_Esztetikus": "filling_esthetic_lb",
    "Pal_Ling_-_Tomes_Esztetikus": "filling_esthetic_po",
    "Incizalis_-_Tomes_Esztetikus": "filling_esthetic_i",
    "Eszt._tomes_(alt.)_-_Tomes_Esztetikus": "filling_esthetic_alt",

    # --- Tömés (Ideiglenes) ---
    "Mesialis_-_Tomes_Ideiglenes": "filling_temporary_m",
    "Occlusalis_-_Tomes_Ideiglenes": "filling_temporary_o",
    "Distalis_-_Tomes_Ideiglenes": "filling_temporary_d",
    "Gingivo_B._-_Tomes_Ideiglenes": "filling_temporary_gb",
    "Buccalis_-_Tomes_Ideiglenes": "filling_temporary_lb",
    "Pal_Ling_-_Tomes_Ideiglenes": "filling_temporary_po",
    "Incizalis_-_Tomes_Ideiglenes": "filling_temporary_i",

    # --- Tömés (Arany) ---
    "Mesialis_-_Tomes_Arany": "filling_gold_m",
    "Occlusalis_-_Tomes_Arany": "filling_gold_o",
    "Distalis_-_Tomes_Arany": "filling_gold_d",
    "Gingivo_B._-_Tomes_Arany": "filling_gold_gb",
    "Buccalis_-_Tomes_Arany": "filling_gold_lb",
    "Pal_Ling_-_Tomes_Arany": "filling_gold_po",
    "Incizalis_-_Tomes_Arany": "filling_gold_i",

    # --- Csonkfelépítés ---
    "Mesialis_-_Csonkfelepites_Cetac-Molar": "corebuildup_cetacmolar_m",
    "Occlusalis_-_Csonkfelepites_Cetac-Molar": "corebuildup_cetacmolar_o",
    "Distalis_-_Csonkfelepites_Cetac-Molar": "corebuildup_cetacmolar_d",
    "Mesialis_-_Csonkfelepites_Vitremer": "corebuildup_composite_m",
    "Occlusalis_-_Csonkfelepites_Vitremer": "corebuildup_composite_o",
    "Distalis_-_Csonkfelepites_Vitremer": "corebuildup_composite_d",
    "Mesialis_-_Csonkfelepites_Composite": "corebuildup_vitremer_m",
    "Occlusalis_-_Csonkfelepites_Composite": "corebuildup_vitremer_o",
    "Distalis_-_Csonkfelepites_Composite": "corebuildup_vitremer_d",

    # --- Protézis ---
    "Teljes_-_Protezis": "prosthesis_full",
    "Teljes_(impl.)_-_Protezis": "prosthesis_on_implant_full",
    "Steg_-_Protezis": "pier_abutment",
    "bal_-_Protezis_Reszleges_kiveheto": "prosthesis_removable_pier_left",
    "kozep_-_Protezis_Reszleges_kiveheto": "prosthesis_removable_pier_center",
    "jobb_-_Protezis_Reszleges_kiveheto": "prosthesis_removable_pier_right",
    "kozep_-_Protezis_Reszl._kiv._(impl.)": "prosthesis_on_implant_removable_pier_center",
    "bal_-_Protezis_Reszl._kiv._(impl.)": "prosthesis_on_implant_removable_pier_left",
    "jobb_-_Protezis_Reszl._kiv._(impl.)": "prosthesis_on_implant_removable_pier_right",
    "Cserelendo_teljes_prot._-_Protezis_Cserelendo_protezis": "prothesis_full_replace_needed",
    "Cserelendo_prot._-_bal_-_Protezis_Cserelendo_protezis": "prosthesis_removable_pier_left_replace_needed",
    "Cserelendo_prot._-_kozep_-_Protezis_Cserelendo_protezis": "prosthesis_removable_pier_center_replace_needed",
    "Cserelendo_prot._-_jobb_-_Protezis_Cserelendo_protezis": "prosthesis_removable_pier_right_replace_needed",

    # --- Korona ---
    "Fem-keramia_-_Korona": "crown_metal_ceramic",
    "Cirkonium_-_Korona": "crown_zirconium",
    "Preskeramia_-_Korona": "crown_pressed_ceramic",
    "Aranykeramia_-_Korona": "crown_gold_ceramic",
    "Procera_-_Korona": "crown_procera",
    "Ideig._Procera_-_Korona": "crown_procera_temp",
    "Ideiglenes_-_Korona": "crown_temporary",
    "Teleszk._korona_-_Korona": "telescopic_crown",
    "Femkorona_-_Korona": "crown_metal",

    # --- Korona (Ideiglenes ragasztás) ---
    "Aranykeramia_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_gold_ceramic",
    "Femkeramia_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_metal_ceramic",
    "Fem_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_metal_crown",
    "Preskeramia_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_pressed_ceramic",
    "Procera_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_procera",
    "Cirkon_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_zirconium",

    # --- Híd ---
    "Fem-keramia_-_Hid": "bridge_metal_ceramic",
    "Cirkonium_-_Hid": "bridge_zirconium",
    "Preskeramia_-_Hid": "bridge_pressed_ceramic",
    "Aranykeramia_-_Hid": "bridge_gold_ceramic",
    "Hidelvalasztas_-_Hid": "bridge_separation",
    "Ideiglenes_hid_-_Hid": "bridge_temporary",

    # --- Élpótlás ---
    "Mesialis_-_Elpotlas": "edge_replacement_m",
    "Incizalis_-_Elpotlas": "edge_replacement_o",
    "Distalis_-_Elpotlas": "edge_replacement_d",

    # --- Letört fog ---
    "Mesialis_-_Letort_fog": "broken_tooth_m",
    "Incizalis_-_Letort_fog": "broken_tooth_o",
    "Distalis_-_Letort_fog": "broken_tooth_d",

    # --- Gyökértömés (Végleges) ---
    "M._Buccalis_-_Gyokertomes_Vegleges": "rootcanal_final_mb",
    "D._Buccalis_-_Gyokertomes_Vegleges": "rootcanal_final_d",
    "Pal_Ling_-_Gyokertomes_Vegleges": "rootcanal_final_p",
    "Ossz._gyoker_-_Gyokertomes_Vegleges": "rootcanal_final_extra",
    "Inkomplett_-_Gyokertomes_Vegleges": "rootcanal_incomplete",

    # --- Gyökértömés (Ideiglenes) ---
    "M._Buccalis_-_Gyokertomes_Ideiglenes": "rootcanal_temporary_mb",
    "D._Buccalis_-_Gyokertomes_Ideiglenes": "rootcanal_temporary_d",
    "Pal_Ling_-_Gyokertomes_Ideiglenes": "rootcanal_temporary_p",
    "Ossz._gyoker_-_Gyokertomes_Ideiglenes": "rootcanal_temporary_extra",

    # --- Retrográd gyökértömés ---
    "D._Buccalis_-_Retrograd_gy.tomes": "retrograde_root_filling_d",
    "M._Buccalis_-_Retrograd_gy.tomes": "retrograde_root_filling_m",
    "Palatinalis_-_Retrograd_gy.tomes": "retrograde_root_filling_p",
    "Kulonallo_-_Retrograd_gy.tomes": "retrograde_root_filling_single",

    # --- Betétek (Inlay/Onlay/Overlay) ---
    "Arany_-_Betetek_Inlay": "inlay_gold", "Kompozit_-_Betetek_Inlay": "inlay_composite",
    "Keramia_-_Betetek_Inlay": "inlay_ceramic", "Fembetet_-_Betetek_Inlay": "metal_insert_inlay",
    "Arany_-_Betetek_Onlay": "onlay_gold", "Kompozit_-_Betetek_Onlay": "onlay_composite",
    "Keramia_-_Betetek_Onlay": "onlay_ceramic", "Fembetet_-_Betetek_Onlay": "metal_insert_onlay",
    "Arany_-_Betetek_Overlay": "overlay_gold", "Kompozit_-_Betetek_Overlay": "overlay_composite",
    "Keramia_-_Betetek_Overlay": "overlay_ceramic", "Fembetet_-_Betetek_Overlay": "metal_insert_overlay",

    # --- Héjak ---
    "Hej_-_Hejak": "peels_peel", "Veneer_lay_-_Hejak": "peels_veneer_lay",

    # --- Speciális ---
    "Koronazando_fog_-_Specialis": "crown_needed",
    "Cserel._korona_-_Specialis": "replace_needed",
    "Kihuzando_fog_-_Specialis": "teeth_extraction_mark",
    "Zarodott_fogh._-_Specialis": "missing_closed",
    "Egyenes_csavar_-_Specialis": "implant_head_screw",
    "Gombfeju_csavar_-_Specialis": "implant_head_sphere",
    "Impaktalt_fog_-_Specialis": "impacted_tooth",
    "Muanyag_fog_-_Specialis": "plastic_tooth",
    "Brekket_-_Specialis": "bracket",
}

COMMENT_KEYS = {"megjegyzes", "megjegyzés", "comment", "note"}


# ── Helpers ──────────────────────────────────────────────────────────────────
def has_real_data(obj: object) -> bool:
    """True only when a tooth dict contains actionable data (not just empty strings)."""
    if not isinstance(obj, dict):
        return bool(obj)
    return any(
        (v is True)
        or (isinstance(v, str) and v.strip())
        or (isinstance(v, dict) and has_real_data(v))
        for v in obj.values()
    )


def collect_actions(obj: dict) -> tuple[list[str], str]:
    """
    Walk a tooth dict and return:
      - list of (json_key, data_name) tuples for buttons to click
      - comment string (empty if none)
    """
    buttons: list[tuple[str, str]] = []
    comment: str = ""

    def _walk(node: object) -> None:
        nonlocal comment
        if not isinstance(node, dict):
            return
        for key, val in node.items():
            if val is True and key in MAPPING:
                buttons.append((key, MAPPING[key]))
            elif key.lower() in COMMENT_KEYS and isinstance(val, str) and val.strip():
                comment = val.strip()
            elif isinstance(val, dict):
                _walk(val)

    _walk(obj)
    return buttons, comment


def expand_all_menus(page: Page) -> None:
    """Force-open every collapsible clinical sub-menu via JS."""
    page.evaluate("""() => {
        document.querySelectorAll('.tooth-option-menu').forEach(m => {
            m.style.display = 'block';
            m.style.height  = 'auto';
            m.classList.add('opened');
            const parent = m.previousElementSibling;
            if (parent && parent.classList && parent.classList.contains('tooth-option-parent')) {
                parent.classList.add('opened');
                parent.setAttribute('aria-expanded', 'true');
            }
        });
    }""")


def safe_click(page: Page, selector: str, description: str, timeout: int = CLICK_TIMEOUT_MS, max_retries: int = 2) -> bool:
    """
    Click an element via Playwright (real click, not JS).
    Waits for visible, scrolls into view, then clicks.
    Retries up to max_retries times with a 1s delay on failure.
    Returns True on success.
    """
    for attempt in range(max_retries + 1):
        try:
            loc = page.locator(selector).first
            loc.wait_for(state="visible", timeout=timeout)
            loc.scroll_into_view_if_needed(timeout=timeout)
            loc.click(timeout=timeout)
            return True
        except PWTimeoutError:
            if attempt < max_retries:
                log(f"Timeout clicking: {description} ({selector}) — retrying ({attempt + 1}/{max_retries})...", "WARN")
                time.sleep(1.0)
            else:
                log(f"Timeout clicking: {description} ({selector}) after {max_retries} retries.", "WARN")
                return False
        except Exception as e:
            if attempt < max_retries:
                log(f"Error clicking: {description} — {e} — retrying ({attempt + 1}/{max_retries})...", "WARN")
                time.sleep(1.0)
            else:
                log(f"Error clicking: {description} — {e}", "ERROR")
                return False
    return False


# ── Tooth Processing ─────────────────────────────────────────────────────────
def process_tooth(page: Page, tooth_num: str, data: dict, failed_list: list) -> None:
    buttons, comment = collect_actions(data)
    if not buttons and not comment:
        return

    tooth_sel = f"div#tooth-number-{tooth_num}"

    # Select the tooth (real Playwright click, like old script)
    if not safe_click(page, tooth_sel, f"tooth {tooth_num}"):
        failed_list.append(f"[{tooth_num}] tooth click failed")
        time.sleep(0.5)
        return

    # Re-expand menus after tooth click (UI may collapse them)
    expand_all_menus(page)
    time.sleep(0.3)

    # Click status buttons (real Playwright clicks with wait_for + scroll)
    for json_key, data_name in buttons:
        # Check if this status is already applied on the tooth
        existing_sel = f"#tooth-status-{tooth_num}-{data_name}"
        if page.locator(existing_sel).count() > 0:
            log(f"  [{tooth_num}] Already set: {json_key} → {data_name}", "DEBUG")
            continue

        btn_sel = f'button.addDentilSignButton[data-name="{data_name}"]'
        if safe_click(page, btn_sel, f"[{tooth_num}] {json_key} → {data_name}"):
            log(f"  [{tooth_num}] Synced: {json_key} → {data_name}", "OK")
            time.sleep(BUTTON_PAUSE)
        else:
            log(f"  [{tooth_num}] Failed: {json_key} → {data_name}", "ERROR")
            failed_list.append(f"[{tooth_num}] {json_key} → {data_name}")

    # Save comment
    if comment:
        log(f"  [{tooth_num}] Saving comment: {comment[:50]!r}", "OK")
        try:
            # Force-reveal the hidden comment input
            page.evaluate("""() => {
                const el = document.querySelector('input#tooth_comment');
                if (el) {
                    el.classList.remove('displayNone');
                    el.style.display = 'block';
                    el.style.visibility = 'visible';
                }
            }""")
            loc = page.locator("input#tooth_comment").first
            loc.wait_for(state="visible", timeout=CLICK_TIMEOUT_MS)
            loc.scroll_into_view_if_needed(timeout=CLICK_TIMEOUT_MS)
            loc.fill("")
            loc.fill(comment)
            safe_click(page, "button#saveToothComment", f"[{tooth_num}] save comment")
            time.sleep(0.1)
            log(f"  [{tooth_num}] Comment saved.", "OK")
        except PWTimeoutError:
            log(f"  [{tooth_num}] Comment input timeout.", "WARN")
        except Exception as e:
            log(f"  [{tooth_num}] Comment error: {e}", "ERROR")

    # Deselect tooth
    safe_click(page, tooth_sel, f"deselect tooth {tooth_num}")
    time.sleep(TOOTH_PAUSE)


# ── General Clinical Comment ──────────────────────────────────────────────────
def save_general_comment(page: Page) -> None:
    gen_comment = (
        STATUS_DATA.get("MEGJEGYZES_FO")
        or STATUS_DATA.get("megjegyzes_fo")
        or ROOT_DATA.get("MEGJEGYZES_FO")
        or ROOT_DATA.get("megjegyzes_fo")
        or META.get("MEGJEGYZES_FO")
        or META.get("megjegyzes_fo")
        or STATUS_DATA.get("body", {}).get("MEGJEGYZES_FO")
        or STATUS_DATA.get("body", {}).get("megjegyzes_fo")
    )

    if not (gen_comment and str(gen_comment).strip()):
        log("No general clinical comment — skipping.", "DEBUG")
        return

    text = str(gen_comment).strip()
    log(f"Saving general comment ({len(text)} chars)…", "OK")

    try:
        loc = page.locator("i.fa-plus.fa-fw").first
        loc.wait_for(state="visible", timeout=CLICK_TIMEOUT_MS)
        loc.scroll_into_view_if_needed(timeout=CLICK_TIMEOUT_MS)
        loc.click(timeout=CLICK_TIMEOUT_MS)

        ta = page.locator("textarea#AddPatientCommentModal_comment").first
        ta.wait_for(state="visible", timeout=CLICK_TIMEOUT_MS)
        ta.scroll_into_view_if_needed(timeout=CLICK_TIMEOUT_MS)
        ta.fill(text)

        safe_click(page, "button#AddPatientCommentModal_SaveButton", "general comment save")
        time.sleep(0.2)
        log("General comment saved.", "OK")
    except PWTimeoutError as e:
        log(f"General comment modal error: {e}", "ERROR")
    except Exception as e:
        log(f"General comment error: {e}", "ERROR")


# ── Main ─────────────────────────────────────────────────────────────────────
def run() -> None:
    headless  = os.getenv("HEADLESS", "true").lower() == "true"
    base_url  = f"https://{DOMAIN}.flexi-dent.hu"

    # Pre-filter: only teeth with actual data
    actionable = sorted(
        [k for k in STATUS_DATA if k.isdigit() and has_real_data(STATUS_DATA[k])],
        key=int,
    )
    log(f"Actionable teeth ({len(actionable)}): {actionable}")

    with sync_playwright() as p:
        log(f"Launching browser (headless={headless}, slow_mo={SLOWMO_MS}ms)…")
        browser = p.chromium.launch(headless=headless, slow_mo=SLOWMO_MS)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page    = context.new_page()

        # Set a global timeout so the script doesn't hang forever
        page.set_default_timeout(NAV_TIMEOUT_MS)
        page.set_default_navigation_timeout(NAV_TIMEOUT_MS)

        ss_num = [0]
        def screenshot(leiras: str):
            """Capture screenshot to in-memory buffer."""
            ss_num[0] += 1
            name = f"{ss_num[0]:02d}_{leiras}"
            try:
                png_bytes = page.screenshot(full_page=True)
                _screenshot_buffer.append((name, png_bytes))
                log(f"[SCREENSHOT] {name} ({len(png_bytes)} bytes)", "INFO")
            except Exception as e:
                log(f"[SCREENSHOT] {name} hiba: {e}", "ERROR")

        success = False
        try:
            # ── Login ──────────────────────────────────────────────────
            log(f"Navigating to {base_url}…")
            page.goto(f"{base_url}/hu/?msg=no-for-patient", wait_until="networkidle",
                      timeout=NAV_TIMEOUT_MS)
            page.fill('input[name="emailaddress"]', EMAIL)
            page.fill('input[name="password"]', PASSWORD)
            page.click('input[type="submit"][value="Bejelentkezés"]')
            page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT_MS)

            if "msg=no-for-patient" in page.url:
                log("Authentication failed!", "ERROR")
                screenshot("auth_failed")
                upload_error_report("Authentication failed")
                sys.exit(1)
            log("Logged in.", "OK")
            screenshot("logged_in")

            # ── Patient Card ───────────────────────────────────────────
            log(f"Opening patient card: {PATIENT_ID}")
            page.goto(f"{base_url}/hu/patients/cardboard/cardboard?id={PATIENT_ID}",
                      wait_until="networkidle", timeout=NAV_TIMEOUT_MS)
            screenshot("patient_card_opened")

            # ── Ensure we are on "Új karton" (new card) tab ───────────
            # The page may load on "Régi karton" (old card) where the
            # status editor is not available.
            try:
                uj_karton_btn = page.locator("div#changeToNewCardboardMenuButton")
                if uj_karton_btn.count() > 0 and uj_karton_btn.first.is_visible():
                    # Check if it's already active
                    classes = uj_karton_btn.first.get_attribute("class") or ""
                    if "menu-toggle-button-active" not in classes:
                        log("Page loaded on Régi karton — switching to Új karton…", "WARN")
                        uj_karton_btn.first.click(timeout=CLICK_TIMEOUT_MS)
                        page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT_MS)
                        time.sleep(1.0)
                        log("Switched to Új karton.", "OK")
                        screenshot("switched_to_uj_karton")
                    else:
                        log("Already on Új karton — proceeding.", "OK")
                else:
                    log("Új karton button not found — assuming correct tab.", "DEBUG")
            except Exception as e:
                log(f"Új karton check error: {e} — continuing anyway.", "WARN")

            # ── Open Status Editor ─────────────────────────────────────
            log("Opening Status UI…")
            if not safe_click(page, "div#editStatusText", "Status editor"):
                log("Failed to click Status editor!", "ERROR")
                screenshot("failed_open_status")
                upload_error_report("Failed to open Status editor")
                sys.exit(1)
                
            time.sleep(1.0)
            
            # Dismiss any "unsaved changes" confirmation dialog
            try:
                page.locator(".jconfirm-buttons .btn.btn-red").first.click(timeout=1500)
                page.wait_for_load_state("networkidle", timeout=NAV_TIMEOUT_MS)
                time.sleep(0.5)
            except PWTimeoutError:
                log("No confirmation dialog — continuing.", "DEBUG")

            # ── Wait for DOM to settle ────────────────────────────────
            log("Waiting for Status UI to settle (networkidle + visibility)...")
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
                page.wait_for_selector(".tooth-option-parent", state="attached", timeout=15000)
                # Extra explicit wait for slow connections where Angular re-renders the DOM
                time.sleep(2.0)
            except PWTimeoutError:
                log("Timeout waiting for Status UI to settle, continuing anyway...", "WARN")
            
            screenshot("status_editor_ready")

            # ── Expand all sub-menus ──────────────────────────────────
            expand_all_menus(page)

            # ── Process teeth ─────────────────────────────────────────
            failed_buttons: list = []
            for tooth in actionable:
                log(f"Processing tooth {tooth}…")
                process_tooth(page, tooth, STATUS_DATA[tooth], failed_buttons)

            # ── General Comment ────────────────────────────────────────
            save_general_comment(page)

            # ── Final Save (Státusz Rögzítése) ────────────────────────
            log("Finalising — clicking 'Státusz Rögzítése'…")
            screenshot("before_final_save")
            if safe_click(page, "button#saveStatusDentilHeader", "Státusz Rögzítése"):
                time.sleep(1.5)
                # Also wait for the post-save navigation or network idle to ensure the save goes through
                try:
                    page.wait_for_load_state("networkidle", timeout=10000)
                except PWTimeoutError:
                    pass
                log("Session saved successfully.", "OK")
            else:
                log("Final save button did not respond!", "ERROR")
                screenshot("failed_final_save")
                upload_error_report("Failed to click final save button")
                sys.exit(1)

            screenshot("automation_completed")
            log("Automation completed.", "OK")

            # Upload error report if any buttons failed
            if failed_buttons:
                summary = f"{len(failed_buttons)} button(s) failed: {'; '.join(failed_buttons[:5])}"
                log(f"Uploading error report: {summary}", "WARN")
                upload_error_report(summary, severity="warning")

            success = True

        except SystemExit:
            # Re-raise so the exit code (1) propagates to OS / n8n.
            # The `finally` block still runs before the process exits.
            raise
        except Exception as e:
            log(f"Unexpected error in automation: {type(e).__name__}: {str(e)}", "ERROR")
            screenshot("unexpected_error")
            upload_error_report(f"Unexpected error: {str(e)[:100]}")
            sys.exit(1)
        finally:
            log("Closing browser...")
            browser.close()
            log("Browser closed.")


if __name__ == "__main__":
    try:
        run()
    except SystemExit as e:
        # Propagate the exit code to the OS (n8n checks this)
        sys.exit(e.code)
    except Exception as e:
        # Catch-all so n8n always gets stderr output
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
