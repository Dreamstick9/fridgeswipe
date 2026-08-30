// The cast of Kangaroo Court. Each node returns {writes} per the harness contract.
// All model output is parsed with extractJson — never trusted raw.

import { extractJson } from '../src/transport.mjs';

const asJson = (t, fallback) => { try { return extractJson(t); } catch { return fallback; } };

const TONE = `Setting: KANGAROO COURT — a gloriously over-the-top courtroom for petty disputes.
Style: dramatic legal theater with a wink of Indian courtroom drama ("Order! Order!"),
but sharp and genuinely fair underneath. Never mean-spirited, never crude. Keep it tight.`;

export function makeNodeImpls() {
  return {
    clerk: async ({ state, ask }) => {
      const { text } = await ask(
        `Side A — ${state.caseA.name}: """${state.caseA.transcript}"""
Side B — ${state.caseB.name}: """${state.caseB.transcript}"""

File this dispute. Return JSON only:
{"caseTitle":"<punchy 'X v. Y — the matter of ...'>","charges":["<mock-legal charge, max 12 words>","<another>"],"summary":"<neutral 2-sentence framing>"}`,
        `${TONE}\nYou are the COURT CLERK. Neutral, officious, secretly loving the drama.`,
      );
      return { writes: { docket: asJson(text, { caseTitle: 'The People v. Chaos', charges: ['general pettiness'], summary: text.slice(0, 200) }) } };
    },

    advocate_a: async ({ state, ask }) => {
      const prior = state.objection?.passed === false
        ? `\nTHE EXAMINER OBJECTED to the last round: ${JSON.stringify(state.objection.reasons)}. Fix those holes head-on.` : '';
      const { text } = await ask(
        `Docket: ${JSON.stringify(state.docket)}
Your client — ${state.caseA.name}: """${state.caseA.transcript}"""${prior}

Make the STRONGEST good-faith case for your client. Return JSON only:
{"opening":"<one theatrical opening line>","points":["<argument, max 20 words>","<2nd>","<3rd>"],"concession":"<one honest weakness you admit>"}`,
        `${TONE}\nYou are ADVOCATE A — silver-tongued, passionate, but honest about weaknesses.`,
      );
      return { writes: { argA: asJson(text, { opening: text.slice(0, 120), points: [], concession: '' }) } };
    },

    advocate_b: async ({ state, ask }) => {
      const prior = state.objection?.passed === false
        ? `\nTHE EXAMINER OBJECTED to the last round: ${JSON.stringify(state.objection.reasons)}. Fix those holes head-on.` : '';
      const { text } = await ask(
        `Docket: ${JSON.stringify(state.docket)}
Your client — ${state.caseB.name}: """${state.caseB.transcript}"""${prior}

Make the STRONGEST good-faith case for your client. Return JSON only:
{"opening":"<one theatrical opening line>","points":["<argument, max 20 words>","<2nd>","<3rd>"],"concession":"<one honest weakness you admit>"}`,
        `${TONE}\nYou are ADVOCATE B — icy, precise, devastating, but honest about weaknesses.`,
      );
      return { writes: { argB: asJson(text, { opening: text.slice(0, 120), points: [], concession: '' }) } };
    },

    hearing: async ({ state, ask }) => {
      const { text } = await ask(
        `Advocate A argued: ${JSON.stringify(state.argA)}
Advocate B argued: ${JSON.stringify(state.argB)}

Stage the exchange as a courtroom script. Return JSON only:
{"exchange":[{"speaker":"ADVOCATE A|ADVOCATE B","line":"<max 22 words>"}],"tension":"<what the case now hinges on, one sentence>"}
5-7 lines, alternating, each landing a real point from the arguments.`,
        `${TONE}\nYou are the COURT REPORTER staging the hearing.`,
      );
      return { writes: { record: asJson(text, { exchange: [], tension: text.slice(0, 160) }) } };
    },

    examiner: async ({ state, ask }) => {
      const { text } = await ask(
        `The hearing record: ${JSON.stringify(state.record)}

Cross-examine it. Did either side dodge, contradict themselves, or leave a load-bearing claim unsupported?
Be STRICT — a first-round record usually deserves an objection unless it is genuinely airtight.
Return JSON only:
{"passed":<bool>,"reasons":["<specific hole, max 15 words>"],"weakSide":"A|B|both|none"}`,
        `${TONE}\nYou are the CROSS-EXAMINER. Read-only. You judge the arguments; you never rewrite them.`,
      );
      const objection = asJson(text, { passed: true, reasons: ['examiner speechless'], weakSide: 'none' });
      if (typeof objection.passed !== 'boolean') objection.passed = true;
      return { writes: { objection } };
    },

    bench: async () => ({ writes: {} }),

    judge: async ({ state, ask }) => {
      const { text } = await ask(
        `Docket: ${JSON.stringify(state.docket)}
Final record: ${JSON.stringify(state.record)}
Examiner's notes: ${JSON.stringify(state.objection)}

Rule NOW. Return JSON only:
{"winner":"A|B|split","split":"<vote like 3-2>","ruling":"<theatrical 2-3 sentence ruling, quotable, starts with 'ORDER! ORDER!'>",
"sentence":"<one funny, doable compensation the loser owes — chai, dishes, public apology>","oneLiner":"<the shareable zinger, max 12 words>"}
Fair on the merits. Funny in the delivery.`,
        `${TONE}\nYou are THE HONOURABLE JUDGE. Booming, final, secretly delighted.`,
      );
      return { writes: { verdict: asJson(text, { winner: 'split', split: '2-2', ruling: text.slice(0, 240), sentence: 'chai for everyone', oneLiner: 'Justice is petty.' }) } };
    },
  };
}
