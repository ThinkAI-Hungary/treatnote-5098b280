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
    // 1. Fetch telephely setting for use_default_library
    const { data: telephelyData, error: telephelyError } = await supabase
      .from('telephely')
      .select('use_default_library')
      .eq('id', telephelyId)
      .single();

    if (telephelyError) throw telephelyError;

    const useDefaultLibrary = telephelyData?.use_default_library ?? false;

    // 2. Fetch custom items
    const { data: customItems, error: customError } = await supabase
      .from('clinic_treatment_items_stdl')
      .select('*')
      .eq('telephely_id', telephelyId);

    if (customError) throw customError;

    const combinedItems: CombinedTreatmentItem[] = (customItems || []).map(item => ({
      ...item,
      is_default: false,
    }));

    // 3. Fetch overrides since we need them for both paths
    const { data: overridesData, error: overridesError } = await supabase
      .from('clinic_item_overrides')
      .select('*')
      .eq('telephely_id', telephelyId);

    if (overridesError) throw overridesError;

    const overridesMap = new Map();
    (overridesData || []).forEach(o => {
      overridesMap.set(o.default_item_id, o);
    });

    let defaultsToFetch: any[] = [];

    if (useDefaultLibrary) {
      const { data, error } = await supabase.from('default_treatment_items').select('*');
      if (error) throw error;
      defaultsToFetch = data || [];
    } else {
      // Find locked items to keep them available
      const lockedIds = (overridesData || []).filter(o => o.is_locked).map(o => o.default_item_id);
      if (lockedIds.length > 0) {
        const { data, error } = await supabase.from('default_treatment_items').select('*').in('id', lockedIds);
        if (error) throw error;
        defaultsToFetch = data || [];
      }
    }

    if (defaultsToFetch.length > 0) {
      const defaultCombined: CombinedTreatmentItem[] = defaultsToFetch.map(item => {
        const override = overridesMap.get(item.id);
        return {
          ...item,
          price: override?.price !== undefined ? override.price : null,
          is_active: override?.is_active !== undefined ? override.is_active : true,
          is_locked: override?.is_locked !== undefined ? override.is_locked : false,
          telephely_id: telephelyId,
          is_default: true,
        };
      });

      combinedItems.push(...defaultCombined);
    }

    return combinedItems;
  } catch (error) {
    console.error('Error fetching combined treatment items:', error);
    throw error;
  }
}
