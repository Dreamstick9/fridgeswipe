import { SPEC_GRAMMAR } from './grammar.mjs';
import { validateSpec } from '../spec.mjs';

export const SPEC_SYSTEM = `You design an execution graph: which node runs next, what state it
receives, how control flows. This is NOT a knowledge graph — nodes are units of work.
Return ONE JSON object matching this grammar, no prose.

${SPEC_GRAMMAR}

The graph MUST contain at least one conditional edge and at least one bounded loop-back
(a verifier that can send work back to its producer).`;

export const specValidator = (v) => validateSpec(v).errors.map((x) => `[${x.code}] ${x.message} — fix: ${x.hint}`);

export const specPrompt = (intent, schema) =>
  `Intent:\n${JSON.stringify(intent, null, 2)}\n\nShared state schema (use these exact field names):\n${JSON.stringify(schema, null, 2)}\n\nReturn the graph spec JSON.`;
