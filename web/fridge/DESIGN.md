---
name: FridgeSwipe
description: Parisian editorial kitchen — warm paper, ink, one Bordeaux pen
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
    fontSize: "clamp(1.75rem, 6vw, 2.5rem)"
    fontWeight: 460
    lineHeight: 1.08
    letterSpacing: "0"
  headline:
    fontFamily: "'Bodoni Moda', Didot, 'Bodoni MT', Georgia, serif"
    fontSize: "1.375rem"
    fontWeight: 500
    lineHeight: 1.15
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
    padding: "15px 22px"
  button-primary-hover:
    backgroundColor: "{colors.bordeaux}"
    textColor: "{colors.paper}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "14px 22px"
---

# Design System: FridgeSwipe

## Overview

**Creative North Star: "La Carte de la Maison"**

The interface is a maison de couture's press dossier crossed with a bistro's daily carte: warm ivoire paper, warm near-black ink, and one Bordeaux accent wielded like an editor's pen. Structure comes from hairline rules and whitespace, never from boxes; the only "card" in the system is the recipe sheet in the swipe deck, a lifted piece of paper. Type does the branding: a Didone display face (Bodoni Moda) sets dish names like couture pieces, a Futura-descended grotesque (Jost) carries all UI text, and uppercase letterspaced micro-labels with French garnish do the wayfinding ("VOTRE CUISINE", "JOUR 2 · DÉJEUNER"). Body copy stays English. Light is the design; every background is painted explicitly.

**Key Characteristics:**
- Paper ground, ink text, one Bordeaux accent with editorial meaning
- Hairline 1px rules instead of bordered cards; sharp corners everywhere
- Didone display + geometric grotesque; tabular numerals for all data
- French micro-label garnish; English body copy
- Restrained motion: fades, one authored swipe animation

## Colors

Warm paper neutrals plus a single claret accent; nothing else.

