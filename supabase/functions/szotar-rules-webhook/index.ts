import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Webhook URLs
const PRIMARY_WEBHOOK_URL = "https://n8n.thinkaimedical.hu/webhook/99f5b5e4-6e0e-49d1-9277-da2d08d7fd85";
const SECONDARY_WEBHOOK_URL = "https://n8n.thinkaimedical.hu/webhook-test/99f5b5e4-6e0e-49d1-9277-da2d08d7fd85";

// 19 előre definiált kezelési protokoll (PDF alapján frissítve)
const TREATMENT_PROTOCOLS = [
  {
    id: 1,
    category: "Diagnosztika",
    name: "Állapotfelmérés",
    protocol: "1. Vizit:\n- Anamnézis felvétele és a panaszok egyeztetése.\n- Teljes szájüregi vizsgálat elvégzése.\n- Panoráma röntgen készítése a diagnózishoz."
  },
  {
    id: 2,
    category: "Higiénia",
    name: "Fogkőeltávolítás",
    protocol: "1. Vizit:\n- Ultrahangos fogkőeltávolítás (depurálás) az íny felett.\n- Homokfúvás alkalmazása az elszíneződések ellen.\n- Polírozás pasztával a sima felszínért."
  },
  {
    id: 3,
    category: "Parodontológia",
    name: "Parodontális zárt kürett",
    protocol: "A fogágybetegségek kezelését célzó beavatkozás általában két külön alkalommal történik, állcsontonként elosztva.\n1. Vizit (pl. Felső állcsont):\n- Érzéstelenítés beadása.\n- Tasakmélységek mérése szondával (státusz felvétele).\n- Íny alatti tisztítás kézi műszerekkel (kürett), valamint a gyulladt szövetek eltávolítása.\n- Fertőtlenítő átöblítés.\n2. Vizit (pl. Alsó állcsont):\n- Ugyanaz a folyamat elvégzése a másik állcsonton, jellemzően 1-2 nap elteltével."
  },
  {
    id: 4,
    category: "Konzerváló Fogászat",
    name: "Esztétikus Tömés",
    protocol: "A szuvas fogak helyreállítása egyetlen vizit alatt történik, modern anyagok és technikák alkalmazásával.\n1. Vizit:\n- Érzéstelenítés (pl. QuickSleeper).\n- A szuvas rész eltávolítása és az üreg kialakítása.\n- Izolálás (Kofferdam gumilepedővel) a száraz környezetért.\n- Bondozás, majd rétegzéses tömés készítése kompozit anyagból, több felszínre.\n- A tömés kidolgozása, a magasság beállítása és polírozás."
  },
  {
    id: 5,
    category: "Konzerváló Fogászat",
    name: "Inlay",
    protocol: "Egyetlen fog inlay-vel történő felépítése általában két találkozót igényel.\n1. Vizit:\n- Érzéstelenítés, majd az üreg kialakítása.\n- Precíziós lenyomatvétel (szilikonnal vagy digitális szkennerrel).\n- Ideiglenes tömés behelyezése.\n2. Vizit:\n- A kész inlay beragasztása végleges cementtel.\n- A harapás ellenőrzése és beállítása."
  },
  {
    id: 6,
    category: "Konzerváló Fogászat",
    name: "Mikroszkópos Gyökérkezelés",
    protocol: "A fogmegtartó kezelés nagy precizitást igényel, ezért általában 2-3 alkalomra van szükség a véglegesítéshez.\n1. Vizit:\n- Diagnosztika készítése (CT felvétel vagy kisröntgen).\n- Érzéstelenítés, majd a fog megnyitása (trepanálás).\n- Idegek eltávolítása és a csatornahossz mérése.\n- Gépi tágítás elvégzése mikroszkóp alatt.\n- Gyógyszeres lezárás az ideiglenes időszakra.\n2. Vizit:\n- A csatornák átöblítése és fertőtlenítése.\n- Végleges gyökértömés elkészítése (guttapercha).\n- Kontroll röntgenfelvétel.\n- Fedőtömés készítése vagy csap előkészítése."
  },
  {
    id: 7,
    category: "Konzerváló Fogászat",
    name: "Gyökérkezelés",
    protocol: "A fogmegtartó kezelés nagy precizitást igényel, ezért általában 2-3 alkalomra van szükség a véglegesítéshez.\n1. Vizit:\n- Diagnosztika készítése (CT felvétel vagy kisröntgen).\n- Érzéstelenítés, majd a fog megnyitása (trepanálás).\n- Idegek eltávolítása és a csatornahossz mérése.\n- Tágítás elvégzése.\n- Gyógyszeres lezárás az ideiglenes időszakra.\n2. Vizit:\n- A csatornák átöblítése és fertőtlenítése.\n- Végleges gyökértömés elkészítése (guttapercha).\n- Kontroll röntgenfelvétel.\n- Fedőtömés készítése vagy csap előkészítése."
  },
  {
    id: 8,
    category: "Gyermekfogászat",
    name: "Barázdazárás",
    protocol: "A szuvasodás megelőzését szolgáló fájdalommentes beavatkozás, amely fúrás nélkül, egyetlen alkalommal történik.\n1. Vizit:\n- A rágófelszín alapos tisztítása kefével és levegővel.\n- A barázdák kondicionálása (savazás).\n- Folyékony barázdazáró anyag befolyatása a résekbe.\n- Az anyag megkötése UV lámpás megvilágítással."
  },
  {
    id: 9,
    category: "Fogpótlás",
    name: "Cirkon Korona (Szóló)",
    protocol: "Egyetlen fog koronával történő felépítése általában három találkozót igényel a pontos illeszkedés érdekében.\n1. Vizit:\n- Érzéstelenítés, majd a fog lecsiszolása (vállas előkészítés).\n- Precíziós lenyomatvétel (szilikonnal vagy digitális szkennerrel).\n- Ideiglenes műanyag korona elkészítése és felragasztása a csonk védelmére.\n2. Vizit:\n- Vázpróba (ez a lépés opcionális, esetenként elhagyható).\n3. Vizit:\n- A kész cirkon korona beragasztása végleges cementtel.\n- A harapás ellenőrzése és beállítása."
  },
  {
    id: 10,
    category: "Fogpótlás",
    name: "Fémkerámia Korona (Szóló)",
    protocol: "Egyetlen fog koronával történő felépítése általában három találkozót igényel a pontos illeszkedés érdekében.\n1. Vizit:\n- Érzéstelenítés, majd a fog lecsiszolása (vállas előkészítés).\n- Precíziós lenyomatvétel (szilikonnal vagy digitális szkennerrel).\n- Ideiglenes műanyag korona elkészítése és felragasztása a csonk védelmére.\n2. Vizit:\n- Vázpróba (ez a lépés opcionális, esetenként elhagyható).\n3. Vizit:\n- A kész fémkerámia korona beragasztása végleges cementtel.\n- A harapás ellenőrzése és beállítása."
  },
  {
    id: 11,
    category: "Fogpótlás",
    name: "Héjkerámia",
    protocol: "A mosoly esztétikai korrekcióját szolgáló vékony héjak felhelyezése 2-3 alkalmat vesz igénybe.\n1. Vizit:\n- Mosolytervezés és fotódokumentáció készítése.\n- Minimális csiszolás a fog elülső felszínéből.\n- Lenyomatvétel.\n- Ideiglenes héj felhelyezése.\n2. Vizit:\n- A vékony kerámia héjak speciális ragasztása.\n- Végső polírozás."
  },
  {
    id: 12,
    category: "Fogpótlás",
    name: "Éjszakai Harapásemelő Sín",
    protocol: "A fogcsikorgatás ellen védő sín elkészítése két rövid látogatást igényel.\n1. Vizit:\n- Tanulmányi lenyomatvétel az alsó és felső fogívről.\n2. Vizit:\n- A laboratórium által elkészített átlátszó sín átadása és az illeszkedés ellenőrzése."
  },
  {
    id: 13,
    category: "Szájsebészet",
    name: "Foghúzás (Egyszerű)",
    protocol: "A menthetetlen fog eltávolítása egyetlen sebészeti vizit alkalmával történik.\n1. Vizit:\n- Helyi érzéstelenítés.\n- A fog eltávolítása fogóval vagy emelővel.\n- A seb kitisztítása (kürett).\n- Tamponra harapás a vérzés csillapítására (varrat behelyezése ennél a típusnál általában nem szükséges)."
  },
  {
    id: 14,
    category: "Szájsebészet",
    name: "Fogimplantátum beültetés (Műtéti fázis)",
    protocol: "A műgyökér beültetése egy komolyabb sebészeti beavatkozás, amelyet hosszú gyógyulási idő követ.\n1. Vizit (Műtét):\n- Steril előkészületek.\n- Érzéstelenítés és az íny feltárása.\n- Az implantátum (csavar) behajtása a csontba.\n- Az íny összevarrása.\n- (Ezt követően 3-6 hónap gyógyulási időszak következik a felszabadítás előtt)."
  },
  {
    id: 15,
    category: "Szájsebészet / Protetika",
    name: "Implantátum Korona (Protetikai fázis)",
    protocol: "Az implantátum csontosodása után kezdődik a fogpótlás elkészítése, amely három lépésben zajlik.\n1. Vizit:\n- Az implantátum felszabadítása és az ínyformázó csavar behelyezése.\n2. Vizit:\n- Lenyomatvétel lenyomati fejjel.\n3. Vizit:\n- A végleges felépítmény behelyezése és a kész korona becsavarozása vagy ragasztása az implantátumra."
  },
  {
    id: 16,
    category: "Esztétika",
    name: "Rendelői Fogfehérítés",
    protocol: "A fogak árnyalatának világosítása egyetlen, hosszabb (kb. 1,5-2 órás) kezelés alkalmával történik.\n1. Vizit:\n- Ínyvédő gél felvitele a lágyszövetek védelmére.\n- A fehérítő anyag felvitele a fogakra, általában 3x15 perces ciklusban.\n- Az anyag aktiválása LED lámpás megvilágítással.\n- Érzékenységcsökkentő ecsetelés a kezelés végén.\n- (Gyakran adnak mellé otthoni fenntartó sínt is)."
  },
  {
    id: 17,
    category: "Fogszabályozás",
    name: "Rögzített Fogszabályozó (Felhelyezés)",
    protocol: "A fogszabályozó készülék felragasztása precíz előkészítést igényel, így a folyamat két alkalomra oszlik.\n1. Vizit:\n- Teleröntgen, fotók készítése és lenyomatvétel a tervezéshez.\n2. Vizit:\n- A fogak polírozása és tisztítása.\n- A brekettek (tappancsok) felragasztása egyenként a fogakra.\n- A drótív bekötése a brekettekbe."
  },
  {
    id: 18,
    category: "Fogpótlás",
    name: "Fém-kerámia Híd",
    protocol: "A hiányzó fogak pótlása híddal három találkozót igényel, amely magában foglalja az előkészítést, a próbát és az átadást.\n1. Vizit (Előkészítés):\n- Érzéstelenítés.\n- A hiányt határoló szomszédos fogak (pillérek) lecsiszolása.\n- Precíziós lenyomatvétel a csonkokról.\n- Ideiglenes híd készítése és felragasztása a pillérek védelme érdekében.\n2. Vizit (Vázpróba):\n- A híd vázának ellenőrzése a szájban.\n3. Vizit (Átadás):\n- A kész, leplezett híd beragasztása végleges cementtel.\n- A harapás ellenőrzése."
  },
  {
    id: 19,
    category: "Fogpótlás",
    name: "Cirkonium Híd",
    protocol: "A hiányzó fogak pótlása híddal három találkozót igényel, amely magában foglalja az előkészítést, a próbát és az átadást.\n1. Vizit (Előkészítés):\n- Érzéstelenítés.\n- A hiányt határoló szomszédos fogak (pillérek) lecsiszolása.\n- Precíziós lenyomatvétel a csonkokról.\n- Ideiglenes híd készítése és felragasztása a pillérek védelme érdekében.\n2. Vizit (Vázpróba):\n- A híd vázának ellenőrzése a szájban.\n3. Vizit (Átadás):\n- A kész, leplezett híd beragasztása végleges cementtel.\n- A harapás ellenőrzése."
  }
];

