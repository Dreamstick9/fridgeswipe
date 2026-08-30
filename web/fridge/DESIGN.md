---
name: FridgeSwipe
description: Editorial kitchen — warm paper, ink, one Bordeaux pen; Italian labels, English body
colors:
  paper: "#F5F1E8"
  paper-deep: "#ECE6D9"
  sheet: "#FBF8F1"
  ink: "#1F1B16"
  ink-soft: "#5D564A"
  ink-faint: "#8A8172"
  rule: "rgba(31,27,22,.16)"
  bordeaux: "#6D1F2B"
typography:
  display:
    fontFamily: "'Bodoni Moda', Didot, 'Bodoni MT', Georgia, serif"
    fontSize: "clamp(1.75rem, 7.5vw, 2.375rem)"
    fontWeight: 460
    lineHeight: 1.08
    letterSpacing: "0"
  headline:
    fontFamily: "'Bodoni Moda', Didot, 'Bodoni MT', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.12
  body:
    fontFamily: "Jost, Futura, 'Avenir Next', 'Century Gothic', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Jost, Futura, 'Avenir Next', 'Century Gothic', sans-serif"
    fontSize: "0.65625rem"
    fontWeight: 500
    letterSpacing: "0.16em"
rounded:
  none: "0"
spacing:
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "32px"
  xl: "52px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "16px 22px"
  button-primary-hover:
    backgroundColor: "{colors.bordeaux}"
    textColor: "{colors.paper}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "15px 22px"
---

# Design System: FridgeSwipe

## Overview

**Creative North Star: "The House Menu"**

The interface is a fashion house's press dossier crossed with a kitchen's daily menu card: warm ivory paper, warm near-black ink, and one Bordeaux accent wielded like an editor's pen. Structure comes from hairline rules and whitespace, never from boxes; the only "card" in the system is the recipe sheet in the swipe deck, a lifted piece of paper. Type does the branding: Bodoni Moda sets dish names and stamps, Jost carries all UI text, and uppercase letterspaced Italian micro-labels with muted English echoes do the wayfinding ("GIORNO 2 · PRANZO" over "Day 2 · Lunch"). Questions, body copy, and primary actions stay English; practical constraint controls (time per dish, servings, diet) are plain English only. Light is the design; every background is painted explicitly.

**Key Characteristics:**
- Paper ground, ink text, one Bordeaux accent with editorial meaning
- Hairline 1px rules instead of bordered cards; sharp corners everywhere
- Didone display + geometric grotesque; tabular numerals for all data
- Italian micro-label garnish with muted English echoes; English body copy
- Restrained motion: fades, one authored swipe animation

## Colors

Warm paper neutrals plus a single claret accent; nothing else.