### Primary
- **Bordeaux** (#6D1F2B): the editor's pen. Killed candidates and their strikethroughs, the OUI stamp, missing ingredients, use-soon asterisks, selected-control underlines, primary-button hover. Never decoration, never large fills.

### Neutral
- **Ivoire** (#F5F1E8): the page ground; body background and default surface.
- **Papier creusé** (#ECE6D9): recessed wells — photo placeholders, journal timestamp gutter.
- **Feuille** (#FBF8F1): the lifted recipe sheet in the deck, one step brighter than the ground.
- **Encre** (#1F1B16): all primary text, emphatic 1px rules, primary button fill, the NON stamp.
- **Encre douce** (#5D564A): secondary text; passes 4.5:1 on Ivoire.
- **Encre pâle** (#8A8172): decorative/large-only (ghost numerals, disabled) — never body-size copy.
- **Filet** (rgba(31,27,22,.16)): the hairline; all structural rules and separators.

### Named Rules
**The Éditeur's Pen Rule.** Bordeaux appears only where a decision or urgency lives (kill, OUI, missing, use-soon, selection). If a screen shows more than ~5% Bordeaux, it is shouting.
**The One Sheet Rule.** Only the deck's recipe sheet gets a filled surface and a shadow; everything else sits directly on the paper, divided by hairlines.

## Typography

**Display Font:** Bodoni Moda (with Didot, "Bodoni MT", Georgia, serif)
**Body Font:** Jost (with Futura, "Avenir Next", "Century Gothic", sans-serif)

**Character:** Vogue-Paris pairing — high-contrast Didone for names and stamps, quiet geometric grotesque for everything operable. The grotesque never exceeds 600 weight; the Didone never sets body copy.

### Hierarchy
- **Display** (460, clamp(1.75rem–2.5rem), 1.08): screen statements and dish names on the sheet.
- **Headline** (500, 22px, 1.15): section titles inside plans ("Jour 1"), fork options.
- **Body** (400, 15px, 1.5): all running UI text, item names, steps.
- **Label** (500, 10.5px, 0.16em tracking, uppercase): kickers, category headers, control captions. French garnish lives here.
- **Data** (body face, `font-variant-numeric: tabular-nums`): every numeral — timestamps, nutrition, counts. Minutes use the prime mark (25′).

### Named Rules
**The Garnish Rule.** French appears only in micro-labels, kickers, and mode names (Ce soir / La semaine); body copy, buttons that instruct, and errors stay English.
**The Guillemet Rule.** Quotes from the pipeline ("why you", learned taste) are set in italic Didone inside « guillemets ».

## Layout

Single centered column, max-width 480px, 20px side padding, safe-area aware; content on the page itself, no panels. Vertical rhythm from the spacing scale (6/12/20/32/52); more space above a heading than below it. At ≥720px the column widens to 560px and gains hairline left/right rules — the carte on the table. The masthead (wordmark over a thick-thin double rule with the day's French date) is constant across screens; each screen opens with a micro-label kicker.

## Elevation & Depth

Flat by default. Depth exists only in the swipe deck: stacked sheets recede by translate/scale behind a hairline border, and the top sheet carries a soft warm shadow (`0 1px 2px rgba(31,27,22,.08), 0 12px 32px rgba(31,27,22,.14)`) that deepens while dragged. Nothing else casts.

## Shapes

Sharp corners everywhere (0 radius) — paper is not rounded. Rules are 1px hairlines; the emphatic divider is the masthead's thick-thin pair (2px + hairline). Stamps (OUI/NON) are double-bordered rectangles, rotated a few degrees. Checkboxes are 18px hairline squares.

## Components

### Buttons
- **Shape:** sharp rectangle (0 radius), Jost 500 caps, 0.14em tracking.
- **Primary:** Encre fill, Ivoire text, 15px 22px padding; hover/active fills Bordeaux; disabled at 35% opacity.
- **Quiet:** transparent with 1px Encre border; hover fills Encre, text Ivoire.
- **Text control:** label-style caps with no border, underlined 1px on hover; used for peeks, segment values, inline actions.
- **Focus:** 2px Encre outline, 2px offset, on :focus-visible only.

### Segmented controls (constraints, wizard)
- **Style:** caption micro-label above; values as text separated by hairline gaps; selected value in Encre with a 1px Bordeaux underline (3px offset); unselected in Encre douce.

### Inputs
- **Style:** transparent, bottom hairline only; Jost 15px; focus swaps the hairline to 1px Encre. Placeholder in Encre douce.

### The Recipe Sheet (signature)
- Feuille fill, hairline border, 22px padding, sharp corners; kicker (chef), Didone dish name, hairline, meta line with primes and tabular data, « why-you » in italic Didone, DE VOTRE CUISINE / IL VOUS MANQUE label blocks, nutrition line in tabular numerals (em-dash when absent), STEPS peek. OUI stamp Bordeaux top-left rotated −8°, NON stamp Encre top-right rotated 8°.

### The Journal (signature)
- Streaming feed as an atelier log: 44px tabular timestamp gutter, hairline-separated entries; stage lines in letterspaced caps; kills in Bordeaux with a true line-through on the dish name; pending lines end in three pulsing dots (no spinner rings).

## Do's and Don'ts

### Do:
- **Do** paint every background explicitly with Ivoire (#F5F1E8); the light theme is the design.
- **Do** set every numeral tabular and right-align numeric columns.
- **Do** mark use-soon items with a Bordeaux asterisk and one footnote legend ("* use soon").
- **Do** keep motion to opacity/transform fades (~200ms) plus the single authored card fly-out.

### Don't:
- **Don't** use gradients, glass, blur-as-decoration, emoji-as-decoration, or rounded corners.
- **Don't** put Bordeaux on anything that is not a decision, urgency, or selection.
- **Don't** box content in bordered cards; divide with hairlines (the recipe sheet is the sole exception).
- **Don't** set French in body copy or error messages; garnish stays in labels.