// Process protocols in batches to avoid overwhelming n8n
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  delayBetweenBatches = 0
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);
    console.log(`Processing batch ${batchNum}/${totalBatches}: protocols ${i + 1}-${Math.min(i + batchSize, items.length)}`);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Small delay between batches to prevent resource exhaustion
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  return results;
}

// Helper functions
function generateUUID(): string {
  return crypto.randomUUID();
}

function mapTargetToothType(value?: string): 'all' | 'pillar_only' | 'pontic_only' {
  const lower = (value || '').toLowerCase();
  if (lower === 'pillar_only' || lower === 'pillar' || lower.includes('pillér')) return 'pillar_only';
  if (lower === 'pontic_only' || lower === 'pontic' || lower.includes('pótfog')) return 'pontic_only';
  return 'all';
}

function mapScaling(value?: string): 'per_tooth' | 'per_case' | 'fix' {
  const lower = (value || '').toLowerCase();
  if (lower === 'per_case' || lower.includes('eset')) return 'per_case';
  if (lower === 'fix') return 'fix';
  return 'per_tooth';
}

// ==========================================================
// Embedding generálás OpenAI API-val
// ==========================================================
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.error('Missing OPENAI_API_KEY secret');
    return [];
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`OpenAI API error: ${response.status} - ${error}`);
      return [];
    }

    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  } catch (error) {
    console.error('Embedding generation error:', error);
    return [];
  }
}

