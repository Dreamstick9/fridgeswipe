// Render a graph spec as a Mermaid flowchart. Complements the run trace: the trace shows
// what happened, this shows the machine that could happen.

const SHAPE = {
  produce: (id, label) => `  ${id}["${label}"]`,
  verify:  (id, label) => `  ${id}{{"${label}"}}`,
  router:  (id, label) => `  ${id}{"${label}"}`,
  join:    (id, label) => `  ${id}[/"${label}"/]`,
};

const esc = (s) => String(s).replace(/"/g, "'").replace(/\n/g, ' ');

export function specToMermaid(spec, { trace = null } = {}) {
  const lines = ['flowchart TD'];
  const hit = new Set();
  const loopHit = new Set();
  if (trace) {
    for (const e of trace.events ?? []) {
      if (e.type === 'node:start') hit.add(e.node);
      if (e.type === 'loop-back') loopHit.add(e.node);
    }
  }

  for (const n of spec.nodes) {
    const label = `${esc(n.id)}<br/><small>${esc(n.kind)}</small>`;
    lines.push((SHAPE[n.kind] ?? SHAPE.produce)(n.id, label));
  }
  lines.push('  END(["END"])');

  for (const e of spec.edges) {
    const tos = Array.isArray(e.to) ? e.to : [e.to];
    for (const to of tos) {
      const label = e.when ? `|"${esc(e.when)}"|` : e.fanOut ? '|fan-out|' : '';
      const arrow = e.loopBack ? '-.->' : '-->';
      lines.push(`  ${e.from} ${arrow}${label} ${to}`);
    }
  }

  for (const n of spec.nodes.filter((n) => n.kind === 'join')) {
    for (const j of n.joins ?? []) lines.push(`  ${j} -.-|join| ${n.id}`);
  }

  lines.push('  classDef verify stroke-dasharray: 4 3;');
  const verifiers = spec.nodes.filter((n) => n.kind === 'verify').map((n) => n.id);
  if (verifiers.length) lines.push(`  class ${verifiers.join(',')} verify;`);
  if (hit.size) {
    lines.push('  classDef ran stroke-width:3px;');
    lines.push(`  class ${[...hit].join(',')} ran;`);
  }
  return lines.join('\n');
}
