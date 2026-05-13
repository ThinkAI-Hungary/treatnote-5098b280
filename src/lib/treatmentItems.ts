import { supabase } from '@/integrations/supabase/client';

export interface CombinedTreatmentItem {
  id: string; // The original ID (either custom or default)
  telephely_id?: string;
  name: string;
  category: string;
  subcategory: string | null;
  price: number | null;
  visual_group: string;
  visual_color: string;
  visual_icon: string;
  is_per_tooth: boolean;
  applicable_statuses: string[] | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  embedding_status?: string;
  is_default: boolean; // Flag to indicate if it's from the global library
  is_locked?: boolean;
  aliases?: string[];
}

export async function fetchCombinedTreatmentItems(telephelyId: string): Promise<CombinedTreatmentItem[]> {
  try {
    const { data: customItems, error: customError } = await supabase
      .from('clinic_treatment_items_stdl')
      .select('*')
      .eq('telephely_id', telephelyId)
      .order('sort_order', { ascending: true });

    if (customError) throw customError;

    const combinedItems: CombinedTreatmentItem[] = (customItems || []).map(item => ({
      ...item,
      is_default: item.is_default || false,
      is_locked: item.is_locked || false,
    }));

    return combinedItems;
  } catch (error) {
    console.error('Error fetching combined treatment items:', error);
    throw error;
  }
}
