// Graph executor: wave scheduler with conditional edges, bounded loop-backs,
// fan-out/fan-in, and hard iteration + spend caps.

import { assertValidSpec, END } from './spec.mjs';
import { compileCondition } from './expr.mjs';
import { createTrace } from './trace.mjs';

export class CapExceeded extends Error {
  constructor(reason, detail) { super(`${reason}: ${detail}`); this.name = 'CapExceeded'; this.reason = reason; this.detail = detail; }
}

/**
 * @param spec       validated graph spec
 * @param nodeImpls  { [nodeId]: async ({state, node, ask, transport}) => ({writes}) }
 * @param transport  model transport (live or stub)
 * @param input      initial values for state fields marked {input:true}
 */
export async function runGraph(spec, { nodeImpls, transport, input = {}, trace = createTrace({ name: spec?.name ?? 'run' }) } = {}) {
  assertValidSpec(spec);

  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const caps = spec.caps;
  const conds = new Map();
  for (const e of spec.edges) if (e.when != null) conds.set(e, compileCondition(String(e.when)));

  const state = { ...input };
  const loopCounts = Object.create(null);
  const runCounts = Object.create(null);
  const completed = new Set();
  const spendAtStart = transport.spentUsd ?? 0;
  const spent = () => (transport.spentUsd ?? 0) - spendAtStart;

  let queue = [spec.entry];
  let steps = 0;
  let status = 'ok';

  try {
    while (queue.length) {
      // A join node is only runnable once every branch it waits on has completed.
      const runnable = [], blocked = [];
      for (const id of queue) {
        const n = byId.get(id);
        if (n.kind === 'join' && !(n.joins ?? []).every((j) => completed.has(j))) blocked.push(id);
        else runnable.push(id);
      }
      if (runnable.length === 0) {
        trace.halt('deadlock', `join node(s) ${blocked.join(', ')} wait on branches that never completed`);
        status = 'deadlock';
        break;
      }
      queue = blocked;

      if (steps + runnable.length > caps.maxSteps) {
        trace.halt('cap:maxSteps', `would exceed maxSteps=${caps.maxSteps} (already ran ${steps})`);
        status = 'halted:maxSteps';
        break;
      }
      if (spent() >= caps.maxSpendUsd) {
        trace.halt('cap:maxSpendUsd', `spent $${spent().toFixed(4)} of $${caps.maxSpendUsd}`);
        status = 'halted:maxSpendUsd';
        break;
      }

      const uniq = [...new Set(runnable)];
      steps += uniq.length;

      const results = await Promise.all(uniq.map(async (id) => {
        const node = byId.get(id);
        const iteration = (runCounts[id] = (runCounts[id] ?? 0) + 1);
        trace.nodeStart(id, node.kind, iteration);
        const before = transport.spentUsd ?? 0;
        try {
          const impl = nodeImpls[id];
          if (!impl) throw new Error(`no implementation registered for node "${id}"`);
          const ask = (prompt, system) => transport.complete({ prompt, system: system ?? node.role ?? '' });
          const out = (await impl({ state: Object.freeze({ ...state }), node, ask, transport })) ?? {};
          const writes = out.writes ?? {};
          const costUsd = (transport.spentUsd ?? 0) - before;
          trace.nodeEnd(id, { writes, costUsd });
          return { id, node, writes };
        } catch (e) {
          trace.nodeError(id, e.message);
          throw e;
        }
      }));

      for (const { id, writes } of results) {
        Object.assign(state, writes);
        completed.add(id);
      }

      // Resolve successors for everything that just ran.
      const next = [];
      for (const { id, node } of results) {
        const outgoing = spec.edges.filter((e) => e.from === id);
        let tookAny = false;
        for (const e of outgoing) {
          const cond = conds.get(e);
          if (cond && !cond.test(state)) { trace.edgeSkipped(id, Array.isArray(e.to) ? e.to.join('|') : e.to, String(e.when)); continue; }
          tookAny = true;
          const tos = Array.isArray(e.to) ? e.to : [e.to];
          if (e.fanOut && tos.length > 1) trace.fanOut(id, tos);
          for (const to of tos) {
            trace.edge(id, to, { when: e.when != null ? String(e.when) : null, loopBack: !!e.loopBack, fanOut: !!e.fanOut });
            if (to === END) continue;
            if (e.loopBack) {
              const count = (loopCounts[to] = (loopCounts[to] ?? 0) + 1);
              const cap = caps.maxLoopBacks?.[to] ?? 0;
              trace.loopBack(to, count, cap);
              if (count > cap) {
                trace.halt('cap:maxLoopBacks', `node "${to}" looped ${count} times, cap ${cap}`);
                throw new CapExceeded('cap:maxLoopBacks', `node "${to}" looped ${count} times, cap ${cap}`);
              }
              // re-entering a cycle: the branch nodes must be runnable again
              for (const c of cycleMembers(spec, to, id)) completed.delete(c);
            }
            const target = byId.get(to);
            if (target?.kind === 'join') trace.join(to, target.joins ?? []);
            next.push(to);
          }
        }
        if (!tookAny && outgoing.length > 0) {
          trace.halt('no-branch-taken', `every outgoing condition from "${id}" evaluated false`);
          status = 'halted:no-branch';
        }
      }
      queue = [...queue, ...next];
    }
  } catch (e) {
    if (e instanceof CapExceeded) status = `halted:${e.reason}`;
    else { status = 'error'; trace.halt('error', e.message); }
    trace.done(status);
    return { status, state, trace, steps, spentUsd: spent(), error: e };
  }

  if (status === 'ok') trace.done('ok'); else trace.done(status);
  return { status, state, trace, steps, spentUsd: spent() };
}

/** Nodes on the cycle between `to` (loop target) and `from` (where the loop-back originated). */
function cycleMembers(spec, to, from) {
  const out = new Set();
  const stack = [to];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur) || cur === END) continue;
    seen.add(cur);
    out.add(cur);
    if (cur === from) continue;
    for (const e of spec.edges) {
      if (e.from !== cur) continue;
      for (const t of (Array.isArray(e.to) ? e.to : [e.to])) stack.push(t);
    }
  }
  return out;
}
