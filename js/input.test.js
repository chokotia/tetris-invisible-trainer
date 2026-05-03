import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from './input.js';

function makeInput(das = 10, arr = 2) {
  return new Input({ das, arr });
}

test('キー押下でpressedがtrueになる', () => {
  const inp = makeInput();
  inp.keyDown('left');
  assert.equal(inp.pressed('left'), true);
});

test('キー離すでpressedがfalseになる', () => {
  const inp = makeInput();
  inp.keyDown('left');
  inp.keyUp('left');
  assert.equal(inp.pressed('left'), false);
});

test('押してすぐはjustPressedがtrue', () => {
  const inp = makeInput();
  inp.keyDown('left');
  inp.update(1);
  assert.equal(inp.justPressed('left'), true);
});

test('2フレーム目はjustPressedがfalse', () => {
  const inp = makeInput();
  inp.keyDown('left');
  inp.update(1);
  inp.update(2);
  assert.equal(inp.justPressed('left'), false);
});

test('DAS発動前はrepeatがfalse', () => {
  const inp = makeInput();  // das=10
  inp.keyDown('left');
  for (let f = 1; f < 10; f++) inp.update(f);
  assert.equal(inp.repeat('left'), false);
});

test('DASフレームちょうどでrepeatがtrue', () => {
  const inp = makeInput();  // das=10
  inp.keyDown('left');
  for (let f = 1; f <= 10; f++) inp.update(f);
  assert.equal(inp.repeat('left'), true);
});

test('DAS後はARR間隔でrepeatがtrue', () => {
  const inp = makeInput(10, 2);  // das=10, arr=2
  inp.keyDown('left');
  for (let f = 1; f <= 12; f++) inp.update(f);
  assert.equal(inp.repeat('left'), true);   // frame 12 = DAS(10) + ARR(2)
});

test('ARR=0はDAS後に毎フレームrepeatがtrue', () => {
  const inp = makeInput(10, 0);  // arr=0 → 連射
  inp.keyDown('left');
  for (let f = 1; f <= 11; f++) inp.update(f);
  assert.equal(inp.repeat('left'), true);
  inp.update(12);
  assert.equal(inp.repeat('left'), true);
});

test('キー離すとrepeatがリセットされる', () => {
  const inp = makeInput();
  inp.keyDown('left');
  for (let f = 1; f <= 15; f++) inp.update(f);
  inp.keyUp('left');
  inp.update(16);
  assert.equal(inp.repeat('left'), false);
});

test('押してないキーは全てfalse', () => {
  const inp = makeInput();
  inp.update(1);
  assert.equal(inp.pressed('left'), false);
  assert.equal(inp.justPressed('left'), false);
  assert.equal(inp.repeat('left'), false);
});

test('反対方向を押すと左のDASがリセットされる', () => {
  const inp = makeInput(10, 0);  // das=10
  inp.keyDown('left');
  // leftのDASを発動させる
  for (let f = 1; f <= 15; f++) inp.update(f);
  assert.equal(inp.repeat('left'), true);
  // 右を押す → leftのDASがリセット
  inp.keyDown('right');
  inp.update(16);
  assert.equal(inp.repeat('left'), false);  // DASリセット済みでfalse
});

test('反対方向を押してもjustPressedは影響を受けない', () => {
  const inp = makeInput(10, 0);
  inp.keyDown('left');
  inp.update(1);
  // 1フレーム後に右を押す
  inp.keyDown('right');
  inp.update(2);
  // leftのjustPressedはframe1に押したまま（影響なし）
  assert.equal(inp.justPressed('left'), false);  // prevFrame=1, held[left]=0 → false
  // rightはjustPressedがtrue
  assert.equal(inp.justPressed('right'), true);
});
