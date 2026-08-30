export const SCHEMA_SYSTEM = `You design the shared state object that flows along a graph's edges.
Return ONE JSON object, no prose:
{ "fields": [ { "name": "<lowerCamel ident>", "type": "string|number|boolean|object|array",
                "input": <true only for values the user supplies at run time>,
                "description": "<what it holds and who writes it>" } ] }
Design the state as a contract: one field per artifact that crosses a node boundary.
Include a verdict-shaped object field for the verifier. 4-8 fields. No nesting beyond one level.`;

export function validateSchema(v) {
  const e = [];
  if (!v || !Array.isArray(v.fields)) return ['schema.fields must be an array'];
  if (v.fields.length < 2) e.push('schema.fields needs at least 2 fields');
  const seen = new Set();
  for (const [i, f] of v.fields.entries()) {
    if (!f?.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.name)) e.push(`fields[${i}].name must be an identifier`);
    else if (seen.has(f.name)) e.push(`duplicate field "${f.name}"`); else seen.add(f.name);
    if (!['string', 'number', 'boolean', 'object', 'array'].includes(f?.type)) e.push(`fields[${i}].type is invalid`);
  }
  if (!v.fields.some((f) => f?.input)) e.push('at least one field must be marked "input": true');
  return e;
}

export const schemaPrompt = (intent) =>
  `Intent:\n${JSON.stringify(intent, null, 2)}\n\nReturn the shared-state schema JSON.`;
