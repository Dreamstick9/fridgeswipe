# graph-harness

Compiles a raw idea prompt into a **running agent graph** — nodes that do the work, edges
that route between them, one shared state object flowing along the edges.

This is *graph engineering* in the execution sense: which node runs next, what state it
receives, how control flows. It is not a knowledge graph.

```bash
node src/cli.mjs compile "a bot that triages incoming support tickets"
node src/cli.mjs run triages-incoming-support-graph "printer is on fire"
node src/cli.mjs validate examples/broken.spec.json
```

## The four floors

Each floor is validated before the next one is generated. A floor that fails is
re-prompted with its own errors, a bounded number of times, then fails loudly.

| Floor | In | Out | Validator |
|---|---|---|---|
| `intent` | raw prompt | goal, deliverable, inputs, distinct steps | shape + step count |
| `schema` | intent | the shared state contract | identifiers, types, ≥1 input field |
| `spec` | intent + schema | nodes, edges, routers, caps | **17 structural rules** (below) |
| `code` | spec | runnable `.mjs` per node + `graph.mjs` | every module must parse |

The code floor is a deterministic transform, not a model call — if the spec passed, the
code is valid by construction.

## What the spec floor rejects

Reachability (every node reachable from entry, every node has a path to `END`), undeclared
or never-written state reads, verifier discipline (at least one `verify` node; it must read
an artifact and must never write a field a `produce` node writes), unparseable or
undeclared-field router conditions, unknown edge endpoints, reserved/duplicate ids, join
arity, missing caps, and — the important one — **any cycle that does not contain a bounded
loop-back edge**.

```
$ node src/cli.mjs validate examples/broken.spec.json
graph spec rejected at the spec floor (10 problems):
  10. [E_UNBOUNDED_CYCLE] cycle write -> check -> write contains no loop-back edge
      fix: mark the returning edge "check" -> "write" with "loopBack": true
           and add caps.maxLoopBacks["write"]
```

## Router conditions are parsed, never eval'd

Model-authored conditions go through a small recursive-descent parser (`src/expr.mjs`) —
paths, literals, `== != < <= > >=`, `&& || !`, parentheses. `process.exit(1)` is a syntax
error, not a shell.

## Caps

Three independent bounds, all enforced by the executor: `maxSteps`, `maxSpendUsd` (read
from the transport's real accumulated cost), and per-target `maxLoopBacks`. A verifier that
never passes halts as `halted:cap:maxLoopBacks` — it does not run away.

## Transports

`liveTransport` rides the ambient Claude Code login via `@anthropic-ai/claude-agent-sdk`
(model `claude-opus-5`). `stubTransport` / `fixtureTransport` are deterministic and offline.
Same interface, so every floor and the executor are exercised either way.

```bash
TRANSPORT=live node src/cli.mjs compile "..."   # real model design
TRANSPORT=fixture ...                            # offline (default while auth is blocked)
```

See `.goal-task/graph-harness/state.md` for the current auth status.

## Tests

```bash
npm test   # 17 tests: validators, executor, caps, fan-out/join, end-to-end compile
```
