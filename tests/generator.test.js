import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMarkdown, injectIntoReadme, extractInjected, START_MARKER, END_MARKER } from '../src/generator/markdown.js';
import { parsePythonSource } from '../src/parser/python.js';
import { parseCSource } from '../src/parser/c.js';

const py = parsePythonSource(`"""Module doc."""


def add(a: int, b: int) -> int:
    """Sum.

    :param a: first
    """
    return a + b


class Box:
    """A box."""

    def open(self) -> str:
        """Open it."""
        return "x"
`, { path: '/root/src/sample.py' });

const c = parseCSource(`/** Header. */
static int signum(int x)
{
    return x;
}
`, { path: '/root/src/sample.c' });

const md = generateMarkdown([py, c], { title: 'Demo', rootDir: '/root', level: 1 });

test('document starts with title and badges', () => {
  const lines = md.split('\n');
  assert.equal(lines[0], '# 📚 Demo');
  assert.ok(md.includes('shields.io/badge/functions'));
  assert.ok(md.includes('language-PYTHON'));
  assert.ok(md.includes('language-C'));
});

test('overview stats table is rendered', () => {
  assert.match(md, /🧭 Overview/);
  assert.match(md, /\| Functions \| 3 \|/); // 1 module fn + 1 method + 1 c fn
  assert.match(md, /\| Classes \| 1 \|/);
});

test('relative paths use forward slashes', () => {
  assert.match(md, /\`src\/sample.py\`/);
  assert.match(md, /\`src\/sample.c\`/);
});

test('table of contents links to anchors', () => {
  assert.match(md, /📖 Table of Contents/);
  assert.match(md, /\[🐍 `src\/sample\.py`\]/);
  assert.match(md, /#\w/);
});

test('python functions render signature, params table and returns', () => {
  assert.match(md, /```python/);
  assert.match(md, /def add\(a: int, b: int\) -> int/);
  assert.match(md, /\| Name \| Type \|/);
  assert.match(md, /`a`/);
  assert.match(md, /\| first \|/);
  assert.match(md, /\*\*Returns\*\*/);
  assert.match(md, /\*\*Source\*\* · .+sample\.py:\d+/);
});

test('class heading and methods appear', () => {
  assert.match(md, /class `Box`/);
  assert.match(md, /`open\(\)`/);
});

test('c functions render c code block and badges', () => {
  assert.match(md, /```c/);
  assert.match(md, /int signum\(int x\)/);
  assert.match(md, /`static`/);
  assert.match(md, /🔧/);
  assert.match(md, /🐍/);
});

test('injection inserts between markers when absent', () => {
  const out = injectIntoReadme('# My Project\n\nSome intro.', md);
  const extracted = extractInjected(out);
  assert.ok(extracted);
  assert.ok(out.includes(START_MARKER) && out.includes(END_MARKER));
  assert.ok(extracted.includes('Demo'));
});

test('injection replaces previous content between markers', () => {
  const first = injectIntoReadme('', md);
  const updated = injectIntoReadme(first, '# 📚 Different');
  assert.equal(extractInjected(updated), '# 📚 Different');
  // marker count stays exactly 2
  assert.equal((updated.match(/livedocs:start/g) || []).length, 1);
  assert.equal((updated.match(/livedocs:end/g) || []).length, 1);
});

test('injected docs before existing content stay in place', () => {
  const out = injectIntoReadme('# My Project\n\nSome intro.', md);
  assert.ok(out.indexOf('Some intro.') < out.indexOf(START_MARKER));
});

test('markers mentioned in prose are not treated as anchors', () => {
  const readme = [
    '# Project',
    '',
    'We use `<!-- livedocs:start -->` and `<!-- livedocs:end -->` inline in prose.',
    '',
    START_MARKER,
    '',
    'old body',
    '',
    END_MARKER,
    '',
  ].join('\n');
  const out = injectIntoReadme(readme, md);
  assert.match(out, /We use `<!-- livedocs:start -->` and `<!-- livedocs:end -->` inline in prose\./);
  assert.ok(!out.includes('old body'));
  assert.ok(extractInjected(out).includes('Demo'));
});

test('markers inside fenced code blocks are not treated as anchors', () => {
  const readme = [
    '# Project',
    '',
    'Document the markers like this:',
    '',
    '```markdown',
    START_MARKER,
    END_MARKER,
    '```',
    '',
    START_MARKER,
    '',
    'old body',
    '',
    END_MARKER,
    '',
  ].join('\n');
  const out = injectIntoReadme(readme, md);
  // the fenced example stays untouched and in order
  const fence = out.slice(out.indexOf('```markdown'), out.indexOf('```', out.indexOf('```markdown') + 3) + 3);
  assert.equal(fence, ['```markdown', START_MARKER, END_MARKER, '```'].join('\n'));
  assert.ok(!out.includes('old body'));
  assert.ok(extractInjected(out).includes('Demo'));
});
