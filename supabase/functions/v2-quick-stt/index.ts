// ============================================================
// TreatNote — Lightweight STT endpoint for short voice clips
// Records in browser → sends audio blob → ElevenLabs Scribe → text
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Expect multipart form with audio file
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    if (!audioFile) {
      return new Response(JSON.stringify({ error: 'No audio file provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Forward to ElevenLabs Scribe v2
    const elevenForm = new FormData();
    elevenForm.append('file', audioFile, audioFile.name || 'recording.webm');
    elevenForm.append('model_id', 'scribe_v2');
    elevenForm.append('language_code', 'hun');
    elevenForm.append('tag_audio_events', 'false');
    elevenForm.append('diarize', 'false');

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: elevenForm,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ElevenLabs error: ${res.status} ${body}`);
    }

    const data = await res.json() as Record<string, unknown>;

    return new Response(JSON.stringify({
      transcript: data.text || '',
      language: data.language_code || 'hun',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('STT error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
