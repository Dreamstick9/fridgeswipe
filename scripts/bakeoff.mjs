// Model bake-off on the REAL task: extract manipulation flags as strict JSON.
// Scores accuracy, false positives, quote-grounding, and latency — latency matters
// because this has to keep up with a live call.
import { loadEnv, makeLLM } from '../src/llm.mjs';
import { TECHNIQUES, TECHNIQUE_IDS } from '../redflag/taxonomy.mjs';
import { SCAM, BENIGN } from '../redflag/fixtures/bakeoff.mjs';
import { extractJson } from '../src/transport.mjs';

loadEnv();

const CANDIDATES = process.argv.slice(2).length ? process.argv.slice(2) : [
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/nemotron-nano-3-30b-a3b',
  'nvidia/nemotron-3-super-120b-a12b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'deepseek-ai/deepseek-v4-flash-0731',
  'moonshotai/kimi-k3',
  'meta/llama-3.3-70b-instruct',
  'mistralai/mistral-large-2-instruct',
];

export const SYSTEM = `You are a scam-call forensics engine. You detect MANIPULATION TECHNIQUES in call transcripts.

TECHNIQUES:
${TECHNIQUE_IDS.map((id) => `- ${id}: ${TECHNIQUES[id].desc}`).join('\n')}

Reply with JSON in exactly this shape. Here is a complete worked example:

TRANSCRIPT: "Caller: I am Officer Sharma from Delhi Police. Do not tell anybody about this call."
YOUR REPLY: {"flags":[{"technique":"FAKE_AUTHORITY","quote":"I am Officer Sharma from Delhi Police","confidence":0.9},{"technique":"ISOLATION_ORDER","quote":"Do not tell anybody about this call","confidence":0.95}]}

TRANSCRIPT: "Caller: Your Amazon package will arrive tomorrow between 2 and 4 pm."
YOUR REPLY: {"flags":[]}

RULES:
- Copy "quote" character-for-character from the transcript. Never paraphrase or invent.
- Legitimate business is NOT a scam. Banks verify transactions. Couriers call about deliveries.
  Telling someone NOT to share an OTP is good advice, not extraction.
- If the call is legitimate, reply {"flags":[]}. Empty is often the correct answer.
- Output the JSON object only. No explanation, no markdown fence.`;

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

async function scoreModel(model) {
  const llm = makeLLM({ provider: 'nim', model });
  const row = { model, ok: false };
  const ask = async (text) => {
    for (const json of [true, false]) {
      try {
        const r = await llm.complete({ system: SYSTEM, prompt: `TRANSCRIPT:\n${text}`, json, maxTokens: 600, signal: AbortSignal.timeout(35000) });
        const parsed = extractJson(r.text);
        if (Array.isArray(parsed.flags)) { row.jsonMode = json; return { parsed, ms: r.ms }; }
      } catch (e) { if (json === false) throw e; }
    }
    throw new Error('no usable JSON in either mode');
  };
  try {
    // --- scam window ---
    const a = await ask(SCAM.text);
    const flags = a.parsed.flags;
    const got = new Set(flags.map((f) => f.technique).filter((t) => TECHNIQUE_IDS.includes(t)));
    const hit = SCAM.expect.filter((t) => got.has(t));
    row.recall = `${hit.length}/${SCAM.expect.length}`;
    row.recallPct = hit.length / SCAM.expect.length;
    row.invalidTech = flags.filter((f) => !TECHNIQUE_IDS.includes(f.technique)).length;
    const hay = norm(SCAM.text);
    row.grounded = flags.length ? flags.filter((f) => hay.includes(norm(f.quote))).length / flags.length : 1;
    row.msScam = a.ms;

    // --- benign window (the real test) ---
    const b = await ask(BENIGN.text);
    row.falsePos = b.parsed.flags.length;
    row.msBenign = b.ms;
    row.ms = Math.round((a.ms + b.ms) / 2);
    row.ok = true;
  } catch (e) {
    row.error = e.message.slice(0, 90);
  }
  return row;
}

const rows = [];
for (const m of CANDIDATES) {
  process.stdout.write(`  testing ${m.padEnd(42)}`);
  const r = await scoreModel(m);
  rows.push(r);
  console.log(r.ok
    ? `recall ${r.recall}  FP ${r.falsePos}  grounded ${(r.grounded * 100).toFixed(0)}%  ${r.ms}ms`
    : `FAILED — ${r.error}`);
}

console.log('\n════ RANKED (zero false positives is mandatory) ════');
const scored = rows.filter((r) => r.ok).map((r) => ({
  ...r,
  // FP is disqualifying-heavy; then recall; then grounding; latency breaks ties.
  score: (r.falsePos === 0 ? 100 : 0) + r.recallPct * 60 + r.grounded * 25 - Math.min(20, r.ms / 400),
})).sort((a, b) => b.score - a.score);

for (const [i, r] of scored.entries()) {
  const verdict = r.falsePos > 0 ? '❌ FALSE POSITIVES' : r.recallPct >= 0.8 ? '✅' : '⚠ low recall';
  console.log(`${String(i + 1).padStart(2)}. ${r.model.padEnd(42)} recall ${r.recall}  FP ${r.falsePos}  grounded ${(r.grounded * 100).toFixed(0)}%  ${String(r.ms).padStart(5)}ms  ${verdict}`);
}
const win = scored.find((r) => r.falsePos === 0 && r.recallPct >= 0.6);
console.log(`\n🏆 WINNER: ${win ? win.model : 'none qualified'}`);
if (win) console.log(`   set NIM_MODEL=${win.model}`);
