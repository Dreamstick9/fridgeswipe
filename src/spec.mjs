// Graph spec format + the spec floor's validators.
// Everything here is pure and offline: a malformed graph is rejected HERE with an
// actionable message, never allowed to become a runtime crash.

import { parse, referencedPaths } from './expr.mjs';

export const END = 'END';
export const NODE_KINDS = ['produce', 'verify', 'router', 'join'];

export class SpecError extends Error {
  constructor(errors) {
    super(`graph spec rejected at the spec floor (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n` +
      errors.map((e, i) => `  ${i + 1}. [${e.code}] ${e.message}\n     fix: ${e.hint}`).join('\n'));
    this.name = 'SpecError';
    this.errors = errors;
  }
}

const err = (code, message, hint) => ({ code, message, hint });

export function validateSpec(spec) {
  const errors = [];
  const E = (...a) => errors.push(err(...a));

  if (!spec || typeof spec !== 'object') {
    return { ok: false, errors: [err('E_SHAPE', 'spec is not an object', 'emit a JSON object with name/entry/state/nodes/edges/caps')] };
  }

  // --- structural presence -------------------------------------------------
  for (const f of ['name', 'entry', 'state', 'nodes', 'edges', 'caps']) {
    if (spec[f] == null) E('E_MISSING_FIELD', `spec.${f} is missing`, `add a "${f}" field to the spec`);
  }
  if (!Array.isArray(spec.nodes)) E('E_NODES_SHAPE', 'spec.nodes must be an array', 'emit nodes as a JSON array');
  if (!Array.isArray(spec.edges)) E('E_EDGES_SHAPE', 'spec.edges must be an array', 'emit edges as a JSON array');
  if (errors.length) return { ok: false, errors };

  const nodes = spec.nodes;
  const edges = spec.edges;
  const ids = nodes.map((n) => n && n.id);
  const byId = new Map(nodes.filter((n) => n && n.id).map((n) => [n.id, n]));

  // --- node identity -------------------------------------------------------
  ids.forEach((id, i) => {
    if (!id) E('E_NODE_ID', `nodes[${i}] has no id`, 'give every node a unique string id');
    else if (id === END) E('E_RESERVED_ID', `node id "${END}" is reserved`, 'rename the node; END is the implicit terminal');
    else if (ids.indexOf(id) !== i) E('E_DUP_ID', `duplicate node id "${id}"`, 'node ids must be unique');
  });
  for (const n of nodes) {
    if (n && n.id && !NODE_KINDS.includes(n.kind)) {
      E('E_NODE_KIND', `node "${n.id}" has kind ${JSON.stringify(n.kind)}`, `kind must be one of ${NODE_KINDS.join(', ')}`);
    }
  }

  // --- state schema --------------------------------------------------------
  const fields = (spec.state && Array.isArray(spec.state.fields)) ? spec.state.fields : null;
  if (!fields) E('E_STATE_SHAPE', 'spec.state.fields must be an array', 'declare the shared state as {"fields":[{"name","type"}]}');
  const declared = new Set((fields ?? []).map((f) => f && f.name).filter(Boolean));
  const inputs = new Set((fields ?? []).filter((f) => f && f.input).map((f) => f.name));
  const rootOf = (p) => String(p).split('.')[0];

  const written = new Set(inputs);
  for (const n of nodes) for (const w of n?.writes ?? []) written.add(rootOf(w));

  for (const n of nodes) {
    for (const w of n?.writes ?? []) if (!declared.has(rootOf(w))) {
      E('E_UNDECLARED_WRITE', `node "${n.id}" writes undeclared state field "${w}"`, `add "${rootOf(w)}" to spec.state.fields`);
    }
    for (const r of n?.reads ?? []) {
      if (!declared.has(rootOf(r))) E('E_UNDECLARED_READ', `node "${n.id}" reads undeclared state field "${r}"`, `add "${rootOf(r)}" to spec.state.fields`);
      else if (!written.has(rootOf(r))) E('E_UNWRITTEN_READ', `node "${n.id}" reads "${r}", which no node writes and which is not an input`, `mark "${rootOf(r)}" as {"input":true} or have an upstream node write it`);
    }
  }

  // --- verifier discipline: at least one, and it must be read-only ----------
  const verifiers = nodes.filter((n) => n?.kind === 'verify');
  if (verifiers.length === 0) {
    E('E_NO_VERIFIER', 'no node has kind "verify"', 'add one read-only verifier node that judges another node\'s output');
  }
  const producedFields = new Set();
  for (const n of nodes) if (n?.kind === 'produce') for (const w of n.writes ?? []) producedFields.add(rootOf(w));
  for (const v of verifiers) {
    for (const w of v.writes ?? []) {
      if (producedFields.has(rootOf(w))) {
        E('E_VERIFIER_WRITES_ARTIFACT', `verifier "${v.id}" writes "${w}", which a produce node also writes`,
          'a verifier must be read-only w.r.t. artifacts — have it write only its own verdict field');
      }
    }
    if ((v.reads ?? []).length === 0) {
      E('E_VERIFIER_READS_NOTHING', `verifier "${v.id}" reads no state`, 'a verifier must read the artifact it judges');
    }
  }

  // --- edges ---------------------------------------------------------------
  const exists = (id) => id === END || byId.has(id);
  edges.forEach((e, i) => {
    if (!e || typeof e !== 'object') { E('E_EDGE_SHAPE', `edges[${i}] is not an object`, 'each edge is {"from","to"}'); return; }
    if (!exists(e.from)) E('E_EDGE_FROM', `edges[${i}].from references unknown node "${e.from}"`, `use one of: ${[...byId.keys()].join(', ')}`);
    if (e.from === END) E('E_EDGE_FROM_END', `edges[${i}] originates at END`, 'END is terminal; remove this edge');
    const tos = Array.isArray(e.to) ? e.to : [e.to];
    if (Array.isArray(e.to) && !e.fanOut) E('E_FANOUT_FLAG', `edges[${i}].to is an array but fanOut is not set`, 'set "fanOut": true for parallel branches');
    for (const t of tos) if (!exists(t)) E('E_EDGE_TO', `edges[${i}].to references unknown node "${t}"`, `use a declared node id or "${END}"`);
    if (e.when != null) {
      try {
        const ast = parse(String(e.when));
        for (const p of referencedPaths(ast)) {
          if (!declared.has(rootOf(p))) E('E_COND_FIELD', `edges[${i}].when references undeclared state field "${p}"`, `add "${rootOf(p)}" to spec.state.fields`);
        }
      } catch (pe) {
        E('E_COND_PARSE', `edges[${i}].when is not a valid condition: ${pe.message}`, 'use paths, literals, == != < <= > >=, && || !');
      }
    }
  });

  // --- reachability, in both directions ------------------------------------
  if (!exists(spec.entry) || spec.entry === END) {
    E('E_ENTRY', `spec.entry "${spec.entry}" is not a declared node`, `set entry to one of: ${[...byId.keys()].join(', ')}`);
  } else {
    const succ = new Map([...byId.keys()].map((id) => [id, []]));
    for (const e of edges) {
      if (!succ.has(e.from)) continue;
      for (const t of (Array.isArray(e.to) ? e.to : [e.to])) succ.get(e.from).push(t);
    }
    const seen = new Set();
    (function walk(id) {
      if (id === END || seen.has(id)) return;
      seen.add(id);
      for (const t of succ.get(id) ?? []) walk(t);
    })(spec.entry);
    for (const id of byId.keys()) if (!seen.has(id)) {
      E('E_UNREACHABLE', `node "${id}" is unreachable from entry "${spec.entry}"`, 'add an edge into it, or delete it');
    }
    // can every node still reach END?
    const canEnd = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of byId.keys()) {
        if (canEnd.has(id)) continue;
        if ((succ.get(id) ?? []).some((t) => t === END || canEnd.has(t))) { canEnd.add(id); changed = true; }
      }
    }
    for (const id of seen) if (id !== END && !canEnd.has(id)) {
      E('E_NO_PATH_TO_END', `node "${id}" has no path to ${END}`, `add a terminating edge from "${id}" (directly or transitively) to "${END}"`);
    }
  }

  // --- joins match a fan-out -----------------------------------------------
  const fanOutBranches = new Set();
  for (const e of edges) if (e?.fanOut) for (const t of (Array.isArray(e.to) ? e.to : [e.to])) fanOutBranches.add(t);
  for (const n of nodes.filter((n) => n?.kind === 'join')) {
    const joins = n.joins ?? [];
    if (joins.length < 2) E('E_JOIN_ARITY', `join node "${n.id}" joins ${joins.length} branch(es)`, 'a join must wait on at least 2 fan-out branches');
    for (const j of joins) {
      if (!byId.has(j)) E('E_JOIN_UNKNOWN', `join "${n.id}" waits on unknown node "${j}"`, 'joins must name declared nodes');
      else if (!fanOutBranches.has(j)) E('E_JOIN_NOT_FANOUT', `join "${n.id}" waits on "${j}", which is not a fan-out branch`, 'only nodes reached by a fanOut edge can be joined');
    }
  }

  // --- caps: loop-backs must be bounded ------------------------------------
  const caps = spec.caps ?? {};
  if (!(caps.maxSteps > 0)) E('E_CAP_STEPS', 'caps.maxSteps must be a positive number', 'set caps.maxSteps (e.g. 24)');
  if (!(caps.maxSpendUsd > 0)) E('E_CAP_SPEND', 'caps.maxSpendUsd must be a positive number', 'set caps.maxSpendUsd (e.g. 1.00)');
  const loopCaps = caps.maxLoopBacks ?? {};
  for (const e of edges) {
    if (!e?.loopBack) continue;
    const tos = Array.isArray(e.to) ? e.to : [e.to];
    for (const t of tos) if (!(loopCaps[t] > 0)) {
      E('E_UNBOUNDED_LOOP', `loop-back edge into "${t}" has no positive caps.maxLoopBacks["${t}"]`,
        `add caps.maxLoopBacks["${t}"] = <n> so the cycle is provably bounded`);
    }
  }
  // A cycle is bounded only if at least one edge on it is a flagged loop-back.
  // Strip the loop-backs; anything still cyclic can run forever.
  {
    const succ = new Map([...byId.keys()].map((id) => [id, []]));
    for (const e of edges) {
      if (e?.loopBack || !succ.has(e.from)) continue;
      for (const t of (Array.isArray(e.to) ? e.to : [e.to])) if (t !== END) succ.get(e.from).push(t);
    }
    const cycle = findCycle(succ);
    if (cycle) {
      E('E_UNBOUNDED_CYCLE', `cycle ${cycle.join(' -> ')} -> ${cycle[0]} contains no loop-back edge`,
        `mark the returning edge "${cycle.at(-1)}" -> "${cycle[0]}" with "loopBack": true and add caps.maxLoopBacks["${cycle[0]}"]`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Return one cycle (as a node list) in a successor map, or null if acyclic. */
function findCycle(succ) {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map([...succ.keys()].map((k) => [k, WHITE]));
  const stack = [];
  let found = null;
  const dfs = (u) => {
    color.set(u, GREY); stack.push(u);
    for (const v of succ.get(u) ?? []) {
      if (found) return;
      if (!color.has(v)) continue;
      if (color.get(v) === GREY) { found = stack.slice(stack.indexOf(v)); return; }
      if (color.get(v) === WHITE) { dfs(v); if (found) return; }
    }
    color.set(u, BLACK); stack.pop();
  };
  for (const k of succ.keys()) { if (found) break; if (color.get(k) === WHITE) dfs(k); }
  return found;
}

export function assertValidSpec(spec) {
  const { ok, errors } = validateSpec(spec);
  if (!ok) throw new SpecError(errors);
  return spec;
}
