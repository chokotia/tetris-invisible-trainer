import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Randomizer } from './randomizer.js';

const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

test('nextは7種のうちいずれかを返す', () => {
  const r = new Randomizer(0);
  for (let i = 0; i < 20; i++)
    assert.ok(TYPES.includes(r.next()));
});

test('同じシードは同じ順序を生成する', () => {
  const r1 = new Randomizer(42);
  const r2 = new Randomizer(42);
  for (let i = 0; i < 14; i++)
    assert.equal(r1.next(), r2.next());
});

test('違うシードは異なる順序を生成する', () => {
  const r1 = new Randomizer(1);
  const r2 = new Randomizer(2);
  const seq1 = Array.from({ length: 7 }, () => r1.next());
  const seq2 = Array.from({ length: 7 }, () => r2.next());
  assert.notDeepEqual(seq1, seq2);
});

test('1bag（7回）でちょうど7種が1つずつ出る', () => {
  const r = new Randomizer(0);
  const bag = Array.from({ length: 7 }, () => r.next());
  assert.equal(bag.length, 7);
  for (const t of TYPES)
    assert.equal(bag.filter(x => x === t).length, 1, `${t}が1回出ない`);
});

test('2bag（14回）でも各7種が2つずつ出る', () => {
  const r = new Randomizer(0);
  const bag = Array.from({ length: 14 }, () => r.next());
  for (const t of TYPES)
    assert.equal(bag.filter(x => x === t).length, 2, `${t}が2回出ない`);
});

test('peek(n)はnext()と同じ順序を返す', () => {
  const r1 = new Randomizer(7);
  const r2 = new Randomizer(7);
  const peeked = r1.peek(5);
  const nexted = Array.from({ length: 5 }, () => r2.next());
  assert.deepEqual(peeked, nexted);
});

test('peek後もnext()の順序は変わらない', () => {
  const r = new Randomizer(99);
  const peeked = r.peek(3);
  assert.equal(r.next(), peeked[0]);
  assert.equal(r.next(), peeked[1]);
  assert.equal(r.next(), peeked[2]);
});
