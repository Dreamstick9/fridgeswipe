# FridgeSwipe

## 🧊 What it is

Photograph your fridge and pantry, and the AI turns the photos into an inventory you can edit by hand. Answer four simple questions — how many days to plan, meals per day (a 1–7 slider), vegetarian / non-vegetarian / vegan, and any other restrictions — then swipe SÌ or NO through 5 real recipe options for each meal slot, like a dating app for dinner. When every slot is filled you get a weekly plan with per-day calories, macros and micronutrients, a shopping list of only the ingredients you're missing, and an "I ate it" button that tracks what you actually cooked.

## 🔍 Why it's not a GPT wrapper

A wrapper sends one prompt to a model and shows you the answer. FridgeSwipe runs a pipeline for every meal slot, and plain code — not the AI — has the final word at each step:

1. **Real web search first.** Before any recipe is written, the server makes a real web search call (OpenAI's Responses API `web_search` tool) scoped to the top items actually in your fridge. So the ideas are grounded in what people currently cook, not just what the model remembers.
2. **Two chefs per slot, in parallel.** Each meal slot is drafted by two different "chef" personas at the same time (for example a home-cooking chef and a fresh-and-light chef), each proposing several dishes. Two independent drafts give real variety instead of one model's default answer.
3. **A code cross-check catches made-up ingredients.** Every ingredient a recipe claims to use is checked, by deterministic code with fuzzy word matching, against your real inventory ("egg" no longer matches "eggplant"). If the AI invented an ingredient you don't have, the code reclassifies it as missing — the model cannot lie its way past this step.
4. **A code nutrition audit.** The server recomputes each recipe's calories from its own macros (kcal = 4·protein + 4·carbs + 9·fat). If the model's calorie number drifts more than 20% from the arithmetic, code overwrites it. The nutrition you see is math, not autocomplete.
5. **A code ranker.** The surviving recipes are ordered by plain code: how well their taste tags match your swipe history, minus penalties for missing ingredients.
6. **A taste profile that learns.** Every swipe is saved to disk. Once you have a few, the server distills your recent swipes into a taste profile that is fed into every future chef prompt and into the ranker — the app genuinely gets better the more you use it.

If one AI provider fails, the app doesn't: it falls back through four model tiers — OpenAI `gpt-5.6-luna` (primary) → Groq `gpt-oss-120b` → Groq `gpt-oss-20b` → NVIDIA NIM — with per-tier timeouts and a circuit breaker that sidelines a failing provider for 45 seconds instead of stalling every request on it.

## ▶️ How to run it

**1. Add your API keys.** Create a file called `.env` in the project root (see `.env.example` for the layout) and paste your keys. Only one is strictly required, but OpenAI is the primary (it powers the photo analysis and the web search); the others are fallbacks:

```
OPENAI_API_KEY=...
GROQ_API_KEY=...
NVIDIA_API_KEY=...
```

**2. Start the server** (it serves both the API and the web app on port 5177):

```bash
node server/fridge-server.mjs
```

**3. Open the web app.** On any phone or laptop on the same Wi-Fi, open:

```
http://<your-LAN-IP>:5177
```

**4. (Optional) Run the native app.** In a second terminal:

```bash
cd fridge-app && npx expo start
```

Then open the `exp://...` URL it prints in the Expo Go app (SDK 54) on your phone.

## 🗺️ Architecture

Everything lives in one repo, and the server is a single file with no framework:

- **`server/fridge-server.mjs`** — the whole backend. Its endpoints:
  - `POST /api/analyze` — takes a fridge photo, returns an inventory list (AI vision).
  - `POST /api/merge` — merges and dedupes inventories from multiple photos.
  - `POST /api/slotdeck` — runs the full pipeline for one meal slot (web scout → 2 chefs → cross-check → nutrition audit → rank) and streams progress live as newline-delimited JSON.
  - `POST /api/planweek` — builds the weekly ledger in deterministic code: shopping gaps, contested ingredients, per-day nutrition totals.
  - `POST /api/swipe` — records each SÌ/NO swipe to disk for the taste profile.
  - `POST /api/log` — records "I ate it".
  - `GET /api/taste` — returns the current learned taste profile.
- **`web/fridge/index.html`** — the entire web client in a single file, with an Italian-editorial design (hence the SÌ stamps).
- **`fridge-app/`** — the native client, runs in Expo Go.
- **`data/`** — runtime state (your swipes and eaten log), gitignored.

## 🧰 Tech stack

- **Server:** Node.js, no framework — one plain HTTP server file.
- **Web client:** vanilla HTML/CSS/JS in a single file, no build step.
- **Native app:** Expo / React Native (Expo Go, SDK 54).
- **AI providers:** OpenAI (primary: vision, web search, chefs) with Groq and NVIDIA NIM as automatic fallbacks.

---

*The previous README in this repo (documenting an earlier hackathon project) was moved to [`docs/README-redflag.md`](docs/README-redflag.md).*
