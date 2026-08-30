# Product

<!-- impeccable:product-schema 1 -->
<!-- All facts below are inferred from the redesign brief and the working code (no interactive user available in this session); items marked [inferred] are assumptions the team may correct. -->

## Platform

web

## Users

Hackathon judges and demo visitors, opening the app on their phones during a live demo; secondarily the team itself. Job: photograph a real fridge/pantry, correct the detected inventory, and get either tonight's menu or a 1-3 day meal plan, watching the AI pipeline deliberate live. [inferred from brief: "judges open it on phones"]

## Product Purpose

FridgeSwipe turns photos of a kitchen into a cooked plan: vision analysis builds an inventory, a multi-agent chef pipeline drafts and audits recipe candidates, the user swipes OUI/NON, and the app assembles a cooking order, shopping gaps, and (weekly mode) per-day nutrition totals with eaten-meal logging. Success = a complete, believable capture-to-plan demo in minutes.

## Positioning

The live, legible deliberation is the differentiator: candidates are pitched, cross-checked, and killed on screen with reasons, streamed as it happens (NDJSON). The swipe deck learns taste per swipe. [inferred: "the streaming feed is the demo's wow moment"]

## Operating Context

- Served by `server/fridge-server.mjs` at `http://localhost:5177` (re-reads the file per request); must also work double-clicked from `file://` via the hardcoded API base `http://10.10.29.28:5177`.
- Phone-first usage in demo lighting; desktop composition also judged.

## Capabilities and Constraints

- Single self-contained HTML file (`web/fridge/index.html`), inline CSS/JS, vanilla, no frameworks, no build step.
- Endpoints (fixed contract): `/api/analyze`, `/api/merge`, `/api/deck` (NDJSON stream), `/api/slotdeck` (NDJSON stream + `scout` event), `/api/swipe` (fired on every decision), `/api/plan`, `/api/planweek` (adds `dayTotals`), `/api/log`, `/api/taste`.
- Card shape may omit fields; `nutrition` may be null — render an em-dash, never crash.
- Client-side photo downscale ≤1280px JPEG ~0.85 before upload.
- Guard double-swipes (`el.dataset.gone`) and concurrent deck builds (`building` flag).
- `web/fridge/classic.html` is the preserved previous UI; never overwrite it.
- Files outside `web/fridge/` must not be touched by UI work.

## Brand Commitments

- Name: FridgeSwipe. Modes are named "Ce soir" and "La semaine" (user-pinned).
- Visual world pinned by the owner: Parisian editorial / maison de couture minimalism — warm paper, near-black ink, ONE accent, hairline rules, Didone display + quiet grotesque, uppercase letterspaced micro-labels with French garnish; body copy stays English. Light theme is the design. No purple/orange gradients, no glassmorphism, no emoji decoration, no dark-SaaS look.

## Evidence on Hand

- Working flow, state machine, and streaming client code: `web/fridge/classic.html` (functional reference only, visual anti-reference).
- Live server on :5177 with real (paid) model calls; slot generations cost real money — exercise sparingly.

## Product Principles

- The pipeline's honesty is the show: never hide stages, kills, or reasons.
- Every tap the judge makes must respond instantly; network waits get live narration.
- Correctability over confidence: the inventory is the user's to fix.
- Nothing fabricated: absent data renders as absence (em-dash), not filler.
