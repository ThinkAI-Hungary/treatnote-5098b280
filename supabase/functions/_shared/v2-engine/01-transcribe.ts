// ============================================================
// TreatNote V2 — Pipeline Stage 01: Transcribe (Edge Function version)
// Audio → szöveg (ElevenLabs Scribe v2)
// ============================================================

export interface TranscribeResult {
  transcript: string;
  language: string;
  duration_seconds?: number;
}

/** Transcribe audio buffer using ElevenLabs Scribe v2 */
export async function transcribeAudio(
  audioBuffer: Uint8Array,
  filename: string = 'audio.webm'
): Promise<TranscribeResult> {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY required');
  }

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model_id', 'scribe_v2');
  formData.append('language_code', 'hun');
  formData.append('tag_audio_events', 'false');
  formData.append('diarize', 'false');

  const keyterms = [
    "fémkerámia", "cirkon", "cirkónium", "préskerámia", "aranykerámia",
    "híd", "hídtag", "pillér", "korona", "gyökérkezelés", "gyökértömött",
    "extractio", "foghúzás", "lyukas", "szuvas", "szuvasodás", "tejfog",
    "implant", "implantátum", "csontpótlás", "sinuslift", "depurálás",
    "All-on-4", "All-on-6", "radix", "mobilitás", "tasakmélység", "ínyvisszahúzódás",
    "kopogtatásra érzékeny", "hidegre érzékeny", "melegre érzékeny", "ráharapásra érzékeny",
    "foghány", "barázdazárás", "csonkfelépítés", "inlay", "onlay", "overlay", "héj", "veneer",
    "Zsigmondy", "FDI", "kvadráns",
    "tizenegyes", "tizenkettes", "tizenhármas", "tizennégyes", "tizenötös", "tizenhatos", "tizenhetes", "tizennyolcas",
    "huszonegyes", "huszonkettes", "huszonhármas", "huszonnégyes", "huszonötös", "huszonhatos", "huszonhetes", "huszonnyolcas",
    "harmincegyes", "harminckettes", "harminchármas", "harmincnégyes", "harmincötös", "harminchatos", "harminchetes", "harmincnyolcas",
    "negyvenegyes", "negyvenkettes", "negyvenhármas", "negyvennégyes", "negyvenötös", "negyvenhatos", "negyvenhetes", "negyvennyolcas"
  ];
  keyterms.forEach(term => formData.append('keyterms', term));

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs Scribe error: ${res.status} ${body}`);
  }

  const data = await res.json() as Record<string, unknown>;

  return {
    transcript: data.text as string,
    language: (data.language_code as string) || 'hun',
    duration_seconds: data.duration as number | undefined,
  };
}

/** Direct text input (bypass transcription) */
export function textInput(text: string): TranscribeResult {
  return { transcript: text, language: 'hu' };
}
