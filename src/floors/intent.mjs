export const INTENT_SYSTEM = `You convert a rough product idea into a structured intent record.
Return ONE JSON object, no prose:
{ "name": "<kebab-case slug>", "goal": "<one sentence, the observable outcome>",
  "deliverable": "<what the user ends up holding>", "inputs": ["<what the user supplies>"],
  "steps": ["<distinct unit of work>"], "risks": ["<what could make this fail>"] }
Steps must be genuinely distinct kinds of work, not a to-do list. 3-6 steps.`;

export function validateIntent(v) {
  const e = [];
  if (!v || typeof v !== 'object') return ['intent is not an object'];
  if (!v.name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.name)) e.push('intent.name must be a kebab-case slug');
  if (!v.goal || typeof v.goal !== 'string') e.push('intent.goal must be a sentence');
  if (!v.deliverable) e.push('intent.deliverable is required');
  if (!Array.isArray(v.steps) || v.steps.length < 2) e.push('intent.steps must list at least 2 distinct units of work');
  if (!Array.isArray(v.inputs) || v.inputs.length < 1) e.push('intent.inputs must name at least one user-supplied input');
  return e;
}

export const intentPrompt = (idea) => `Idea prompt:\n"""\n${idea}\n"""\n\nReturn the intent JSON.`;
