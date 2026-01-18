import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Webhook URLs
const PRIMARY_WEBHOOK_URL = "https://n8n.thinkaimedical.hu/webhook/99f5b5e4-6e0e-49d1-9277-da2d08d7fd85";
const SECONDARY_WEBHOOK_URL = "https://n8n.thinkaimedical.hu/webhook-test/99f5b5e4-6e0e-49d1-9277-da2d08d7fd85";

// 13 előre definiált kezelési protokoll
const TREATMENT_PROTOCOLS = [
  {
    id: 1,
    category: "Diagnosztika és Higiénia",
    name: "Állapotfelmérés és Fogkőeltávolítás (Komplex)",
    protocol: "1. Vizit (Egyetlen alkalom):\n- Anamnézis, panaszok egyeztetése.\n- Teljes szájüregi vizsgálat.\n- Panoráma röntgen készítése.\n- Ultrahangos fogkőeltávolítás (depurálás) íny alatt és felett.\n- Homokfúvás (Air-flow) az elszíneződések ellen.\n- Polírozás pasztával."
  },
  {
    id: 2,
    category: "Parodontológia",
    name: "Parodontális zárt kürett (Mélytisztítás)",
    protocol: "Kezelés 2 alkalommal (állcsontonként):\n1. Vizit (pl. Felső állcsont):\n- Érzéstelenítés.\n- Tasakmélységek mérése szondával (státusz).\n- Íny alatti tisztítás kézi műszerekkel (kürett), gyulladt szövet eltávolítása.\n- Fertőtlenítő átöblítés.\n2. Vizit (pl. Alsó állcsont):\n- Ugyanaz a folyamat a másik állcsonton 1-2 nap múlva."
  },
  {
    id: 3,
    category: "Konzerváló Fogászat",
    name: "Esztétikus Tömés (Nagyőrlő)",
    protocol: "1. Vizit (Egyetlen alkalom):\n- Érzéstelenítés (pl. QuickSleeper).\n- Szuvas rész eltávolítása, üreg alakítása.\n- Izolálás (Kofferdam).\n- Bondozás és rétegzéses tömés (kompozit) több felszínre.\n- Kidolgozás, magasság beállítás, polírozás."
  },
  {
    id: 4,
    category: "Konzerváló Fogászat",
    name: "Mikroszkópos Gyökérkezelés (3-4 csatorna)",
    protocol: "Kezelés 2-3 alkalommal:\n1. Vizit:\n- Diagnosztika (CT vagy kusröntgen).\n- Érzéstelenítés, Trepanálás (megnyitás).\n- Idegek eltávolítása, csatornahossz mérése.\n- Gépi tágítás mikroszkóp alatt.\n- Gyógyszeres lezárás.\n2. Vizit:\n- Csatornák átöblítése.\n- Végleges gyökértömés (guttapercha).\n- Kontroll röntgen.\n- Fedőtömés vagy csap előkészítés."
  },
  {
    id: 5,
    category: "Gyermekfogászat",
    name: "Barázdazárás",
    protocol: "1. Vizit (Fúrás nélkül):\n- Rágófelszín tisztítása kefével/levegővel.\n- Barázdák kondicionálása (savazás).\n- Folyékony barázdazáró anyag befolyatása.\n- UV lámpás megvilágítás."
  },
  {
    id: 6,
    category: "Fogpótlás",
    name: "Cirkon Korona (Szóló)",
    protocol: "Kezelés 3 alkalommal:\n1. Vizit:\n- Érzéstelenítés, fog lecsiszolása (vállas előkészítés).\n- Precíziós lenyomatvétel (szilikon vagy digitális scan).\n- Ideiglenes műanyag korona készítése és felragasztása.\n2. Vizit:\n- Vázpróba (opcionális).\n3. Vizit:\n- A kész cirkon korona beragasztása végleges cementtel.\n- Harapás beállítása."
  },
  {
    id: 7,
    category: "Fogpótlás",
    name: "Héjkerámia (E-max Veneer)",
    protocol: "Kezelés 2-3 alkalommal:\n1. Vizit:\n- Mosolytervezés, fotózás.\n- Minimális csiszolás a fog elülső felszínéből.\n- Lenyomatvétel.\n- Ideiglenes héj felhelyezése.\n2. Vizit:\n- A vékony kerámia héjak speciális ragasztása.\n- Polírozás."
  },
  {
    id: 8,
    category: "Fogpótlás",
    name: "Éjszakai Harapásemelő Sín",
    protocol: "Kezelés 2 alkalommal:\n1. Vizit:\n- Tanulmányi lenyomatvétel (alsó/felső).\n2. Vizit:\n- A labor által elkészített átlátszó sín átadása, illeszkedés ellenőrzése."
  },
  {
    id: 9,
    category: "Szájsebészet",
    name: "Foghúzás (Egyszerű)",
    protocol: "1. Vizit:\n- Érzéstelenítés.\n- Fog eltávolítása fogóval/emelővel.\n- Sebkitisztítás (kürett).\n- Tamponra harapás (varrat általában nem szükséges)."
  },
  {
    id: 10,
    category: "Szájsebészet",
    name: "Fogimplantátum beültetés (Műtéti fázis)",
    protocol: "Kezelés több lépésben:\n1. Vizit (Műtét):\n- Steril előkészületek.\n- Érzéstelenítés, íny feltárása.\n- Implantátum (csavar) behajtása a csontba.\n- Íny összevarrása.\n- (3-6 hónap gyógyulás után következik a felszabadítás)."
  },
  {
    id: 11,
    category: "Szájsebészet / Protetika",
    name: "Implantátum Korona (Protetikai fázis)",
    protocol: "A gyógyulás után:\n1. Vizit:\n- Implantátum felszabadítása, ínyformázó csavar behelyezése.\n2. Vizit:\n- Lenyomatvétel a felépítményhez (fejhez).\n3. Vizit:\n- A kész korona rácsavarozása vagy ragasztása az implantátumra."
  },
  {
    id: 12,
    category: "Esztétika",
    name: "Rendelői Fogfehérítés",
    protocol: "1. Vizit (kb 1.5-2 óra):\n- Ínyvédő gél felvitele.\n- Fehérítő anyag felvitele a fogakra 3x15 perc ciklusban.\n- LED lámpás aktiválás.\n- Érzékenységcsökkentő ecsetelés.\n- (Gyakran adnak mellé otthoni fenntartó sínt)."
  },
  {
    id: 13,
    category: "Fogszabályozás",
    name: "Rögzített Fogszabályozó (Felhelyezés)",
    protocol: "Folyamat:\n1. Vizit:\n- Teleröntgen, fotók, lenyomat.\n2. Vizit:\n- Fogak polírozása.\n- Brekettek (tappancsok) felragasztása egyenként.\n- Drótív bekötése."
  }
];

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
  trigger_words?: string[] | Record<string, string>;
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
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout per protocol
  
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
      console.error(`[Protocol ${protocolId}] Timeout after 30s`);
      return { success: false, protocolId, protocolName, error: 'Timeout' };
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Protocol ${protocolId}] Network error: ${errorMsg}`);
    return { success: false, protocolId, protocolName, error: errorMsg };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const eventId = generateUUID();
  console.log(`[szotar-rules-webhook] Starting with event_id: ${eventId}`);
  console.log(`[szotar-rules-webhook] Will send ${TREATMENT_PROTOCOLS.length} parallel webhook calls`);

  try {
    // Parse request body
    const body = await req.json();
    const { telephely_id, user_id } = body;

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

    const timestamp = new Date().toISOString();

    // Create 13 parallel webhook calls - one for each protocol
    console.log('Starting 13 parallel webhook calls...');
    
    const webhookPromises = TREATMENT_PROTOCOLS.map((protocol) => {
      const payload: ProtocolPayload = {
        version: '2.0', // New version for parallel protocol architecture
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
      };

      // Try primary webhook first, fall back to secondary
      return callProtocolWebhook(PRIMARY_WEBHOOK_URL, payload, protocol.id, protocol.name)
        .then(result => {
          if (!result.success) {
            console.log(`[Protocol ${protocol.id}] Primary failed, trying secondary...`);
            return callProtocolWebhook(SECONDARY_WEBHOOK_URL, payload, protocol.id, protocol.name);
          }
          return result;
        });
    });

    // Wait for all webhooks to complete
    const results = await Promise.all(webhookPromises);

    // Log summary
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    console.log(`Webhook results: ${successCount} success, ${failedCount} failed`);

    // If all failed, return error
    if (successCount === 0) {
      const errors = results.map(r => `${r.protocolName}: ${r.error}`).join('; ');
      return new Response(
        JSON.stringify({ 
          ok: false, 
          status: 'error', 
          code: 'ALL_WEBHOOKS_FAILED', 
          message: errors,
          event_id: eventId 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process all successful responses and insert into database
    let totalInserted = 0;
    let totalDuplicates = 0;
    let totalErrors = 0;

    for (const result of results) {
      if (!result.success || !result.response?.extractions) {
        continue;
      }

      const extractions = result.response.extractions;
      
      for (const extraction of extractions) {
        if (!extraction.fogalom) {
          console.log(`[Protocol ${result.protocolId}] Skipping extraction without fogalom`);
          totalErrors++;
          continue;
        }

        // Parse trigger words - handle various formats
        let triggerWords: string[] = [];
        if (extraction.trigger_words) {
          if (Array.isArray(extraction.trigger_words)) {
            triggerWords = extraction.trigger_words;
          } else if (typeof extraction.trigger_words === 'object') {
            triggerWords = Object.values(extraction.trigger_words).filter(v => typeof v === 'string') as string[];
          }
        }

        console.log(`[Protocol ${result.protocolId}] Inserting: ${extraction.fogalom}`);

        // Insert into treatment_rules
        const { data: ruleData, error: ruleError } = await supabase
          .from('treatment_rules')
          .insert({
            clinic_id: telephely_id,
            name: extraction.fogalom,
            category: extraction.kategoria || result.response.extractions[0]?.kategoria || null,
            trigger_words: triggerWords,
          })
          .select('id')
          .single();

        if (ruleError) {
          if (ruleError.code === '23505') {
            console.log(`[Protocol ${result.protocolId}] Duplicate: ${extraction.fogalom}`);
            totalDuplicates++;
            continue;
          } else {
            console.error(`[Protocol ${result.protocolId}] Rule insert error:`, ruleError);
            totalErrors++;
            continue;
          }
        }

        // Insert visits and items
        const visits = extraction.parsed?.visits || [];
        for (let vi = 0; vi < visits.length; vi++) {
          const visit = visits[vi];

          const { data: visitData, error: visitError } = await supabase
            .from('rule_visits')
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

            const { error: itemsError } = await supabase
              .from('rule_items')
              .insert(itemsToInsert);

            if (itemsError) {
              console.error(`[Protocol ${result.protocolId}] Items insert error:`, itemsError);
            }
          }
        }

        totalInserted++;
      }
    }

    console.log(`Processing complete: ${totalInserted} inserted, ${totalDuplicates} duplicates, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({
        ok: true,
        status: 'processed',
        event_id: eventId,
        inserted: totalInserted,
        duplicates: totalDuplicates,
        errors: totalErrors,
        webhooks_success: successCount,
        webhooks_failed: failedCount,
        total_protocols: TREATMENT_PROTOCOLS.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