### Primary
- **Bordeaux** (#6D1F2B): the editor's pen. Killed candidates and their strikethroughs, the SÌ stamp and SÌ vote, missing ingredients, use-soon asterisks, selected-control underlines, primary-button hover. Never decoration, never large fills.

### Neutral
- **Ivory** (#F5F1E8): the page ground; body background and default surface.
- **Recessed paper** (#ECE6D9): photo placeholder wells.
- **Sheet** (#FBF8F1): the lifted recipe sheet in the deck, one step brighter than the ground.
- **Ink** (#1F1B16): all primary text, emphatic 1px rules, primary button fill, the NO stamp.
- **Soft ink** (#5D564A): secondary text; passes 4.5:1 on Ivory.
- **Faint ink** (#8A8172): decorative/large-only (skipped meals, disabled) — never body-size copy.
- **Hairline** (rgba(31,27,22,.16)): all structural rules; a fainter .09 variant separates list rows.

### Named Rules
**The Editor's Pen Rule.** Bordeaux appears only where a decision or urgency lives (kill, SÌ, missing, use-soon, selection). If a screen shows more than ~5% Bordeaux, it is shouting.
**The One Sheet Rule.** Only the deck's recipe sheet gets a filled surface and a shadow; everything else sits directly on the paper, divided by hairlines.

## Typography

**Display Font:** Bodoni Moda (with Didot, "Bodoni MT", Georgia, serif)
**Body Font:** Jost (with Futura, "Avenir Next", "Century Gothic", sans-serif)

**Character:** Vogue pairing — high-contrast Didone for names, stamps, and the meals-per-day numeral; quiet geometric grotesque for everything operable. The grotesque never exceeds 600 weight; the Didone never sets body copy.

### Hierarchy
- **Display** (460, clamp 28-38px, 1.08): screen questions and statements; dish names on the sheet at 24-30px.
- **Headline** (500, 24px, 1.12): screen titles inside working screens; "Giorno N" at 22px.
- **Body** (400, 15px, 1.5): running UI text, item names, steps. Inputs are 16px (blocks iOS focus zoom).
- **Label** (500, 10.5px, 0.16-0.18em, uppercase): kickers, category headers, control captions. Italian garnish lives here; muted echoes drop to 9px. Intentional micro steps 9/9.5/10/10.5/11/11.5/12/12.5/13/13.5px serve the label/echo/data set; they are on-system despite being absent from the frontmatter ramp.
- **Data** (body face, `font-variant-numeric: tabular-nums` globally): every numeral. Minutes use the prime (25′), journal seconds the double prime (12.4″).

### Named Rules
**The Garnish Rule.** Italian appears in micro-labels, stamps, day/meal headers, and section titles; where not self-evident it carries a small muted English echo ("TI MANCA · you'd need"). Questions, body copy, errors, and primary actions stay English. Practical constraint controls are plain English only. No French.
**The Caporali Rule.** Quotes from the pipeline (why-you, taste memory, learned profile) are set in italic Didone inside « caporali » with narrow no-break spaces.

## Layout

Single centered column, max-width 480px, 20px side padding, `height: 100dvh` app frame with inner scrollers (inventory list, journal, plan body) so the masthead and CTAs stay put; safe-area aware. Vertical rhythm from the spacing scale (6/12/20/32/52); more space above a heading than below it. At ≥720px the column widens to 560px and gains hairline left/right rules — the menu card on the table. The masthead (wordmark over a thick-thin double rule, Italian date "Edizione del …") is constant; each screen opens with a Bordeaux kicker, wizard screens add a back control and a serif I·II·III·IV step indicator.

## Elevation & Depth

Flat by default. Depth exists only in the swipe deck: stacked sheets recede by translate/scale with a degree of rotation (a loose pile of paper), and the top sheet carries a soft warm shadow (`0 1px 2px rgba(31,27,22,.06), 0 12px 32px rgba(31,27,22,.10)`) that deepens while dragged (`.lift`). Nothing else casts.

## Shapes

Sharp corners everywhere (0 radius) — paper is not rounded; the range slider's thumb is a 20px ink square on a 2px track whose fill is a JS-set gradient. Rules are 1px hairlines; the emphatic divider is the masthead's thick-thin pair (2px + 1px). Stamps (SÌ/NO) are double-bordered rectangles (2px + inner 1px inset 3px), rotated ±8°. Checkboxes are 17px hairline squares checked with a Bordeaux ✓ and a line-through label.

## Components

### Buttons
- **Shape:** sharp rectangle, Jost 500 caps, 0.14em tracking.
- **Primary:** ink fill, ivory text, 16px 22px padding; hover/active fills Bordeaux; disabled at 35% opacity.
- **Quiet:** transparent with 1px ink border; hover fills ink.
- **Text control:** label-style caps, underlined on hover (peeks, Add, Back, meal toggles).
- **Vote buttons:** serif "Sì" (Bordeaux border/text) and "No" (ink), min 52px tall; hover fills.
- **Focus:** 2px ink outline, 2px offset, :focus-visible only.

### Question list (wizard)
- Full-width hairline rows; option name in 21px Didone, right-aligned uppercase micro sub where needed; hover and picked state turn the name Bordeaux (picked adds a 1px underline); selection auto-advances after ~180ms.

### Segmented controls / meal slider
- Caption micro-label above; values as letterspaced text; selected value in ink with a 1px Bordeaux underline (inset box-shadow). The meals-per-day slider pairs a giant Didone numeral readout with a muted English line naming the meals.

### Inputs
- Transparent with bottom hairline only; 16px Jost; focus swaps the hairline to ink. Inline inventory rename swaps the row content for such an input.

### The Recipe Sheet (signature)
- Sheet fill, hairline border, 22px padding; kicker (chef · "Proposta n° N"), Didone dish name, ink rule, uppercase meta with primes and "voto" score ("long shot" in Bordeaux when risky), « why-you » in italic Didone, "DALLA TUA CUCINA · from your kitchen" / "TI MANCA · you'd need" label blocks, nutrition line pinned to the sheet's foot above "The method" peek (em-dash when null). SÌ stamp Bordeaux top-left at −8°, NO stamp ink top-right at 8°; opacity driven by drag distance.

### The Journal (signature)
- Streaming atelier log directly on the paper: 44px right-aligned tabular timestamp gutter (11px, double-prime seconds), hairline-separated entries; stage lines in letterspaced caps with pulsing middot ellipsis (no spinners); chef names in italic Didone; kills in Bordeaux with true line-through on dish names; taste-memory lines as italic caporali quotes.

## Do's and Don'ts

### Do:
- **Do** paint every background explicitly with Ivory (#F5F1E8); the light theme is the design.
- **Do** set every numeral tabular; use primes for minutes and double primes for seconds.
- **Do** mark use-soon items with a Bordeaux asterisk and one footnote legend.
- **Do** keep motion to opacity/transform (~200-450ms) plus the single authored card fly-out; animate the progress fill with `transform: scaleX`, never width.

### Don't:
- **Don't** use gradients (except the slider's two-stop track fill), glass, emoji decoration, or rounded corners.
- **Don't** put Bordeaux on anything that is not a decision, urgency, or selection.
- **Don't** box content in bordered cards; divide with hairlines (the recipe sheet is the sole exception).
- **Don't** use French anywhere, Italian for constraint-control labels, or Italian without an echo when the word is not self-evident.
