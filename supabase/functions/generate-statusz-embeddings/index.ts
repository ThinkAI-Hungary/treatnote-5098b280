import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Full mapping: marker_key -> { label_hu, data_name, category }
// label_hu is used for embedding (what the AI would say in Hungarian)
const STATUSZ_MARKERS: Record<string, { label_hu: string; data_name: string; category: string }> = {
    // --- Általános ---
    "Foghiany": { label_hu: "Foghiány (hiányzó fog)", data_name: "missing", category: "Altalanos" },
    "Tejfog": { label_hu: "Tejfog", data_name: "milk_tooth", category: "Altalanos" },
    "Barazdazaras": { label_hu: "Barázdazárás", data_name: "fissure", category: "Altalanos" },
    "Parapulpalis_csap": { label_hu: "Parapulpális csap", data_name: "parapulpal_pin", category: "Altalanos" },
    "Radix": { label_hu: "Radix (gyökérmaradvány)", data_name: "radix", category: "Altalanos" },
    "Lecsiszolt_fog": { label_hu: "Lecsiszolt fog", data_name: "resected_tooth", category: "Altalanos" },
    "Rezekalt_fog": { label_hu: "Rezekált fog", data_name: "resected_tooth_ok", category: "Altalanos" },
    "Csontpotlas": { label_hu: "Csontpótlás", data_name: "bone_graft", category: "Altalanos" },

    // --- Implant ---
    "Nobel": { label_hu: "Nobel implantátum", data_name: "implant_nobel", category: "Implant" },
    "AlphaBio": { label_hu: "AlphaBio implantátum", data_name: "implant_alphabio", category: "Implant" },
    "IDEGEN": { label_hu: "Ismeretlen idegen implantátum", data_name: "implant_foreign", category: "Implant" },
    "Ankylos": { label_hu: "Ankylos implantátum", data_name: "implant_ankylos", category: "Implant" },
    "SGS": { label_hu: "SGS implantátum", data_name: "implant_sgs", category: "Implant" },
    "Straumann": { label_hu: "Straumann implantátum", data_name: "implant_straumann", category: "Implant" },
    "Astra": { label_hu: "Astra implantátum", data_name: "implant_astra", category: "Implant" },
    "Anyridge": { label_hu: "Anyridge implantátum", data_name: "implant_anyridge", category: "Implant" },
    "Nobel_Active": { label_hu: "Nobel Active implantátum", data_name: "implant_nobel_active", category: "Implant" },
    "Nobel_On1": { label_hu: "Nobel On1 implantátum", data_name: "implant_nobel_on1", category: "Implant" },
    "Nobel_Replace": { label_hu: "Nobel Replace implantátum", data_name: "implant_nobel_replace", category: "Implant" },
    "Camlog": { label_hu: "Camlog implantátum", data_name: "implant_camlog", category: "Implant" },
    "Conelog": { label_hu: "Conelog implantátum", data_name: "implant_conelog", category: "Implant" },
    "Camlog_Isy": { label_hu: "Camlog Isy implantátum", data_name: "implant_camlog_Isy", category: "Implant" },
    "Denti": { label_hu: "Denti implantátum", data_name: "implant_denti", category: "Implant" },

    // --- Felépítmények ---
    "Altalanos_felepitmeny_-_Implant_Felepitmenyek": { label_hu: "Általános felépítmény", data_name: "implant_head", category: "Felepitmeny" },
    "Bredent_Multi_unit_(egyenes)_-_Implant_Felepitmenyek": { label_hu: "Bredent Multi unit egyenes felépítmény", data_name: "implant_bredent_straight", category: "Felepitmeny" },
    "Bredent_Multi_unit_(szogtort_-_bal)_-_Implant_Felepitmenyek": { label_hu: "Bredent Multi unit szögtört bal felépítmény", data_name: "implant_bredent_bent_left", category: "Felepitmeny" },
    "Bredent_Multi_unit_(szogtort_-_jobb)_-_Implant_Felepitmenyek": { label_hu: "Bredent Multi unit szögtört jobb felépítmény", data_name: "implant_bredent_bent_right", category: "Felepitmeny" },

    // --- Periapicalis ---
    "Granuloma_-_Periapicalis_elv.": { label_hu: "Granuloma periapicalis elváltozás", data_name: "granuloma", category: "Periapicalis" },
    "Cysta_-_Periapicalis_elv.": { label_hu: "Cysta periapicalis elváltozás", data_name: "cysta", category: "Periapicalis" },
    "Elhalt_gyoker_-_Periapicalis_elv.": { label_hu: "Elhalt gyökér", data_name: "deadroot", category: "Periapicalis" },

    // --- Gyökércsap ---
    "keramia_-_Gyokercsap": { label_hu: "Kerámia gyökércsap", data_name: "taproot_ceramic", category: "Gyokercsap" },
    "fem_-_Gyokercsap": { label_hu: "Fém gyökércsap", data_name: "taproot_metal", category: "Gyokercsap" },
    "uvegszalas_-_Gyokercsap": { label_hu: "Üvegszálas gyökércsap", data_name: "taproot_fiber", category: "Gyokercsap" },
    "Kompozit_-_Gyokercsap": { label_hu: "Kompozit gyökércsap", data_name: "taproot_composite", category: "Gyokercsap" },

    // --- Caries ---
    "Mesialis_-_Caries": { label_hu: "Mesiális caries szuvasodás", data_name: "caries_m", category: "Caries" },
    "Occlusalis_-_Caries": { label_hu: "Occlusalis caries szuvasodás", data_name: "caries_o", category: "Caries" },
    "Distalis_-_Caries": { label_hu: "Distalis caries szuvasodás", data_name: "caries_d", category: "Caries" },
    "Gingivo_B._-_Caries": { label_hu: "Gingivalis buccalis caries", data_name: "caries_gb", category: "Caries" },
    "Buccalis_-_Caries": { label_hu: "Buccalis caries szuvasodás", data_name: "caries_lb", category: "Caries" },
    "Pal_Ling_-_Caries": { label_hu: "Palatinalis lingualis caries", data_name: "caries_po", category: "Caries" },
    "Incizalis_-_Caries": { label_hu: "Incizalis caries szuvasodás", data_name: "caries_i", category: "Caries" },
    "Gyok._caries_3_-_Caries": { label_hu: "Gyöki caries 3. fokozat", data_name: "tooth_root_caries_a", category: "Caries" },
    "Gyok._caries_2_-_Caries": { label_hu: "Gyöki caries 2. fokozat", data_name: "tooth_root_caries_b", category: "Caries" },
    "Gyok._caries_1_-_Caries": { label_hu: "Gyöki caries 1. fokozat", data_name: "tooth_root_caries_c", category: "Caries" },

    // --- Tömés (Amalgám) ---
    "Mesialis_-_Tomes_Amalgam": { label_hu: "Mesiális amalgám tömés", data_name: "filling_amalgam_m", category: "Tomes_Amalgam" },
    "Occlusalis_-_Tomes_Amalgam": { label_hu: "Occlusalis amalgám tömés", data_name: "filling_amalgam_o", category: "Tomes_Amalgam" },
    "Distalis_-_Tomes_Amalgam": { label_hu: "Distalis amalgám tömés", data_name: "filling_amalgam_d", category: "Tomes_Amalgam" },
    "Gingivo_B._-_Tomes_Amalgam": { label_hu: "Gingivalis buccalis amalgám tömés", data_name: "filling_amalgam_gb", category: "Tomes_Amalgam" },
    "Buccalis_-_Tomes_Amalgam": { label_hu: "Buccalis amalgám tömés", data_name: "filling_amalgam_lb", category: "Tomes_Amalgam" },
    "Pal_Ling_-_Tomes_Amalgam": { label_hu: "Palatinalis lingualis amalgám tömés", data_name: "filling_amalgam_po", category: "Tomes_Amalgam" },
    "Incizalis_-_Tomes_Amalgam": { label_hu: "Incizalis amalgám tömés", data_name: "filling_amalgam_i", category: "Tomes_Amalgam" },

    // --- Tömés (Esztétikus) ---
    "Mesialis_-_Tomes_Esztetikus": { label_hu: "Mesiális esztétikus tömés", data_name: "filling_esthetic_m", category: "Tomes_Esztetikus" },
    "Occlusalis_-_Tomes_Esztetikus": { label_hu: "Occlusalis esztétikus tömés", data_name: "filling_esthetic_o", category: "Tomes_Esztetikus" },
    "Distalis_-_Tomes_Esztetikus": { label_hu: "Distalis esztétikus tömés", data_name: "filling_esthetic_d", category: "Tomes_Esztetikus" },
    "Gingivo_B._-_Tomes_Esztetikus": { label_hu: "Gingivalis buccalis esztétikus tömés", data_name: "filling_esthetic_gb", category: "Tomes_Esztetikus" },
    "Buccalis_-_Tomes_Esztetikus": { label_hu: "Buccalis esztétikus tömés", data_name: "filling_esthetic_lb", category: "Tomes_Esztetikus" },
    "Pal_Ling_-_Tomes_Esztetikus": { label_hu: "Palatinalis lingualis esztétikus tömés", data_name: "filling_esthetic_po", category: "Tomes_Esztetikus" },
    "Incizalis_-_Tomes_Esztetikus": { label_hu: "Incizalis esztétikus tömés", data_name: "filling_esthetic_i", category: "Tomes_Esztetikus" },
    "Eszt._tomes_(alt.)_-_Tomes_Esztetikus": { label_hu: "Esztétikus tömés általános", data_name: "filling_esthetic_alt", category: "Tomes_Esztetikus" },

    // --- Tömés (Ideiglenes) ---
    "Mesialis_-_Tomes_Ideiglenes": { label_hu: "Mesiális ideiglenes tömés", data_name: "filling_temporary_m", category: "Tomes_Ideiglenes" },
    "Occlusalis_-_Tomes_Ideiglenes": { label_hu: "Occlusalis ideiglenes tömés", data_name: "filling_temporary_o", category: "Tomes_Ideiglenes" },
    "Distalis_-_Tomes_Ideiglenes": { label_hu: "Distalis ideiglenes tömés", data_name: "filling_temporary_d", category: "Tomes_Ideiglenes" },
    "Gingivo_B._-_Tomes_Ideiglenes": { label_hu: "Gingivalis buccalis ideiglenes tömés", data_name: "filling_temporary_gb", category: "Tomes_Ideiglenes" },
    "Buccalis_-_Tomes_Ideiglenes": { label_hu: "Buccalis ideiglenes tömés", data_name: "filling_temporary_lb", category: "Tomes_Ideiglenes" },
    "Pal_Ling_-_Tomes_Ideiglenes": { label_hu: "Palatinalis lingualis ideiglenes tömés", data_name: "filling_temporary_po", category: "Tomes_Ideiglenes" },
    "Incizalis_-_Tomes_Ideiglenes": { label_hu: "Incizalis ideiglenes tömés", data_name: "filling_temporary_i", category: "Tomes_Ideiglenes" },

    // --- Tömés (Arany) ---
    "Mesialis_-_Tomes_Arany": { label_hu: "Mesiális arany tömés", data_name: "filling_gold_m", category: "Tomes_Arany" },
    "Occlusalis_-_Tomes_Arany": { label_hu: "Occlusalis arany tömés", data_name: "filling_gold_o", category: "Tomes_Arany" },
    "Distalis_-_Tomes_Arany": { label_hu: "Distalis arany tömés", data_name: "filling_gold_d", category: "Tomes_Arany" },
    "Gingivo_B._-_Tomes_Arany": { label_hu: "Gingivalis buccalis arany tömés", data_name: "filling_gold_gb", category: "Tomes_Arany" },
    "Buccalis_-_Tomes_Arany": { label_hu: "Buccalis arany tömés", data_name: "filling_gold_lb", category: "Tomes_Arany" },
    "Pal_Ling_-_Tomes_Arany": { label_hu: "Palatinalis lingualis arany tömés", data_name: "filling_gold_po", category: "Tomes_Arany" },
    "Incizalis_-_Tomes_Arany": { label_hu: "Incizalis arany tömés", data_name: "filling_gold_i", category: "Tomes_Arany" },

    // --- Csonkfelépítés ---
    "Mesialis_-_Csonkfelepites_Cetac-Molar": { label_hu: "Mesiális csonkfelépítés Cetac-Molar", data_name: "corebuildup_cetacmolar_m", category: "Csonkfelepites" },
    "Occlusalis_-_Csonkfelepites_Cetac-Molar": { label_hu: "Occlusalis csonkfelépítés Cetac-Molar", data_name: "corebuildup_cetacmolar_o", category: "Csonkfelepites" },
    "Distalis_-_Csonkfelepites_Cetac-Molar": { label_hu: "Distalis csonkfelépítés Cetac-Molar", data_name: "corebuildup_cetacmolar_d", category: "Csonkfelepites" },
    "Mesialis_-_Csonkfelepites_Vitremer": { label_hu: "Mesiális csonkfelépítés Vitremer", data_name: "corebuildup_composite_m", category: "Csonkfelepites" },
    "Occlusalis_-_Csonkfelepites_Vitremer": { label_hu: "Occlusalis csonkfelépítés Vitremer", data_name: "corebuildup_composite_o", category: "Csonkfelepites" },
    "Distalis_-_Csonkfelepites_Vitremer": { label_hu: "Distalis csonkfelépítés Vitremer", data_name: "corebuildup_composite_d", category: "Csonkfelepites" },
    "Mesialis_-_Csonkfelepites_Composite": { label_hu: "Mesiális csonkfelépítés Composite", data_name: "corebuildup_vitremer_m", category: "Csonkfelepites" },
    "Occlusalis_-_Csonkfelepites_Composite": { label_hu: "Occlusalis csonkfelépítés Composite", data_name: "corebuildup_vitremer_o", category: "Csonkfelepites" },
    "Distalis_-_Csonkfelepites_Composite": { label_hu: "Distalis csonkfelépítés Composite", data_name: "corebuildup_vitremer_d", category: "Csonkfelepites" },

    // --- Protézis ---
    "Teljes_-_Protezis": { label_hu: "Teljes protézis", data_name: "prosthesis_full", category: "Protezis" },
    "Teljes_(impl.)_-_Protezis": { label_hu: "Teljes protézis implantátumon", data_name: "prosthesis_on_implant_full", category: "Protezis" },
    "Steg_-_Protezis": { label_hu: "Steg protézis", data_name: "pier_abutment", category: "Protezis" },
    "bal_-_Protezis_Reszleges_kiveheto": { label_hu: "Bal részleges kivehető protézis", data_name: "prosthesis_removable_pier_left", category: "Protezis" },
    "kozep_-_Protezis_Reszleges_kiveheto": { label_hu: "Középső részleges kivehető protézis", data_name: "prosthesis_removable_pier_center", category: "Protezis" },
    "jobb_-_Protezis_Reszleges_kiveheto": { label_hu: "Jobb részleges kivehető protézis", data_name: "prosthesis_removable_pier_right", category: "Protezis" },
    "kozep_-_Protezis_Reszl._kiv._(impl.)": { label_hu: "Középső részleges kivehető protézis implantátumon", data_name: "prosthesis_on_implant_removable_pier_center", category: "Protezis" },
    "bal_-_Protezis_Reszl._kiv._(impl.)": { label_hu: "Bal részleges kivehető protézis implantátumon", data_name: "prosthesis_on_implant_removable_pier_left", category: "Protezis" },
    "jobb_-_Protezis_Reszl._kiv._(impl.)": { label_hu: "Jobb részleges kivehető protézis implantátumon", data_name: "prosthesis_on_implant_removable_pier_right", category: "Protezis" },
    "Cserelendo_teljes_prot._-_Protezis_Cserelendo_protezis": { label_hu: "Cserélendő teljes protézis", data_name: "prothesis_full_replace_needed", category: "Protezis" },
    "Cserelendo_prot._-_bal_-_Protezis_Cserelendo_protezis": { label_hu: "Cserélendő bal protézis", data_name: "prosthesis_removable_pier_left_replace_needed", category: "Protezis" },
    "Cserelendo_prot._-_kozep_-_Protezis_Cserelendo_protezis": { label_hu: "Cserélendő középső protézis", data_name: "prosthesis_removable_pier_center_replace_needed", category: "Protezis" },
    "Cserelendo_prot._-_jobb_-_Protezis_Cserelendo_protezis": { label_hu: "Cserélendő jobb protézis", data_name: "prosthesis_removable_pier_right_replace_needed", category: "Protezis" },

    // --- Korona ---
    "Fem-keramia_-_Korona": { label_hu: "Fém-kerámia korona", data_name: "crown_metal_ceramic", category: "Korona" },
    "Cirkonium_-_Korona": { label_hu: "Cirkonium korona", data_name: "crown_zirconium", category: "Korona" },
    "Preskeramia_-_Korona": { label_hu: "Préskerámia korona", data_name: "crown_pressed_ceramic", category: "Korona" },
    "Aranykeramia_-_Korona": { label_hu: "Arany-kerámia korona", data_name: "crown_gold_ceramic", category: "Korona" },
    "Procera_-_Korona": { label_hu: "Procera korona", data_name: "crown_procera", category: "Korona" },
    "Ideig._Procera_-_Korona": { label_hu: "Ideiglenes Procera korona", data_name: "crown_procera_temp", category: "Korona" },
    "Ideiglenes_-_Korona": { label_hu: "Ideiglenes korona", data_name: "crown_temporary", category: "Korona" },
    "Teleszk._korona_-_Korona": { label_hu: "Teleszkópos korona", data_name: "telescopic_crown", category: "Korona" },
    "Femkorona_-_Korona": { label_hu: "Fémkorona", data_name: "crown_metal", category: "Korona" },
    "Aranykeramia_-_Korona_Ideiglenes_ragaszt.": { label_hu: "Arany-kerámia korona ideiglenes ragasztással", data_name: "temporary_gluing_gold_ceramic", category: "Korona" },
    "Femkeramia_-_Korona_Ideiglenes_ragaszt.": { label_hu: "Fém-kerámia korona ideiglenes ragasztással", data_name: "temporary_gluing_metal_ceramic", category: "Korona" },
    "Fem_-_Korona_Ideiglenes_ragaszt.": { label_hu: "Fémkorona ideiglenes ragasztással", data_name: "temporary_gluing_metal_crown", category: "Korona" },
    "Preskeramia_-_Korona_Ideiglenes_ragaszt.": { label_hu: "Préskerámia korona ideiglenes ragasztással", data_name: "temporary_gluing_pressed_ceramic", category: "Korona" },
    "Procera_-_Korona_Ideiglenes_ragaszt.": { label_hu: "Procera korona ideiglenes ragasztással", data_name: "temporary_gluing_procera", category: "Korona" },
    "Cirkon_-_Korona_Ideiglenes_ragaszt.": { label_hu: "Cirkon korona ideiglenes ragasztással", data_name: "temporary_gluing_zirconium", category: "Korona" },

    // --- Híd ---
    "Fem-keramia_-_Hid": { label_hu: "Fém-kerámia híd", data_name: "bridge_metal_ceramic", category: "Hid" },
    "Cirkonium_-_Hid": { label_hu: "Cirkonium híd", data_name: "bridge_zirconium", category: "Hid" },
    "Preskeramia_-_Hid": { label_hu: "Préskerámia híd", data_name: "bridge_pressed_ceramic", category: "Hid" },
    "Aranykeramia_-_Hid": { label_hu: "Arany-kerámia híd", data_name: "bridge_gold_ceramic", category: "Hid" },
    "Hidelvalasztas_-_Hid": { label_hu: "Hídelválasztás", data_name: "bridge_separation", category: "Hid" },
    "Ideiglenes_hid_-_Hid": { label_hu: "Ideiglenes híd", data_name: "bridge_temporary", category: "Hid" },

    // --- Élpótlás ---
    "Mesialis_-_Elpotlas": { label_hu: "Mesiális élpótlás", data_name: "edge_replacement_m", category: "Elpotlas" },
    "Incizalis_-_Elpotlas": { label_hu: "Incizalis élpótlás", data_name: "edge_replacement_o", category: "Elpotlas" },
    "Distalis_-_Elpotlas": { label_hu: "Distalis élpótlás", data_name: "edge_replacement_d", category: "Elpotlas" },

    // --- Letört fog ---
    "Mesialis_-_Letort_fog": { label_hu: "Mesiálisan letört fog", data_name: "broken_tooth_m", category: "Letort_fog" },
    "Incizalis_-_Letort_fog": { label_hu: "Incizálisan letört fog", data_name: "broken_tooth_o", category: "Letort_fog" },
    "Distalis_-_Letort_fog": { label_hu: "Distálisan letört fog", data_name: "broken_tooth_d", category: "Letort_fog" },

    // --- Gyökértömés (Végleges) ---
    "M._Buccalis_-_Gyokertomes_Vegleges": { label_hu: "Mesiobuccalis végleges gyökértömés", data_name: "rootcanal_final_mb", category: "Gyokertomes_Vegleges" },
    "D._Buccalis_-_Gyokertomes_Vegleges": { label_hu: "Distobuccalis végleges gyökértömés", data_name: "rootcanal_final_d", category: "Gyokertomes_Vegleges" },
    "Pal_Ling_-_Gyokertomes_Vegleges": { label_hu: "Palatinalis lingualis végleges gyökértömés", data_name: "rootcanal_final_p", category: "Gyokertomes_Vegleges" },
    "Ossz._gyoker_-_Gyokertomes_Vegleges": { label_hu: "Összes gyökér végleges gyökértömés", data_name: "rootcanal_final_extra", category: "Gyokertomes_Vegleges" },
    "Inkomplett_-_Gyokertomes_Vegleges": { label_hu: "Inkomplett gyökértömés", data_name: "rootcanal_incomplete", category: "Gyokertomes_Vegleges" },

    // --- Gyökértömés (Ideiglenes) ---
    "M._Buccalis_-_Gyokertomes_Ideiglenes": { label_hu: "Mesiobuccalis ideiglenes gyökértömés", data_name: "rootcanal_temporary_mb", category: "Gyokertomes_Ideiglenes" },
    "D._Buccalis_-_Gyokertomes_Ideiglenes": { label_hu: "Distobuccalis ideiglenes gyökértömés", data_name: "rootcanal_temporary_d", category: "Gyokertomes_Ideiglenes" },
    "Pal_Ling_-_Gyokertomes_Ideiglenes": { label_hu: "Palatinalis lingualis ideiglenes gyökértömés", data_name: "rootcanal_temporary_p", category: "Gyokertomes_Ideiglenes" },
    "Ossz._gyoker_-_Gyokertomes_Ideiglenes": { label_hu: "Összes gyökér ideiglenes gyökértömés", data_name: "rootcanal_temporary_extra", category: "Gyokertomes_Ideiglenes" },

    // --- Retrográd gyökértömés ---
    "D._Buccalis_-_Retrograd_gy.tomes": { label_hu: "Distobuccalis retrográd gyökértömés", data_name: "retrograde_root_filling_d", category: "Retrograd" },
    "M._Buccalis_-_Retrograd_gy.tomes": { label_hu: "Mesiobuccalis retrográd gyökértömés", data_name: "retrograde_root_filling_m", category: "Retrograd" },
    "Palatinalis_-_Retrograd_gy.tomes": { label_hu: "Palatinalis retrográd gyökértömés", data_name: "retrograde_root_filling_p", category: "Retrograd" },
    "Kulonallo_-_Retrograd_gy.tomes": { label_hu: "Különálló retrográd gyökértömés", data_name: "retrograde_root_filling_single", category: "Retrograd" },

    // --- Betétek (Inlay) ---
    "Arany_-_Betetek_Inlay": { label_hu: "Arany inlay betét", data_name: "inlay_gold", category: "Betetek_Inlay" },
    "Kompozit_-_Betetek_Inlay": { label_hu: "Kompozit inlay betét", data_name: "inlay_composite", category: "Betetek_Inlay" },
    "Keramia_-_Betetek_Inlay": { label_hu: "Kerámia inlay betét", data_name: "inlay_ceramic", category: "Betetek_Inlay" },
    "Fembetet_-_Betetek_Inlay": { label_hu: "Fém inlay betét", data_name: "metal_insert_inlay", category: "Betetek_Inlay" },

    // --- Betétek (Onlay) ---
    "Arany_-_Betetek_Onlay": { label_hu: "Arany onlay betét", data_name: "onlay_gold", category: "Betetek_Onlay" },
    "Kompozit_-_Betetek_Onlay": { label_hu: "Kompozit onlay betét", data_name: "onlay_composite", category: "Betetek_Onlay" },
    "Keramia_-_Betetek_Onlay": { label_hu: "Kerámia onlay betét", data_name: "onlay_ceramic", category: "Betetek_Onlay" },
    "Fembetet_-_Betetek_Onlay": { label_hu: "Fém onlay betét", data_name: "metal_insert_onlay", category: "Betetek_Onlay" },

    // --- Betétek (Overlay) ---
    "Arany_-_Betetek_Overlay": { label_hu: "Arany overlay betét", data_name: "overlay_gold", category: "Betetek_Overlay" },
    "Kompozit_-_Betetek_Overlay": { label_hu: "Kompozit overlay betét", data_name: "overlay_composite", category: "Betetek_Overlay" },
    "Keramia_-_Betetek_Overlay": { label_hu: "Kerámia overlay betét", data_name: "overlay_ceramic", category: "Betetek_Overlay" },
    "Fembetet_-_Betetek_Overlay": { label_hu: "Fém overlay betét", data_name: "metal_insert_overlay", category: "Betetek_Overlay" },

    // --- Héjak ---
    "Hej_-_Hejak": { label_hu: "Héj veneer", data_name: "peels_peel", category: "Hejak" },
    "Veneer_lay_-_Hejak": { label_hu: "Veneer lay héj", data_name: "peels_veneer_lay", category: "Hejak" },

    // --- Speciális ---
    "Koronazando_fog_-_Specialis": { label_hu: "Koronázandó fog", data_name: "crown_needed", category: "Specialis" },
    "Cserel._korona_-_Specialis": { label_hu: "Cserélendő korona", data_name: "replace_needed", category: "Specialis" },
    "Kihuzando_fog_-_Specialis": { label_hu: "Kihúzandó fog eltávolítandó", data_name: "teeth_extraction_mark", category: "Specialis" },
    "Zarodott_fogh._-_Specialis": { label_hu: "Záródott foghiány", data_name: "missing_closed", category: "Specialis" },
    "Egyenes_csavar_-_Specialis": { label_hu: "Egyenes csavar implantátum fejelem", data_name: "implant_head_screw", category: "Specialis" },
    "Gombfeju_csavar_-_Specialis": { label_hu: "Gombfejű csavar implantátum fejelem", data_name: "implant_head_sphere", category: "Specialis" },
    "Impaktalt_fog_-_Specialis": { label_hu: "Impaktált fog bennrekedt fog", data_name: "impacted_tooth", category: "Specialis" },
    "Muanyag_fog_-_Specialis": { label_hu: "Műanyag fog", data_name: "plastic_tooth", category: "Specialis" },
    "Brekket_-_Specialis": { label_hu: "Brekket fogszabályozó", data_name: "bracket", category: "Specialis" },
};

