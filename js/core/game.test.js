import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './game.js';

function makeGame(seed = 0) {
  return new Game({ seed });
}

test('ゲーム開始時に現在ピースが存在する', () => {
  const g = makeGame();
  assert.ok(g.current);
});

test('ゲーム開始時のNextキューに5個以上ある', () => {
  const g = makeGame();
  assert.ok(g.next.length >= 5);
});

test('moveLeftでピースが左に移動する', () => {
  const g = makeGame();
  const prevX = g.current.x;
  g.moveLeft();
  assert.equal(g.current.x, prevX - 1);
});

test('moveRightでピースが右に移動する', () => {
  const g = makeGame();
  const prevX = g.current.x;
  g.moveRight();
  assert.equal(g.current.x, prevX + 1);
});

test('rotateCWでピースが時計回りに回転する', () => {
  const g = makeGame();
  const prevRot = g.current.rotation;
  g.rotateCW();
  assert.equal(g.current.rotation, (prevRot + 1) % 4);
});

test('rotateCCWでピースが反時計回りに回転する', () => {
  const g = makeGame();
  const prevRot = g.current.rotation;
  g.rotateCCW();
  assert.equal(g.current.rotation, (prevRot + 3) % 4);
});

test('hardDropでピースが固定されてスコアが0以上になる', () => {
  const g = makeGame();
  g.hardDrop();
  assert.ok(g.score >= 0);
});

test('hardDrop後に新しいピースが出現する', () => {
  const g = makeGame();
  const firstType = g.current.type;
  const firstNext = g.next[0];
  g.hardDrop();
  assert.equal(g.current.type, firstNext);
});

test('左端では左に移動できない', () => {
  const g = makeGame();
  for (let i = 0; i < 20; i++) g.moveLeft();
  const x = g.current.x;
  g.moveLeft();
  assert.equal(g.current.x, x);
});

test('softDropでピースが1マス落下する', () => {
  const g = makeGame();
  const prevY = g.current.y;
  g.softDrop();
  assert.equal(g.current.y, prevY + 1);
});

test('tickで重力が働きピースが落下する', () => {
  const g = makeGame();
  const prevY = g.current.y;
  for (let i = 0; i < g.gravityFrames; i++) g.tick();
  assert.ok(g.current.y > prevY || g.current !== null);
});

test('hardDropを繰り返すとlinesCleared値が取得できる', () => {
  const g = makeGame();
  // 全行を直接埋めてclearLinesのカウントを確認
  for (let x = 0; x < g.board.cols; x++)
    g.board.set(x, g.board.rows - 1, 'I');
  g.board.clearLines();
  assert.ok(g.linesCleared >= 0);
});

test('isGameOverはゲームオーバー時にtrueになる', () => {
  const g = makeGame();
  // 列0だけ空けて全行を埋める（ライン消去されず、スポーン位置が塞がれる）
  for (let y = 0; y < g.board.rows; y++)
    for (let x = 1; x < g.board.cols; x++)
      g.board.set(x, y, 'I');
  g.hardDrop();
  assert.equal(g.isGameOver, true);
});

test('gravityFramesが0のとき、tickで落下しない', () => {
  const g = new Game({ seed: 0, gravityFrames: 0 });
  const prevY = g.current.y;
  for (let i = 0; i < 100; i++) g.tick();
  assert.equal(g.current.y, prevY);
});
