export type DentalStatusDef = {
  id: string;
  name: string;
  group: string;
  hasSurfaces: boolean;
};

export type ToothModel = {
  id?: string;
  patient_id?: string;
  tooth_number: string;
  status: string;
  surfaces: string | null;
  mobility?: number | null;
  percussion_sensitive?: boolean | null;
  periapical_lesion?: boolean | null;
  gum_recession_mm?: number | null;
  pocket_depth_mm?: number | null;
  prosthetic_type?: string | null;
  prosthetic_material?: string | null;
  prosthetic_shade?: string | null;
  implant_system?: string | null;
  implant_diameter?: number | null;
  implant_length?: number | null;
  implant_date?: string | null;
  percussion?: string | null;
  sensitivity?: string | null;
  dental_signs?: string[] | null;
  notes?: string | null;
};
