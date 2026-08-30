// The graph spec grammar, stated once and injected into the spec floor's prompt.
export const SPEC_GRAMMAR = `A graph spec is JSON:
{
  "version": 1,
  "name": "<kebab-case>",
  "entry": "<node id>",
  "caps": { "maxSteps": <int>, "maxSpendUsd": <number>, "maxLoopBacks": { "<node id>": <int> } },
  "state": { "fields": [ { "name": "<ident>", "type": "string|number|boolean|object|array", "input": <bool, optional>, "description": "<text>" } ] },
  "nodes": [ { "id": "<ident>", "kind": "produce|verify|router|join", "role": "<instruction for this node>", "reads": ["<field>"], "writes": ["<field>"], "joins": ["<node id>"] } ],
  "edges": [ { "from": "<node id>", "to": "<node id>|END|[<ids>]", "when": "<condition, optional>", "loopBack": <bool, optional>, "fanOut": <bool, optional> } ]
}

RULES (the spec floor rejects violations):
- Every node id unique; "END" is reserved and implicit.
- Every field in reads/writes must be declared in state.fields.
- A field that is read must be written by some node, or declared "input": true.
- At least one node has kind "verify". A verifier READS an artifact and writes ONLY its own
  verdict field — it must never write a field that a "produce" node also writes.
- Every node must be reachable from entry, and must have a path to END.
- Conditions use only: state paths (a.b), literals (true/false/numbers/"strings"),
  and == != < <= > >= && || ! and parentheses. No function calls.
- Any cycle must contain an edge marked "loopBack": true, and caps.maxLoopBacks must give
  that loop target a positive integer bound.
- Fan-out: one edge with "to": [ids] and "fanOut": true. A "join" node lists those ids in
  "joins" and waits for all of them.
- Prefer 3-6 nodes. Every node must earn its place.`;
