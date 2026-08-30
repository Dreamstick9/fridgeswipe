# 90-second demo runbook

Four beats. Every command below is real and rerunnable.

## 1. "Point it at any idea." (20s)

```bash
node src/cli.mjs compile "a bot that triages incoming support tickets"
```

Four floors tick green: `intent → schema → spec → code`. Ends with node/edge counts.
The point: **retargeting is one command**, not a rewrite.

## 2. "The spec floor is a real compiler, not vibes." (25s)

```bash
DEMO_REPAIR=1 node src/cli.mjs compile "a bot that triages incoming support tickets"
```

The spec floor **rejects** the first graph — `E_UNBOUNDED_CYCLE: cycle draft -> review ->
decide -> draft contains no loop-back edge` — feeds that error back, and the second attempt
converges. Bad graphs never reach codegen.

```bash
node src/cli.mjs validate examples/broken.spec.json
```

Ten distinct coded rejections with fixes: reserved ids, undeclared reads, a verifier that
writes an artifact, an unparseable condition, unreachable nodes, missing caps.

## 3. "Now watch it run." (30s)

```bash
DEMO_REVISE=2 node src/cli.mjs run triages-incoming-support-graph "printer is on fire"
```

The trace shows the machinery: `◆ produce`, `◇ verify`, `◈ router`, conditional edges taken
and **not** taken, and `⟲ loop-back into draft (1/2)` — the reviewer sending work back to its
producer, twice, before it passes.

## 4. "And it can't run away." (15s)

```bash
DEMO_REVISE=99 node src/cli.mjs run triages-incoming-support-graph "x"; echo "exit=$?"
```

`■ HALT cap:maxLoopBacks node "draft" looped 3 times, cap 2` — exit 1. A verifier that never
passes is bounded, not a runaway bill.

## The line to land

> Most agent demos are a chatbot you have to take on faith. This one shows you the graph:
> which node ran, which edge was taken, which branch wasn't, and where the reviewer sent the
> work back. The graph *is* the demo.

## If asked "is this just LangGraph?"

No — this compiles *to* a graph. LangGraph is where you hand-write `StateGraph` nodes and
edges. Here the idea prompt is the input and the validated graph is the output, with a spec
floor that rejects unbounded cycles, non-read-only verifiers, and unreachable nodes before
any code is emitted.
