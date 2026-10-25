#!/usr/bin/env node
// living-docs-agent CLI — keep your README's API docs forever fresh.

import { generateDocs, watchDocs, countEntries, START_MARKER, END_MARKER } from '../src/index.js';

const VERSION = '0.1.0';

const HELP = `
📚  living-docs-agent v${VERSION}

Scan C / Python source trees and generate a beautiful, always-fresh Markdown
API document. With --watch, it regenerates the moment your code changes.

USAGE
  living-docs <src-dir> [src-dir...] [options]

OPTIONS
  -o, --output <file>     Write the standalone API document to this file.
  -r, --readme <file>     Inject the docs into this README between
                          ${START_MARKER} / ${END_MARKER} markers.
  -w, --watch             Regenerate automatically on source changes.
      --lang <c|python|auto>   Restrict parsing to one language (default: auto).
  -t, --title <text>      Document title (default: "API Reference").
      --no-toc            Skip the table of contents.
      --interval <ms>     Watcher polling interval (default: 500ms).
  -h, --help              Show this help.
  -v, --version           Show version.

EXAMPLES
  living-docs ./src -o docs/API.md
  living-docs ./lib ./include -r README.md --watch
`.trim();

function parseArgs(argv) {
  const args = { src: [], output: null, readme: null, watch: false, lang: 'auto', title: 'API Reference', toc: true, interval: 500 };
  const it = argv.slice(2)[Symbol.iterator]();
  let cur = it.next();
  while (!cur.done) {
    const a = cur.value;
    const next = () => { cur = it.next(); return cur.value; };
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a === '-v' || a === '--version') { console.log(VERSION); process.exit(0); }
    else if (a === '-o' || a === '--output') { args.output = next(); }
    else if (a === '-r' || a === '--readme') { args.readme = next(); }
    else if (a === '-w' || a === '--watch') { args.watch = true; }
    else if (a === '--lang') { args.lang = next(); }
    else if (a === '-t' || a === '--title') { args.title = next(); }
    else if (a === '--no-toc') { args.toc = false; }
    else if (a === '--interval') { args.interval = parseInt(next(), 10); }
    else if (a.startsWith('-')) { console.error(`Unknown option: ${a}\n\n${HELP}`); process.exit(2); }
    else { args.src.push(a); }
    cur = it.next();
  }
  return args;
}

function log(icon, msg) {
  const stamp = new Date().toLocaleTimeString('en-GB');
  console.log(`  ${icon} ${msg}   [${stamp}]`);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.src.length === 0) {
    console.error('✖ No source directory given.\n');
    console.log(HELP);
    process.exit(2);
  }
  if (!args.output && !args.readme) {
    console.error('✖ Nothing to write: pass --output <file> and/or --readme <file>.');
    console.log(HELP);
    process.exit(2);
  }

  const base = { src: args.src, output: args.output, readme: args.readme, lang: args.lang, title: args.title, includeToc: args.toc, recursive: true };

  // One-shot generation first (also seeds the watch loop).
  try {
    const { files, written } = generateDocs(base);
    const counts = countEntries(files);
    log('✨', `Generated ${counts.functions} function${counts.functions === 1 ? '' : 's'}${counts.classes ? ` / ${counts.classes} class${counts.classes === 1 ? '' : 'es'}` : ''} from ${counts.files} file${counts.files === 1 ? '' : 's'}.`);
    for (const w of written) log('📝', `Wrote ${w}`);
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }

  if (!args.watch) return;

  console.log('\n  👀  Watching for changes…  (Ctrl-C to stop)\n');
  const watcher = watchDocs({
    ...base,
    intervalMs: args.interval,
    onRegenerate: ({ reason, counts, elapsed, written }) => {
      const parts = [];
      if (reason.added.length) parts.push(`${reason.added.length} added`);
      if (reason.changed.length) parts.push(`${reason.changed.length} changed`);
      if (reason.removed.length) parts.push(`${reason.removed.length} removed`);
      log('🔄', `Docs regenerated (${parts.join(', ') || 'trigger'}) in ${elapsed}ms — ${counts.functions} entries.`);
      for (const w of written) log('📝', `Updated ${w}`);
    },
  });

  const shutdown = (sig) => {
    console.log(`\n  👋  ${sig} received — stopping watcher. Docs are up to date.`);
    watcher.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