// ==========================================================
// Embedding mentése Supabase-be
// ==========================================================
// deno-lint-ignore no-explicit-any
async function saveEmbeddings(
  supabase: any,
  ruleId: string,
  semanticDescription: string | null,
  items: { name: string }[],
  mode: string
): Promise<{ success: number; failed: number }> {
  const stats = { success: 0, failed: 0 };

  // Összegyűjtjük a szövegeket
  const textsToEmbed: { text: string; type: 'semantic_description' | 'item_name' }[] = [];

  // 1. Semantic description (fő forrás)
  if (semanticDescription && semanticDescription.trim()) {
    textsToEmbed.push({
      text: semanticDescription.trim(),
      type: 'semantic_description',
    });
  }

  // 2. Item names (másodlagos)
  for (const item of items) {
    if (item.name && item.name.trim()) {
      textsToEmbed.push({
        text: item.name.trim(),
        type: 'item_name',
      });
    }
  }

  // Deduplikálás
  const seen = new Set<string>();
  const uniqueTexts = textsToEmbed.filter(t => {
    const key = `${t.text}|${t.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueTexts.length === 0) {
    console.log(`No texts to embed for rule ${ruleId}`);
    return stats;
  }

  console.log(`Generating ${uniqueTexts.length} embeddings for rule ${ruleId}`);

  // Embedding generálás
  const texts = uniqueTexts.map(t => t.text);
  const embeddings = await generateEmbeddings(texts);

  if (embeddings.length === 0) {
    console.error(`Failed to generate embeddings for rule ${ruleId}`);
    stats.failed = uniqueTexts.length;
    return stats;
  }

  // Mentés Supabase-be
  for (let i = 0; i < uniqueTexts.length; i++) {
    if (!embeddings[i]) {
      stats.failed++;
      continue;
    }

    // Direct insert/upsert to treatment_embeddings table
    const table = mode === 'native' ? 'treatment_embeddings_stdl' : 'treatment_embeddings';
    const embeddingVector = `[${embeddings[i].join(',')}]`;
    const { error } = await supabase
      .from(table)
      .upsert({
        treatment_rule_id: ruleId,
        text_source: uniqueTexts[i].text,
        source_type: uniqueTexts[i].type,
        embedding: embeddingVector,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'treatment_rule_id,text_source,source_type',
      });

    if (error) {
      console.error(`Failed to save embedding: ${error.message}`);
      stats.failed++;
    } else {
      stats.success++;
    }
  }

  console.log(`Embeddings for rule ${ruleId}: ${stats.success} success, ${stats.failed} failed`);
  return stats;
}

// Types for webhook payload
interface ProtocolPayload {
  version: string;
  event_id: string;
  protocol_id: number;
  telephely_id: string;
  telephely_name: string;
  flexi_domain: string | null;
  user_id: string;
  category: string;
  name: string;
  protocol: string;
  timestamp: string;
  kezelesek: Array<{ id: string; name: string; category: string }>;
}

// Response types from n8n
interface VisitItem {
  name: string;
  qty?: number;
  unit?: string;
  scaling?: string;
  target_tooth_type?: string;
}

interface ParsedVisit {
  visit_no?: number;
  duration_days?: number;
  healing_time_months?: number;
  items: VisitItem[];
}

interface ExtractionItem {
  fogalom: string;
  kategoria?: string;
  semantic_description?: string;
  parsed?: {
    visits: ParsedVisit[];
  };
}

interface N8nResponse {
  extractions?: ExtractionItem[];
}

interface WebhookResult {
  success: boolean;
  protocolId: number;
  protocolName: string;
  error?: string;
  response?: N8nResponse;
}

// Call a single webhook for one protocol (with shorter timeout since payload is smaller)
async function callProtocolWebhook(
  url: string,
  payload: ProtocolPayload,
  protocolId: number,
  protocolName: string
): Promise<WebhookResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 100000); // 100s timeout per protocol

  try {
    console.log(`[Protocol ${protocolId}] Calling webhook for: ${protocolName}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Protocol ${protocolId}] HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      return { success: false, protocolId, protocolName, error: `HTTP ${response.status}` };
    }

    const responseText = await response.text();
    let responseData: N8nResponse;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      console.error(`[Protocol ${protocolId}] Invalid JSON`);
      return { success: false, protocolId, protocolName, error: 'Invalid JSON response' };
    }

    // Handle array-wrapped response
    if (Array.isArray(responseData) && responseData.length > 0) {
      responseData = responseData[0];
    }

    // Handle nested json wrapper
    // deno-lint-ignore no-explicit-any
    const rd = responseData as any;
    if (rd?.json?.extractions && Array.isArray(rd.json.extractions)) {
      responseData = rd.json;
    }

    const extractionCount = Array.isArray(responseData?.extractions) ? responseData.extractions.length : 0;
    console.log(`[Protocol ${protocolId}] OK - extractions: ${extractionCount}`);

    return { success: true, protocolId, protocolName, response: responseData };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[Protocol ${protocolId}] Timeout after 45s`);
      return { success: false, protocolId, protocolName, error: 'Timeout' };
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Protocol ${protocolId}] Network error: ${errorMsg}`);
    return { success: false, protocolId, protocolName, error: errorMsg };
  }
}

