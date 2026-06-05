import { DENTAL_STATUSES } from './constants';
import { ToothModel } from './types';

// Helps map string segments to 'O', 'M', 'D', 'V'/B', 'L'/P', 'C'
const surfaceMap: Record<string, string> = {
  'Mesialis': 'M',
  'Occlusalis': 'O',
  'Distalis': 'D',
  'Gingivo_B.': 'C',
  'Buccalis': 'V',
  'Pal_Ling': 'L',
  'Incizalis': 'O',
  // Caries or fillings might combine these, but in Voxis flexident schema they are separate items like Tomes.Esztetikus.Occlusalis_-_Tomes_Esztetikus
};

// Map flexident enum endings to our internal status IDs
const statusMap: Record<string, string> = {
  'Altalanos.Foghiany': 'missing',
  'Altalanos.Tejfog': 'milk_tooth',
  'Altalanos.Barazdazaras': 'fissure',
  'Altalanos.Parapulpalis_csap': 'parapulpal_pin',
  'Altalanos.Radix': 'radix',
  'Altalanos.Lecsiszolt_fog': 'resected_tooth',
  'Altalanos.Rezekalt_fog': 'resected_tooth_ok',
  'Altalanos.Csontpotlas': 'bone_graft',

  // Implants
  'Implant.Altalanos.Nobel': 'implant_nobel',
  'Implant.Altalanos.AlphaBio': 'implant_alphabio',
  'Implant.Altalanos.IDEGEN': 'implant_foreign',
  'Implant.Altalanos.Ankylos': 'implant_ankylos',
  'Implant.Altalanos.SGS': 'implant_sgs',
  'Implant.Altalanos.Straumann': 'implant_straumann',
  'Implant.Altalanos.Astra': 'implant_astra',
  'Implant.Altalanos.Anyridge': 'implant_anyridge',
  'Implant.Altalanos.Nobel_Active': 'implant_nobel_active',
  'Implant.Altalanos.Nobel_On1': 'implant_nobel_on1',
  'Implant.Altalanos.Nobel_Replace': 'implant_nobel_replace',
  'Implant.Altalanos.Camlog': 'implant_camlog',
  'Implant.Altalanos.Conelog': 'implant_conelog',
  'Implant.Altalanos.Camlog_Isy': 'implant_camlog_Isy',
  'Implant.Altalanos.Denti': 'implant_denti',

  // Caries
  'Caries.Altalanos.Gyok._caries_3_-_Caries': 'tooth_root_caries',
  'Caries.Altalanos.Gyok._caries_2_-_Caries': 'tooth_root_caries',
  'Caries.Altalanos.Gyok._caries_1_-_Caries': 'tooth_root_caries',

  // Fillings
  'Tomes_Amalgam': 'filling_amalgam',
  'Tomes_Esztetikus': 'filling_esthetic',
  'Tomes_Ideiglenes': 'filling_temporary',
  'Tomes_Arany': 'filling_gold',

  // Core Buildup
  'Csonkfelepites_Cetac-Molar': 'corebuildup_cetacmolar',
  'Csonkfelepites_Vitremer': 'corebuildup_vitremer',
  'Csonkfelepites_Composite': 'corebuildup_composite',

  // Prosthesis
  'Teljes_-_Protezis': 'prosthesis_full',
  'Teljes_(impl.)_-_Protezis': 'prosthesis_on_implant_full',
  'Steg_-_Protezis': 'pier_abutment',
  'Protezis_Reszleges_kiveheto': 'prosthesis_partial',
  'Protezis_Reszl._kiv._(impl.)': 'prosthesis_on_implant_partial',

  // Crowns
  'Fem-keramia_-_Korona': 'crown_metal_ceramic',
  'Cirkonium_-_Korona': 'crown_zirconium',
  'Preskeramia_-_Korona': 'crown_pressed_ceramic',
  'Aranykeramia_-_Korona': 'crown_gold_ceramic',
  'Procera_-_Korona': 'crown_procera',
  'Ideig._Procera_-_Korona': 'crown_procera_temp',
  'Ideiglenes_-_Korona': 'crown_temporary',
  'Teleszk._korona_-_Korona': 'telescopic_crown',
  'Femkorona_-_Korona': 'crown_metal',

  // Bridges
  'Fem-keramia_-_Hid': 'bridge_metal_ceramic',
  'Fem-keramia_-_Hidtag': 'bridge_metal_ceramic',
  'Cirkonium_-_Hid': 'bridge_zirconium',
  'Cirkonium_-_Hidtag': 'bridge_zirconium',
  'Preskeramia_-_Hid': 'bridge_pressed_ceramic',
  'Preskeramia_-_Hidtag': 'bridge_pressed_ceramic',
  'Aranykeramia_-_Hid': 'bridge_gold_ceramic',
  'Aranykeramia_-_Hidtag': 'bridge_gold_ceramic',
  'Hidelvalasztas_-_Hid': 'bridge_separation',
  'Ideiglenes_hid_-_Hid': 'bridge_temporary',
  'Hidtag': 'bridge_metal_ceramic',

  // Root Canal
  'Gyokertomes_Vegleges': 'rootcanal_final',
  'Gyokertomes_Ideiglenes': 'rootcanal_temporary',

  // Inlays/Onlays
  'Arany_-_Betetek_Inlay': 'inlay_gold',
  'Kompozit_-_Betetek_Inlay': 'inlay_composite',
  'Keramia_-_Betetek_Inlay': 'inlay_ceramic',
  'Fembetet_-_Betetek_Inlay': 'metal_insert_inlay',

  'Arany_-_Betetek_Onlay': 'onlay_gold',
  'Kompozit_-_Betetek_Onlay': 'onlay_composite',
  'Keramia_-_Betetek_Onlay': 'onlay_ceramic',
  'Fembetet_-_Betetek_Onlay': 'metal_insert_onlay',

  // Peels / Veneers
  'Hej_-_Hejak': 'peels_peel',
  'Veneer_lay_-_Hejak': 'peels_veneer_lay'
};

