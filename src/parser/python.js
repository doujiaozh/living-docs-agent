// Python source extraction: functions, classes, methods, docstrings, params
// and return-type inference. Line-oriented scanner (no runtime deps).

import { splitTopLevel, indentOf } from '../utils.js';

/**
 * @typedef {Object} PyParam
 * @property {string} name
 * @property {string} type
 * @property {string|null} default
 * @property {boolean} keywordOnly
 * @property {'normal'|'vararg'|'kwarg'} [variadic]
 * @property {string} description
 *
 * @typedef {Object} PyFunction
 * @property {string} name
 * @property {number} line
 * @property {string} signature
 * @property {boolean} isAsync
 * @property {string[]} decorators
 * @property {string} doc
 * @property {PyParam[]} params
 * @property {{type: string, description: string}} returns
 *
 * @typedef {Object} PyClass
 * @property {string} name
 * @property {number} line
 * @property {string[]} bases
 * @property {string} doc
 * @property {PyFunction[]} methods
 */

/** Strip a trailing `# comment` (outside strings) from a source line. */
function stripLineComment(line) {
  let quote = null;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
    i += 1;
  }
  return line;
}

/** Read code lines with line comments removed (positions preserved). */
function readLines(source) {
  return source.split(/\r?\n/).map((l) => stripLineComment(l));
}

