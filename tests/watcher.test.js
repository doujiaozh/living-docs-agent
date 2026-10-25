import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchDocs, countEntries } from '../src/index.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(cond, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true;
    await sleep(50);
  }
  return false;
}

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livingdocs-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'lib.py'),
    'def first():\n    """Doc."""\n    return 1\n',
    'utf8');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Project\n', 'utf8');
  return dir;
}

test('watch mode regenerates docs when a source file changes', async () => {
  const dir = makeTempProject();
  let watcher;
  try {
    const events = [];
    watcher = watchDocs({
      src: [path.join(dir, 'src')],
      readme: path.join(dir, 'README.md'),
      intervalMs: 200,
      onRegenerate: (info) => events.push(info),
    });

    // Let the watcher establish its baseline snapshot.
    await sleep(400);

    // Modify the source file
    fs.writeFileSync(path.join(dir, 'src', 'lib.py'),
      'def first():\n    """Doc."""\n    return 1\n\n\ndef second():\n    """New."""\n    return 2\n',
      'utf8');

    assert.ok(await waitFor(() => events.some((e) => e.counts.functions === 2)), 'should pick up the new function');

    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    assert.match(readme, /livedocs:start/);
    assert.match(readme, /`second\(\)`/);
  } finally {
    if (watcher) watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('watch mode detects newly added files', async () => {
  const dir = makeTempProject();
  let watcher;
  try {
    const events = [];
    watcher = watchDocs({
      src: [path.join(dir, 'src')],
      readme: path.join(dir, 'README.md'),
      intervalMs: 200,
      onRegenerate: (info) => events.push(info),
    });
    await sleep(400);

    fs.writeFileSync(path.join(dir, 'src', 'more.py'), 'def extra():\n    return 0\n', 'utf8');
    assert.ok(await waitFor(() => events.some((e) => e.counts.functions >= 2)), 'should detect added file');
  } finally {
    if (watcher) watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('countEntries tallies functions, methods and classes', () => {
  const files = [
    { functions: [{}, {}], classes: [{ methods: [{}] }] },
    { functions: [], classes: [] },
  ];
  assert.deepEqual(countEntries(files), { files: 2, functions: 3, classes: 1 });
});
