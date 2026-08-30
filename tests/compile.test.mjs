import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { compile } from '../src/compile.mjs';
import { validateSpec } from '../src/spec.mjs';
import { runGraph } from '../src/executor.mjs';
import { fixtureTransport } from '../src/fixtures.mjs';

const IDEAS = [
  'a mobile app that turns a photo of a restaurant menu into allergy warnings',
  'a dashboard that watches my github repos and drafts release notes',
];

test('two distinct idea prompts each compile end-to-end, unedited', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const slugs = new Set();

  for (const idea of IDEAS) {
    const r = await compile(idea, { transport: fixtureTransport(idea), outRoot: root });
    slugs.add(r.slug);
    assert.equal(validateSpec(r.spec).ok, true, 'emitted spec must pass the spec floor');
    for (const f of ['intent.json', 'schema.json', 'spec.json', 'graph.mjs']) {
      assert.ok(existsSync(join(r.outDir, f)), `${f} must be emitted`);
    }
    for (const n of r.spec.nodes) assert.ok(existsSync(join(r.outDir, 'nodes', `${n.id}.mjs`)));
    assert.ok(r.spec.edges.some((e) => e.when), 'must contain a conditional edge');
    assert.ok(r.spec.edges.some((e) => e.loopBack), 'must contain a loop-back');

    const mod = await import(join(r.outDir, 'graph.mjs'));
    const run = await runGraph(r.spec, {
      nodeImpls: await mod.loadNodeImpls(),
      transport: fixtureTransport(idea, { reviseTimes: 1 }),
      input: { request: idea },
    });
    assert.equal(run.status, 'ok', 'the generated graph must execute to completion');
    assert.equal(run.trace.events.filter((e) => e.type === 'loop-back').length, 1);
    assert.ok(run.trace.events.some((e) => e.type === 'edge' && e.to === 'END' && e.taken));
  }
  assert.equal(slugs.size, 2, 'the two ideas must produce distinct graphs');
});

test('the spec floor rejects a bad spec and the repair round converges', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const seen = [];
  const r = await compile(IDEAS[0], {
    transport: fixtureTransport(IDEAS[0], { failSpecOnce: true }),
    outRoot: root,
    log: (e) => seen.push(e),
  });
  const rejected = seen.find((e) => e.floor === 'spec' && e.status === 'rejected');
  assert.ok(rejected, 'the spec floor must reject the first attempt');
  assert.match(rejected.errors[0], /E_UNBOUNDED_CYCLE/);
  assert.equal(r.attempts.spec, 2, 'and converge on the repair attempt');
});

test('an unrepairable floor fails loudly instead of emitting bad code', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { stubTransport } = await import('../src/transport.mjs');
  const junk = stubTransport({ handlers: [{ match: /.*/, reply: { nope: true } }] });
  await assert.rejects(
    () => compile('x', { transport: junk, outRoot: root, maxRepairs: 1 }),
    (e) => e.name === 'FloorError' && e.floor === 'intent',
  );
});
