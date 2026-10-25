// Shared utilities for living-docs-agent: file walking, token-aware splitting,
// comment stripping and small string helpers.

import fs from 'node:fs';
import path from 'node:path';

/** Default file extensions grouped by language. */
export const EXTENSIONS = {
  c: ['.c', '.h'],
  python: ['.py'],
};

/**
 * Collect files under `dir` whose extension matches `extensions`.
 * @param {string} dir
 * @param {{extensions?: string[], recursive?: boolean, exclude?: string[]}} opts
 * @returns {string[]} Absolute file paths, sorted for deterministic output.
 */
export function walkDir(dir, { extensions = null, recursive = true, exclude = ['node_modules', '.git', '.venv', '__pycache__'] } = {}) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !exclude.includes(entry.name)) {
        out.push(...walkDir(full, { extensions, recursive, exclude }));
      }
    } else if (entry.isFile()) {
      if (!extensions || extensions.includes(path.extname(full).toLowerCase())) {
        out.push(full);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/**
 * Split a string on `sep` but only at bracket depth 0, ignoring separators
 * nested inside (), [], {} or quoted strings. Handles Python triple quotes.
 * @param {string} text
 * @param {string} sep
 * @returns {string[]}
 */
export function splitTopLevel(text, sep = ',') {
  const parts = [];
  let depth = 0;
  let current = '';
  let quote = null;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    // Triple-quote (Python) handling: jump over the whole quoted span.
    if (!quote && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      const tq = text.slice(i, i + 3);
      const end = text.indexOf(tq, i + 3);
      const stop = end === -1 ? text.length : end + 3;
      current += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === '\\') { // escaped char: skip next
        current += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim() !== '' || parts.length > 0) parts.push(current);
  return parts;
}

/**
 * Strip C-style comments from `code`, returning { code, comments } where
 * comments is an array of { startLine, endLine, text } with 1-based line
 * numbers, used to attach leading comments to following declarations.
 * @param {string} code
 */
export function stripCComments(code) {
  const comments = [];
  let out = '';
  let i = 0;
  let line = 1;
  while (i < code.length) {
    const two = code.slice(i, i + 2);
    if (two === '//') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      comments.push({ startLine: line, endLine: line, text: code.slice(i + 2, stop).trim() });
      out += ' ';
      i = stop;
      continue;
    }
    if (two === '/*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      const body = code.slice(i + 2, end === -1 ? code.length : end);
      const nl = body.split('\n').length - 1;
      comments.push({
        startLine: line,
        endLine: line + nl,
        text: body.replace(/^\s*\* ?/gm, '').trim(),
      });
      out += '\n'.repeat(nl); // keep line numbers aligned
      line += nl;             // keep the line counter aligned too
      i = stop;
      continue;
    }
    if (code[i] === '"') {
      const end = findStringEnd(code, i);
      out += code.slice(i, end);
      const seg = code.slice(i, end);
      line += seg.split('\n').length - 1;
      i = end;
      continue;
    }
    if (code[i] === '\n') line += 1;
    out += code[i];
    i += 1;
  }
  return { code: out, comments };
}

/** Build a 1-based line -> comment lookup map from stripCComments output. */
export function commentLineMap(comments) {
  const map = new Map();
  for (const c of comments) map.set(c.endLine, c);
  return map;
}

function findStringEnd(code, start) {
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code[i] === '"') return i + 1;
    i += 1;
  }
  return code.length;
}

/** Collapse a multi-line comment body into one clean paragraph. */
export function foldWhitespace(text) {
  return (text || '').replace(/[ \t]+/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
}

/** Compute 0-based indentation of a line. */
export function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].replace(/\t/g, '    ').length : 0;
}

/** Format a Unix ms timestamp as ISO string in local time. */
export function timestampLabel(now = new Date()) {
  return now.toLocaleString('sv-SE').replace('T', ' ');
}

/** Ensure parent directory exists for a file path. */
export function ensureDirFor(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
