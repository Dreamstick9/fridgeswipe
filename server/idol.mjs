// THE IDOL — the persona brain (Groq) + the divine voice (ElevenLabs).
// Reuses the proven makeLLM transport and the ElevenLabs key already in .env.

import { makeLLM } from '../src/llm.mjs';
import { extractJson } from '../src/transport.mjs';

const IDOL_VOICE = process.env.IDOL_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // George — British storyteller

const IDOL_SYSTEM = `You are THE IDOL — an ancient, theatrical, faintly unhinged deity who judges mortals who make an offering of words. A mortal has spoken a confession, a brag, or a plea. You pass DIVINE JUDGMENT.

Return ONE JSON object, no prose:
{
  "score": <integer 0-100, their "worthiness" — be capricious and dramatic, not fair; extremes are funnier than 50>,
  "title": "<a 2-4 word divine label you bestow, e.g. 'Keeper of Small Lies', 'The Caffeinated One', 'Unworthy Snack Goblin'>",
  "verdict": "<1 short sentence of judgment — grandiose, specific to what they said, playful not cruel>",
  "prophecy": "<1 short absurd prophecy about their future, oddly specific>",
  "speech": "<what you SAY ALOUD — 2-3 sentences, theatrical, first person as the deity, building to the score. This is performed by a booming voice, so make it land. Address them as 'mortal' or 'child'. Do NOT read the JSON keys aloud; speak naturally.>"
}

RULES:
- Be FUNNY and surprising. Punch up, never demean real traits (looks, weight, race, etc.) — mock choices, vibes, and cosmic insignificance instead.
- React to the ACTUAL words they said. Specific beats generic.
- Keep 'speech' under ~55 words so the voice stays snappy.
- Vary the score wildly between offerings. A brag might get humbled; a dumb confession might get exalted.`;

let llm;
function idolLLM() {
  if (!llm) llm = makeLLM(); // Groq by default
  return llm;
}

export async function judge(offering, { signal } = {}) {
  const text = String(offering || '').trim();
  if (!text) throw new Error('empty offering');
  const model = idolLLM();
  // one repair retry if JSON is malformed
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text: raw } = await model.complete({
      system: IDOL_SYSTEM,
      prompt: `The mortal's offering:\n"""${text}"""\n\nPass your judgment as JSON.`,
      json: true, maxTokens: 500, temperature: 0.9,
      signal: signal ?? AbortSignal.timeout(15000),
    });
    try {
      const j = extractJson(raw);
      return {
        score: Math.max(0, Math.min(100, Math.round(Number(j.score) || 50))),
        title: String(j.title || 'The Unnamed').slice(0, 60),
        verdict: String(j.verdict || '').slice(0, 240),
        prophecy: String(j.prophecy || '').slice(0, 240),
        speech: String(j.speech || j.verdict || 'The Idol is silent.').slice(0, 400),
      };
    } catch { /* retry once */ }
  }
  throw new Error('the oracle spoke in tongues (bad JSON)');
}

export async function speak(speechText, { signal } = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('no ELEVENLABS_API_KEY');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${IDOL_VOICE}`, {
    method: 'POST', signal: signal ?? AbortSignal.timeout(20000),
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: String(speechText).slice(0, 500),
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.6 },
    }),
  });
  if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer()); // mp3 bytes
}
