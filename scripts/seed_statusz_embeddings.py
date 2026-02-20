"""
seed_statusz_embeddings.py
Applies the statusz_embeddings migration and seeds all 150+ dental markers.
Usage: python seed_statusz_embeddings.py <openai_api_key>
"""
import sys
import json
import time
import urllib.request
import urllib.error

SUPABASE_URL = "https://bpjzgapmoyhtgryglcke.supabase.co"
SERVICE_KEY = "sbp_de091ef05f9b0b7cfd1c525566c0d0ea363e2806"

HEADERS_SUPABASE = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Full marker map: marker_key -> (label_hu, data_name, category)
MARKERS = {
    # --- Általános ---
    "Foghiany": ("Foghiány hiányzó fog", "missing", "Altalanos"),
    "Tejfog": ("Tejfog", "milk_tooth", "Altalanos"),
    "Barazdazaras": ("Barázdazárás", "fissure", "Altalanos"),
    "Parapulpalis_csap": ("Parapulpális csap", "parapulpal_pin", "Altalanos"),
    "Radix": ("Radix gyökérmaradvány", "radix", "Altalanos"),
    "Lecsiszolt_fog": ("Lecsiszolt fog", "resected_tooth", "Altalanos"),
    "Rezekalt_fog": ("Rezekált fog", "resected_tooth_ok", "Altalanos"),
    "Csontpotlas": ("Csontpótlás", "bone_graft", "Altalanos"),
    # --- Implant ---
    "Nobel": ("Nobel implantátum", "implant_nobel", "Implant"),
    "AlphaBio": ("AlphaBio implantátum", "implant_alphabio", "Implant"),
    "IDEGEN": ("Ismeretlen idegen implantátum", "implant_foreign", "Implant"),
    "Ankylos": ("Ankylos implantátum", "implant_ankylos", "Implant"),
    "SGS": ("SGS implantátum", "implant_sgs", "Implant"),
    "Straumann": ("Straumann implantátum", "implant_straumann", "Implant"),
    "Astra": ("Astra implantátum", "implant_astra", "Implant"),
    "Anyridge": ("Anyridge implantátum", "implant_anyridge", "Implant"),
    "Nobel_Active": ("Nobel Active implantátum", "implant_nobel_active", "Implant"),
    "Nobel_On1": ("Nobel On1 implantátum", "implant_nobel_on1", "Implant"),
    "Nobel_Replace": ("Nobel Replace implantátum", "implant_nobel_replace", "Implant"),
    "Camlog": ("Camlog implantátum", "implant_camlog", "Implant"),
    "Conelog": ("Conelog implantátum", "implant_conelog", "Implant"),
    "Camlog_Isy": ("Camlog Isy implantátum", "implant_camlog_Isy", "Implant"),
    "Denti": ("Denti implantátum", "implant_denti", "Implant"),
    # --- Felépítmény ---
    "Altalanos_felepitmeny_-_Implant_Felepitmenyek": ("Általános felépítmény", "implant_head", "Felepitmeny"),
    "Bredent_Multi_unit_(egyenes)_-_Implant_Felepitmenyek": ("Bredent Multi unit egyenes felépítmény", "implant_bredent_straight", "Felepitmeny"),
    "Bredent_Multi_unit_(szogtort_-_bal)_-_Implant_Felepitmenyek": ("Bredent Multi unit szögtört bal felépítmény", "implant_bredent_bent_left", "Felepitmeny"),
    "Bredent_Multi_unit_(szogtort_-_jobb)_-_Implant_Felepitmenyek": ("Bredent Multi unit szögtört jobb felépítmény", "implant_bredent_bent_right", "Felepitmeny"),
    # --- Periapicalis ---
    "Granuloma_-_Periapicalis_elv.": ("Granuloma periapicalis elváltozás", "granuloma", "Periapicalis"),
    "Cysta_-_Periapicalis_elv.": ("Cysta periapicalis elváltozás", "cysta", "Periapicalis"),
    "Elhalt_gyoker_-_Periapicalis_elv.": ("Elhalt gyökér", "deadroot", "Periapicalis"),
    # --- Gyökércsap ---
    "keramia_-_Gyokercsap": ("Kerámia gyökércsap", "taproot_ceramic", "Gyokercsap"),
    "fem_-_Gyokercsap": ("Fém gyökércsap", "taproot_metal", "Gyokercsap"),
    "uvegszalas_-_Gyokercsap": ("Üvegszálas gyökércsap", "taproot_fiber", "Gyokercsap"),
    "Kompozit_-_Gyokercsap": ("Kompozit gyökércsap", "taproot_composite", "Gyokercsap"),
    # --- Caries ---
    "Mesialis_-_Caries": ("Mesiális caries szuvasodás", "caries_m", "Caries"),
    "Occlusalis_-_Caries": ("Occlusalis caries szuvasodás", "caries_o", "Caries"),
    "Distalis_-_Caries": ("Distalis caries szuvasodás", "caries_d", "Caries"),
    "Gingivo_B._-_Caries": ("Gingivalis buccalis caries", "caries_gb", "Caries"),
    "Buccalis_-_Caries": ("Buccalis caries szuvasodás", "caries_lb", "Caries"),
    "Pal_Ling_-_Caries": ("Palatinalis lingualis caries", "caries_po", "Caries"),
    "Incizalis_-_Caries": ("Incizalis caries szuvasodás", "caries_i", "Caries"),
    "Gyok._caries_3_-_Caries": ("Gyöki caries 3. fokozat", "tooth_root_caries_a", "Caries"),
    "Gyok._caries_2_-_Caries": ("Gyöki caries 2. fokozat", "tooth_root_caries_b", "Caries"),
    "Gyok._caries_1_-_Caries": ("Gyöki caries 1. fokozat", "tooth_root_caries_c", "Caries"),
    # --- Tömés Amalgám ---
    "Mesialis_-_Tomes_Amalgam": ("Mesiális amalgám tömés", "filling_amalgam_m", "Tomes_Amalgam"),
    "Occlusalis_-_Tomes_Amalgam": ("Occlusalis amalgám tömés", "filling_amalgam_o", "Tomes_Amalgam"),
    "Distalis_-_Tomes_Amalgam": ("Distalis amalgám tömés", "filling_amalgam_d", "Tomes_Amalgam"),
    "Gingivo_B._-_Tomes_Amalgam": ("Gingivalis buccalis amalgám tömés", "filling_amalgam_gb", "Tomes_Amalgam"),
    "Buccalis_-_Tomes_Amalgam": ("Buccalis amalgám tömés", "filling_amalgam_lb", "Tomes_Amalgam"),
    "Pal_Ling_-_Tomes_Amalgam": ("Palatinalis lingualis amalgám tömés", "filling_amalgam_po", "Tomes_Amalgam"),
    "Incizalis_-_Tomes_Amalgam": ("Incizalis amalgám tömés", "filling_amalgam_i", "Tomes_Amalgam"),
    # --- Tömés Esztétikus ---
    "Mesialis_-_Tomes_Esztetikus": ("Mesiális esztétikus tömés", "filling_esthetic_m", "Tomes_Esztetikus"),
    "Occlusalis_-_Tomes_Esztetikus": ("Occlusalis esztétikus tömés", "filling_esthetic_o", "Tomes_Esztetikus"),
    "Distalis_-_Tomes_Esztetikus": ("Distalis esztétikus tömés", "filling_esthetic_d", "Tomes_Esztetikus"),
    "Gingivo_B._-_Tomes_Esztetikus": ("Gingivalis buccalis esztétikus tömés", "filling_esthetic_gb", "Tomes_Esztetikus"),
    "Buccalis_-_Tomes_Esztetikus": ("Buccalis esztétikus tömés", "filling_esthetic_lb", "Tomes_Esztetikus"),
    "Pal_Ling_-_Tomes_Esztetikus": ("Palatinalis lingualis esztétikus tömés", "filling_esthetic_po", "Tomes_Esztetikus"),
    "Incizalis_-_Tomes_Esztetikus": ("Incizalis esztétikus tömés", "filling_esthetic_i", "Tomes_Esztetikus"),
    "Eszt._tomes_(alt.)_-_Tomes_Esztetikus": ("Esztétikus tömés általános", "filling_esthetic_alt", "Tomes_Esztetikus"),
    # --- Tömés Ideiglenes ---
    "Mesialis_-_Tomes_Ideiglenes": ("Mesiális ideiglenes tömés", "filling_temporary_m", "Tomes_Ideiglenes"),
    "Occlusalis_-_Tomes_Ideiglenes": ("Occlusalis ideiglenes tömés", "filling_temporary_o", "Tomes_Ideiglenes"),
    "Distalis_-_Tomes_Ideiglenes": ("Distalis ideiglenes tömés", "filling_temporary_d", "Tomes_Ideiglenes"),
    "Gingivo_B._-_Tomes_Ideiglenes": ("Gingivalis buccalis ideiglenes tömés", "filling_temporary_gb", "Tomes_Ideiglenes"),
    "Buccalis_-_Tomes_Ideiglenes": ("Buccalis ideiglenes tömés", "filling_temporary_lb", "Tomes_Ideiglenes"),
    "Pal_Ling_-_Tomes_Ideiglenes": ("Palatinalis lingualis ideiglenes tömés", "filling_temporary_po", "Tomes_Ideiglenes"),
    "Incizalis_-_Tomes_Ideiglenes": ("Incizalis ideiglenes tömés", "filling_temporary_i", "Tomes_Ideiglenes"),
    # --- Tömés Arany ---
    "Mesialis_-_Tomes_Arany": ("Mesiális arany tömés", "filling_gold_m", "Tomes_Arany"),
    "Occlusalis_-_Tomes_Arany": ("Occlusalis arany tömés", "filling_gold_o", "Tomes_Arany"),
    "Distalis_-_Tomes_Arany": ("Distalis arany tömés", "filling_gold_d", "Tomes_Arany"),
    "Gingivo_B._-_Tomes_Arany": ("Gingivalis buccalis arany tömés", "filling_gold_gb", "Tomes_Arany"),
    "Buccalis_-_Tomes_Arany": ("Buccalis arany tömés", "filling_gold_lb", "Tomes_Arany"),
    "Pal_Ling_-_Tomes_Arany": ("Palatinalis lingualis arany tömés", "filling_gold_po", "Tomes_Arany"),
    "Incizalis_-_Tomes_Arany": ("Incizalis arany tömés", "filling_gold_i", "Tomes_Arany"),
    # --- Csonkfelépítés ---
    "Mesialis_-_Csonkfelepites_Cetac-Molar": ("Mesiális csonkfelépítés Cetac-Molar", "corebuildup_cetacmolar_m", "Csonkfelepites"),
    "Occlusalis_-_Csonkfelepites_Cetac-Molar": ("Occlusalis csonkfelépítés Cetac-Molar", "corebuildup_cetacmolar_o", "Csonkfelepites"),
    "Distalis_-_Csonkfelepites_Cetac-Molar": ("Distalis csonkfelépítés Cetac-Molar", "corebuildup_cetacmolar_d", "Csonkfelepites"),
    "Mesialis_-_Csonkfelepites_Vitremer": ("Mesiális csonkfelépítés Vitremer", "corebuildup_composite_m", "Csonkfelepites"),
    "Occlusalis_-_Csonkfelepites_Vitremer": ("Occlusalis csonkfelépítés Vitremer", "corebuildup_composite_o", "Csonkfelepites"),
    "Distalis_-_Csonkfelepites_Vitremer": ("Distalis csonkfelépítés Vitremer", "corebuildup_composite_d", "Csonkfelepites"),
    "Mesialis_-_Csonkfelepites_Composite": ("Mesiális csonkfelépítés Composite", "corebuildup_vitremer_m", "Csonkfelepites"),
    "Occlusalis_-_Csonkfelepites_Composite": ("Occlusalis csonkfelépítés Composite", "corebuildup_vitremer_o", "Csonkfelepites"),
    "Distalis_-_Csonkfelepites_Composite": ("Distalis csonkfelépítés Composite", "corebuildup_vitremer_d", "Csonkfelepites"),
    # --- Protézis ---
    "Teljes_-_Protezis": ("Teljes protézis", "prosthesis_full", "Protezis"),
    "Teljes_(impl.)_-_Protezis": ("Teljes protézis implantátumon", "prosthesis_on_implant_full", "Protezis"),
    "Steg_-_Protezis": ("Steg protézis", "pier_abutment", "Protezis"),
    "bal_-_Protezis_Reszleges_kiveheto": ("Bal részleges kivehető protézis", "prosthesis_removable_pier_left", "Protezis"),
    "kozep_-_Protezis_Reszleges_kiveheto": ("Középső részleges kivehető protézis", "prosthesis_removable_pier_center", "Protezis"),
    "jobb_-_Protezis_Reszleges_kiveheto": ("Jobb részleges kivehető protézis", "prosthesis_removable_pier_right", "Protezis"),
    "kozep_-_Protezis_Reszl._kiv._(impl.)": ("Középső részleges kivehető protézis implantátumon", "prosthesis_on_implant_removable_pier_center", "Protezis"),
    "bal_-_Protezis_Reszl._kiv._(impl.)": ("Bal részleges kivehető protézis implantátumon", "prosthesis_on_implant_removable_pier_left", "Protezis"),
    "jobb_-_Protezis_Reszl._kiv._(impl.)": ("Jobb részleges kivehető protézis implantátumon", "prosthesis_on_implant_removable_pier_right", "Protezis"),
    "Cserelendo_teljes_prot._-_Protezis_Cserelendo_protezis": ("Cserélendő teljes protézis", "prothesis_full_replace_needed", "Protezis"),
    "Cserelendo_prot._-_bal_-_Protezis_Cserelendo_protezis": ("Cserélendő bal protézis", "prosthesis_removable_pier_left_replace_needed", "Protezis"),
    "Cserelendo_prot._-_kozep_-_Protezis_Cserelendo_protezis": ("Cserélendő középső protézis", "prosthesis_removable_pier_center_replace_needed", "Protezis"),
    "Cserelendo_prot._-_jobb_-_Protezis_Cserelendo_protezis": ("Cserélendő jobb protézis", "prosthesis_removable_pier_right_replace_needed", "Protezis"),
    # --- Korona ---
    "Fem-keramia_-_Korona": ("Fém-kerámia korona", "crown_metal_ceramic", "Korona"),
    "Cirkonium_-_Korona": ("Cirkonium korona", "crown_zirconium", "Korona"),
    "Preskeramia_-_Korona": ("Préskerámia korona", "crown_pressed_ceramic", "Korona"),
    "Aranykeramia_-_Korona": ("Arany-kerámia korona", "crown_gold_ceramic", "Korona"),
    "Procera_-_Korona": ("Procera korona", "crown_procera", "Korona"),
    "Ideig._Procera_-_Korona": ("Ideiglenes Procera korona", "crown_procera_temp", "Korona"),
    "Ideiglenes_-_Korona": ("Ideiglenes korona", "crown_temporary", "Korona"),
    "Teleszk._korona_-_Korona": ("Teleszkópos korona", "telescopic_crown", "Korona"),
    "Femkorona_-_Korona": ("Fémkorona", "crown_metal", "Korona"),
    "Aranykeramia_-_Korona_Ideiglenes_ragaszt.": ("Arany-kerámia korona ideiglenes ragasztással", "temporary_gluing_gold_ceramic", "Korona"),
    "Femkeramia_-_Korona_Ideiglenes_ragaszt.": ("Fém-kerámia korona ideiglenes ragasztással", "temporary_gluing_metal_ceramic", "Korona"),
    "Fem_-_Korona_Ideiglenes_ragaszt.": ("Fémkorona ideiglenes ragasztással", "temporary_gluing_metal_crown", "Korona"),
    "Preskeramia_-_Korona_Ideiglenes_ragaszt.": ("Préskerámia korona ideiglenes ragasztással", "temporary_gluing_pressed_ceramic", "Korona"),
    "Procera_-_Korona_Ideiglenes_ragaszt.": ("Procera korona ideiglenes ragasztással", "temporary_gluing_procera", "Korona"),
    "Cirkon_-_Korona_Ideiglenes_ragaszt.": ("Cirkon korona ideiglenes ragasztással", "temporary_gluing_zirconium", "Korona"),
    # --- Híd ---
    "Fem-keramia_-_Hid": ("Fém-kerámia híd", "bridge_metal_ceramic", "Hid"),
    "Cirkonium_-_Hid": ("Cirkonium híd", "bridge_zirconium", "Hid"),
    "Preskeramia_-_Hid": ("Préskerámia híd", "bridge_pressed_ceramic", "Hid"),
    "Aranykeramia_-_Hid": ("Arany-kerámia híd", "bridge_gold_ceramic", "Hid"),
    "Hidelvalasztas_-_Hid": ("Hídelválasztás", "bridge_separation", "Hid"),
    "Ideiglenes_hid_-_Hid": ("Ideiglenes híd", "bridge_temporary", "Hid"),
    # --- Élpótlás ---
    "Mesialis_-_Elpotlas": ("Mesiális élpótlás", "edge_replacement_m", "Elpotlas"),
    "Incizalis_-_Elpotlas": ("Incizalis élpótlás", "edge_replacement_o", "Elpotlas"),
    "Distalis_-_Elpotlas": ("Distalis élpótlás", "edge_replacement_d", "Elpotlas"),
    # --- Letört fog ---
    "Mesialis_-_Letort_fog": ("Mesiálisan letört fog", "broken_tooth_m", "Letort_fog"),
    "Incizalis_-_Letort_fog": ("Incizálisan letört fog", "broken_tooth_o", "Letort_fog"),
    "Distalis_-_Letort_fog": ("Distálisan letört fog", "broken_tooth_d", "Letort_fog"),
    # --- Gyökértömés Végleges ---
    "M._Buccalis_-_Gyokertomes_Vegleges": ("Mesiobuccalis végleges gyökértömés", "rootcanal_final_mb", "Gyokertomes_Vegleges"),
    "D._Buccalis_-_Gyokertomes_Vegleges": ("Distobuccalis végleges gyökértömés", "rootcanal_final_d", "Gyokertomes_Vegleges"),
    "Pal_Ling_-_Gyokertomes_Vegleges": ("Palatinalis lingualis végleges gyökértömés", "rootcanal_final_p", "Gyokertomes_Vegleges"),
    "Ossz._gyoker_-_Gyokertomes_Vegleges": ("Összes gyökér végleges gyökértömés", "rootcanal_final_extra", "Gyokertomes_Vegleges"),
    "Inkomplett_-_Gyokertomes_Vegleges": ("Inkomplett gyökértömés", "rootcanal_incomplete", "Gyokertomes_Vegleges"),
    # --- Gyökértömés Ideiglenes ---
    "M._Buccalis_-_Gyokertomes_Ideiglenes": ("Mesiobuccalis ideiglenes gyökértömés", "rootcanal_temporary_mb", "Gyokertomes_Ideiglenes"),
    "D._Buccalis_-_Gyokertomes_Ideiglenes": ("Distobuccalis ideiglenes gyökértömés", "rootcanal_temporary_d", "Gyokertomes_Ideiglenes"),
    "Pal_Ling_-_Gyokertomes_Ideiglenes": ("Palatinalis lingualis ideiglenes gyökértömés", "rootcanal_temporary_p", "Gyokertomes_Ideiglenes"),
    "Ossz._gyoker_-_Gyokertomes_Ideiglenes": ("Összes gyökér ideiglenes gyökértömés", "rootcanal_temporary_extra", "Gyokertomes_Ideiglenes"),
    # --- Retrográd ---
    "D._Buccalis_-_Retrograd_gy.tomes": ("Distobuccalis retrográd gyökértömés", "retrograde_root_filling_d", "Retrograd"),
    "M._Buccalis_-_Retrograd_gy.tomes": ("Mesiobuccalis retrográd gyökértömés", "retrograde_root_filling_m", "Retrograd"),
    "Palatinalis_-_Retrograd_gy.tomes": ("Palatinalis retrográd gyökértömés", "retrograde_root_filling_p", "Retrograd"),
    "Kulonallo_-_Retrograd_gy.tomes": ("Különálló retrográd gyökértömés", "retrograde_root_filling_single", "Retrograd"),
    # --- Betétek Inlay ---
    "Arany_-_Betetek_Inlay": ("Arany inlay betét", "inlay_gold", "Betetek_Inlay"),
    "Kompozit_-_Betetek_Inlay": ("Kompozit inlay betét", "inlay_composite", "Betetek_Inlay"),
    "Keramia_-_Betetek_Inlay": ("Kerámia inlay betét", "inlay_ceramic", "Betetek_Inlay"),
    "Fembetet_-_Betetek_Inlay": ("Fém inlay betét", "metal_insert_inlay", "Betetek_Inlay"),
    # --- Betétek Onlay ---
    "Arany_-_Betetek_Onlay": ("Arany onlay betét", "onlay_gold", "Betetek_Onlay"),
    "Kompozit_-_Betetek_Onlay": ("Kompozit onlay betét", "onlay_composite", "Betetek_Onlay"),
    "Keramia_-_Betetek_Onlay": ("Kerámia onlay betét", "onlay_ceramic", "Betetek_Onlay"),
    "Fembetet_-_Betetek_Onlay": ("Fém onlay betét", "metal_insert_onlay", "Betetek_Onlay"),
    # --- Betétek Overlay ---
    "Arany_-_Betetek_Overlay": ("Arany overlay betét", "overlay_gold", "Betetek_Overlay"),
    "Kompozit_-_Betetek_Overlay": ("Kompozit overlay betét", "overlay_composite", "Betetek_Overlay"),
    "Keramia_-_Betetek_Overlay": ("Kerámia overlay betét", "overlay_ceramic", "Betetek_Overlay"),
    "Fembetet_-_Betetek_Overlay": ("Fém overlay betét", "metal_insert_overlay", "Betetek_Overlay"),
    # --- Héjak ---
    "Hej_-_Hejak": ("Héj veneer", "peels_peel", "Hejak"),
    "Veneer_lay_-_Hejak": ("Veneer lay héj", "peels_veneer_lay", "Hejak"),
    # --- Speciális ---
    "Koronazando_fog_-_Specialis": ("Koronázandó fog", "crown_needed", "Specialis"),
    "Cserel._korona_-_Specialis": ("Cserélendő korona", "replace_needed", "Specialis"),
    "Kihuzando_fog_-_Specialis": ("Kihúzandó fog eltávolítandó", "teeth_extraction_mark", "Specialis"),
    "Zarodott_fogh._-_Specialis": ("Záródott foghiány", "missing_closed", "Specialis"),
    "Egyenes_csavar_-_Specialis": ("Egyenes csavar implantátum fejelem", "implant_head_screw", "Specialis"),
    "Gombfeju_csavar_-_Specialis": ("Gombfejű csavar implantátum fejelem", "implant_head_sphere", "Specialis"),
    "Impaktalt_fog_-_Specialis": ("Impaktált fog bennrekedt fog", "impacted_tooth", "Specialis"),
    "Muanyag_fog_-_Specialis": ("Műanyag fog", "plastic_tooth", "Specialis"),
    "Brekket_-_Specialis": ("Brekket fogszabályozó", "bracket", "Specialis"),
}


