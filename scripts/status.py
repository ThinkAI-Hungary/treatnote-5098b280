import sys
import os
import json
import time
import re
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError

# Usage:
# python3 status.py '<DOMAIN>' '<PATIENT_ID>' '<JSON_DATA>' '<EMAIL>' '<PASSWORD>'

def log(msg, level="INFO"):
    timestamp = time.strftime('%H:%M:%S')
    color = ""
    if level == "OK": color = "\033[92m"
    elif level == "ERROR": color = "\033[91m"
    elif level == "DEBUG": color = "\033[95m"
    reset = "\033[0m"
    print(f"{color}[{level}] {timestamp} {msg}{reset}")

# --- 1. Argument Parsing ---
if len(sys.argv) < 4:
    log("Missing required arguments (Domain, ID, and JSON).", "ERROR")
    sys.exit(1)

arg_domain = sys.argv[1].strip()
arg_patient_id = sys.argv[2].strip()
arg_json_raw = sys.argv[3].strip()
arg_email = sys.argv[4].strip() if len(sys.argv) > 4 else ""
arg_password = sys.argv[5].strip() if len(sys.argv) > 5 else ""

try:
    ROOT_DATA = json.loads(arg_json_raw)
    STATUS_DATA = ROOT_DATA.get("status_data") if "status_data" in ROOT_DATA else ROOT_DATA
except Exception as e:
    log(f"Error parsing JSON data: {e}", "ERROR")
    sys.exit(1)

# Resilient Metadata Retrieval
DOMAIN = arg_domain or ROOT_DATA.get("metadata", {}).get("domain") or ROOT_DATA.get("domain") or ROOT_DATA.get("flexi_domain")
PATIENT_ID = arg_patient_id or ROOT_DATA.get("metadata", {}).get("paciensId") or ROOT_DATA.get("PaciensID")
EMAIL = arg_email or ROOT_DATA.get("metadata", {}).get("email") or ROOT_DATA.get("flexi_username")
PASSWORD = arg_password or ROOT_DATA.get("metadata", {}).get("password") or ROOT_DATA.get("flexi_pw")

if not all([DOMAIN, PATIENT_ID, EMAIL, PASSWORD]):
    log(f"Missing connectivity info: DOMAIN={DOMAIN}, ID={PATIENT_ID}, EMAIL={EMAIL}, PW={'***' if PASSWORD else 'None'}", "ERROR")
    sys.exit(1)

# --- 2. FULL DENTAL MAPPING ---
MAPPING = {
    "Foghiany": "missing", "Tejfog": "milk_tooth", "Barazdazaras": "fissure",
    "Parapulpalis_csap": "parapulpal_pin", "Radix": "radix", "Lecsiszolt_fog": "resected_tooth",
    "Rezekalt_fog": "resected_tooth_ok", "Csontpotlas": "bone_graft",
    "Nobel": "implant_nobel", "AlphaBio": "implant_alphabio", "IDEGEN": "implant_foreign",
    "Ankylos": "implant_ankylos", "SGS": "implant_sgs", "Straumann": "implant_straumann",
    "Astra": "implant_astra", "Anyridge": "implant_anyridge", "Nobel_Active": "implant_nobel_active",
    "Nobel_On1": "implant_nobel_on1", "Nobel_Replace": "implant_nobel_replace",
    "Camlog": "implant_camlog", "Conelog": "implant_conelog", "Camlog_Isy": "implant_camlog_Isy",
    "Denti": "implant_denti", "Altalanos_felepitmeny_-_Implant_Felepitmenyek": "implant_head",
    "Granuloma_-_Periapicalis_elv.": "granuloma", "Cysta_-_Periapicalis_elv.": "cysta", "Elhalt_gyoker_-_Periapicalis_elv.": "deadroot",
    "keramia_-_Gyokercsap": "taproot_ceramic", "fem_-_Gyokercsap": "taproot_metal", "uvegszalas_-_Gyokercsap": "taproot_fiber", "Kompozit_-_Gyokercsap": "taproot_composite",
    "Mesialis_-_Caries": "caries_m", "Occlusalis_-_Caries": "caries_o", "Distalis_-_Caries": "caries_d",
    "Gingivo_B._-_Caries": "caries_gb", "Buccalis_-_Caries": "caries_lb", "Pal_Ling_-_Caries": "caries_po", "Incizalis_-_Caries": "caries_i",
    "Gyok._caries_3_-_Caries": "tooth_root_caries_a", "Gyok._caries_2_-_Caries": "tooth_root_caries_b", "Gyok._caries_1_-_Caries": "tooth_root_caries_c",
    "Mesialis_-_Tomes_Amalgam": "filling_amalgam_m", "Occlusalis_-_Tomes_Amalgam": "filling_amalgam_o", "Distalis_-_Tomes_Amalgam": "filling_amalgam_d",
    "Mesialis_-_Tomes_Esztetikus": "filling_esthetic_m", "Occlusalis_-_Tomes_Esztetikus": "filling_esthetic_o", "Distalis_-_Tomes_Esztetikus": "filling_esthetic_d",
    "Fem-keramia_-_Korona": "crown_metal_ceramic", "Cirkonium_-_Korona": "crown_zirconium", "Preskeramia_-_Korona": "crown_pressed_ceramic", "Aranykeramia_-_Korona": "crown_gold_ceramic",
    "Fem-keramia_-_Hid": "bridge_metal_ceramic", "Cirkonium_-_Hid": "bridge_zirconium", "Inkomplett_-_Gyokertomes_Vegleges": "rootcanal_incomplete",
    "Koronazando_fog_-_Specialis": "crown_needed", "Kihuzando_fog_-_Specialis": "teeth_extraction_mark", "Zarodott_fogh._-_Specialis": "missing_closed"
}

