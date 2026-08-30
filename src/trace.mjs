// Run trace: an append-only event log plus a terminal renderer.

export function createTrace({ name = 'run' } = {}) {
  const events = [];
  let seq = 0;
  const t0 = Date.now();
  const push = (type, data) => {
    const e = { seq: seq++, ms: Date.now() - t0, type, ...data };
    events.push(e);
    return e;
  };
  return {
    name,
    events,
    nodeStart: (id, kind, iteration) => push('node:start', { node: id, kind, iteration }),
    nodeEnd: (id, { writes, costUsd }) => push('node:end', { node: id, writes: Object.keys(writes ?? {}), costUsd }),
    nodeError: (id, message) => push('node:error', { node: id, message }),
    edge: (from, to, { when = null, taken = true, loopBack = false, fanOut = false } = {}) =>
      push('edge', { from, to, when, taken, loopBack, fanOut }),
    edgeSkipped: (from, to, when) => push('edge', { from, to, when, taken: false }),
    loopBack: (to, count, cap) => push('loop-back', { node: to, count, cap }),
    fanOut: (from, branches) => push('fan-out', { from, branches }),
    join: (id, branches) => push('join', { node: id, branches }),
    halt: (reason, detail) => push('halt', { reason, detail }),
    done: (status) => push('done', { status }),
    toJSON: () => ({ name, events }),
  };
}

const C = process.stdout.isTTY
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`,
      y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, c: (s) => `\x1b[36m${s}\x1b[0m`,
      m: (s) => `\x1b[35m${s}\x1b[0m` }
  : new Proxy({}, { get: () => (s) => s });

const KIND_GLYPH = { produce: '◆', verify: '◇', router: '◈', join: '⧗' };

/** Human-legible render of a run — this is what gets demoed. */
export function renderTrace(trace) {
  const L = [];
  L.push(C.b(`\n  graph run: ${trace.name}`));
  L.push(C.dim('  ' + '─'.repeat(66)));
  let spend = 0;
  for (const e of trace.events) {
    const ts = C.dim(String(e.ms).padStart(6) + 'ms');
    switch (e.type) {
      case 'node:start':
        L.push(`${ts}  ${C.c(KIND_GLYPH[e.kind] ?? '•')} ${C.b(e.node)} ${C.dim(e.kind)}${e.iteration > 1 ? C.y(`  ↻ pass ${e.iteration}`) : ''}`);
        break;
      case 'node:end':
        spend += e.costUsd ?? 0;
        L.push(`${ts}    ${C.dim('└ wrote')} ${e.writes.length ? e.writes.join(', ') : C.dim('(nothing)')} ${C.dim(`$${(e.costUsd ?? 0).toFixed(4)}`)}`);
        break;
      case 'node:error':
        L.push(`${ts}    ${C.r('└ error')} ${e.message}`);
        break;
      case 'edge': {
        const arrow = e.loopBack ? C.y('⟲') : '→';
        const cond = e.when ? C.dim(` [${e.when}]`) : '';
        L.push(e.taken
          ? `${ts}    ${arrow} ${C.g(e.to)}${cond}`
          : `${ts}    ${C.dim(`✗ ${e.to}`)}${cond} ${C.dim('(condition false)')}`);
        break;
      }
      case 'fan-out':
        L.push(`${ts}    ${C.m('⇉ fan-out')} → ${e.branches.map((b) => C.g(b)).join(', ')}`);
        break;
      case 'join':
        L.push(`${ts}    ${C.m('⧗ join')} ${C.dim(e.branches.join(' + '))} → ${C.b(e.node)}`);
        break;
      case 'loop-back':
        L.push(`${ts}    ${C.y(`⟲ loop-back into ${e.node}`)} ${C.dim(`(${e.count}/${e.cap})`)}`);
        break;
      case 'halt':
        L.push(`${ts}  ${C.r('■ HALT')} ${C.b(e.reason)} ${C.dim(e.detail ?? '')}`);
        break;
      case 'done':
        L.push(`${ts}  ${e.status === 'ok' ? C.g('● done') : C.r('● ' + e.status)}`);
        break;
    }
  }
  L.push(C.dim('  ' + '─'.repeat(66)));
  const nodes = trace.events.filter((e) => e.type === 'node:start').length;
  const loops = trace.events.filter((e) => e.type === 'loop-back').length;
  const taken = trace.events.filter((e) => e.type === 'edge' && e.taken).length;
  const skipped = trace.events.filter((e) => e.type === 'edge' && !e.taken).length;
  L.push(`  ${nodes} node runs · ${taken} edges taken · ${skipped} branches not taken · ${loops} loop-backs · $${spend.toFixed(4)}\n`);
  return L.join('\n');
}
