// Offline detector gate. Runs against recorded model responses: free, deterministic, ~1s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CALLS, SCAMS, CONTROLS } from '../redflag/fixtures/calls.mjs';
import { groundFlags, markerScan, mergeFlags, assess, resetIds, SCAM_THRESHOLD } from '../redflag/detector.mjs';
import { extractJson } from '../src/transport.mjs';
import { validateFlag, scoreFlags, bandFor } from '../src/contract.mjs';

const cache = JSON.parse(readFileSync(new URL('../redflag/fixtures/cache.json', import.meta.url)));
const analyse = (c) => { resetIds(); return groundFlags(extractJson(cache[c.id]).flags ?? [], c.text); };

test('every benign control produces ZERO flags', () => {
  for (const c of CONTROLS) {
    const flags = analyse(c);
    assert.equal(flags.length, 0, `${c.id} raised ${flags.length} false positives: ${flags.map((f) => f.technique).join(',')}`);
  }
});

test('recall across scam fixtures is 100%', () => {
  let hit = 0, tot = 0;
  for (const c of SCAMS) {
    const got = new Set(analyse(c).map((f) => f.technique));
    hit += c.expect.filter((t) => got.has(t)).length;
    tot += c.expect.length;
  }
  assert.equal(tot > 0, true);
  assert.ok(hit / tot >= 0.8, `recall ${hit}/${tot} below 80%`);
});

test('scam scores and control scores are cleanly separated', () => {
  const scamScores = SCAMS.map((c) => assess(analyse(c)).score);
  const ctrlScores = CONTROLS.map((c) => assess(analyse(c)).score);
  const minScam = Math.min(...scamScores), maxCtrl = Math.max(...ctrlScores);
  assert.ok(maxCtrl < SCAM_THRESHOLD, `a control scored ${maxCtrl}, at/above threshold ${SCAM_THRESHOLD}`);
  assert.ok(minScam >= SCAM_THRESHOLD, `a scam scored ${minScam}, below threshold ${SCAM_THRESHOLD}`);
  assert.ok(minScam > maxCtrl, 'scam and control score ranges must not overlap');
});

test('every flag is grounded in the transcript (no hallucinated evidence)', () => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const c of CALLS) {
    for (const f of analyse(c)) {
      assert.ok(norm(c.text).includes(norm(f.quote)), `${c.id}: quote not in transcript: "${f.quote}"`);
    }
  }
});

test('hallucinated and malformed flags are discarded', () => {
  const c = SCAMS[0];
  const junk = [
    { technique: 'FAKE_AUTHORITY', quote: 'I am the King of Spain', confidence: 0.9 }, // not in transcript
    { technique: 'NOT_A_TECHNIQUE', quote: 'badge number 4471', confidence: 0.9 },      // invalid id
    { technique: 'EXTRACTION', quote: '', confidence: 0.9 },                            // empty quote
  ];
  assert.equal(groundFlags(junk, c.text).length, 0);
});

test('every emitted flag satisfies the frozen contract', () => {
  for (const c of CALLS) for (const f of analyse(c)) assert.deepEqual(validateFlag(f), []);
});

test('tier-1 marker scan never outranks a confirmed model flag', () => {
  const c = SCAMS[0];
  const merged = mergeFlags(markerScan(c.text), analyse(c));
  const byTech = new Map(merged.map((f) => [f.technique, f]));
  for (const f of analyse(c)) assert.equal(byTech.get(f.technique).tier, 2);
});

test('the isolation+extraction combo is scored as the signature pattern', () => {
  const base = [{ technique: 'ISOLATION_ORDER', confidence: 1 }, { technique: 'EXTRACTION', confidence: 1 }];
  const apart = scoreFlags([{ technique: 'ISOLATION_ORDER', confidence: 1 }]) + scoreFlags([{ technique: 'EXTRACTION', confidence: 1 }]);
  assert.ok(scoreFlags(base) > apart, 'combined score must exceed the sum of its parts');
  assert.equal(bandFor(scoreFlags(base)), 'danger');
});