async function generateEmbeddings(texts: string[], openaiApiKey: string): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-large", input: texts, dimensions: 1536 }),
    });
    if (!response.ok) throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
    const data = await response.json();
    return data.data.map((item: { embedding: number[] }) => item.embedding);
}

async function seedStatuszEmbeddings(supabaseUrl: string, supabaseServiceKey: string, openaiApiKey: string) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const markers = Object.entries(STATUSZ_MARKERS);
    console.log(`Seeding ${markers.length} statusz markers...`);

    const BATCH_SIZE = 50;
    let processed = 0;
    const errors: string[] = [];

    for (let i = 0; i < markers.length; i += BATCH_SIZE) {
        const batch = markers.slice(i, i + BATCH_SIZE);
        // Build text_source: "label_hu (category)" for richer semantic matching
        const texts = batch.map(([, v]) => `${v.label_hu} (${v.category})`);

        try {
            console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: embedding ${batch.length} items...`);
            const embeddings = await generateEmbeddings(texts, openaiApiKey);

            for (let j = 0; j < batch.length; j++) {
                const [marker_key, meta] = batch[j];
                const embeddingStr = `[${embeddings[j].join(",")}]`;

                const { error } = await supabase.rpc("upsert_statusz_embedding", {
                    p_marker_key: marker_key,
                    p_label_hu: meta.label_hu,
                    p_data_name: meta.data_name,
                    p_category: meta.category,
                    p_text_source: texts[j],
                    p_embedding: embeddingStr,
                });

                if (error) {
                    errors.push(`Failed "${marker_key}": ${error.message}`);
                } else {
                    processed++;
                }
            }
        } catch (e) {
            errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${e instanceof Error ? e.message : e}`);
        }
    }

    console.log(`Done: ${processed} seeded, ${errors.length} errors`);
    return { processed, errors };
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

        if (!openaiApiKey) {
            return new Response(JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
            });
        }

        // @ts-ignore
        EdgeRuntime.waitUntil(
            seedStatuszEmbeddings(supabaseUrl, supabaseServiceKey, openaiApiKey)
                .then(r => console.log("Seeding complete:", r))
                .catch(e => console.error("Seeding failed:", e))
        );

        return new Response(JSON.stringify({ success: true, message: `Seeding ${Object.keys(STATUSZ_MARKERS).length} markers in background...` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return new Response(JSON.stringify({ success: false, error: message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
        });
    }
});