// Retry delays in milliseconds: 30s, 60s, 90s
const RETRY_DELAYS = [30000, 60000, 90000];
const MAX_ATTEMPTS = 4; // 1 initial + 3 retries

// Helper to update job status in rule_generation_jobs
async function updateJobStatus(
  supabase: SupabaseClient,
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString(), ...extra };
  if (status === 'completed' || status === 'error') {
    update.completed_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from('rule_generation_jobs')
    .update(update)
    .eq('id', jobId);
  if (error) {
    console.error(`Failed to update job ${jobId}:`, error.message);
  }
}

// Process a single successful webhook result — insert rules, visits, items, embeddings
async function processWebhookResult(
  result: WebhookResult,
  telephely_id: string,
  supabase: SupabaseClient,
  mode: string
): Promise<{ inserted: number; duplicates: number; errors: number; embeddingStats: { success: number; failed: number } }> {
  const stats = { inserted: 0, duplicates: 0, errors: 0, embeddingStats: { success: 0, failed: 0 } };

  if (!result.success || !result.response?.extractions) {
    return stats;
  }

  for (const extraction of result.response.extractions) {
    if (!extraction.fogalom) {
      console.log(`[Protocol ${result.protocolId}] Skipping extraction without fogalom`);
      stats.errors++;
      continue;
    }

    console.log(`[Protocol ${result.protocolId}] Inserting: ${extraction.fogalom}`);

    const rulesTable = mode === 'native' ? 'treatment_rules_stdl' : 'treatment_rules';
    const { data: ruleData, error: ruleError } = await supabase
      .from(rulesTable)
      .insert({
        clinic_id: telephely_id,
        name: extraction.fogalom,
        category: extraction.kategoria || result.response.extractions[0]?.kategoria || null,
        semantic_description: extraction.semantic_description || null,
        alapszabaly: true,
      })
      .select('id')
      .single();

    if (ruleError) {
      if (ruleError.code === '23505') {
        console.log(`[Protocol ${result.protocolId}] Duplicate: ${extraction.fogalom}`);
        stats.duplicates++;
        continue;
      } else {
        console.error(`[Protocol ${result.protocolId}] Rule insert error:`, ruleError);
        stats.errors++;
        continue;
      }
    }

    const allItems: { name: string }[] = [];
    const visits = extraction.parsed?.visits || [];
    for (let vi = 0; vi < visits.length; vi++) {
      const visit = visits[vi];
      const visitsTable = mode === 'native' ? 'rule_visits_stdl' : 'rule_visits';
      const { data: visitData, error: visitError } = await supabase
        .from(visitsTable)
        .insert({
          rule_id: ruleData.id,
          visit_number: visit.visit_no || vi + 1,
          duration_days: visit.duration_days || 0,
          healing_months: visit.healing_time_months || 0,
          display_order: vi,
        })
        .select('id')
        .single();

      if (visitError) {
        console.error(`[Protocol ${result.protocolId}] Visit insert error:`, visitError);
        continue;
      }

      if (visit.items && visit.items.length > 0) {
        const itemsToInsert = visit.items.map((item, ii) => ({
          visit_id: visitData.id,
          name: item.name || '',
          quantity: item.qty || 1,
          unit: item.unit || 'db',
          scaling: mapScaling(item.scaling),
          target_tooth_type: mapTargetToothType(item.target_tooth_type),
          display_order: ii,
        }));

        const itemsTable = mode === 'native' ? 'rule_items_stdl' : 'rule_items';
        const { error: itemsError } = await supabase
          .from(itemsTable)
          .insert(itemsToInsert);

        if (itemsError) {
          console.error(`[Protocol ${result.protocolId}] Items insert error:`, itemsError);
        }
        allItems.push(...visit.items.filter(item => item.name));
      }
    }

    // Embedding generation
    console.log(`[Protocol ${result.protocolId}] Generating embeddings for: ${extraction.fogalom}`);
    const ruleEmbeddingStats = await saveEmbeddings(
      supabase,
      ruleData.id,
      extraction.semantic_description || null,
      allItems,
      mode
    );
    stats.embeddingStats.success += ruleEmbeddingStats.success;
    stats.embeddingStats.failed += ruleEmbeddingStats.failed;
    stats.inserted++;
  }

  return stats;
}

