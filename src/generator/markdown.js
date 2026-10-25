// Markdown rendering: turns parsed file descriptors into a polished API document.

import path from 'node:path';
import { timestampLabel } from '../utils.js';

export const START_MARKER = '<!-- livedocs:start -->';
export const END_MARKER = '<!-- livedocs:end -->';

const LANG_ICON = { c: '🔧', python: '🐍' };
const LANG_COLOR = { c: '00599C', python: '3776AB' };

/** GitHub-compatible anchor slug for headings. */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // drop punctuation (keep word chars, spaces, dashes)
    .trim()
    .replace(/\s+/g, '-');
}

/** Escape a literal string for safe inline use in Markdown. */
function esc(s) {
  return (s || '').replace(/`/g, '\\`').replace(/\|/g, '\\|');
}

/** Convert a heading level number to the markdown prefix. */
function h(level, text) {
  return `${'#'.repeat(Math.max(1, Math.min(6, level)))} ${text}`;
}

/** Render a params table; returns null when there is nothing to show. */
function renderParamsTable(params) {
  if (!params || params.length === 0) return null;
  const hasDefaults = params.some((p) => p.default !== null && p.default !== undefined);
  const hasDesc = params.some((p) => p.description);
  const header = ['Name', 'Type'];
  if (hasDefaults) header.push('Default');
  if (hasDesc) header.push('Description');
  const rows = params.map((p) => {
    const name = (p.variadic === 'kwarg' ? '**' : p.variadic === 'vararg' ? '*' : '') + p.name || '';
    const row = [`\`${esc(name)}\``, p.type ? `\`${esc(p.type)}\`` : '—'];
    if (hasDefaults) row.push(p.default !== null && p.default !== undefined ? `\`${esc(p.default)}\`` : '—');
    if (hasDesc) row.push(esc(p.description) || '—');
    return row;
  });
  const widths = [4, 4];
  const sep = header.map(() => '------');
  return [
    `| ${header.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/** Render a single function entry. */
function renderFunction(fn, kind, relPath, level, anchorBase) {
  const out = [];
  const badges = [];
  if (kind === 'c') {
    if (fn.isStatic) badges.push('`static`');
    if (fn.isInline) badges.push('`inline`');
    if (fn.kind === 'prototype') badges.push('`prototype`');
  } else {
    if (fn.isAsync) badges.push('`async`');
    for (const d of fn.decorators) badges.push(`@${esc(d)}`);
  }
  const heading = `\`${fn.name}(${fn.params.map((p) => p.name).join(', ')})\``;
  out.push(h(level, `${heading}${badges.length ? ' ' + badges.join(' ') : ''}`));
  out.push('');
  if (fn.doc) {
    out.push(fn.doc.split('\n').map((l) => l.trim()).join('\n'));
    out.push('');
  }
  out.push('**Signature**');
  out.push('');
  out.push(`\`\`\`${kind === 'c' ? 'c' : 'python'}`);
  out.push(fn.signature);
  out.push('```');
  out.push('');
  const paramsTable = renderParamsTable(fn.params);
  if (paramsTable) {
    out.push('**Parameters**');
    out.push('');
    out.push(paramsTable);
    out.push('');
  }
  if (fn.returns && (fn.returns.type || fn.returns.description)) {
    out.push('**Returns**');
    out.push('');
    const typeBits = [];
    if (fn.returns.type) typeBits.push(`\`${esc(fn.returns.type)}\`${fn.returns.inferred ? ' _(inferred)_ ' : ''}`);
    out.push(typeBits.join(''));
    if (fn.returns.description) out.push('');
    if (fn.returns.description) out.push(esc(fn.returns.description));
    out.push('');
  }
  out.push(`**Source** · \`${relPath}:${fn.line}\``);
  out.push('');
  out.push('---');
  out.push('');
  return out.join('\n');
}

/** Render a class and its methods. */
function renderClass(cls, relPath, level) {
  const out = [];
  out.push(h(level, `class \`${cls.name}\`${cls.bases.length ? ` extends ${cls.bases.map((b) => `\`${esc(b)}\``).join(', ')}` : ''}`));
  out.push('');
  if (cls.doc) {
    out.push(cls.doc);
    out.push('');
  }
  out.push(`**Source** · \`${relPath}:${cls.line}\``);
  out.push('');
  for (const method of cls.methods) {
    out.push(renderFunction(method, 'python', relPath, level + 1, `${cls.name}.`));
  }
  return out.join('\n');
}

/** Build the table of contents. */
function renderToc(files, level) {
  const out = [h(level, '📖 Table of Contents'), ''];
  for (const file of files) {
    if (file.kind === 'error') continue;
    const rel = file.relPath;
    const fileAnchor = slugify(`${LANG_ICON[file.language]} ${rel}`);
    const count = (file.functions || []).length + (file.classes || []).reduce((n, c) => n + c.methods.length, 0);
    out.push(`- [${LANG_ICON[file.language]} \`${rel}\`](#${fileAnchor}) — ${count} entr${count === 1 ? 'y' : 'ies'}`);
    for (const fn of file.functions) {
      out.push(`  - [\`${fn.name}()\`](#${slugify(`${fn.name}(${fn.params.map((p) => p.name).join(', ')})`)})`);
    }
    for (const cls of file.classes) {
      out.push(`  - [class \`${cls.name}\`](#${slugify(`class ${cls.name}`)})`);
      for (const m of cls.methods) {
        out.push(`    - [\`${cls.name}.${m.name}()\`](#${slugify(`${m.name}(${m.params.map((p) => p.name).join(', ')})`)})`);
      }
    }
  }
  out.push('');
  return out.join('\n');
}

/**
 * Render the full Markdown API document for parsed files.
 * @param {Array} files Output of scanDirectory() (mutated with relPath).
 * @param {{title?: string, rootDir?: string, level?: number, includeToc?: boolean, generatedAt?: Date}} opts
 */
export function generateMarkdown(files, {
  title = 'API Reference',
  rootDir = '.',
  level = 1,
  includeToc = true,
  generatedAt = new Date(),
} = {}) {
  for (const f of files) f.relPath = f.relPath || (f.path ? rel(f.path, rootDir) : f.path);

  const langs = [...new Set(files.filter((f) => f.language).map((f) => f.language))];
  const fnCount = files.reduce((n, f) => n + (f.functions?.length || 0), 0);
  const clsCount = files.reduce((n, f) => n + (f.classes?.length || 0), 0);
  const methodCount = files.reduce((n, f) => n + (f.classes || []).reduce((m, c) => m + c.methods.length, 0), 0);
  const errCount = files.filter((f) => f.kind === 'error').length;

  const out = [];
  out.push(h(level, `📚 ${title}`));
  out.push('');

  // Badge row
  const badges = langs.map((l) =>
    `![${l}](https://img.shields.io/badge/language-${l.toUpperCase()}-${LANG_COLOR[l] || 'gray'})`);
  badges.push(`![functions](https://img.shields.io/badge/functions-${fnCount + methodCount}-brightgreen)`);
  if (clsCount) badges.push(`![classes](https://img.shields.io/badge/classes-${clsCount}-blue)`);
  badges.push(`![auto-generated](https://img.shields.io/badge/docs-auto--generated-ff69b4)`);
  out.push(badges.join(' '));
  out.push('');
  out.push(`> ✨ **Living docs** — this page is generated by **living-docs-agent**. Edit the source code, not this file.`);
  out.push(`> Last updated: **${timestampLabel(generatedAt)}**`);
  out.push('');

  // Overview table
  out.push(h(level + 1, '🧭 Overview'));
  out.push('');
  out.push('| | |', '|---|---|');
  out.push(`| Languages | ${langs.map((l) => `\`${l}\``).join(', ') || '—'} |`);
  out.push(`| Source files | ${files.length - errCount}${errCount ? ` (${errCount} failed)` : ''} |`);
  out.push(`| Functions | ${fnCount + methodCount} |`);
  if (clsCount) out.push(`| Classes | ${clsCount} |`);
  out.push(`| Last updated | ${timestampLabel(generatedAt)} |`);
  out.push('');

  if (includeToc && files.some((f) => f.kind !== 'error')) {
    out.push(renderToc(files, level + 1));
  }

  for (const file of files) {
    if (file.kind === 'error') {
      out.push(h(level + 1, `⚠️ \`${file.relPath || file.path}\``));
      out.push('');
      out.push(`Parse error: ${esc(file.error)}`);
      out.push('');
      continue;
    }
    out.push(h(level + 1, `${LANG_ICON[file.language]} \`${file.relPath}\``));
    out.push('');
    if (file.moduleDoc) {
      out.push(`> ${file.moduleDoc.split('\n').map((l) => l.trim()).join('\n> ')}`);
      out.push('');
    }
    const subLevel = level + 2;
    if (file.functions?.length) {
      out.push(h(subLevel, file.language === 'c' ? 'Functions' : 'Module functions'));
      out.push('');
      for (const fn of file.functions) out.push(renderFunction(fn, file.language, file.relPath, subLevel + 1));
    }
    for (const cls of file.classes || []) {
      out.push(renderClass(cls, file.relPath, subLevel));
    }
    if (!file.functions?.length && !(file.classes?.length)) {
      out.push('_No public API entries found in this file._');
      out.push('');
    }
  }

  out.push(h(level + 1, '🤖 About'));
  out.push('');
  out.push(`Generated by [living-docs-agent](https://github.com/living-docs-agent/living-docs-agent) v0.1.0 — run \`living-docs --watch\` to keep this page alive.`);
  out.push('');

  return out.join('\n');
}

