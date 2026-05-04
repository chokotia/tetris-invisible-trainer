import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from './board.js';

test('盤面は10列21行で初期化される', () => {
  const board = new Board();
  assert.equal(board.cols, 10);
  assert.equal(board.rows, 21);
});

test('初期状態は全セルが空', () => {
  const board = new Board();
  for (let y = 0; y < board.rows; y++)
    for (let x = 0; x < board.cols; x++)
      assert.equal(board.get(x, y), null);
});

test('セルにブロックを置ける', () => {
  const board = new Board();
  board.set(3, 5, 'T');
  assert.equal(board.get(3, 5), 'T');
});

test('範囲外はisValidがfalse', () => {
  const board = new Board();
  assert.equal(board.isValid(-1, 0), false);
  assert.equal(board.isValid(10, 0), false);
  assert.equal(board.isValid(0, -1), true); // buffer zone above
  assert.equal(board.isValid(0, 21), false);
});

test('範囲内の空セルはisValidがtrue', () => {
  const board = new Board();
  assert.equal(board.isValid(0, 0), true);
  assert.equal(board.isValid(9, 20), true);
});

test('埋まったセルはisValidがfalse', () => {
  const board = new Board();
  board.set(5, 5, 'I');
  assert.equal(board.isValid(5, 5), false);
});

test('1行埋まるとclearLinesで1が返る', () => {
  const board = new Board();
  for (let x = 0; x < board.cols; x++)
    board.set(x, 20, 'I');
  assert.equal(board.clearLines(), 1);
});

test('clearLines後にその行が空になる', () => {
  const board = new Board();
  for (let x = 0; x < board.cols; x++)
    board.set(x, 20, 'I');
  board.clearLines();
  for (let x = 0; x < board.cols; x++)
    assert.equal(board.get(x, 20), null);
});

test('消えた行の上のブロックが落ちてくる', () => {
  const board = new Board();
  board.set(0, 19, 'T');           // 消える行の1つ上にブロック
  for (let x = 0; x < board.cols; x++)
    board.set(x, 20, 'I');         // 最下行を埋める
  board.clearLines();
  assert.equal(board.get(0, 20), 'T');  // 1行落ちてくる
  assert.equal(board.get(0, 19), null);
});

test('2行同時に消せる', () => {
  const board = new Board();
  for (let x = 0; x < board.cols; x++) {
    board.set(x, 19, 'I');
    board.set(x, 20, 'I');
  }
  assert.equal(board.clearLines(), 2);
});

test('部分的に埋まった行は消えない', () => {
  const board = new Board();
  for (let x = 0; x < board.cols - 1; x++)
    board.set(x, 20, 'I');
  assert.equal(board.clearLines(), 0);
});

test('clearでリセットできる', () => {
  const board = new Board();
  board.set(5, 5, 'T');
  board.clear();
  assert.equal(board.get(5, 5), null);
});

test('getBoardState: 何もないときはnone', () => {
  const board = new Board();
  assert.equal(board.getBoardState(), 'none');
});

test('getBoardState: 完璧に積まれているときはnone', () => {
  const board = new Board();
  board.set(0, 20, 'I');
  board.set(1, 20, 'I');
  assert.equal(board.getBoardState(), 'none');
});

test('getBoardState: オーバーハング（到達可能な穴）はyellow', () => {
  const board = new Board();
  // ##.
  // #..
  // ###
  board.set(0, 18, 'I'); board.set(1, 18, 'I');
  board.set(0, 19, 'I'); 
  board.set(0, 20, 'I'); board.set(1, 20, 'I'); board.set(2, 20, 'I');
  // (1, 19) は (2, 19) から到達可能
  assert.equal(board.getBoardState(), 'yellow');
});

test('getBoardState: 閉じられた穴はred', () => {
  const board = new Board();
  // ###
  // #.#
  // ###
  board.set(0, 18, 'I'); board.set(1, 18, 'I'); board.set(2, 18, 'I');
  board.set(0, 19, 'I');                        board.set(2, 19, 'I');
  board.set(0, 20, 'I'); board.set(1, 20, 'I'); board.set(2, 20, 'I');
  assert.equal(board.getBoardState(), 'red');
});

test('getBoardState: 下部のせり上がり（純粋なガベージ）は判定から除外される', () => {
  const board = new Board(10, 20);
  
  // ガベージを2行追加（穴は3列目）
  board.pushGarbage(2, 3);
  
  // ガベージの穴の上にブロックを置いても、それはガベージ行なので無視されるべき
  board.set(3, 17, 'I'); 
  
  assert.equal(board.getBoardState(), 'none');
});

test('getBoardState: ガベージとプレイヤーのブロックが混在する場合は判定に含まれる', () => {
  const board = new Board(10, 20);
  
  // ガベージを2行追加
  board.pushGarbage(2, 3); // Row 18, 19
  
  // ガベージの行（最下行）にプレイヤーがブロックを置く
  board.set(0, 19, 'I'); // これにより19行目は「純粋なガベージ」ではなくなる
  
  // 18行目（ガベージだった行）の特定のセルを空にして、その上にプレイヤーがブロックを置く
  board.set(0, 18, null); 
  board.set(0, 17, 'I'); // (0, 18) が穴（またはオーバーハング）になる
  
  assert.ok(board.getBoardState() !== 'none');
});