// Background processing function with job tracking and auto-retry
async function processWebhooksAndImport(
  batchId: string,
  eventId: string,
  telephely_id: string,
  user_id: string,
  telephelyData: { name: string; flexi_domain: string | null },
  kezelesek: Array<{ id: string; name: string; category: string }>,
  supabase: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  jobMap: Map<number, any>, // protocolId -> job row
  regenerate: boolean,
  mode: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  console.log(`[Background ${eventId}] Starting webhook processing (batch: ${batchId})...`);

  try {
    if (regenerate) {
      const rulesTable = mode === 'native' ? 'treatment_rules_stdl' : 'treatment_rules';
      console.log(`[Background ${eventId}] REGENERATE mode — deleting alapszabaly rules for telephely ${telephely_id}`);
      const { error: deleteError, count } = await supabase
        .from(rulesTable)
        .delete({ count: 'exact' })
        .eq('clinic_id', telephely_id)
        .eq('alapszabaly', true);
      if (deleteError) {
        console.error(`[Background ${eventId}] Error deleting rules:`, deleteError);
      } else {
        console.log(`[Background ${eventId}] Deleted ${count} existing rules`);
      }
    }

    // Build protocol payloads
    const protocolPayloads = TREATMENT_PROTOCOLS.map((protocol) => ({
      protocol,
      payload: {
        version: '2.0',
        event_id: eventId,
        protocol_id: protocol.id,
        telephely_id,
        telephely_name: telephelyData.name,
        flexi_domain: telephelyData.flexi_domain,
        user_id: user_id || '',
        category: protocol.category,
        name: protocol.name,
        protocol: protocol.protocol,
        timestamp,
        kezelesek,
      } as ProtocolPayload,
    }));

    // Track which protocols still need processing
    let pendingProtocols = [...protocolPayloads];
    let totalInserted = 0;
    let totalDuplicates = 0;
    let totalErrors = 0;
    const embeddingStats = { success: 0, failed: 0 };

    // Process with auto-retry: attempt 1 + 3 retries
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (pendingProtocols.length === 0) break;

      console.log(`[Background ${eventId}] Attempt ${attempt}/${MAX_ATTEMPTS}: processing ${pendingProtocols.length} protocols`);

      // Update all pending jobs to 'processing'
      for (const pp of pendingProtocols) {
        const job = jobMap.get(pp.protocol.id);
        if (job) {
          await updateJobStatus(supabase, job.id, 'processing', { attempt });
        }
      }

      // Fire all pending protocols in parallel
      const results = await Promise.all(pendingProtocols.map(async (pp) => {
        // Try primary webhook first, fall back to secondary
        const result = await callProtocolWebhook(PRIMARY_WEBHOOK_URL, pp.payload, pp.protocol.id, pp.protocol.name);
        if (!result.success) {
          console.log(`[Protocol ${pp.protocol.id}] Primary failed, trying secondary...`);
          return { pp, result: await callProtocolWebhook(SECONDARY_WEBHOOK_URL, pp.payload, pp.protocol.id, pp.protocol.name) };
        }
        return { pp, result };
      }));

      // Process results: separate successes from failures
      const failedThisRound: typeof pendingProtocols = [];

      for (const { pp, result } of results) {
        const job = jobMap.get(pp.protocol.id);

        if (result.success) {
          // Process and insert rules
          const stats = await processWebhookResult(result, telephely_id, supabase, mode);
          totalInserted += stats.inserted;
          totalDuplicates += stats.duplicates;
          totalErrors += stats.errors;
          embeddingStats.success += stats.embeddingStats.success;
          embeddingStats.failed += stats.embeddingStats.failed;

          // Mark job as completed
          if (job) {
            await updateJobStatus(supabase, job.id, 'completed', {
              extractions_count: stats.inserted,
            });
          }
        } else {
          // Mark as error
          if (job) {
            await updateJobStatus(supabase, job.id, 'error', {
              error_message: result.error || 'Unknown error',
              attempt,
            });
          }
          // Add to retry queue if we have more attempts
          if (attempt < MAX_ATTEMPTS) {
            failedThisRound.push(pp);
          }
        }
      }

      // Log round summary
      const successThisRound = results.filter(r => r.result.success).length;
      console.log(`[Background ${eventId}] Attempt ${attempt} done: ${successThisRound} success, ${failedThisRound.length} failed`);

      // Update pending list for next round
      pendingProtocols = failedThisRound;

      // Wait before retrying (30s, 60s, 90s)
      if (pendingProtocols.length > 0 && attempt < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS[attempt - 1];
        console.log(`[Background ${eventId}] Waiting ${delay / 1000}s before retry ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log(`[Background ${eventId}] Complete: ${totalInserted} inserted, ${totalDuplicates} duplicates, ${totalErrors} errors`);
    console.log(`[Background ${eventId}] Embeddings: ${embeddingStats.success} success, ${embeddingStats.failed} failed`);

  } catch (error) {
    console.error(`[Background ${eventId}] Fatal error:`, error);
    // Mark all pending jobs as error on fatal crash
    for (const [, job] of jobMap) {
      if (job.status !== 'completed') {
        await updateJobStatus(supabase, job.id, 'error', {
          error_message: `Fatal: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }
}

// Declare EdgeRuntime for Deno
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const eventId = generateUUID();
  const batchId = generateUUID();
  console.log(`[szotar-rules-webhook] Starting with event_id: ${eventId}, batch_id: ${batchId}`);

  try {
    // Parse request body
    const body = await req.json();
    const { telephely_id, user_id, regenerate, mode } = body;
    const resolvedMode = mode === 'native' ? 'native' : 'flexi';

    if (!telephely_id) {
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'MISSING_TELEPHELY', message: 'telephely_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials');
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'CONFIG_ERROR', message: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch telephely info
    console.log(`Fetching telephely info for: ${telephely_id}`);
    const { data: telephelyData, error: telephelyError } = await supabase
      .from('telephely')
      .select('name, flexi_domain')
      .eq('id', telephely_id)
      .single();

    if (telephelyError) {
      console.error('Error fetching telephely:', telephelyError);
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'TELEPHELY_NOT_FOUND', message: 'Telephely not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch szotar_kezelesek for this telephely
    const szotarTable = resolvedMode === 'native' ? 'clinic_treatment_items_stdl' : 'szotar_kezelesek';
    console.log(`Fetching dictionary from ${szotarTable} for telephely: ${telephely_id}`);
    const { data: kezelesekData, error: kezelesekError } = await supabase
      .from(szotarTable)
      .select('id, name, category')
      .eq('telephely_id', telephely_id);

    if (kezelesekError) {
      console.error('Error fetching kezelesek:', kezelesekError);
    }

    const kezelesek = kezelesekData || [];
    console.log(`Found ${kezelesek.length} kezelesek entries`);

    // Insert job rows for all 19 protocols
    const jobRows = TREATMENT_PROTOCOLS.map((protocol) => ({
      batch_id: batchId,
      telephely_id,
      user_id: user_id || '',
      source: 'protocol',
      protocol_id: protocol.id,
      protocol_name: protocol.name,
      status: 'pending',
      attempt: 1,
      max_attempts: MAX_ATTEMPTS,
    }));

    const { data: insertedJobs, error: jobsError } = await supabase
      .from('rule_generation_jobs')
      .insert(jobRows)
      .select('id, protocol_id, status');

    if (jobsError) {
      console.error('Error inserting jobs:', jobsError);
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'JOB_INSERT_ERROR', message: 'Failed to create job records' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build a map of protocolId -> job row for easy lookup
    // deno-lint-ignore no-explicit-any
    const jobMap = new Map<number, any>();
    for (const job of (insertedJobs || [])) {
      jobMap.set(job.protocol_id, job);
    }

    // 🚀 Start background processing with EdgeRuntime.waitUntil
    EdgeRuntime.waitUntil(
      processWebhooksAndImport(
        batchId,
        eventId,
        telephely_id,
        user_id || '',
        telephelyData,
        kezelesek,
        supabase,
        jobMap,
        regenerate === true,
        resolvedMode
      )
    );

    // 🚀 Return immediately with "started" status + batch_id for polling
    console.log(`[szotar-rules-webhook] Returning immediately, processing continues in background`);
    return new Response(
      JSON.stringify({
        ok: true,
        status: 'started',
        event_id: eventId,
        batch_id: batchId,
        message: regenerate ? 'Újragenerálás elindult háttérben' : 'A feldolgozás elindult háttérben',
        total_protocols: TREATMENT_PROTOCOLS.length,
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in szotar-rules-webhook:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        event_id: eventId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
