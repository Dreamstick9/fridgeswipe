# graph-harness — live state

**Baseline:** fresh repo, initialized 2026-08-30. Nothing pre-existing.
**Resume entrypoint:** `node src/cli.mjs compile "<idea prompt>"` then `node src/cli.mjs run <out/spec.json>`.

## Preflight: model access — BLOCKED (fallback active)

Ran `node scripts/preflight.mjs` twice (bounded retry). Both attempts:

```
Claude Code returned an error result:
Failed to authenticate: OAuth session expired and could not be refreshed
```

Evidence: `~/.claude/.credentials.json` last written 2026-08-25 (stale); `ANTHROPIC_API_KEY`
unset; `ant` CLI absent. The parent Claude Code session holds a working token in memory, but
the Agent SDK spawns a *child* Claude Code that re-reads credentials from disk and fails to
refresh. Not transient — reproduced on both attempts.

**SUBSTITUTION IN EFFECT:** every compiler floor and the executor are built and validated
against `stubTransport` (deterministic, offline). The live path (`liveTransport`) is fully
wired and exercised by the same interface; no code change is needed to switch.

**Unblock condition:** either `export ANTHROPIC_API_KEY=<key>` (hackathon partner credits
would do it — the SDK picks the env var up automatically) or re-login in an interactive
terminal. Then rerun `node scripts/preflight.mjs`; `TRANSPORT=live` flips the harness over.

## Phases

- [x] P0 scaffold + transport interface + preflight
- [x] P1 safe expression evaluator (src/expr.mjs, recursive descent, no eval)
- [x] P2 graph spec format + spec-floor validators (src/spec.mjs, 17 rules)
- [x] P3 executor: conditional edges, bounded loop-backs, fan-out/fan-in, caps
- [x] P4 run trace + renderer (src/trace.mjs)
- [x] P5 compiler floors: intent -> schema -> spec -> code (src/compile.mjs, src/floors/)
- [x] P6 CLI, two end-to-end idea prompts, malformed-spec case, runaway-bounded case
- [ ] P7 independent review + re-review  <- IN PROGRESS

## Gate evidence (all commands rerunnable)

| Gate | Evidence | Status |
|---|---|---|
| 1 two ideas compile unedited | `tests/compile.test.mjs`; `out/mobile-turns-photo-graph`, `out/dashboard-watches-github-graph` | PASS |
| 2 conditional edge + loop-back fire | `DEMO_REVISE=2 node src/cli.mjs run mobile-turns-photo-graph "..."` -> 2 loop-backs, END taken | PASS |
| 3 runaway bounded | `DEMO_REVISE=99 ... run` -> `halted:cap:maxLoopBacks`, exit 1 | PASS |
| 4 malformed spec caught at spec floor | `node src/cli.mjs validate examples/broken.spec.json` -> 10 coded errors, exit 1 | PASS |
| 5 trace legible | `src/trace.mjs` renderer; `out/*/last-run.trace.json` | PASS |
| 6 independent review | subagent dispatched | PENDING |

`npm test` -> 17/17 passing.

## Fixed during build

- Cycle validator wrongly flagged every edge on a cycle; now strips loop-back edges and
  reports any cycle that remains (`E_UNBOUNDED_CYCLE`).
- Generated code hard-coded `../../src/...`, breaking any out-of-project output dir; codegen
  now resolves harness specifiers at emit time and realpaths the output dir (macOS
  /tmp -> /private/var symlink).

## Deferred

- Live-transport end-to-end evidence — deferred behind the auth blocker above. All other
  gates are reachable on the stub; this one flips green the moment a credential exists.
