// Tiny safe expression language for router conditions.
// Model-authored strings are parsed to an AST and interpreted — never eval'd.
// Grammar: or := and ('||' and)* ; and := not ('&&' not)* ; not := '!' not | cmp
//          cmp := primary (OP primary)? ; primary := '(' or ')' | literal | path
// Supported ops: == != < <= > >=

const OPS = ['==', '!=', '<=', '>=', '<', '>'];

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { toks.push({ t: c }); i++; continue; }
    if (src.startsWith('&&', i)) { toks.push({ t: '&&' }); i += 2; continue; }
    if (src.startsWith('||', i)) { toks.push({ t: '||' }); i += 2; continue; }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { toks.push({ t: 'op', v: op }); i += op.length; continue; }
    if (c === '!') { toks.push({ t: '!' }); i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { s += src[j + 1]; j += 2; } else { s += src[j++]; }
      }
      if (j >= src.length) throw new SyntaxError(`unterminated string in condition: ${src}`);
      toks.push({ t: 'lit', v: s }); i = j + 1; continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { toks.push({ t: 'lit', v: Number(num[0]) }); i += num[0].length; continue; }
    const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (word) {
      const w = word[0];
      if (w === 'true') toks.push({ t: 'lit', v: true });
      else if (w === 'false') toks.push({ t: 'lit', v: false });
      else if (w === 'null') toks.push({ t: 'lit', v: null });
      else toks.push({ t: 'path', v: w });
      i += w.length; continue;
    }
    throw new SyntaxError(`unexpected character ${JSON.stringify(c)} at ${i} in condition: ${src}`);
  }
  return toks;
}

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (t) => (peek() && peek().t === t ? toks[p++] : null);

  function primary() {
    if (eat('(')) {
      const e = or();
      if (!eat(')')) throw new SyntaxError(`missing ) in condition: ${src}`);
      return e;
    }
    const tok = peek();
    if (!tok) throw new SyntaxError(`unexpected end of condition: ${src}`);
    if (tok.t === 'lit') { p++; return { type: 'lit', value: tok.v }; }
    if (tok.t === 'path') { p++; return { type: 'path', path: tok.v.split('.') }; }
    throw new SyntaxError(`unexpected token ${JSON.stringify(tok.t)} in condition: ${src}`);
  }
  function not() {
    if (eat('!')) return { type: 'not', expr: not() };
    return cmp();
  }
  function cmp() {
    const left = primary();
    const tok = peek();
    if (tok && tok.t === 'op') { p++; return { type: 'cmp', op: tok.v, left, right: primary() }; }
    return left;
  }
  function and() {
    let left = not();
    while (eat('&&')) left = { type: 'and', left, right: not() };
    return left;
  }
  function or() {
    let left = and();
    while (eat('||')) left = { type: 'or', left, right: and() };
    return left;
  }
  const ast = or();
  if (p !== toks.length) throw new SyntaxError(`trailing tokens in condition: ${src}`);
  return ast;
}

/** Every state path an expression touches — used by the spec validator. */
export function referencedPaths(ast, out = []) {
  if (!ast || typeof ast !== 'object') return out;
  if (ast.type === 'path') out.push(ast.path.join('.'));
  for (const k of ['left', 'right', 'expr']) if (ast[k]) referencedPaths(ast[k], out);
  return out;
}

const getPath = (state, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), state);

export function evaluate(ast, state) {
  switch (ast.type) {
    case 'lit': return ast.value;
    case 'path': return getPath(state, ast.path);
    case 'not': return !evaluate(ast.expr, state);
    case 'and': return Boolean(evaluate(ast.left, state)) && Boolean(evaluate(ast.right, state));
    case 'or': return Boolean(evaluate(ast.left, state)) || Boolean(evaluate(ast.right, state));
    case 'cmp': {
      const l = evaluate(ast.left, state), r = evaluate(ast.right, state);
      switch (ast.op) {
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
        default: throw new Error(`unknown operator ${ast.op}`);
      }
    }
    default: throw new Error(`unknown node type ${ast.type}`);
  }
}

export const compileCondition = (src) => { const ast = parse(src); return { ast, test: (s) => Boolean(evaluate(ast, s)) }; };
