// ============================================================
// TreatNote V2 — Supabase Client (read-only)
// Csak olvasásra: szotar_kezelesek embeddings + telephely info
// ============================================================

import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_API_KEY required in .env');
}

interface SupabaseResponse<T> {
  data: T[] | null;
  error: string | null;
  count?: number;
}

/** Generic Supabase REST query */
async function supabaseGet<T>(
  table: string,
  query: string = '',
  headers: Record<string, string> = {}
): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_API_KEY,
      'Authorization': `Bearer ${SUPABASE_API_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase error ${res.status}: ${body}`);
  }
  return await res.json() as T[];
}

// ---- Szótár kezelések ----

export interface SzotarKezeles {
  id: string;
  telephely_id: string;
  name: string;
  category: string;
}

/** Lekéri egy telephely összes szótár kezelését */
export async function getSzotarByTelephely(telephelyId: string): Promise<SzotarKezeles[]> {
  return await supabaseGet<SzotarKezeles>(
    'szotar_kezelesek',
    `telephely_id=eq.${telephelyId}&select=id,telephely_id,name,category&limit=5000`
  );
}

/** Lekéri egy telephely infóját */
export async function getTelephely(telephelyId: string): Promise<{ id: string; name: string } | null> {
  const items = await supabaseGet<{ id: string; name: string }>(
    'telephely',
    `id=eq.${telephelyId}&select=id,name&limit=1`
  );
  return items[0] || null;
}

/** Supabase embedding match RPC hívás */
export async function matchSzotarEmbedding(
  telephelyId: string,
  queryEmbedding: number[],
  topK: number = 5,
  threshold: number = 0.3
): Promise<{ id: string; name: string; similarity: number }[]> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/match_szotar_embedding`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_API_KEY,
      'Authorization': `Bearer ${SUPABASE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      match_telephely_id: telephelyId,
      match_count: topK,
      match_threshold: threshold,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase RPC error ${res.status}: ${body}`);
  }
  return await res.json() as any[];
}
