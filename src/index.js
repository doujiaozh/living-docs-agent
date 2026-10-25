// Public API of living-docs-agent: one-shot generation and live watching.

import fs from 'node:fs';
import path from 'node:path';
import { scanDirectory } from './parser/index.js';
import { generateMarkdown, injectIntoReadme, START_MARKER, END_MARKER } from './generator/markdown.js';
import { createWatcher } from './watcher.js';
import { ensureDirFor, EXTENSIONS } from './utils.js';

/**
 * Scan sources and render the Markdown document.
 * @param {{src: string[], lang?: 'c'|'python'|'auto', title?: string, recursive?: boolean, includeToc?: boolean}} opts
 * @returns {{files: Array, markdown: string}}
 */
export function buildDocs({ src, lang = 'auto', title = 'API Reference', recursive = true, includeToc = true }) {
  const files = [];
  for (const dir of src) {
    files.push(...scanDirectory(dir, { lang, recursive }));
  }
  const rootDir = src[0] || '.';
  const markdown = generateMarkdown(files, { title, rootDir, level: 1, includeToc });
  return { files, markdown };
}

function writeOutput({ output, readme, markdown }) {
  const written = [];
  if (output) {
    ensureDirFor(path.resolve(output));
    fs.writeFileSync(path.resolve(output), markdown + '\n', 'utf8');
    written.push(path.resolve(output));
  }
  if (readme) {
    const readmePath = path.resolve(readme);
    const existing = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
    const injected = injectIntoReadme(existing, markdown);
    fs.writeFileSync(readmePath, injected, 'utf8');
    written.push(readmePath);
  }
  return written;
}

/**
 * Generate docs once and write to disk.
 * @param {{src: string[], output?: string, readme?: string, lang?: string, title?: string, recursive?: boolean, includeToc?: boolean}} opts
 * @returns {{files: Array, markdown: string, written: string[]}}
 */
export function generateDocs(opts) {
  const { files, markdown } = buildDocs(opts);
  const written = writeOutput({ ...opts, markdown });
  return { files, markdown, written };
}

export function countEntries(files) {
  const functions = files.reduce((n, f) => n + (f.functions?.length || 0), 0);
  const methods = files.reduce((n, f) => n + (f.classes || []).reduce((m, c) => m + c.methods.length, 0), 0);
  const classes = files.reduce((n, f) => n + (f.classes?.length || 0), 0);
  return { files: files.length, functions: functions + methods, classes };
}

/**
 * Generate docs once, then keep them updated as source files change.
 * @param {{src: string[], output?: string, readme?: string, lang?: string, title?: string, recursive?: boolean, includeToc?: boolean, intervalMs?: number, onRegenerate?: (info) => void}} opts
 * @returns {{stop: () => void, regenerate: () => object}}
 */
export function watchDocs({
  src, output, readme, lang = 'auto', title = 'API Reference', recursive = true, includeToc = true,
  intervalMs = 500, onRegenerate = () => {},
}) {
  const extensions = lang === 'auto'
    ? [...EXTENSIONS.c, ...EXTENSIONS.python]
    : EXTENSIONS[lang];

  function regenerate(reason) {
    const started = performance.now();
    const { files, markdown, written } = generateDocs({ src, output, readme, lang, title, recursive, includeToc });
    const elapsed = (performance.now() - started).toFixed(0);
    const counts = countEntries(files);
    onRegenerate({ reason, files, markdown, written, elapsed, counts, timestamp: new Date() });
    return { files, markdown, written };
  }

  const watcher = createWatcher({
    roots: src,
    extensions,
    extraFiles: readme ? [path.resolve(readme)] : [],
    intervalMs,
    onChange: (summary) => {
      if (summary.first) return; // initial snapshot: generation already happened up front
      // Self-trigger guard: never regenerate because our own outputs changed.
      const written = [output, readme].filter(Boolean).map((f) => path.resolve(f));
      const external = (file) => !written.includes(path.resolve(file));
      const reasons = [...summary.added, ...summary.changed, ...summary.removed].filter(external);
      if (reasons.length === 0) return;
      regenerate({ ...summary, external: reasons });
    },
  });

  watcher.start();

  return {
    regenerate,
    /** Stop watching. */
    stop() { watcher.stop(); },
  };
}

export { START_MARKER, END_MARKER };
