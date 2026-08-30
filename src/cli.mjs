#!/usr/bin/env node
// One command per verb. Retargeting the harness to a new idea is:
//   node src/cli.mjs compile "<any idea prompt>"

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile, FloorError } from './compile.mjs';
import { runGraph } from './executor.mjs';
import { renderTrace } from './trace.mjs';
import { validateSpec, SpecError } from './spec.mjs';
import { liveTransport } from './transport.mjs';
import { fixtureTransport } from './fixtures.mjs';

const C = process.stdout.isTTY
  ? { b: (s) => `\x1b[1m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`,
      r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m` }
  : new Proxy({}, { get: () => (s) => s });

const USAGE = `graph-harness — compile an idea prompt into a running agent graph

  node src/cli.mjs compile "<idea prompt>"   compile idea -> intent -> schema -> spec -> code
  node src/cli.mjs run <slug> [input...]     execute a compiled graph
  node src/cli.mjs validate <spec.json>      run the spec floor's validators alone

  TRANSPORT=live|fixture   (default: fixture while model auth is unavailable)
`;

function pickTransport(idea, opts = {}) {
  const mode = process.env.TRANSPORT ?? 'fixture';
  if (mode === 'live') return liveTransport();
  console.log(C.y('  ! fixture transport — graph shape is derived offline, not model-designed.'));
  console.log(C.d('    set a credential and TRANSPORT=live for real design. see .goal-task/graph-harness/state.md\n'));
  return fixtureTransport(idea, opts);
}

const floorLog = ({ floor, status, attempt, errors, files }) => {
  if (status === 'ok') console.log(`  ${C.g('✓')} ${C.b(floor.padEnd(7))} ${C.d(`attempt ${attempt}${files ? ` · ${files} files` : ''}`)}`);
  else {
    console.log(`  ${C.r('✗')} ${C.b(floor.padEnd(7))} ${C.d(`attempt ${attempt} rejected`)}`);
    for (const e of errors) console.log(`      ${C.d('·')} ${e}`);
    console.log(`      ${C.y('↻ re-prompting with these errors')}`);
  }
};

async function cmdCompile(idea) {
  if (!idea) { console.error(USAGE); process.exit(2); }
  console.log(C.b(`\n  compiling: ${C.d(idea)}\n`));
  const transport = pickTransport(idea, { failSpecOnce: process.env.DEMO_REPAIR === '1' });
  try {
    const r = await compile(idea, { transport, log: floorLog });
    console.log(`\n  ${C.g('●')} ${C.b(r.slug)} ${C.d(`→ ${r.outDir}  (${r.ms}ms, $${transport.spentUsd.toFixed(4)})`)}`);
    console.log(C.d(`    ${r.spec.nodes.length} nodes · ${r.spec.edges.length} edges · ${r.spec.edges.filter((e) => e.when).length} conditional · ${r.spec.edges.filter((e) => e.loopBack).length} loop-back`));
    console.log(C.d(`\n    run it:  node src/cli.mjs run ${r.slug} "your input here"\n`));
    return r;
  } catch (e) {
    if (e instanceof FloorError) { console.error(`\n  ${C.r('■ ' + e.message)}\n`); process.exit(1); }
    throw e;
  }
}

async function cmdRun(slug, args) {
  const dir = join('out', slug);
  const specPath = join(dir, 'spec.json');
  if (!existsSync(specPath)) { console.error(`no compiled graph at ${specPath} — compile it first`); process.exit(2); }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const mod = await import(new URL(`../${dir}/graph.mjs`, import.meta.url).href);
  const inputFields = spec.state.fields.filter((f) => f.input).map((f) => f.name);
  const input = Object.fromEntries(inputFields.map((f, i) => [f, args[i] ?? '']));
  const transport = pickTransport(args[0] ?? slug, { reviseTimes: Number(process.env.DEMO_REVISE ?? 0) });
  const r = await runGraph(spec, { nodeImpls: await mod.loadNodeImpls(), transport, input });
  console.log(renderTrace(r.trace));
  writeFileSync(join(dir, 'last-run.trace.json'), JSON.stringify(r.trace.toJSON(), null, 2));
  console.log(`  status: ${r.status === 'ok' ? C.g(r.status) : C.r(r.status)}  ${C.d(`trace → ${join(dir, 'last-run.trace.json')}`)}\n`);
  if (r.status !== 'ok') process.exitCode = 1;
}

function cmdValidate(path) {
  const spec = JSON.parse(readFileSync(path, 'utf8'));
  const { ok, errors } = validateSpec(spec);
  if (ok) { console.log(C.g(`  ✓ ${path} is a valid graph spec`)); return; }
  console.log(new SpecError(errors).message);
  process.exitCode = 1;
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'compile': await cmdCompile(rest.join(' ')); break;
  case 'run': await cmdRun(rest[0], rest.slice(1)); break;
  case 'validate': cmdValidate(rest[0]); break;
  default: console.log(USAGE); process.exit(cmd ? 2 : 0);
}