# --- 3. UI Helpers ---
def open_all_menus(page):
    log("Expanding clinical menus...", "DEBUG")
    page.evaluate("""() => {
        document.querySelectorAll('.tooth-option-menu').forEach(menu => {
            menu.style.display = 'block';
            menu.style.height = 'auto';
            menu.classList.add('opened');
            const parent = menu.previousElementSibling;
            if (parent && parent.classList.contains('tooth-option-parent')) {
                parent.classList.add('opened');
            }
        });
    }""")

# --- 4. Main Process ---
def run():
    with sync_playwright() as p:
        log(f"Connecting to {DOMAIN}...")
        headless_mode = os.getenv("HEADLESS", "true").lower() == "true"
        browser = p.chromium.launch(headless=headless_mode)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()
        base_url = f"https://{DOMAIN}.flexi-dent.hu"

        try:
            # Step 1: Navigation & Login
            log(f"Navigating to {base_url} and attempting login...")
            page.goto(f"{base_url}/hu/?msg=no-for-patient", wait_until="networkidle")
            page.fill('input[name="emailaddress"]', EMAIL)
            page.fill('input[name="password"]', PASSWORD)
            page.click('input[type="submit"][value="Bejelentkezés"]')
            page.wait_for_load_state("networkidle")

            if "msg=no-for-patient" in page.url:
                log("Authentication failed!", "ERROR")
                sys.exit(1)

            # Step 2: Patient Selection
            log(f"Opening Patient Card: {PATIENT_ID}")
            page.goto(f"{base_url}/hu/patients/cardboard/cardboard?id={PATIENT_ID}", wait_until="networkidle")

            # Step 3: Status Entry
            log("Opening Status UI...")
            page.click('div#editStatusText')
            try:
                page.locator('.jconfirm-buttons .btn.btn-red').click(timeout=1500)
                page.wait_for_load_state("networkidle")
            except: pass

            # Step 4: UI Preparation
            open_all_menus(page)

            # Step 5: Tooth Processing Loop
            def process_recursive(tooth_num, obj):
                if not isinstance(obj, dict): return
                for key, val in obj.items():
                    if not val: continue
                    
                    if val is True and key in MAPPING:
                        log(f"  [{tooth_num}] Syncing: {MAPPING[key]}", "OK")
                        try:
                            # 5.b Click the right UI button
                            btn = page.locator(f'button.addDentilSignButton[data-name="{MAPPING[key]}"]').first
                            btn.click(timeout=3000)
                            time.sleep(0.05)
                        except: pass
                    elif isinstance(val, dict):
                        process_recursive(tooth_num, val)
                    elif key.lower() in ["megjegyzes", "megjegyzés", "comment"] and str(val).strip():
                        log(f"  [{tooth_num}] Saving comment...", "OK")
                        try:
                            # 5.c Click onto input#tooth_comment
                            comment_input = page.locator('input#tooth_comment').first
                            comment_input.click(timeout=2000)
                            comment_input.fill("")
                            
                            # 5.d Paste the tooth's megjegyzés
                            page.type('input#tooth_comment', str(val).strip(), delay=20)
                            
                            # 5.e Click Mentés
                            page.click('button#saveToothComment')
                            time.sleep(0.1)
                        except Exception as e:
                            log(f"  [{tooth_num}] Comment save error: {e}", "DEBUG")

            tooth_keys = sorted([k for k in STATUS_DATA.keys() if k.isdigit() and STATUS_DATA[k]])
            for tooth in tooth_keys:
                log(f"Accessing tooth {tooth}...")
                tooth_selector = f'div#tooth-number-{tooth}'
                try:
                    # 5.a Click on the tooth
                    page.click(tooth_selector, timeout=5000)
                    process_recursive(tooth, STATUS_DATA[tooth])
                    
                    # 5.f Click on the tooth again (deselect/finalize)
                    page.click(tooth_selector)
                    time.sleep(0.2)
                except Exception as e:
                    log(f"Could not interact with tooth {tooth}: {e}", "ERROR")

            # Step 6: General Comment (MEGJEGYZES_FO)
            log("Step 6: Processing General Comment...", "DEBUG")
            log(f"Top-level keys in STATUS_DATA: {list(STATUS_DATA.keys())}", "DEBUG")
            
            # Hyper-resilient multi-level fallback search
            gen_comment = (
                STATUS_DATA.get("MEGJEGYZES_FO") or 
                ROOT_DATA.get("MEGJEGYZES_FO") or
                STATUS_DATA.get("metadata", {}).get("MEGJEGYZES_FO") or
                ROOT_DATA.get("metadata", {}).get("MEGJEGYZES_FO") or
                STATUS_DATA.get("body", {}).get("MEGJEGYZES_FO") or
                STATUS_DATA.get("body", {}).get("megjegyzes_fo") or
                ROOT_DATA.get("metadata", {}).get("megjegyzes_fo")
            )
            
            if gen_comment and str(gen_comment).strip():
                comment_text = str(gen_comment).strip()
                log(f"General Comment matched! Content preview: '{comment_text[:40]}...'", "OK")
                try:
                    log("Clicking clinical (+) plus icon...", "DEBUG")
                    page.click('i.fa-plus.fa-fw')
                    
                    log("Waiting for clinical comment modal...", "DEBUG")
                    page.wait_for_selector('textarea#AddPatientCommentModal_comment', state="visible", timeout=6000)
                    
                    log("Pasting general clinical record...", "DEBUG")
                    page.fill('textarea#AddPatientCommentModal_comment', "")
                    page.type('textarea#AddPatientCommentModal_comment', comment_text, delay=20)
                    
                    log("Clicking clinical Save button...", "DEBUG")
                    page.click('button#AddPatientCommentModal_SaveButton')
                    time.sleep(1.0) # Buffer for save
                    log("General clinical record successfully saved.", "OK")
                except Exception as e:
                    log(f"General Comment entry failed: {e}", "ERROR")
            else:
                log("No clinical general comment found after exhaustive search. Skipping Step 6.", "DEBUG")

            # Step 7: Final Commitment (Státusz Rögzítése)
            log("Finalizing: Clicking 'Státusz Rögzítése'...", "OK")
            try:
                save_btn = page.locator('button#saveStatusDentilHeader').first
                save_btn.scroll_into_view_if_needed()
                save_btn.click(timeout=5000)
                log("Full clinical session saved successfully.", "OK")
                time.sleep(1)
            except Exception as e:
                log(f"Final save click failed: {e}", "ERROR")

            log("Automation completed successfully.", "OK")

        finally:
            log("Closing browser.")
            browser.close()

if __name__ == "__main__":
    run()
