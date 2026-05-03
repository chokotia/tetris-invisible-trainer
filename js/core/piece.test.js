import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Piece, PIECES } from './piece.js';

test('7種類のピースが定義されている', () => {
  const types = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  for (const t of types)
    assert.ok(PIECES[t], `${t}が定義されていない`);
});

test('各ピースに色が定義されている', () => {
  for (const [type, def] of Object.entries(PIECES))
    assert.ok(def.color, `${type}に色がない`);
});

test('Tピース初期状態のブロック位置', () => {
  const piece = new Piece('T');
  // .T.
  // TTT
  assert.deepEqual(piece.blocks(), [
    [1, 0],
    [0, 1], [1, 1], [2, 1],
  ]);
});

test('Tピースを時計回りに回転', () => {
  const piece = new Piece('T');
  const rotated = piece.rotatedCW();
  // .T.
  // .TT
  // .T.
  assert.deepEqual(rotated.blocks(), [
    [1, 0],
    [1, 1], [2, 1],
    [1, 2],
  ]);
});

test('Tピースを反時計回りに回転', () => {
  const piece = new Piece('T');
  const rotated = piece.rotatedCCW();
  // .T.
  // TT.
  // .T.
  assert.deepEqual(rotated.blocks(), [
    [1, 0],
    [0, 1], [1, 1],
    [1, 2],
  ]);
});

test('Tピースを180度回転', () => {
  const piece = new Piece('T');
  const rotated = piece.rotatedCW().rotatedCW();
  // ...
  // TTT
  // .T.
  assert.deepEqual(rotated.blocks(), [
    [0, 1], [1, 1], [2, 1],
    [1, 2],
  ]);
});

test('回転は4回で元に戻る', () => {
  const piece = new Piece('T');
  const rotated = piece.rotatedCW().rotatedCW().rotatedCW().rotatedCW();
  assert.deepEqual(rotated.blocks(), piece.blocks());
});

test('Oピースは回転しても形が変わらない', () => {
  const piece = new Piece('O');
  const blocks = piece.blocks();
  assert.deepEqual(piece.rotatedCW().blocks(), blocks);
  assert.deepEqual(piece.rotatedCCW().blocks(), blocks);
});

test('Iピース初期状態は横4マス', () => {
  const piece = new Piece('I');
  // ....
  // IIII
  const blocks = piece.blocks();
  assert.equal(blocks.length, 4);
  // 全て同じy座標
  assert.ok(blocks.every(([, y]) => y === blocks[0][1]));
});

test('Iピースを時計回りで縦4マスになる', () => {
  const piece = new Piece('I');
  const rotated = piece.rotatedCW();
  const blocks = rotated.blocks();
  // 全て同じx座標
  assert.ok(blocks.every(([x]) => x === blocks[0][0]));
});

test('absoluteBlocksはx/yオフセットが反映される', () => {
  const piece = new Piece('T', 0, 3, 5);
  const abs = piece.absoluteBlocks();
  const rel = piece.blocks();
  for (let i = 0; i < rel.length; i++) {
    assert.equal(abs[i][0], rel[i][0] + 3);
    assert.equal(abs[i][1], rel[i][1] + 5);
  }
});

test('rotationプロパティが正しく更新される', () => {
  const p = new Piece('T');
  assert.equal(p.rotation, 0);
  assert.equal(p.rotatedCW().rotation, 1);
  assert.equal(p.rotatedCW().rotatedCW().rotation, 2);
  assert.equal(p.rotatedCCW().rotation, 3);
});
