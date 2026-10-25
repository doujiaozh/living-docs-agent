import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cli = path.join(root, 'bin', 'cli.js');

function runCli(args, { cwd = root } = {}) {
  return execFileSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

test('CLI writes a standalone API document', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livingdocs-cli-'));
  try {
    const out = path.join(dir, 'API.md');
    const stdout = runCli([path.join(here, 'fixtures/python'), '-o', out, '-t', 'Py Test']);
    assert.match(stdout, /Generated 1[0-9]? function/);
    const md = fs.readFileSync(out, 'utf8');
    assert.match(md, /# 📚 Py Test/);
    assert.match(md, /```python/);
    assert.match(md, /Vector2D/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI injects docs into an existing README between markers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livingdocs-cli-'));
  try {
    const readme = path.join(dir, 'README.md');
    fs.writeFileSync(readme, '# Proj\n\nIntro text.\n', 'utf8');
    runCli([path.join(here, 'fixtures/c'), '-r', readme, '-t', 'C API']);
    const md = fs.readFileSync(readme, 'utf8');
    assert.match(md, /^# Proj/);
    assert.match(md, /Intro text\./);
    assert.match(md, /<!-- livedocs:start -->/);
    assert.match(md, /<!-- livedocs:end -->/);
    assert.match(md, /ml_add/);
    // second run stays idempotent (single marker pair)
    runCli([path.join(here, 'fixtures/c'), '-r', readme, '-t', 'C API']);
    assert.equal((fs.readFileSync(readme, 'utf8').match(/livedocs:start/g) || []).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI handles C and Python together in auto mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livingdocs-cli-'));
  try {
    const out = path.join(dir, 'API.md');
    runCli([path.join(here, 'fixtures/c'), path.join(here, 'fixtures/python'), '-o', out]);
    const md = fs.readFileSync(out, 'utf8');
    assert.match(md, /language-PYTHON/);
    assert.match(md, /language-C/);
    assert.match(md, /🐍/);
    assert.match(md, /🔧/);
    assert.match(md, /Vector2D/);
    assert.match(md, /ml_clamp/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --help and --version work', () => {
  assert.match(runCli(['--help']), /USAGE/);
  assert.match(runCli(['--version']), /0\.1\.0/);
});

test('CLI exits with error when no source is given', () => {
  assert.throws(() => runCli([]), (err) => {
    assert.equal(err.status, 2);
    return true;
  });
});