/** Relative path helper that always uses forward slashes. */
function rel(full, root) {
  let r = path.relative(root, full);
  return r.split(path.sep).join('/');
}

/** Locate a livedocs marker on its own line, ignoring fenced code blocks
 *  (where the markers are commonly shown as documentation examples). */
function findMarkerLine(text, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^[ \\t]*${escaped}[ \\t]*$`);
  const lines = text.split('\n');
  let inFence = false;
  let offset = 0;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
    } else if (!inFence && re.test(line)) {
      return { index: offset, length: line.length };
    }
    offset += line.length + 1;
  }
  return null;
}

/**
 * Inject a docs body into a README between livedocs markers.
 * Inserts markers (and a heading) when absent.
 */
export function injectIntoReadme(readme, body) {
  const start = findMarkerLine(readme, START_MARKER);
  if (start) {
    const afterStart = start.index + start.length;
    const end = findMarkerLine(readme.slice(afterStart), END_MARKER);
    if (end) {
      return readme.slice(0, afterStart)
        + '\n\n' + body + '\n\n'
        + readme.slice(afterStart + end.index);
    }
  }
  const sep = readme.trimEnd().length > 0 ? '\n\n' : '';
  return readme.trimEnd() + sep + START_MARKER + '\n\n' + body + '\n\n' + END_MARKER + '\n';
}

/** Extract the current docs body between markers (null when absent). */
export function extractInjected(readme) {
  const start = findMarkerLine(readme, START_MARKER);
  if (!start) return null;
  const afterStart = start.index + start.length;
  const end = findMarkerLine(readme.slice(afterStart), END_MARKER);
  if (!end) return null;
  return readme.slice(afterStart, afterStart + end.index).trim();
}
