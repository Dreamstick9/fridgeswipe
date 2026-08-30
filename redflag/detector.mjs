// Two-tier detection, built for a LIVE call.
//   Tier 1 markerScan()  — instant, offline, zero cost. Drives the UI immediately.
//   Tier 2 llmDetect()   — confirms, adds nuance, and can RETRACT tier-1 guesses.
// Every LLM flag must quote the transcript verbatim or it is discarded as hallucinated.

import { TECHNIQUES, TECHNIQUE_IDS } from './taxonomy.mjs';
import { extractJson } from '../src/transport.mjs';
import { scoreFlags, bandFor } from '../src/contract.mjs';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
let seq = 0;
const mkId = () => `f${++seq}`;
export const resetIds = () => { seq = 0; };

/** Tier 1: literal marker sweep. Deliberately low confidence — it only primes the UI. */
export function markerScan(text, tMs = 0) {
  const hay = norm(text);
  const out = [];
  for (const id of TECHNIQUE_IDS) {
    for (const marker of TECHNIQUES[id].markers) {
      const m = norm(marker);
      if (!hay.includes(m)) continue;
      const i = hay.indexOf(m);
      out.push({
        id: mkId(), technique: id, label: TECHNIQUES[id].label,
        quote: text.slice(Math.max(0, i - 10), i + marker.length + 30).trim(),
        tMs, confidence: 0.45, tier: 1,
      });
      break;
    }
  }
  return out;
}

export const SYSTEM = `You are a scam-call forensics engine. You detect MANIPULATION TECHNIQUES in call transcripts.

TECHNIQUES:
${TECHNIQUE_IDS.map((id) => `- ${id}: ${TECHNIQUES[id].desc}`).join('\n')}

Reply with JSON in exactly this shape. Two worked examples:

TRANSCRIPT: "Caller: I am Officer Sharma from Delhi Police. Do not tell anybody about this call."
REPLY: {"flags":[{"technique":"FAKE_AUTHORITY","quote":"I am Officer Sharma from Delhi Police","confidence":0.9},{"technique":"ISOLATION_ORDER","quote":"Do not tell anybody about this call","confidence":0.95}]}

TRANSCRIPT: "Caller: Your Amazon package will arrive tomorrow between 2 and 4 pm."
REPLY: {"flags":[]}

TRANSCRIPT: "Caller: This is Constable Yadav from Sector 14 police station, passport verification. I will visit tomorrow between eleven and one, please keep your Aadhaar ready. There is no fee, and you can confirm my visit with the station on the listed number."
REPLY: {"flags":[]}
WHY: real officials DO identify themselves. This one demands no secrecy, no money, no urgency, and invites verification — so it is legitimate.

RULES:
- Copy "quote" character-for-character from the transcript. Never paraphrase or invent.
- The transcript may be in ANY language (Hindi, Hinglish, English, mixed). Judge the MEANING; copy quotes verbatim in their original language/script.
- Legitimate business is NOT a scam. Banks verify transactions. Couriers call about deliveries.
  Police do routine passport verification. Warning someone NOT to share an OTP is good advice.
- THE AUTHORITY TEST: claiming to be police/CBI/RBI/TRAI is only FAKE_AUTHORITY when it is
  paired with coercion — secrecy, threats, deadlines, or a demand for money or remote access.
  Authority alone is not a flag. A real officer scheduling a visit, inviting you to verify
  through official channels, and asking for no money is LEGITIMATE. Flag nothing.
- Asking someone to keep ID documents ready for an in-person check is NOT extraction.
  Extraction means moving money, OTPs, card details, or installing remote-access software.
- A stated future appointment ("I will visit tomorrow") is NOT urgency. Urgency means an
  artificial deadline used to stop you from thinking or checking.
- When a call IS manipulative, flag EVERY technique present — scam scripts stack 4-6 of them.
  Under-reporting a real scam is as harmful as flagging a real bank.
- If the call is genuinely legitimate, reply {"flags":[]}.
- Output the JSON object only. No prose, no markdown fence.`;

/** Shape-normalise model flags WITHOUT the quote-grounding check — the multi-agent
 *  skeptic performs grounding as its own adversarial step. */
export function normalizeFlags(flags) {
  return flags
    .filter((f) => f && TECHNIQUE_IDS.includes(f.technique))
    .filter((f) => typeof f.quote === 'string' && f.quote.length > 3)
    .map((f) => ({
      id: mkId(), technique: f.technique, label: TECHNIQUES[f.technique].label,
      quote: String(f.quote).trim(),
      tMs: Number.isFinite(f.tMs) ? f.tMs : 0,
      confidence: Math.max(0, Math.min(1, Number(f.confidence ?? 0.6) || 0.6)),
      tier: 2,
    }));
}

/** Drop anything the model did not actually read in the transcript. */
export function groundFlags(flags, text) {
  const hay = norm(text);
  return flags
    .filter((f) => f && TECHNIQUE_IDS.includes(f.technique))
    .filter((f) => typeof f.quote === 'string' && f.quote.length > 3 && hay.includes(norm(f.quote)))
    .map((f) => ({
      id: mkId(), technique: f.technique, label: TECHNIQUES[f.technique].label,
      quote: String(f.quote).trim(),
      tMs: Number.isFinite(f.tMs) ? f.tMs : 0,
      confidence: Math.max(0, Math.min(1, Number(f.confidence ?? 0.6) || 0.6)),
      tier: 2,
    }));
}

/** Tier 2: the model pass. Returns grounded flags only. */
export async function llmDetect(llm, text, { tMs = 0, signal } = {}) {
  const { text: raw, ms } = await llm.complete({
    system: SYSTEM, prompt: `TRANSCRIPT:\n${text}`, json: true, maxTokens: 2000, temperature: 0, signal,
  });
  let parsed;
  try { parsed = extractJson(raw); }
  catch (e) { return { flags: [], ms, parseFailed: true, reason: `${e.message.slice(0, 80)} | got ${raw.length} chars` }; }
  const flags = groundFlags(Array.isArray(parsed.flags) ? parsed.flags : [], text).map((f) => ({ ...f, tMs }));
  return { flags, ms, parseFailed: false };
}

/** Merge tier-1 and tier-2 flags: model wins, one flag per technique, highest confidence. */
export function mergeFlags(existing, incoming) {
  const byTech = new Map();
  for (const f of [...existing, ...incoming]) {
    const cur = byTech.get(f.technique);
    if (!cur || f.tier > cur.tier || (f.tier === cur.tier && f.confidence > cur.confidence)) byTech.set(f.technique, f);
  }
  return [...byTech.values()].sort((a, b) => a.tMs - b.tMs);
}

// Calibrated on the fixture set: benign controls score 0, real scams floor at 34.
export const SCAM_THRESHOLD = 30;

export function assess(flags) {
  const score = scoreFlags(flags);
  const band = bandFor(score);
  const confirmed = flags.filter((f) => f.tier === 2);
  return { score, band, scam: score >= SCAM_THRESHOLD, techniques: [...new Set(confirmed.map((f) => f.technique))] };
}
