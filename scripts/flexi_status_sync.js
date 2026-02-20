const { chromium } = require('playwright');

/**
 * Flexi-dent Status Sync Script (Node.js + Playwright)
 * 
 * Usage:
 * node flexi_status_sync.js '<DOMAIN>' '<PATIENT_ID>' '<JSON_DATA>' '<EMAIL>' '<PASSWORD>'
 */

const [, , DOMAIN, PATIENT_ID, JSON_RAW, EMAIL, PASSWORD] = process.argv;

if (!DOMAIN || !PATIENT_ID || !JSON_RAW || !EMAIL || !PASSWORD) {
    console.error('Missing required arguments.');
    console.log('Usage: node flexi_status_sync.js <DOMAIN> <PATIENT_ID> <JSON_DATA> <EMAIL> <PASSWORD>');
    process.exit(1);
}

const STATUS_DATA = JSON.parse(JSON_RAW);

const JSON_TO_DATANAME = {
    "Foghiany": "missing",
    "Tejfog": "milk_tooth",
    "Barazdazaras": "fissure",
    "Parapulpalis_csap": "parapulpal_pin",
    "Radix": "radix",
    "Lecsiszolt_fog": "resected_tooth",
    "Rezekalt_fog": "resected_tooth_ok",
    "Csontpotlas": "bone_graft",
    "Nobel": "implant_nobel",
    "AlphaBio": "implant_alphabio",
    "IDEGEN": "implant_foreign",
    "Ankylos": "implant_ankylos",
    "SGS": "implant_sgs",
    "Straumann": "implant_straumann",
    "Astra": "implant_astra",
    "Anyridge": "implant_anyridge",
    "Nobel_Active": "implant_nobel_active",
    "Nobel_On1": "implant_nobel_on1",
    "Nobel_Replace": "implant_nobel_replace",
    "Camlog": "implant_camlog",
    "Conelog": "implant_conelog",
    "Camlog_Isy": "implant_camlog_Isy",
    "Denti": "implant_denti",
    "Altalanos_felepitmeny_-_Implant_Felepitmenyek": "implant_head",
    "Bredent_Multi_unit_(egyenes)_-_Implant_Felepitmenyek": "implant_bredent_straight",
    "Bredent_Multi_unit_(szogtort_-_bal)_-_Implant_Felepitmenyek": "implant_bredent_bent_left",
    "Bredent_Multi_unit_(szogtort_-_jobb)_-_Implant_Felepitmenyek": "implant_bredent_bent_right",
    "Granuloma_-_Periapicalis_elv.": "granuloma",
    "Cysta_-_Periapicalis_elv.": "cysta",
    "Elhalt_gyoker_-_Periapicalis_elv.": "deadroot",
    "keramia_-_Gyokercsap": "taproot_ceramic",
    "fem_-_Gyokercsap": "taproot_metal",
    "uvegszalas_-_Gyokercsap": "taproot_fiber",
    "Kompozit_-_Gyokercsap": "taproot_composite",
    "Mesialis_-_Caries": "caries_m",
    "Occlusalis_-_Caries": "caries_o",
    "Distalis_-_Caries": "caries_d",
    "Gingivo_B._-_Caries": "caries_gb",
    "Buccalis_-_Caries": "caries_lb",
    "Pal_Ling_-_Caries": "caries_po",
    "Incizalis_-_Caries": "caries_i",
    "Gyok._caries_3_-_Caries": "tooth_root_caries_a",
    "Gyok._caries_2_-_Caries": "tooth_root_caries_b",
    "Gyok._caries_1_-_Caries": "tooth_root_caries_c",
    "Mesialis_-_Tomes_Amalgam": "filling_amalgam_m",
    "Occlusalis_-_Tomes_Amalgam": "filling_amalgam_o",
    "Distalis_-_Tomes_Amalgam": "filling_amalgam_d",
    "Gingivo_B._-_Tomes_Amalgam": "filling_amalgam_gb",
    "Buccalis_-_Tomes_Amalgam": "filling_amalgam_lb",
    "Pal_Ling_-_Tomes_Amalgam": "filling_amalgam_po",
    "Incizalis_-_Tomes_Amalgam": "filling_amalgam_i",
    "Mesialis_-_Tomes_Esztetikus": "filling_esthetic_m",
    "Occlusalis_-_Tomes_Esztetikus": "filling_esthetic_o",
    "Distalis_-_Tomes_Esztetikus": "filling_esthetic_d",
    "Gingivo_B._-_Tomes_Esztetikus": "filling_esthetic_gb",
    "Buccalis_-_Tomes_Esztetikus": "filling_esthetic_lb",
    "Pal_Ling_-_Tomes_Esztetikus": "filling_esthetic_po",
    "Incizalis_-_Tomes_Esztetikus": "filling_esthetic_i",
    "Eszt._tomes_(alt.)_-_Tomes_Esztetikus": "filling_esthetic_alt",
    "Mesialis_-_Tomes_Ideiglenes": "filling_temporary_m",
    "Occlusalis_-_Tomes_Ideiglenes": "filling_temporary_o",
    "Distalis_-_Tomes_Ideiglenes": "filling_temporary_d",
    "Gingivo_B._-_Tomes_Ideiglenes": "filling_temporary_gb",
    "Buccalis_-_Tomes_Ideiglenes": "filling_temporary_lb",
    "Pal_Ling_-_Tomes_Ideiglenes": "filling_temporary_po",
    "Incizalis_-_Tomes_Ideiglenes": "filling_temporary_i",
    "Mesialis_-_Tomes_Arany": "filling_gold_m",
    "Occlusalis_-_Tomes_Arany": "filling_gold_o",
    "Distalis_-_Tomes_Arany": "filling_gold_d",
    "Gingivo_B._-_Tomes_Arany": "filling_gold_gb",
    "Buccalis_-_Tomes_Arany": "filling_gold_lb",
    "Pal_Ling_-_Tomes_Arany": "filling_gold_po",
    "Incizalis_-_Tomes_Arany": "filling_gold_i",
    "Mesialis_-_Csonkfelepites_Cetac-Molar": "corebuildup_cetacmolar_m",
    "Occlusalis_-_Csonkfelepites_Cetac-Molar": "corebuildup_cetacmolar_o",
    "Distalis_-_Csonkfelepites_Cetac-Molar": "corebuildup_cetacmolar_d",
    "Mesialis_-_Csonkfelepites_Vitremer": "corebuildup_composite_m",
    "Occlusalis_-_Csonkfelepites_Vitremer": "corebuildup_composite_o",
    "Distalis_-_Csonkfelepites_Vitremer": "corebuildup_composite_d",
    "Mesialis_-_Csonkfelepites_Composite": "corebuildup_vitremer_m",
    "Occlusalis_-_Csonkfelepites_Composite": "corebuildup_vitremer_o",
    "Distalis_-_Csonkfelepites_Composite": "corebuildup_vitremer_d",
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
    "Fem-keramia_-_Korona": "crown_metal_ceramic",
    "Cirkonium_-_Korona": "crown_zirconium",
    "Preskeramia_-_Korona": "crown_pressed_ceramic",
    "Aranykeramia_-_Korona": "crown_gold_ceramic",
    "Procera_-_Korona": "crown_procera",
    "Ideig._Procera_-_Korona": "crown_procera_temp",
    "Ideiglenes_-_Korona": "crown_temporary",
    "Teleszk._korona_-_Korona": "telescopic_crown",
    "Femkorona_-_Korona": "crown_metal",
    "Aranykeramia_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_gold_ceramic",
    "Femkeramia_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_metal_ceramic",
    "Fem_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_metal_crown",
    "Preskeramia_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_pressed_ceramic",
    "Procera_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_procera",
    "Cirkon_-_Korona_Ideiglenes_ragaszt.": "temporary_gluing_zirconium",
    "Fem-keramia_-_Hid": "bridge_metal_ceramic",
    "Cirkonium_-_Hid": "bridge_zirconium",
    "Preskeramia_-_Hid": "bridge_pressed_ceramic",
    "Aranykeramia_-_Hid": "bridge_gold_ceramic",
    "Hidelvalasztas_-_Hid": "bridge_separation",
    "Ideiglenes_hid_-_Hid": "bridge_temporary",
    "Mesialis_-_Elpotlas": "edge_replacement_m",
    "Incizalis_-_Elpotlas": "edge_replacement_o",
    "Distalis_-_Elpotlas": "edge_replacement_d",
    "Mesialis_-_Letort_fog": "broken_tooth_m",
    "Incizalis_-_Letort_fog": "broken_tooth_o",
    "Distalis_-_Letort_fog": "broken_tooth_d",
    "M._Buccalis_-_Gyokertomes_Vegleges": "rootcanal_final_mb",
    "D._Buccalis_-_Gyokertomes_Vegleges": "rootcanal_final_d",
    "Pal_Ling_-_Gyokertomes_Vegleges": "rootcanal_final_p",
    "Ossz._gyoker_-_Gyokertomes_Vegleges": "rootcanal_final_extra",
    "Inkomplett_-_Gyokertomes_Vegleges": "rootcanal_incomplete",
    "M._Buccalis_-_Gyokertomes_Ideiglenes": "rootcanal_temporary_mb",
    "D._Buccalis_-_Gyokertomes_Ideiglenes": "rootcanal_temporary_d",
    "Pal_Ling_-_Gyokertomes_Ideiglenes": "rootcanal_temporary_p",
    "Ossz._gyoker_-_Gyokertomes_Ideiglenes": "rootcanal_temporary_extra",
    "D._Buccalis_-_Retrograd_gy.tomes": "retrograde_root_filling_d",
    "M._Buccalis_-_Retrograd_gy.tomes": "retrograde_root_filling_m",
    "Palatinalis_-_Retrograd_gy.tomes": "retrograde_root_filling_p",
    "Kulonallo_-_Retrograd_gy.tomes": "retrograde_root_filling_single",
    "Arany_-_Betetek_Inlay": "inlay_gold",
    "Kompozit_-_Betetek_Inlay": "inlay_composite",
    "Keramia_-_Betetek_Inlay": "inlay_ceramic",
    "Fembetet_-_Betetek_Inlay": "metal_insert_inlay",
    "Arany_-_Betetek_Onlay": "onlay_gold",
    "Kompozit_-_Betetek_Onlay": "onlay_composite",
    "Keramia_-_Betetek_Onlay": "onlay_ceramic",
    "Fembetet_-_Betetek_Onlay": "metal_insert_onlay",
    "Arany_-_Betetek_Overlay": "overlay_gold",
    "Kompozit_-_Betetek_Overlay": "overlay_composite",
    "Keramia_-_Betetek_Overlay": "overlay_ceramic",
    "Fembetet_-_Betetek_Overlay": "metal_insert_overlay",
    "Hej_-_Hejak": "peels_peel",
    "Veneer_lay_-_Hejak": "peels_veneer_lay",
    "Koronazando_fog_-_Specialis": "crown_needed",
    "Cserel._korona_-_Specialis": "replace_needed",
    "Kihuzando_fog_-_Specialis": "teeth_extraction_mark",
    "Zarodott_fogh._-_Specialis": "missing_closed",
    "Egyenes_csavar_-_Specialis": "implant_head_screw",
    "Gombfeju_csavar_-_Specialis": "implant_head_sphere",
    "Impaktalt_fog_-_Specialis": "impacted_tooth",
    "Muanyag_fog_-_Specialis": "plastic_tooth",
    "Brekket_-_Specialis": "bracket"
};

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 }
    });
    const page = await context.newPage();

    const baseUrl = `https://${DOMAIN}.flexi-dent.hu`;
    console.log(`Navigating to ${baseUrl}`);

    try {
        // 1. Login
        await page.goto(`${baseUrl}/hu/?msg=no-for-patient`, { waitUntil: 'networkidle' });
        await page.fill('input[name="emailaddress"]', EMAIL);
        await page.fill('input[name="password"]', PASSWORD);
        await page.click('input[type="submit"][value="Bejelentkezés"]');
        await page.waitForLoadState('networkidle');

        // 2. Navigate to Patient Cardboard
        const patientUrl = `${baseUrl}/hu/patients/cardboard/cardboard?id=${PATIENT_ID}`;
        console.log(`Navigating to patient: ${patientUrl}`);
        await page.goto(patientUrl, { waitUntil: 'networkidle' });

        // 3. Open Status Menu
        const statusBtn = page.locator('div#editStatusText').first();
        await statusBtn.scrollIntoViewIfNeeded();
        await statusBtn.click();

        // Check for jConfirm "Új státusz" popup (occurs if status was recently modified)
        try {
            const confirmBtn = page.locator('.jconfirm-buttons .btn.btn-red').first();
            await confirmBtn.waitFor({ state: 'visible', timeout: 2000 });
            await confirmBtn.click();
            await page.waitForLoadState('networkidle');
            console.log('Handled jConfirm "Új státusz" popup.');
        } catch (e) {
            // No popup, continue
        }

        // 4. Process Teeth Data
        // The data might be an array (from the user's script normalizer)
        const normalizedData = Array.isArray(STATUS_DATA) ? STATUS_DATA[0] : STATUS_DATA;

        // Extract actions and comments
        const teethActions = {};
        const teethComments = {};

        function processObject(obj) {
            for (const [key, val] of Object.entries(obj)) {
                if (/^\d{2}$/.test(key) && typeof val === 'object') {
                    // Tooth level
                    const actions = [];
                    for (const [subKey, subVal] of Object.entries(val)) {
                        if (subVal === true && JSON_TO_DATANAME[subKey]) {
                            actions.push(JSON_TO_DATANAME[subKey]);
                        }
                        if (['megjegyzes', 'megjegyzés', 'comment', 'note'].includes(subKey.toLowerCase()) && typeof subVal === 'string') {
                            teethComments[key] = subVal.trim();
                        }
                    }
                    if (actions.length > 0) teethActions[key] = actions;
                } else if (typeof val === 'object' && val !== null) {
                    processObject(val);
                }
            }
        }
        processObject(normalizedData);

        const targetTeeth = Object.keys({ ...teethActions, ...teethComments }).sort();
        console.log(`Synthesizing data for teeth: ${targetTeeth.join(', ')}`);

        for (const tooth of targetTeeth) {
            console.log(`Processing tooth ${tooth}...`);

            // Click tooth
            const toothSelector = `div#tooth-number-${tooth}`;
            await page.click(toothSelector);

            // Apply actions
            const actions = teethActions[tooth] || [];
            for (const actionName of actions) {
                console.log(`  Adding status: ${actionName}`);
                const actionSelector = `button.addDentilSignButton[data-name="${actionName}"]`;
                await page.click(actionSelector);
            }

            // Add comment if exists
            const comment = teethComments[tooth];
            if (comment) {
                console.log(`  Writing comment: ${comment}`);
                await page.fill('input#tooth_comment', '');
                await page.type('input#tooth_comment', comment);
                await page.click('button#saveToothComment');
            }

            // Deselect tooth (click again)
            await page.click(toothSelector);
            await page.waitForTimeout(300); // Small wait between teeth
        }

        // 5. Handle General Comment (MEGJEGYZES_FO) if exists
        let generalComment = normalizedData.MEGJEGYZES_FO || normalizedData.megjegyzes_fo || normalizedData.megjegyzés_fo;
        if (normalizedData.section === 'MEGJEGYZES_FO' && normalizedData.content) {
            generalComment = normalizedData.content;
        }

        if (generalComment && typeof generalComment === 'string' && generalComment.trim()) {
            console.log('Writing general comment...');
            await page.click('i.fa-plus.fa-fw');
            await page.fill('textarea#AddPatientCommentModal_comment', generalComment.trim());
            await page.click('button#AddPatientCommentModal_SaveButton');
            await page.waitForTimeout(500);
        }

        console.log('Status synchronization complete.');

    } catch (error) {
        console.error('Critical script failure:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

run();
