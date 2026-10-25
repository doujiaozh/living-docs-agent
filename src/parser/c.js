// C source extraction: function definitions (.c) and prototypes (.h),
// Doxygen/leading comments, parameter lists and return types.

import { stripCComments, splitTopLevel, foldWhitespace } from '../utils.js';

const CONTROL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'sizeof', 'do', 'else',
  'catch', 'case', 'goto', 'typeof', 'alignof',
]);

/**
 * @typedef {Object} CParam
 * @property {string} name
 * @property {string} type
 * @property {string} description
 *
 * @typedef {Object} CFunction
 * @property {string} name
 * @property {number} line
 * @property {string} signature
 * @property {boolean} isStatic
 * @property {boolean} isInline
 * @property {string} returnType
 * @property {CParam[]} params
 * @property {string} doc
 * @property {{type: string, description: string}} returns
 * @property {'definition'|'prototype'} kind
 */

/** Parse a parameter declaration source text into structured params. */
function parseCParams(text) {
  const params = [];
  const parts = splitTopLevel(text, ',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1 && parts[0] === 'void') return params;
  for (const part of parts) {
    // strip trailing array brackets
    let decl = part.replace(/\[\s*\d*\s*\]\s*$/, '[]');
    // `int a[]` keep, `const char *name` keep
    const m = decl.match(/^(.*?)([A-Za-z_]\w*)\s*(\[\])?\s*$/s);
    if (!m) { params.push({ name: '', type: decl, description: '' }); continue; }
    let type = (m[1] || '').trim();
    if (m[3]) type += '[]';
    if (type === '') type = 'int'; // bare name: old-style declaration
    params.push({ name: m[2], type: type.replace(/\s+/g, ' ').trim(), description: '' });
  }
  return params;
}

/** Extract Doxygen-style tags (`@return`, `@param x ...`, `\param`) from comment text. */
function parseDoxygen(comment) {
  const result = { doc: '', paramDocs: new Map(), returnDoc: '' };
  if (!comment) return result;
  const lines = comment.split('\n');
  const docLines = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*[@\\](param|return|returns|brief|details|retval)\s*(.*)$/i);
    if (!m) { docLines.push(raw); continue; }
    const tag = m[1].toLowerCase();
    const rest = m[2].trim();
    if (tag === 'return' || tag === 'returns' || tag === 'retval') {
      result.returnDoc += (result.returnDoc ? ' ' : '') + rest;
    } else if (tag === 'param') {
      // allow Doxygen direction tags: @param[in] x, @param[out] x
      const pm = rest.match(/^(?:\[(?:in|out|in,out)\]\s*)?(\*{0,2}\w+)\s*(?:\[\])?\s*(.*)$/);
      if (pm) result.paramDocs.set(pm[1].replace(/^\*+/, ''), pm[2].trim());
    } else if (tag === 'brief') {
      docLines.unshift(rest);
    } else {
      docLines.push(rest);
    }
  }
  result.doc = foldWhitespace(docLines.join('\n'));
  return result;
}

