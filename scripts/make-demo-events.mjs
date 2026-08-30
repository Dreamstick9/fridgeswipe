// Bake the offline replay track from REAL detector output on a real fixture.
// The failsafe demo must show genuine results, never invented ones.
import { readFileSync, writeFileSync } from 'node:fs';
import { CALLS } from '../redflag/fixtures/calls.mjs';
import { groundFlags, markerScan, mergeFlags, assess, resetIds } from '../redflag/detector.mjs';
import { extractJson } from '../src/transport.mjs';
import { assertEvent, bandFor } from '../src/contract.mjs';

const call = CALLS.find((c) => c.id === 'digital-arrest');
const cache = JSON.parse(readFileSync('redflag/fixtures/cache.json', 'utf8'));
resetIds();
const allFlags = groundFlags(extractJson(cache[call.id]).flags ?? [], call.text);

const lines = call.text.split('\n').filter(Boolean);
const events = [];
let tMs = 0;
const emitted = [];

for (const line of lines) {
  const words = line.replace(/^Caller:\s*/, '');
  tMs += Math.max(2200, words.length * 55);          // realistic speaking pace
  events.push(assertEvent({ type: 'transcript', tMs, text: words, final: true }));

  // stage the agent choreography on lines that will produce a flag
  const willFlag = allFlags.some((f) => {
    if (emitted.includes(f.id)) return false;
    const norm2 = (x) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return norm2(line).includes(norm2(f.quote));
  });
  if (willFlag) {
    for (const a of ['authority_agent', 'pressure_agent', 'money_agent']) events.push({ ...assertEvent({ type: 'agent', agent: a, status: 'running' }), tMs: tMs + 100 });
    for (const a of ['authority_agent', 'pressure_agent', 'money_agent']) events.push({ ...assertEvent({ type: 'agent', agent: a, status: 'done', ms: 800 }), tMs: tMs + 350 });
    events.push({ ...assertEvent({ type: 'agent', agent: 'skeptic', status: 'running' }), tMs: tMs + 420 });
    events.push({ ...assertEvent({ type: 'agent', agent: 'skeptic', status: 'done', ms: 200 }), tMs: tMs + 550 });
  }

  // a flag surfaces on the line that actually contains its quote
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const f of allFlags) {
    if (emitted.includes(f.id)) continue;
    if (!norm(line).includes(norm(f.quote))) continue;
    emitted.push(f.id);
    events.push({ ...assertEvent({ type: 'flag', flag: { ...f, tMs: tMs + 600 } }), tMs: tMs + 600 });
    const score = assess(allFlags.filter((x) => emitted.includes(x.id))).score;
    events.push({ ...assertEvent({ type: 'risk', score, band: bandFor(score) }), tMs: tMs + 700 });
  }
}

events.push({ ...assertEvent({ type: 'agent', agent: 'ruling', status: 'running' }), tMs: tMs + 300 });
events.push({ ...assertEvent({ type: 'agent', agent: 'ruling', status: 'done', ms: 900 }), tMs: tMs + 1200 });
const final = assess(allFlags);
events.push({ ...assertEvent({
  type: 'verdict', scam: final.scam, confidence: Math.min(0.99, final.score / 100),
  headline: `DIGITAL ARREST SCAM — ${final.score}% RISK`,
  advice: ['Hang up now', '"Digital arrest" does not exist in Indian law',
           'No agency asks you to transfer money to prove it is clean', 'Call 1930 — cybercrime helpline'],
  techniques: final.techniques,
}), tMs: tMs + 2600 });

writeFileSync('redflag/fixtures/demo-events.json', JSON.stringify(events, null, 2));
console.log(`✓ ${events.length} events · ${allFlags.length} flags · final score ${final.score} (${final.band})`);
console.log(`  techniques: ${final.techniques.join(', ')}`);
console.log(`  runtime: ${(tMs / 1000).toFixed(0)}s of call`);
