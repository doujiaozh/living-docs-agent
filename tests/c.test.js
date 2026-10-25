import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSource } from '../src/parser/c.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cSource = fs.readFileSync(path.join(here, 'fixtures/c/math_lib.c'), 'utf8');
const hSource = fs.readFileSync(path.join(here, 'fixtures/c/math_lib.h'), 'utf8');
const c = parseCSource(cSource, { path: 'math_lib.c' });
const h = parseCSource(hSource, { path: 'math_lib.h' });

test('file header comment becomes the module doc', () => {
  assert.match(c.moduleDoc, /implementation of the demo math library/);
  assert.match(h.moduleDoc, /public API of the demo math library/);
});

test('definitions are parsed from the .c file', () => {
  const names = c.functions.map((f) => f.name);
  assert.ok(names.includes('ml_add'));
  assert.ok(names.includes('ml_multiply'));
  assert.ok(names.includes('ml_clamp'));
  assert.ok(names.includes('ml_repeat'));
  assert.ok(names.includes('ml_sum'));
  assert.ok(names.includes('ml_identity'));
  assert.ok(names.includes('ml_demo'));
});

test('return types are normalized', () => {
  const add = c.functions.find((f) => f.name === 'ml_add');
  assert.equal(add.returnType, 'int');
  const repeat = c.functions.find((f) => f.name === 'ml_repeat');
  assert.equal(repeat.returnType, 'char *');
});

test('Doxygen-style comments attach docs and param descriptions', () => {
  const add = c.functions.find((f) => f.name === 'ml_add');
  assert.match(add.doc, /Add two integers/);
  assert.equal(add.params.find((p) => p.name === 'a').description, 'first operand');
  assert.equal(add.returns.description, 'the sum of a and b');
});

test('line comments become docs', () => {
  const clamp = c.functions.find((f) => f.name === 'ml_clamp');
  assert.match(clamp.doc, /Clamp value into the closed interval/);
});

test('static functions are flagged', () => {
  const sig = c.functions.find((f) => f.name === 'signum');
  assert.equal(sig.isStatic, true);
  assert.equal(sig.returnType, 'int');
});

test('undocumented functions parse with empty docs', () => {
  const id = c.functions.find((f) => f.name === 'ml_identity');
  assert.equal(id.doc, '');
  assert.equal(id.params.length, 1);
  assert.equal(id.params[0].name, 'x');
});

test('function call statements and control keywords are not parsed as functions', () => {
  const names = c.functions.map((f) => f.name);
  assert.ok(!names.includes('if'));
  assert.ok(!names.includes('while'));
  assert.ok(!names.includes('for'));
  assert.ok(!names.includes('memcpy'));
  assert.ok(!names.includes('malloc'));
  assert.ok(!names.includes('v'));
});

test('const pointer and array params are typed', () => {
  const repeat = c.functions.find((f) => f.name === 'ml_repeat');
  assert.equal(repeat.params[0].type, 'const char *');
  assert.equal(repeat.params[1].type, 'size_t');
  const sum = c.functions.find((f) => f.name === 'ml_sum');
  assert.equal(sum.params[0].type, 'const int *');
  assert.equal(sum.params[1].type, 'size_t');
});

test('void parameter lists yield no params', () => {
  const demo = c.functions.find((f) => f.name === 'ml_demo');
  assert.equal(demo.params.length, 0);
});

test('header prototypes are parsed and marked as prototypes', () => {
  const names = h.functions.map((f) => f.name);
  assert.ok(names.includes('ml_add'));
  assert.ok(names.includes('ml_clamp'));
  assert.ok(names.includes('ml_repeat'));
  assert.ok(names.includes('ml_sum'));
  for (const fn of h.functions) assert.equal(fn.kind, 'prototype');
  const clamp = h.functions.find((f) => f.name === 'ml_clamp');
  assert.equal(clamp.returnType, 'double');
  assert.match(clamp.doc, /Clamp a value/);
});

test('global variable declarations are not treated as functions', () => {
  const names = h.functions.map((f) => f.name);
  assert.ok(!names.includes('ML_TABLE_SIZE'));
});

test('brace bodies are skipped so inner statements stay out', () => {
  const count = c.functions.filter((f) => f.name === 'ml_add').length;
  assert.equal(count, 1);
});