/** Find the matching open paren for the close paren at `close` (stripped code). */
function matchOpenParen(code, close) {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    const c = code[i];
    if (c === ')') depth += 1;
    else if (c === '(') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Locate the start index of the enclosing statement: previous `;`, `{`, `}`,
 * start-of-source, or the newline ending a preprocessor line (`#…`), since a
 * signature can never span a directive.
 */
function statementStart(code, from) {
  let i = from;
  while (i >= 0) {
    const c = code[i];
    if (c === ';' || c === '{' || c === '}') return i + 1;
    if (c === '\n' && i > 0) {
      // The line ending here is a preprocessor directive: the declaration
      // region starts on the line after it.
      const lineStart = code.lastIndexOf('\n', i - 1) + 1;
      if (/^\s*#/.test(code.slice(lineStart, i))) return i + 1;
    }
    i -= 1;
  }
  return 0;
}

/** Count newlines in code[0..idx] to turn an index into a 1-based line number. */
function lineOfIndex(code, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < code.length; i++) if (code[i] === '\n') n += 1;
  return n;
}

/**
 * Parse C/ header source into structured items.
 * @param {string} source
 * @param {{path?: string}} opts
 */
export function parseCSource(source, { path: filePath = '<c>' } = {}) {
  const { code, comments } = stripCComments(source);
  const lineMap = new Map();
  for (const c of comments) lineMap.set(c.endLine, c);

  // file-level header comment: the first block comment at the top of the file
  let moduleDoc = null;
  if (comments.length > 0 && comments[0].startLine <= 2 && comments[0].text.length > 0) {
    moduleDoc = foldWhitespace(comments[0].text);
  }

  /** @type {CFunction[]} */
  const functions = [];
  const seen = new Map(); // name -> index in functions (dedupe prototype vs definition)

  // Signature terminators: `{` for definitions, `;` for prototypes and
  // forward declarations. The same pattern covers .c and .h files.
  const target = /\)\s*[{;]/g;
  let m;
  while ((m = target.exec(code)) !== null) {
    const closeParen = m.index;
    const openParen = matchOpenParen(code, closeParen);
    if (openParen === -1) continue;
    // function name = identifier (possibly preceded by `*`) directly before `(`
    const before = code.slice(0, openParen);
    const nameMatch = before.match(/([A-Za-z_]\w*)\s*(\**)\s*$/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (CONTROL_KEYWORDS.has(name)) continue;

    const declStart = statementStart(code, openParen);
    const prefix = code.slice(declStart, openParen - nameMatch[0].length).trim();
    if (!prefix) continue;                   // a definition always names a return type
    if (/[=]/.test(prefix)) continue;        // assignment / initializer, not a definition
    if (/[#]/.test(prefix)) continue;        // preprocessor noise
    if (/\($/.test(prefix)) continue;        // function-pointer declarator: int (*cmp)(...)
    if (/\b(?:return|if|while|for|switch|case|sizeof)\b/.test(prefix)) continue;

    const returnType = prefix.replace(/\s+/g, ' ').trim();
    const isStatic = /\bstatic\b/.test(returnType);
    const isInline = /\binline\b/.test(returnType);
    // the match consumed the terminator itself: `{` => definition, `;` => prototype
    const kind = m[0].endsWith('{') ? 'definition' : 'prototype';

    const paramsText = code.slice(openParen + 1, closeParen);
    if (paramsText.includes(';')) continue;  // unlikely: statement-like junk
    const params = parseCParams(paramsText);
    const cleanRet = returnType
      .replace(/^static\s+/, '')
      .replace(/^inline\s+/, '')
      .replace(/^extern\s+/, '')
      .trim();
    const signature = `${returnType.trim()} ${name}(${paramsText.replace(/\s+/g, ' ').trim()})`;

    const fnLine = lineOfIndex(code, openParen);
    // leading doc comment: comment block ending exactly on the previous line
    let docText = null;
    const comment = lineMap.get(fnLine - 1);
    if (comment) docText = comment.text;
    else {
      // allow a single blank line between comment and signature
      const prev = lineMap.get(fnLine - 2);
      if (prev) {
        const gapLine = source.split(/\r?\n/)[fnLine - 2];
        if (gapLine !== undefined && gapLine.trim() === '') docText = prev.text;
      }
    }
    const parsed = parseDoxygen(docText);
    for (const p of params) {
      if (parsed.paramDocs.has(p.name)) p.description = parsed.paramDocs.get(p.name);
    }

    const fn = {
      name,
      line: fnLine,
      signature,
      isStatic,
      isInline,
      returnType: cleanRet,
      params,
      doc: parsed.doc,
      returns: { type: cleanRet, description: parsed.returnDoc },
      kind,
    };

    const existing = seen.get(name);
    if (existing === undefined) {
      seen.set(name, functions.length);
      functions.push(fn);
    } else if (kind === 'definition' && functions[existing].kind === 'prototype') {
      functions[existing] = fn; // prefer the definition (richer context)
    }
    // skip over the body for definitions so inner `)` matches don't fire
    if (kind === 'definition') {
      const braceIdx = code.indexOf('{', m.index + 1);
      if (braceIdx !== -1) {
        let depth = 0;
        for (let i = braceIdx; i < code.length; i++) {
          if (code[i] === '{') depth += 1;
          else if (code[i] === '}') {
            depth -= 1;
            if (depth === 0) { target.lastIndex = i + 1; break; }
          }
        }
      }
    }
  }

  return { language: 'c', path: filePath, moduleDoc, functions, classes: [] };
}

/** Detect C-family file. */
export function looksLikeC(file) {
  return /\.(c|h|cpp|hpp|cc)$/i.test(file);
}
