// ============================================================
// TreatNote V2 — Pipeline Stage 01: Transcribe
// Audio → szöveg (ElevenLabs Scribe v2)
// ============================================================

import 'dotenv/config';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

export interface TranscribeResult {
  transcript: string;
  language: string;
  duration_seconds?: number;
}

/** Transcribe audio buffer using ElevenLabs Scribe v2 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = 'audio.webm'
): Promise<TranscribeResult> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY required in .env');
  }

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model_id', 'scribe_v2');
  formData.append('language_code', 'hun');
  formData.append('tag_audio_events', 'false');
  formData.append('diarize', 'false');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs Scribe error: ${res.status} ${body}`);
  }

  const data = await res.json() as any;

  return {
    transcript: data.text,
    language: data.language_code || 'hun',
    duration_seconds: data.duration,
  };
}

/** Direct text input (bypass transcription) */
export function textInput(text: string): TranscribeResult {
  return { transcript: text, language: 'hu' };
}
