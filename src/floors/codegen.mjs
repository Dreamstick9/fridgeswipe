// Code floor: a deterministic spec -> runnable-code transform. No model call —
// if the spec passed the spec floor, the code it produces is valid by construction.

import { mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HARNESS_SRC = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
/** Import specifier for a harness module, resolved from `fromDir` at emit time so the
 *  generated code keeps working wherever it is emitted. */
const harness = (fromDir, file) => {
  const rel = relative(resolve(fromDir), join(HARNESS_SRC, file)).split(sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
};

const j = (v) => JSON.stringify(v, null, 2);
const lit = (v) => JSON.stringify(v);

function nodeSource(node, spec, outDir) {
  const reads = node.reads ?? [];
  const writes = node.writes ?? [];
  const ctx = reads.length
    ? `  const context = ${lit(reads)}.map((f) => \`## \${f}\\n\${format(state[f])}\`).join('\\n\\n');`
    : `  const context = '(no upstream state)';`;

  if (node.kind === 'router') {
    return `// router: pure control flow — routing is decided by edge conditions in the spec.
export const meta = ${j({ id: node.id, kind: node.kind, reads, writes })};

export async function run({ state }) {
  return { writes: {} };
}
`;
  }

  if (node.kind === 'join') {
    return `// join: waits for ${lit(node.joins ?? [])}, then merges their outputs into one field.
export const meta = ${j({ id: node.id, kind: node.kind, reads, writes, joins: node.joins ?? [] })};

export async function run({ state }) {
${ctx}
  return { writes: { ${writes.map((w) => `${JSON.stringify(w)}: context`).join(', ')} } };
}

const format = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
`;
  }

  if (node.kind === 'verify') {
    const field = writes[0];
    return `// verifier: READ-ONLY with respect to artifacts. Judges ${lit(reads)} and writes only ${lit(field)}.
import { extractJson } from '${harness(join(outDir, 'nodes'), 'transport.mjs')}';

export const meta = ${j({ id: node.id, kind: node.kind, reads, writes })};

export async function run({ state, node, ask }) {
${ctx}
  const { text } = await ask(
    \`\${context}\\n\\nJudge the work above. Return ONE JSON object: {"passed": <bool>, "reasons": ["<why>"]}. No prose.\`,
    \`\${node.role}\\nYou are a read-only reviewer. You never rewrite the work — you only judge it.\`,
  );
  let verdict;
  try {
    verdict = extractJson(text);
  } catch {
    verdict = { passed: false, reasons: ['verifier response was not valid JSON'] };
  }
  if (typeof verdict.passed !== 'boolean') verdict.passed = false;
  return { writes: { ${lit(field)}: verdict } };
}

const format = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
`;
  }

  // produce
  const field = writes[0];
  return `// producer: turns ${lit(reads)} into ${lit(field)}.
export const meta = ${j({ id: node.id, kind: node.kind, reads, writes })};

export async function run({ state, node, ask }) {
${ctx}
  const { text } = await ask(\`\${context}\\n\\nProduce ${lit(field)}.\`, node.role);
  return { writes: { ${lit(field)}: text } };
}

const format = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
`;
}

const graphSource = (spec, outDir) => `// Generated from spec.json — run with: node graph.mjs "<input>"
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runGraph } from '${harness(outDir, 'executor.mjs')}';
import { renderTrace } from '${harness(outDir, 'trace.mjs')}';
import { liveTransport, stubTransport } from '${harness(outDir, 'transport.mjs')}';

const here = dirname(fileURLToPath(import.meta.url));
export const spec = JSON.parse(readFileSync(join(here, 'spec.json'), 'utf8'));

export async function loadNodeImpls() {
  const impls = {};
  for (const n of spec.nodes) {
    const mod = await import(join(here, 'nodes', \`\${n.id}.mjs\`));
    impls[n.id] = mod.run;
  }
  return impls;
}

export async function main(input = {}, transport) {
  const tp = transport ?? (process.env.TRANSPORT === 'stub'
    ? stubTransport({ handlers: [{ match: /.*/, reply: 'stub response' }] })
    : liveTransport());
  const result = await runGraph(spec, { nodeImpls: await loadNodeImpls(), transport: tp, input });
  return result;
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const inputFields = spec.state.fields.filter((f) => f.input).map((f) => f.name);
  const input = Object.fromEntries(inputFields.map((f, i) => [f, process.argv[2 + i] ?? '']));
  const result = await main(input);
  console.log(renderTrace(result.trace));
  console.log('status:', result.status);
}
`;

export function emitCode(spec, dirArg) {
  mkdirSync(join(dirArg, 'nodes'), { recursive: true });
  // Resolve symlinks (macOS /tmp -> /private/var) so emitted specifiers match how Node
  // will resolve the generated module's own path at import time.
  const outDir = realpathSync(dirArg);
  const files = [];
  writeFileSync(join(outDir, 'spec.json'), j(spec));
  files.push(join(outDir, 'spec.json'));
  for (const node of spec.nodes) {
    const p = join(outDir, 'nodes', `${node.id}.mjs`);
    writeFileSync(p, nodeSource(node, spec, outDir));
    files.push(p);
  }
  const g = join(outDir, 'graph.mjs');
  writeFileSync(g, graphSource(spec, outDir));
  files.push(g);
  return files;
}
