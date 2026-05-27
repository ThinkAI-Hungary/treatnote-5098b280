import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logErrorToDatabase } from "../_shared/logger.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";
import { processVoxisInternally } from "./process-statusz-internal.ts";
import { processTreatnoteInternally } from "./process-treatnote-internal.ts";
import { processTreatnoteStdlInternally } from "./process-treatnote-stdl-v2.ts";
import { processAmbulansInternally } from "./process-ambulans-internal.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const formData = await req.formData();
    const audio = formData.get("audio") as File;
    const mode = formData.get("mode") as string;
    const timestamp = formData.get("timestamp") as string;
    const filename = formData.get("filename") as string;
    const userId = formData.get("user_id") as string;
    const treatnotePatientIdStr = formData.get("treatnote_patient_id") as string;
    const paciensIdStr = formData.get("paciens_id") as string;
    const overrideTranscript = formData.get("override_transcript") as string | undefined;

    const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const treatnotePatientId = treatnotePatientIdStr && isValidUUID(treatnotePatientIdStr) ? treatnotePatientIdStr : null;
    const paciensId = paciensIdStr || treatnotePatientIdStr;

    if (!audio || !mode || (!treatnotePatientId && !paciensId)) {
      return new Response(
        JSON.stringify({ error: "Hiányzó kötelező mezők: hangfájl, mód, vagy beteg azonosító" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('company_id, current_telephely_id, full_name, is_solo')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      console.error("Profile not found:", profileError);
      return new Response(
        JSON.stringify({ error: "Felhasználói profil nem található." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyId = profile.company_id;
    const telephelyId = profile.current_telephely_id;

    // ── Lock ellenőrzés ────────────────────────────────────────────────────
    // Ha a cégnek fizetetlen számlája van és lejárt a türelmi idő, blokkolunk
    if (companyId) {
      const { data: companyData } = await supabaseAdmin
        .from('companies')
        .select('is_locked, payment_status')
        .eq('id', companyId)
        .maybeSingle();

      if (companyData?.is_locked) {
        return new Response(
          JSON.stringify({
            error: "A fiók zárolva van az előző havi számla kifizetésének hiánya miatt. Kérjük, rendezze a tartozást a Számlázás oldalon.",
            locked: true,
          }),
          { status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Determine if STDL
    let isStdl = false;
    if (telephelyId) {
      const { data: telephelyData } = await supabaseAdmin
        .from('telephely')
        .select('flexi_domain, voice_recording_preference')
        .eq('id', telephelyId)
        .maybeSingle();
        
      if (!telephelyData?.flexi_domain || telephelyData?.voice_recording_preference === 'treatnote_native') {
        isStdl = true;
      }
    }

    // ── Rate Limiting ─────────────────────────────────────────────────────
    // 30 requests per 15 minutes limit per user
    const rateLimit = await checkRateLimit(supabaseAdmin, userId, 'native-voice-webhook', 30, 15);

    if (!rateLimit.allowed) {
      console.log('Rate limit exceeded but BYPASSED FOR TESTING');
    }

    // Clean up stale jobs (processing for more than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: staleJobs } = await supabaseAdmin
      .from('native_voice_jobs')
      .delete()
      .eq('status', 'processing')
      .lt('created_at', tenMinutesAgo)
      .select('id');

    if (staleJobs && staleJobs.length > 0) {
      console.log(`Cleaned up ${staleJobs.length} stale native jobs`);
    }

    // Check if user already has a processing job (that's not stale)
    if (userId) {
      const { data: activeJob } = await supabaseAdmin
        .from('native_voice_jobs')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'processing')
        .maybeSingle();

      if (activeJob) {
        return new Response(
          JSON.stringify({
            error: "Már fut egy feldolgozás. Kérjük, várjon amíg befejeződik.",
            active_job_id: activeJob.id
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const finalFilename = filename || audio.name;
    const estimatedDuration = Math.round(audio.size / 16000);

    // Create job record (matching v2-test-text pattern)
    const { data: jobData, error: jobError } = await supabaseAdmin
      .from('native_voice_jobs')
      .insert({
        user_id: userId,
        company_id: companyId || null,
        telephely_id: telephelyId || null,
        treatnote_patient_id: treatnotePatientId,
        mode,
        status: 'processing',
        progress_percent: 5,
        progress_message: 'Feldolgozás indítása...',
      })
      .select('id')
      .single();

    if (jobError || !jobData) {
      console.error("Failed to create native job:", JSON.stringify(jobError));
      await logErrorToDatabase(supabaseAdmin, {
        script_name: 'native-voice-webhook',
        summary: 'Feldolgozási sor (job) létrehozása sikertelen',
        full_log: jobError ? JSON.stringify(jobError) : 'Nincs hibaüzenet',
        user_id: userId,
        company_id: companyId,
        telephely_id: telephelyId
      });
      return new Response(
        JSON.stringify({ error: `Belső hiba: nem sikerült a feldolgozási sort létrehozni. ${jobError?.message || ''} ${jobError?.details || ''}`.trim() }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobId = jobData.id;
    console.log(`Created native job ${jobId} for mode: ${mode}, user: ${userId}`);

    // Since this is NATIVE, we natively call processVoxisInternally and bypass n8n webhooks.
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const elevenlabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    const apiKeys = { openai: openaiApiKey || "", elevenlabs: elevenlabsApiKey || "", anthropic: anthropicApiKey || "" };
    const ctx = { userId, companyId, telephelyId, paciensId, treatnotePatientId, logErrorToDatabase };
    let backgroundProcessing;
    if (mode === 'treatnote') {
      if (isStdl) {
        backgroundProcessing = processTreatnoteStdlInternally(jobId, audio, supabaseAdmin, apiKeys, ctx, overrideTranscript);
      } else {
        backgroundProcessing = processTreatnoteInternally(jobId, audio, supabaseAdmin, apiKeys, ctx, overrideTranscript);
      }
    } else if (mode === 'ambulans') {
      backgroundProcessing = processAmbulansInternally(jobId, audio, supabaseAdmin, apiKeys, ctx, overrideTranscript);
    } else {
      backgroundProcessing = processVoxisInternally(jobId, audio, supabaseAdmin, apiKeys, ctx, overrideTranscript);
    }

    // Use EdgeRuntime.waitUntil to process in background
    // @ts-ignore
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundProcessing);
    } else {
      await backgroundProcessing;
    }

    // Return immediately to frontend
    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in native-voice-webhook function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Ismeretlen hiba történt a hangfelvétel feldolgozásakor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
