// ElevenLabs text-to-speech for the judge's spoken ruling.
// Returns an mp3 Buffer, or throws — callers treat voice as a garnish, never a dependency.

const DEFAULT_VOICE = 'onwK4e9ZLuTAKqWW03F9'; // Daniel — formal British broadcaster. The deadpan is the joke.
const MODEL_ID = 'eleven_turbo_v2_5';
const TIMEOUT_MS = 20_000;
const MAX_CHARS = 900;

export async function speak(
  text,
  {
    apiKey = process.env.ELEVENLABS_API_KEY,
    voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE,
  } = {},
) {
  if (!apiKey) throw new Error('speak: missing ELEVENLABS_API_KEY');
  const clipped = String(text).slice(0, MAX_CHARS);
  if (!clipped.trim()) throw new Error('speak: empty text');

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: clipped,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.6 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`elevenlabs ${res.status}: ${body.slice(0, 160)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
