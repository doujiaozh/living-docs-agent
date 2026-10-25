// Parser dispatcher: routes files by extension and aggregates per-file results.

import fs from 'node:fs';
import path from 'node:path';
import { walkDir, EXTENSIONS } from '../utils.js';
import { parsePythonSource } from './python.js';
import { parseCSource } from './c.js';

/** Parse a single source file into a normalized file descriptor. */
export function parseFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const source = fs.readFileSync(absPath, 'utf8');
  if (ext === '.py') {
    const parsed = parsePythonSource(source, { path: absPath });
    return { ...parsed, kind: 'python' };
  }
  if (['.c', '.h', '.cpp', '.hpp', '.cc'].includes(ext)) {
    const parsed = parseCSource(source, { path: absPath });
    return { ...parsed, kind: 'c' };
  }
  return null;
}

/**
 * Scan a directory for C/Python sources and parse every file.
 * @param {string} dir
 * @param {{lang?: 'c'|'python'|'auto', recursive?: boolean}} opts
 */
export function scanDirectory(dir, { lang = 'auto', recursive = true } = {}) {
  if (!fs.existsSync(dir)) throw new Error(`Source directory not found: ${dir}`);
  const extensions = lang === 'auto'
    ? [...EXTENSIONS.c, ...EXTENSIONS.python, '.cpp', '.hpp', '.cc']
    : EXTENSIONS[lang];
  const files = walkDir(dir, { extensions, recursive });
  return files
    .map((f) => {
      try {
        return parseFile(f);
      } catch (err) {
        return { kind: 'error', path: f, error: err.message, functions: [], classes: [] };
      }
    })
    .filter(Boolean);
}