export function mapVoxisToModels(resultJson: any, existingData: Record<string, ToothModel>, patientId: string): Partial<ToothModel>[] {
  const updates: Partial<ToothModel>[] = [];

  const toothNumbers = Object.keys(resultJson).filter(k => !isNaN(parseInt(k)));
  for (const tNum of toothNumbers) {
    const aiData = resultJson[tNum];
    if (!aiData) continue;

    // Ensure active_properties is an array even if missing from JSON payload
    aiData.active_properties = Array.isArray(aiData.active_properties) ? aiData.active_properties : [];

    // We start with existing tooth model if available to preserve id
    const existing = existingData[tNum] || { tooth_number: tNum, patient_id: patientId };

    // Determine the new statuses and surfaces
    const newStatuses: string[] = [];
    const surfaceSet = new Set<string>();

    for (const propPath of aiData.active_properties) {
      // 1. Direct matched (e.g. Altalanos.Foghiany)
      if (statusMap[propPath]) {
        if (!newStatuses.includes(statusMap[propPath])) {
          newStatuses.push(statusMap[propPath]);
        }
        continue;
      }

      // 2. Parsed based on suffix and surface keyword
      const suffixMatch = Object.keys(statusMap).find(k => propPath.endsWith(k));
      if (suffixMatch) {
        if (!newStatuses.includes(statusMap[suffixMatch])) {
          newStatuses.push(statusMap[suffixMatch]);
        }
      }

      // Try to extract surface from the path (e.g. Tomes.Esztetikus.Occlusalis...)
      for (const [key, val] of Object.entries(surfaceMap)) {
        if (propPath.includes(key)) {
          surfaceSet.add(val);
        }
      }
    }

    // Special fallback for generic groups if we didn't find specific ones but have caries group
    if (aiData.active_properties.some((p: string) => p.includes('Caries.Altalanos'))) {
      if (!newStatuses.includes('caries')) newStatuses.push('caries');
    }

    // Generic fallback based on Megjegyzes if still healthy (no specific status found)
    if (newStatuses.length === 0 && aiData.Megjegyzes) {
      const lowerNotes = String(aiData.Megjegyzes).toLowerCase();
      if (lowerNotes.includes('hídtag') || lowerNotes.includes('hidtag')) {
        newStatuses.push('bridge_metal_ceramic');
      } else if (lowerNotes.includes('híd') || lowerNotes.includes('hid')) {
        newStatuses.push('bridge_metal_ceramic');
      } else if (lowerNotes.includes('korona')) {
        newStatuses.push('crown_metal_ceramic');
      } else if (lowerNotes.includes('hiányzik') || lowerNotes.includes('hiány') || lowerNotes.includes('foghiany')) {
        newStatuses.push('missing');
      } else if (lowerNotes.includes('gyökértömött') || lowerNotes.includes('gyokertomott') || lowerNotes.includes('gyökérkezel')) {
        newStatuses.push('rootcanal_final');
      } else if (lowerNotes.includes('implant')) {
        newStatuses.push('implant_foreign');
      } else if (lowerNotes.includes('tömés') || lowerNotes.includes('tomes')) {
        newStatuses.push('filling_esthetic');
      }
    }

    // TreatNote single-status conflict resolution:
    // If a tooth has both Crown and Bridge (it's a pillar), prefer Crown so it renders as a present tooth with a crown, not a missing pontic.
    // However, since we now support MULTIPLE statuses, we can just keep both! 
    // EXCEPT, if it has 'missing' and 'bridge_metal_ceramic', we should KEEP 'missing' if it truly is a pontic.
    // Wait, let's keep all statuses that the AI detected. We just join them.

    let finalStatus = newStatuses.length > 0 ? newStatuses.join(',') : (existing.status || 'healthy');

    // Sort surfaces M O D V L C and separate by comma for legacy array compatibility
    const finalSurfaces = Array.from(surfaceSet).sort((a, b) => "MODVLC".indexOf(a) - "MODVLC".indexOf(b)).join(',') || null;

    // Clean up notes (remove trailing spaces, backticks, fix visual bug)
    let cleanNotes = String(aiData.Megjegyzes || '').replace(/[`]/g, '').trim();

    // Check if we have specific clinical data
    const hasSpecificData = aiData.Mobilitas !== undefined ||
      aiData.Tasakmelyseg_mm !== undefined ||
      aiData.Inyvisszahuzodas_mm !== undefined ||
      aiData.Kopogtatas_erzekeny !== undefined ||
      aiData.Erzekenyseg !== undefined ||
      aiData.Periapikalis_elvaltozas !== undefined ||
      aiData.Egyeb_jelek !== undefined ||
      aiData.Protetika_tipusa !== undefined ||
      aiData.Anyag !== undefined ||
      aiData.Fogszin !== undefined ||
      aiData.Implant_rendszer !== undefined ||
      aiData.Implant_atmero_mm !== undefined ||
      aiData.Implant_hossz_mm !== undefined ||
      aiData.Beultetes_datuma !== undefined;

    // Only update if there's actually a change (or a note or specific data)
    if (aiData.active_properties.length > 0 || cleanNotes || hasSpecificData) {
      updates.push({
        ...existing,
        status: finalStatus !== 'healthy' ? finalStatus : existing.status,
        surfaces: finalSurfaces || existing.surfaces,
        notes: cleanNotes ? cleanNotes : existing.notes,
        mobility: aiData.Mobilitas ?? existing.mobility,
        pocket_depth_mm: aiData.Tasakmelyseg_mm ?? existing.pocket_depth_mm,
        gum_recession_mm: aiData.Inyvisszahuzodas_mm ?? existing.gum_recession_mm,
        percussion_sensitive: aiData.Kopogtatas_erzekeny ?? existing.percussion_sensitive,
        sensitivity: aiData.Erzekenyseg ?? existing.sensitivity,
        periapical_lesion: aiData.Periapikalis_elvaltozas ?? existing.periapical_lesion,
        dental_signs: aiData.Egyeb_jelek ?? existing.dental_signs,
        prosthetic_type: aiData.Protetika_tipusa ?? existing.prosthetic_type,
        prosthetic_material: aiData.Anyag ?? existing.prosthetic_material,
        prosthetic_shade: aiData.Fogszin ?? existing.prosthetic_shade,
        implant_system: aiData.Implant_rendszer ?? existing.implant_system,
        implant_diameter: aiData.Implant_atmero_mm ?? existing.implant_diameter,
        implant_length: aiData.Implant_hossz_mm ?? existing.implant_length,
        implant_date: aiData.Beultetes_datuma ?? existing.implant_date,
      });
    }
  }

  return updates;
}
