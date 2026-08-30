// Offline fixture transport. Stands in for model *judgment* while auth is blocked, so
// every floor, validator, the self-repair loop, codegen and the executor still run for real.
// HONEST LIMIT: with this transport the graph is derived deterministically from the idea
// text, not designed by a model. Set a credential and TRANSPORT=live for real design.

import { stubTransport } from './transport.mjs';

const STOP = new Set(['a','an','the','for','and','that','with','from','into','your','you','builds','build','make','makes','app','tool','uses','use']);
const words = (s) => s.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? [];
const keywords = (idea, n = 3) => {
  const seen = [];
  for (const w of words(idea)) if (!STOP.has(w) && w.length > 3 && !seen.includes(w)) seen.push(w);
  return seen.slice(0, n);
};
const slug = (idea) => (keywords(idea, 3).join('-') || 'graph') + '-graph';

const intentFor = (idea) => {
  const k = keywords(idea, 3);
  return {
    name: slug(idea),
    goal: `Turn a ${k[0] ?? 'raw'} request into a reviewed ${k[1] ?? 'result'}.`,
    deliverable: `A reviewed ${k[1] ?? 'artifact'} plus the trace of how it was produced.`,
    inputs: ['request'],
    steps: ['gather source material', 'draft the artifact', 'review the draft', 'decide ship or revise'],
    risks: ['the reviewer rubber-stamps the draft', 'revision never converges'],
  };
};

const schemaFor = () => ({
  fields: [
    { name: 'request', type: 'string', input: true, description: 'the user request' },
    { name: 'material', type: 'string', description: 'gathered source material' },
    { name: 'draft', type: 'string', description: 'the produced artifact' },
    { name: 'verdict', type: 'object', description: 'read-only reviewer verdict {passed, reasons}' },
  ],
});

const specFor = (idea) => ({
  version: 1,
  name: slug(idea),
  entry: 'gather',
  caps: { maxSteps: 20, maxSpendUsd: 0.5, maxLoopBacks: { draft: 2 } },
  state: schemaFor(),
  nodes: [
    { id: 'gather', kind: 'produce', role: 'Gather the source material the request needs.', reads: ['request'], writes: ['material'] },
    { id: 'draft',  kind: 'produce', role: 'Write the artifact from the material.',          reads: ['request', 'material'], writes: ['draft'] },
    { id: 'review', kind: 'verify',  role: 'Review the draft against the request.',          reads: ['request', 'draft'], writes: ['verdict'] },
    { id: 'decide', kind: 'router',  role: 'Ship if the review passed, else revise.',        reads: ['verdict'], writes: [] },
  ],
  edges: [
    { from: 'gather', to: 'draft' },
    { from: 'draft',  to: 'review' },
    { from: 'review', to: 'decide' },
    { from: 'decide', to: 'draft', when: 'verdict.passed == false', loopBack: true },
    { from: 'decide', to: 'END',   when: 'verdict.passed == true' },
  ],
});

/** A spec with a deliberately unbounded cycle — used to prove the repair loop is real. */
const brokenSpecFor = (idea) => {
  const s = specFor(idea);
  return { ...s, caps: { ...s.caps, maxLoopBacks: {} }, edges: s.edges.map((e) => (e.loopBack ? { ...e, loopBack: false } : e)) };
};

/**
 * @param idea         the idea prompt being compiled
 * @param failSpecOnce emit an invalid spec on the first spec-floor call, to exercise repair
 */
export function fixtureTransport(idea, { failSpecOnce = false, reviseTimes = 0 } = {}) {
  let specCalls = 0;
  let reviewCalls = 0;
  return stubTransport({
    costPerCall: 0.002,
    handlers: [
      { match: ({ system }) => /structured intent record/.test(system), reply: () => intentFor(idea) },
      { match: ({ system }) => /shared state object/.test(system), reply: () => schemaFor() },
      {
        match: ({ system }) => /execution graph/.test(system),
        reply: () => (failSpecOnce && specCalls++ === 0 ? brokenSpecFor(idea) : specFor(idea)),
      },
      // node-level calls during execution
      {
        match: ({ prompt }) => /Return ONE JSON object: \{"passed"/.test(prompt),
        reply: () => (reviewCalls++ < reviseTimes
          ? { passed: false, reasons: [`revision ${reviewCalls} requested: not specific enough`] }
          : { passed: true, reasons: ['meets the request'] }),
      },
      { match: /.*/, reply: ({ prompt }) => `[generated] ${prompt.slice(0, 60).replace(/\s+/g, ' ')}…` },
    ],
  });
}
