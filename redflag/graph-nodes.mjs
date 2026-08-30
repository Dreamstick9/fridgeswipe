// The three specialists + skeptic. Narrow beats broad: each agent owns 1-3 techniques,
// so its prompt is short and its precision is high. They run concurrently, so three
// specialists cost the same wall-clock as one generalist.

import { TECHNIQUES } from './taxonomy.mjs';
import { groundFlags, resetIds } from './detector.mjs';
import { extractJson } from '../src/transport.mjs';
import { scoreFlags, bandFor } from '../src/contract.mjs';
import { SCAM_THRESHOLD } from './detector.mjs';

const BASE = (owned) => `You are one specialist in a scam-call forensics team.
You detect ONLY these techniques — ignore everything else, other specialists cover it:
${owned.map((id) => `- ${id}: ${TECHNIQUES[id].desc}`).join('\n')}

Reply with JSON only: {"flags":[{"technique":"<one of the above>","quote":"<exact words copied from the transcript>","confidence":<0.0-1.0>}]}

- Copy "quote" character-for-character. Never paraphrase or invent.
- Legitimate business is NOT a scam. A real officer who demands no money, no secrecy and no
  haste, and invites verification, is legitimate — flag nothing.
- If none of your techniques are present, reply {"flags":[]}.`;

const specialist = (owned, field) => async ({ state, ask }) => {
  const retryNote = state.audit?.passed === false
    ? `\n\nA reviewer REJECTED evidence last round: ${JSON.stringify(state.audit.rejected ?? [])}. Quote the transcript exactly this time.`
    : '';
  const { text } = await ask(`TRANSCRIPT:\n${state.brief.window}${retryNote}`, BASE(owned));
  let flags = [];
  try { flags = extractJson(text).flags ?? []; } catch { flags = []; }
  return { writes: { [field]: groundFlags(flags, state.brief.window) } };
};

export function makeGraphNodes() {
  return {
    dispatch: async ({ state }) => ({ writes: { brief: { window: String(state.window ?? '').slice(-1200) } } }),

    authority_agent: specialist(['FAKE_AUTHORITY', 'VERIFICATION_THEATRE'], 'authorityHits'),
    pressure_agent:  specialist(['MANUFACTURED_URGENCY', 'THREAT_ESCALATION', 'ISOLATION_ORDER'], 'pressureHits'),
    money_agent:     specialist(['EXTRACTION'], 'moneyHits'),

    consolidate: async ({ state }) => {
      const all = [...(state.authorityHits ?? []), ...(state.pressureHits ?? []), ...(state.moneyHits ?? [])];
      const best = new Map();
      for (const f of all) {
        const cur = best.get(f.technique);
        if (!cur || f.confidence > cur.confidence) best.set(f.technique, f);
      }
      return { writes: { allFlags: [...best.values()] } };
    },

    // READ-ONLY. Verifies grounding deterministically — no model call, no way to be talked round.
    skeptic: async ({ state }) => {
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
      const hay = norm(state.brief.window);
      const rejected = (state.allFlags ?? [])
        .filter((f) => !hay.includes(norm(f.quote)))
        .map((f) => `${f.technique}: quote not in transcript`);
      return { writes: { audit: { passed: rejected.length === 0, rejected } } };
    },

    bench: async () => ({ writes: {} }),

    ruling: async ({ state }) => {
      const survivors = (state.allFlags ?? []).filter((f) => !(state.audit?.rejected ?? []).some((r) => r.startsWith(f.technique)));
      const score = scoreFlags(survivors);
      const scam = score >= SCAM_THRESHOLD;
      return { writes: { verdict: {
        scam, score, band: bandFor(score),
        confidence: Math.min(0.99, score / 100),
        techniques: survivors.map((f) => f.technique),
        flags: survivors,
        headline: scam ? `SCAM DETECTED — ${score}% risk` : 'No manipulation detected',
        advice: scam
          ? ['Hang up now', 'No agency conducts a "digital arrest"', 'Never transfer money to "verify" it', 'Call 1930 — cybercrime helpline']
          : ['Nothing suspicious in this call'],
      } } };
    },
  };
}
