// Tests app/callFlow.js — the pure logic behind the native call receiver's deep link,
// the notification policy, and the agent strip. The native layer is by definition
// mocked here: these functions receive exactly what MainActivity/expo-linking hand them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// app/ is a CJS package scope; re-house the identical source as ESM for import.
const src = readFileSync(new URL('../app/callFlow.js', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'cf-'));
const mod = join(dir, 'callFlow.mjs');
writeFileSync(mod, src);
const { shouldAutoArm, shouldShowReport, notificationFor, agentReducer, AGENT_LABELS } = await import(mod);

test('the native receiver deep link arms; everything else does not', () => {
  assert.equal(shouldAutoArm('redflag://arm'), true);
  assert.equal(shouldAutoArm('REDFLAG://ARM'), true);
  assert.equal(shouldAutoArm('redflag://arm?src=notification'), true);
  assert.equal(shouldAutoArm('myapp://open?redflag_auto=1'), true);
  assert.equal(shouldAutoArm('redflag://'), false);
  assert.equal(shouldAutoArm('https://evil.example/redflag'), false);
  assert.equal(shouldAutoArm(null), false);
  assert.equal(shouldAutoArm(undefined), false);
  assert.equal(shouldAutoArm(42), false);
});

test('the report deep link is recognized; arm link is not confused with it', () => {
  assert.equal(shouldShowReport('redflag://report'), true);
  assert.equal(shouldShowReport('REDFLAG://REPORT?src=n'), true);
  assert.equal(shouldShowReport('redflag://arm'), false);
  assert.equal(shouldShowReport(null), false);
});

test('only agent-confirmed flags and verdicts notify — tier-1 and agent chatter stay silent', () => {
  const t2 = { type: 'flag', flag: { tier: 2, label: 'THE ASK', technique: 'EXTRACTION', quote: 'transfer now' } };
  const t1 = { type: 'flag', flag: { tier: 1, label: 'THE ASK', technique: 'EXTRACTION', quote: 'transfer now' } };
  assert.match(notificationFor(t2).title, /THE ASK/);
  assert.equal(notificationFor(t1), null);
  assert.equal(notificationFor({ type: 'agent', agent: 'skeptic', status: 'done' }), null);
  assert.equal(notificationFor({ type: 'risk', score: 90, band: 'critical' }), null);
  assert.equal(notificationFor(null), null);
});

test('scam verdict notifies at max priority with the 1930 escalation', () => {
  const n = notificationFor({ type: 'verdict', scam: true, headline: 'DIGITAL ARREST SCAM' });
  assert.match(n.title, /SCAM/);
  assert.match(n.body, /1930/);
  assert.equal(n.priority, 'max');
  const clean = notificationFor({ type: 'verdict', scam: false, headline: 'No strong indicators' });
  assert.equal(clean.priority, 'default');
});

test('agent reducer tracks each agent independently and ignores junk', () => {
  let s = {};
  s = agentReducer(s, { type: 'agent', agent: 'authority_agent', status: 'running' });
  s = agentReducer(s, { type: 'agent', agent: 'money_agent', status: 'running' });
  s = agentReducer(s, { type: 'agent', agent: 'authority_agent', status: 'done', ms: 900 });
  assert.equal(s.authority_agent.status, 'done');
  assert.equal(s.authority_agent.ms, 900);
  assert.equal(s.money_agent.status, 'running');
  assert.deepEqual(agentReducer(s, { type: 'flag' }), s);
  assert.deepEqual(agentReducer(s, null), s);
});

test('every server agent id has a UI label', () => {
  for (const id of ['authority_agent', 'pressure_agent', 'money_agent', 'skeptic', 'ruling']) {
    assert.ok(AGENT_LABELS[id], `missing label for ${id}`);
  }
});