def supabase_post(path, data):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        data=body,
        headers={**HEADERS_SUPABASE, "Content-Length": str(len(body))},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def get_embeddings(texts, openai_key):
    body = json.dumps({"model": "text-embedding-3-large", "input": texts}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={
            "Authorization": f"Bearer {openai_key}",
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [item["embedding"] for item in data["data"]]


def apply_migration():
    """Apply the SQL migration via Supabase REST (using pg_query if available)."""
    sql = open("supabase/migrations/20260218181540_statusz_embeddings.sql").read()
    # Try the pg endpoint
    status, body = supabase_post("/rest/v1/rpc/exec_sql", {"sql": sql})
    if status in (200, 201, 204):
        print("Migration applied via exec_sql RPC.")
        return True
    print(f"exec_sql failed ({status}): {body[:200]}")
    return False


def upsert_marker(marker_key, label_hu, data_name, category, text_source, embedding):
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
    status, body = supabase_post("/rest/v1/rpc/upsert_statusz_embedding", {
        "p_marker_key": marker_key,
        "p_label_hu": label_hu,
        "p_data_name": data_name,
        "p_category": category,
        "p_text_source": text_source,
        "p_embedding": embedding_str,
    })
    return status in (200, 201, 204)


def main():
    if len(sys.argv) < 2:
        print("Usage: python seed_statusz_embeddings.py <OPENAI_API_KEY>")
        sys.exit(1)

    openai_key = sys.argv[1]
    markers = list(MARKERS.items())
    print(f"Seeding {len(markers)} markers...")

    BATCH = 50
    processed = 0
    errors = []

    for i in range(0, len(markers), BATCH):
        batch = markers[i:i + BATCH]
        texts = [f"{v[0]} ({v[2]})" for _, v in batch]
        print(f"  Batch {i//BATCH + 1}: generating {len(batch)} embeddings...")
        try:
            embeddings = get_embeddings(texts, openai_key)
        except Exception as e:
            print(f"  ERROR getting embeddings: {e}")
            errors.extend([k for k, _ in batch])
            continue

        for j, (marker_key, (label_hu, data_name, category)) in enumerate(batch):
            ok = upsert_marker(marker_key, label_hu, data_name, category, texts[j], embeddings[j])
            if ok:
                processed += 1
            else:
                errors.append(marker_key)
        time.sleep(0.3)  # rate limit buffer

    print(f"\nDone: {processed}/{len(markers)} seeded. Errors: {len(errors)}")
    if errors:
        print("Failed markers:", errors)


if __name__ == "__main__":
    main()
