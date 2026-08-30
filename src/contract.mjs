// FROZEN EVENT CONTRACT — the single source of truth shared by detector, server and UI.
// Freeze this before parallel work starts; changing it means re-syncing every agent.
import { TECHNIQUE_IDS } from '../redflag/taxonomy.mjs';

export const BANDS = ['calm', 'caution', 'danger', 'critical'];
export const bandFor = (s) => (s >= 80 ? 'critical' : s >= 45 ? 'danger' : s >= 25 ? 'caution' : 'calm');

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, a, b) => isNum(v) && v >= a && v <= b;

export function validateFlag(f) {
  const e = [];
  if (!f || typeof f !== 'object') return ['flag is not an object'];
  if (!isStr(f.id)) e.push('flag.id must be a non-empty string');
  if (!TECHNIQUE_IDS.includes(f.technique)) e.push(`flag.technique must be one of ${TECHNIQUE_IDS.join('|')}`);
  if (!isStr(f.quote)) e.push('flag.quote must be a non-empty string');
  if (!inRange(f.tMs, 0, Infinity)) e.push('flag.tMs must be >= 0');
  if (!inRange(f.confidence, 0, 1)) e.push('flag.confidence must be 0..1');
  return e;
}

export function validateEvent(ev) {
  if (!ev || typeof ev !== 'object') return ['event is not an object'];
  switch (ev.type) {
    case 'transcript':
      return [...(isStr(ev.text) ? [] : ['transcript.text required']),
              ...(inRange(ev.tMs, 0, Infinity) ? [] : ['transcript.tMs required']),
              ...(typeof ev.final === 'boolean' ? [] : ['transcript.final must be boolean'])];
    case 'flag': return validateFlag(ev.flag);
    case 'risk':
      return [...(inRange(ev.score, 0, 100) ? [] : ['risk.score must be 0..100']),
              ...(BANDS.includes(ev.band) ? [] : [`risk.band must be one of ${BANDS.join('|')}`])];
    case 'verdict':
      return [...(typeof ev.scam === 'boolean' ? [] : ['verdict.scam must be boolean']),
              ...(inRange(ev.confidence, 0, 1) ? [] : ['verdict.confidence must be 0..1']),
              ...(isStr(ev.headline) ? [] : ['verdict.headline required']),
              ...(Array.isArray(ev.advice) ? [] : ['verdict.advice must be an array'])];
    case 'agent':
      return [...(isStr(ev.agent) ? [] : ['agent.agent required']),
              ...(['running', 'done', 'error'].includes(ev.status) ? [] : ['agent.status must be running|done|error'])];
    case 'error': return isStr(ev.message) ? [] : ['error.message required'];
    default: return [`unknown event type ${JSON.stringify(ev.type)}`];
  }
}

export const assertEvent = (ev) => {
  const errs = validateEvent(ev);
  if (errs.length) throw new Error(`invalid ${ev?.type} event: ${errs.join('; ')}`);
  return ev;
};

/** Risk score from accumulated flags. Isolation + extraction together is the killer combo. */
export function scoreFlags(flags) {
  const W = { FAKE_AUTHORITY: 22, MANUFACTURED_URGENCY: 14, ISOLATION_ORDER: 26,
              EXTRACTION: 24, THREAT_ESCALATION: 18, VERIFICATION_THEATRE: 16 };
  const seen = new Map();
  for (const f of flags) seen.set(f.technique, Math.max(seen.get(f.technique) ?? 0, f.confidence));
  let s = 0;
  for (const [t, c] of seen) s += (W[t] ?? 10) * c;
  if (seen.has('ISOLATION_ORDER') && seen.has('EXTRACTION')) s += 15; // the signature combo
  return Math.min(100, Math.round(s));
}