/** Extract a triple-quoted docstring starting at line index `start`. */
function extractDocstring(lines, start) {
  if (start >= lines.length) return { doc: null, consumed: 0 };
  const line = lines[start];
  const m = line.match(/^\s*(?:"""|''')/);
  if (!m) return { doc: null, consumed: 0 };
  const quote = m[0].trim();
  const rest = line.slice(m[0].length);
  // Single-line docstring: """text"""
  if (rest.includes(quote)) {
    return { doc: rest.slice(0, rest.indexOf(quote)), consumed: 1 };
  }
  const body = [rest]; // keep content following the opening quotes on the first line
  for (let i = start + 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(quote);
    if (idx !== -1) {
      body.push(lines[i].slice(0, idx));
      return { doc: body.join('\n'), consumed: i - start + 1 };
    }
    body.push(lines[i]);
  }
  return { doc: body.join('\n'), consumed: lines.length - start };
}

/** Collect `# comment` lines directly above `lineIdx` (contiguous, no blanks). */
function leadingComments(rawLines, lineIdx) {
  const out = [];
  let i = lineIdx - 1;
  while (i >= 0) {
    const raw = rawLines[i];
    const m = raw.match(/^\s*#\s?(.*)$/);
    if (m) { out.unshift(m[1].trim()); i -= 1; continue; }
    if (raw.trim() === '' && out.length === 0) { i -= 1; continue; } // allow blank gap before comments
    break;
  }
  return out;
}

/** Parse `params` source text into structured params. */
function parseParams(text, { isMethod }) {
  const params = [];
  const parts = splitTopLevel(text, ',').map((p) => p.trim()).filter(Boolean);
  let keywordOnly = false;
  for (const part of parts) {
    if (part === '*') { keywordOnly = true; continue; }
    if (part === '/' ) { continue; } // positional-only marker
    let variadic = 'normal';
    let body = part;
    if (part.startsWith('**')) { variadic = 'kwarg'; body = part.slice(2); }
    else if (part.startsWith('*')) { variadic = 'vararg'; body = part.slice(1); }

    let name = body;
    let type = '';
    let def = null;
    // split on first top-level '=' for default value
    const eqIdx = indexOfTopLevel(body, '=');
    if (eqIdx !== -1) {
      def = body.slice(eqIdx + 1).trim();
      body = body.slice(0, eqIdx).trim();
    }
    const colon = indexOfTopLevel(body, ':');
    if (colon !== -1) {
      name = body.slice(0, colon).trim();
      type = body.slice(colon + 1).trim();
    }
    if (isMethod && (name === 'self' || name === 'cls')) continue;
    params.push({
      name,
      type: type || '',
      default: def,
      keywordOnly,
      variadic,
      description: '',
    });
  }
  return params;
}

/** Find the index of `ch` at depth 0, outside quotes. */
function indexOfTopLevel(text, ch) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if ('([{'.includes(c)) depth += 1;
    if (')]}'.includes(c)) depth -= 1;
    if (c === ch && depth === 0) return i;
  }
  return -1;
}

/** Scan from an opening `(` to its matching `)`. */
function matchParen(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(') depth += 1;
    if (c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Infer the return type from `return` statements inside the body. */
function inferReturnType(bodyLines) {
  const exprs = [];
  for (const raw of bodyLines) {
    const line = stripLineComment(raw);
    const m = line.match(/^\s*return\b\s*(.*)$/);
    if (m) exprs.push(m[1].trim());
  }
  if (exprs.length === 0) return { type: '', inferred: false };
  const types = new Set();
  for (const e of exprs) {
    if (e === '') types.add('None');
    else if (e === 'True' || e === 'False') types.add('bool');
    else if (/^-?\d+(\.\d+)?$/.test(e)) types.add('number');
    else if (/^[a-zA-Z_]\w*\s*\(/.test(e)) types.add(e.match(/^([a-zA-Z_]\w*)\s*\(/)[1]);
    else if (/^(["'])/.test(e)) types.add('str');
    else if (/^\[/.test(e)) types.add('list');
    else if (/^\{/.test(e)) types.add('dict');
    else if (/^\(|^\w+\s*,/.test(e)) types.add('tuple');
    else types.add('any');
  }
  const list = [...types];
  return { type: list.join(' | '), inferred: true };
}

/** Parse docstring: summary + reST `:param`/`:return:` or Google-style sections. */
function parseDocstring(doc) {
  const result = { summary: '', paramDocs: new Map(), returnDoc: '', rtype: '' };
  if (!doc) return result;
  // reST field list: :param x: ... / :return: ... / :rtype: ...
  const fieldRe = /^\s*:(param|parameter|arg|returns?|rtype|type)\s*(\w+)?\s*:\s*(.*)$/;
  const cleaned = [];
  for (const raw of doc.split('\n')) {
    const m = raw.match(fieldRe);
    if (m) {
      const tag = m[1];
      const arg = (m[2] || '').trim();
      const desc = m[3].trim();
      if (tag === 'returns' || tag === 'return') result.returnDoc += (result.returnDoc ? ' ' : '') + desc;
      else if (tag === 'rtype') result.rtype = desc;
      else if (tag === 'type') { /* type info only; dropped from the prose body */ }
      else if (arg) result.paramDocs.set(arg, desc);
    } else {
      cleaned.push(raw);
    }
  }
  let body = cleaned.join('\n');
  // Google-style sections
  const sectionRe = /^(\s*)(Args|Arguments|Parameters|Returns|Yields|Raises|Examples?):\s*$/;
  const lines = body.split('\n');
  const outLines = [];
  let section = null;
  let sectionIndent = 0;
  for (const line of lines) {
    const m = line.match(sectionRe);
    if (m) {
      section = m[2];
      sectionIndent = m[1].length;
      continue;
    }
    if (section) {
      if (line.trim() === '') { outLines.push(line); continue; }
      if (line.length - line.replace(/^\s+/, '').length <= sectionIndent) {
        section = null; outLines.push(line); continue;
      }
      if (section === 'Args' || section === 'Arguments' || section === 'Parameters') {
        const pm = line.trim().match(/^(?:\w+:\s+)?(\*{0,2}\w+)\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/);
        if (pm) { result.paramDocs.set(pm[1].replace(/^\*+/, ''), pm[3].trim()); continue; }
      } else if (section === 'Returns') {
        const rm = line.trim().match(/^(?:([A-Za-z_][\w.\[\], \|]*)\s*:\s*)?(.*)$/);
        if (rm) {
          if (rm[1] && !result.rtype) result.rtype = rm[1];
          result.returnDoc += (result.returnDoc ? ' ' : '') + rm[2].trim();
          continue;
        }
      }
      continue; // swallow other section bodies
    }
    outLines.push(line);
  }
  body = outLines.join('\n');
  // summary = first non-blank paragraph
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')).filter(Boolean);
  result.summary = paragraphs.join('\n\n');
  return result;
}

/**
 * Parse Python source into structured items.
 * @param {string} source
 * @param {{path?: string}} opts
 */
export function parsePythonSource(source, { path: filePath = '<python>' } = {}) {
  const rawLines = source.split(/\r?\n/);
  const lines = readLines(source);
  const moduleDocResult = extractDocstring(lines, lines.findIndex((l) => l.trim() !== ''));
  const moduleDoc = moduleDocResult.doc;

  /** @type {{functions: PyFunction[], classes: PyClass[]}} */
  const result = { functions: [], classes: [] };
  const classStack = []; // {name, indent, methods, doc, bases, startLine}

  let pendingDecorators = [];

  function flushDecorators() { pendingDecorators = []; }

  function attachDocs(fn, doc, bodyStart, bodyEnd, lineIdx, hints) {
    const parsed = parseDocstring(doc);
    fn.doc = parsed.summary || '';
    for (const p of fn.params) {
      if (parsed.paramDocs.has(p.name)) p.description = parsed.paramDocs.get(p.name);
    }
    let rtype = hints.returnsType || parsed.rtype || '';
    let inferred = false;
    if (!rtype) {
      // look ahead for a `# -> Type` annotation comment is not standard; infer instead
      const body = rawLines.slice(bodyStart, bodyEnd);
      const inf = inferReturnType(body);
      rtype = inf.type;
      inferred = inf.inferred;
    }
    fn.returns = {
      type: rtype,
      inferred,
      description: parsed.returnDoc,
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;

    const decMatch = line.match(/^(\s*)@([\w.]+)/);
    if (decMatch) {
      pendingDecorators.push(decMatch[2]);
      continue;
    }

    const classMatch = line.match(/^(\s*)class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/);
    if (classMatch) {
      const indent = indentOf(line);
      while (classStack.length && classStack[classStack.length - 1].indent >= indent) classStack.pop();
      const docStart = nextStatementIndex(lines, i + 1);
      const { doc, consumed } = extractDocstring(lines, docStart);
      const cls = {
        name: classMatch[2],
        line: i + 1,
        bases: (classMatch[3] || '').split(',').map((b) => b.trim()).filter(Boolean),
        doc: parseDocstring(doc).summary,
        methods: [],
        indent,
      };
      classStack.push(cls);
      result.classes.push(cls);
      i = Math.max(i, docStart + consumed - 1);
      continue;
    }

    const defMatch = line.match(/^(\s*)(async\s+)?def\s+(\w+)\s*\(/);
    if (!defMatch) { flushDecorators(); continue; }
    const indent = indentOf(line);
    // pop classes whose block has ended
    while (classStack.length && classStack[classStack.length - 1].indent >= indent) classStack.pop();
    const inClass = classStack[classStack.length - 1] || null;

    const openParen = line.indexOf('(', defMatch.index + defMatch[0].length - 1);
    const close = matchParen(line, openParen);
    let paramsText, rest;
    if (close !== -1) {
      paramsText = line.slice(openParen + 1, close);
      rest = line.slice(close + 1);
    } else {
      // multi-line signature: join until parens balance
      let joined = line;
      let j = i;
      while (matchParen(joined, openParen) === -1 && j + 1 < lines.length) {
        j += 1;
        joined += ' ' + lines[j].trim();
      }
      const close2 = matchParen(joined, openParen);
      paramsText = joined.slice(openParen + 1, close2);
      rest = joined.slice(close2 + 1);
      i = j;
    }
    const retHintMatch = rest.match(/->\s*(.+?)\s*:/);
    const returnsType = retHintMatch ? retHintMatch[1].trim() : '';

    const isAsync = Boolean(defMatch[2]);
    const name = defMatch[3];
    const defLineIdx = i; // 1-based line recorded before multi-line signatures advance `i`
    const params = parseParams(paramsText, { isMethod: Boolean(inClass) });
    const signature = formatSignature(name, params, { isAsync, isMethod: Boolean(inClass), returnsType });
    const fn = {
      name,
      line: defLineIdx + 1, // 1-based
      signature,
      decorators: [...pendingDecorators],
      isAsync,
      doc: '',
      params,
      returns: null,
    };
    pendingDecorators = [];

    // Single-line body with inline docstring, e.g. `def f(): """doc"""`
    const inlineDocMatch = rest.match(/^.*?:\s*(?:"""|''')(.*)$/);
    let inlineDoc = null;
    if (inlineDocMatch && inlineDocMatch[1].includes('""""') === false) {
      // guard: only treat as docstring if it closes on the same line
      const restAfterColon = rest.slice(rest.indexOf(':') + 1).trim();
      const q = restAfterColon.slice(0, 3);
      if ((q === '"""' || q === "'''") && restAfterColon.indexOf(q, 3) !== -1) {
        inlineDoc = restAfterColon.slice(3, restAfterColon.indexOf(q, 3));
      }
    }

    // body: from next line until dedent below body indent
    const bodyStart = i + 1;
    const bodyIndent = bodyStart < lines.length ? (lines[bodyStart].trim() === '' ? null : indentOf(lines[bodyStart])) : null;
    let bodyEnd = lines.length;
    if (bodyIndent !== null) {
      for (let k = bodyStart; k < lines.length; k++) {
        const l = lines[k];
        if (l.trim() === '') continue;
        if (indentOf(l) < bodyIndent) { bodyEnd = k; break; }
      }
    }
    const docStart = nextStatementIndex(lines, bodyStart);
    const { doc, consumed } = extractDocstring(lines, docStart);
    const finalDoc = doc || inlineDoc || leadingComments(rawLines, defLineIdx).join('\n') || null;
    attachDocs(fn, finalDoc, bodyStart, bodyEnd, defLineIdx, { returnsType });
    if (consumed > 0) i = Math.max(i, docStart + consumed - 1);

    if (inClass) inClass.methods.push(fn);
    else result.functions.push(fn);
  }

  return { language: 'python', path: filePath, moduleDoc, ...result };
}

/** Index of the first line with actual content at/after `start`. */
function nextStatementIndex(lines, start) {
  for (let i = start; i < lines.length; i++) if (lines[i].trim() !== '') return i;
  return lines.length;
}

/** Render a human-readable single-line signature. */
function formatSignature(name, params, { isAsync, isMethod, returnsType }) {
  const parts = params.map((p) => {
    let s = p.variadic === 'kwarg' ? '**' : p.variadic === 'vararg' ? '*' : '';
    s += p.name;
    if (p.type) s += `: ${p.type}`;
    if (p.default !== null) s += ` = ${p.default}`;
    return s;
  });
  let sig = `${isAsync ? 'async ' : ''}${isMethod ? '' : ''}def ${name}(${parts.join(', ')})`;
  if (returnsType) sig += ` -> ${returnsType}`;
  return sig;
}

/** Detect language for a file path. */
export function looksLikePython(file) {
  return /\.py$/i.test(file);
}
