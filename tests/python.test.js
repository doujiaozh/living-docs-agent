import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePythonSource } from '../src/parser/python.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(here, 'fixtures/python/math_tools.py'), 'utf8');
const parsed = parsePythonSource(fixture, { path: 'math_tools.py' });

test('module docstring is extracted', () => {
  assert.ok(parsed.moduleDoc);
  assert.match(parsed.moduleDoc, /Math toolkit/);
});

test('module-level functions are collected with names and lines', () => {
  const names = parsed.functions.map((f) => f.name);
  assert.ok(names.includes('add'));
  assert.ok(names.includes('greet'));
  assert.ok(names.includes('describe'));
  assert.ok(names.includes('fetch'));
  assert.ok(names.includes('multiply'));
  assert.ok(names.includes('variadic_join'));
  const add = parsed.functions.find((f) => f.name === 'add');
  assert.equal(add.line >= 1, true);
});

test('reST docstring params are parsed into param descriptions', () => {
  const add = parsed.functions.find((f) => f.name === 'add');
  const a = add.params.find((p) => p.name === 'a');
  assert.equal(a.type, 'int');
  assert.equal(a.description, 'first operand');
  assert.equal(add.returns.type, 'int');
  assert.equal(add.returns.description, 'the arithmetic sum of a and b');
});

test('Google-style docstrings populate params and return docs', () => {
  const greet = parsed.functions.find((f) => f.name === 'greet');
  const name = greet.params.find((p) => p.name === 'name');
  assert.equal(name.type, 'str');
  assert.equal(name.description, 'who to greet');
  const excited = greet.params.find((p) => p.name === 'excited');
  assert.equal(excited.default, 'False');
  assert.equal(greet.returns.description, 'the greeting message');
});

test('multi-line signature is flattened and parsed', () => {
  const describe = parsed.functions.find((f) => f.name === 'describe');
  const names = describe.params.map((p) => p.name);
  assert.deepEqual(names, ['value', 'prefix', 'precision', 'kwargs']);
  const kw = describe.params.find((p) => p.name === 'kwargs');
  assert.equal(kw.variadic, 'kwarg');
  const prec = describe.params.find((p) => p.name === 'precision');
  assert.equal(prec.keywordOnly, true);
  assert.equal(prec.default, '2');
});

test('async flag is captured', () => {
  const fetch = parsed.functions.find((f) => f.name === 'fetch');
  assert.equal(fetch.isAsync, true);
});

test('leading # comments become the description when no docstring exists', () => {
  const multiply = parsed.functions.find((f) => f.name === 'multiply');
  assert.match(multiply.doc, /leading comment lines/);
});

test('return type is inferred when there is no arrow annotation', () => {
  const inferred = parsed.functions.find((f) => f.name === 'inferred_int');
  assert.equal(inferred.returns.type, 'number');
  assert.equal(inferred.returns.inferred, true);
  const none = parsed.functions.find((f) => f.name === 'inferred_none');
  assert.equal(none.returns.type, 'None');
});

test('classes collect methods with self stripped', () => {
  const vec = parsed.classes.find((c) => c.name === 'Vector2D');
  assert.equal(vec.bases.length, 0);
  const methodNames = vec.methods.map((m) => m.name);
  assert.deepEqual(methodNames, ['__init__', 'magnitude', 'is_zero', 'origin', 'distance']);
  for (const m of vec.methods) {
    assert.ok(!m.params.some((p) => p.name === 'self' || p.name === 'cls'), `self should be stripped in ${m.name}`);
  }
});

test('decorators are attached to decorated methods', () => {
  const vec = parsed.classes.find((c) => c.name === 'Vector2D');
  assert.deepEqual(vec.methods.find((m) => m.name === 'is_zero').decorators, ['property']);
  assert.deepEqual(vec.methods.find((m) => m.name === 'origin').decorators, ['classmethod']);
  assert.deepEqual(vec.methods.find((m) => m.name === 'distance').decorators, ['staticmethod']);
});

test('vararg params are flagged', () => {
  const join = parsed.functions.find((f) => f.name === 'variadic_join');
  const parts = join.params.find((p) => p.name === 'parts');
  assert.equal(parts.variadic, 'vararg');
  assert.equal(parts.type, 'str');
});
