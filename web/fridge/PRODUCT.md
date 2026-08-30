# Product

<!-- impeccable:product-schema 1 -->
<!-- Facts inferred from the owner's briefs (no interactive user in-session); items marked [inferred] are assumptions the team may correct. -->

## Platform

web

## Users

Hackathon judges and demo visitors, opening the app on their phones — possibly by double-clicking the downloaded HTML file (file://). Job: photograph a real fridge/pantry, correct the detected inventory, answer a four-question order, and get a 1-7 day meal plan while watching the AI pipeline deliberate live. [inferred from briefs]

## Product Purpose

FridgeSwipe turns photos of a kitchen into a cooked plan: vision analysis builds an inventory, a multi-agent chef pipeline drafts and audits candidates per meal slot, the user locks each course with a SÌ swipe, and the app assembles per-day menus with macro/micro totals, eaten-meal logging, shopping gaps, and tips. Success = a complete, believable capture-to-plan demo in minutes.

## Positioning

The live, legible deliberation is the differentiator: candidates are pitched, cross-checked, and killed on screen with reasons, streamed as NDJSON. The deck learns taste on every swipe.

## Operating Context

- Served by `server/fridge-server.mjs` at `http://localhost:5177` (re-reads the file per request); must also work double-clicked from `file://` via the hardcoded API base `http://10.10.29.28:5177` (exact fallback line is a contract).
- Phone-first usage; desktop composition also judged.

## Capabilities and Constraints

- Single self-contained HTML file (`web/fridge/index.html`), inline CSS/JS, vanilla, no frameworks, no build step.
- Flow: capture → analyze (`/api/analyze` per photo + `/api/merge`) → editable inventory (+ "Time per dish" 15/30/60) → four-question order (days 1-7 with auto-advance; meals/day slider 1-7; diet vegetarian//vegan; free-text restrictions) → per-slot `/api/slotdeck` NDJSON stream → swipe deck (`/api/swipe` on every decision; SÌ locks the slot, NO deals the next card, exhausted deck regenerates with `offered` = names already shown) → `/api/planweek` plan with `dayTotals`, `/api/log` eaten logging, `/api/taste` profile.
- `/api/deck` and `/api/plan` are intentionally unused since the wizard rework (Tonight = 1 day through the slot flow). `constraints.servings` is fixed at 1; `constraints.restrictions` carries the free text.
- Meal map per meals/day n: 1 [dinner]; 2 [lunch,dinner]; 3 [breakfast,lunch,dinner]; 4 [b,l,snack,d]; 5 [b,snack,l,snack,d]; 6 [b,snack,l,snack,d,snack]; 7 [b,snack,l,snack,d,snack,snack]; slots day-major; repeated snacks are numbered (Spuntino 1/2/3).
- Card fields may be absent; `nutrition` may be null — render an em-dash, never crash.
- Client-side photo downscale ≤1280px JPEG ~0.85. Double-swipe guarded (`dataset.gone`), concurrent builds guarded (`building`).
- `web/fridge/classic.html` is the preserved previous UI; never overwrite it. UI work must not touch files outside `web/fridge/`.
- Test hook: `window.__seed(items?)` seeds inventory and jumps to that screen.

## Brand Commitments

- Name: FridgeSwipe. Visual world pinned by the owner: paper/ink editorial minimalism — warm paper, near-black ink, ONE Bordeaux accent, hairline rules, Didone display + quiet grotesque, light theme only.
- Language: bilingual Italian + English. Italian for micro-labels, stamps (SÌ/NO), day/meal headers (GIORNO, COLAZIONE, PRANZO, CENA, SPUNTINO), section titles ("La spesa"); English for questions, body copy, primary actions; non-obvious Italian labels carry a muted English echo. Exception: practical constraint controls (time per dish, servings, diet) are labeled in plain English only. No French anywhere.

## Evidence on Hand

- Working flow reference: `web/fridge/classic.html` (functional reference only, visual anti-reference).
- Live server on :5177 with real paid model calls; slot generations cost real money — exercise sparingly.

## Product Principles

- The pipeline's honesty is the show: never hide stages, kills, or reasons.
- Every tap responds instantly; network waits get live narration.
- Correctability over confidence: the inventory is the user's to fix.
- Nothing fabricated: absent data renders as absence (em-dash), not filler.
