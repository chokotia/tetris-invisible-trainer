import { Game } from '../core/game.js';
import { Input } from '../input.js';
import { Renderer } from '../renderer.js';
import { PIECES } from '../core/piece.js';
import { applyMapCode } from '../core/mapcode.js';
import { loadLastReplay } from './recorder.js';
import { decodeReplay, encodeReplay } from './sharing.js';

const BLOCK = 30;
const NEXT_COUNT = 5;
const SNAPSHOT_INTERVAL = 60;  // フレーム毎にスナップショット
const SCRUB_SPEED = 4;          // 早送り/巻戻し時の毎raf進行フレーム数
const msToFrames = ms => Math.max(0, Math.round(ms * 60 / 1000));

function drawPiecePreview(canvas, type) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!type) return;
  const blocks = PIECES[type].blocks[0];
  const minY = Math.min(...blocks.map(([, y]) => y));
  ctx.fillStyle = PIECES[type].color;
  for (const [x, y] of blocks)
    ctx.fillRect(x * BLOCK + 1, (y - minY) * BLOCK + 1, BLOCK - 2, BLOCK - 2);
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const dataParam = params.get('d');
  
  let replay = dataParam ? decodeReplay(dataParam) : null;

  const statusEl = document.getElementById('status');

  if (!replay) {
    statusEl.textContent = 'リプレイがありません。プレイ画面で1手以上動かしてから再度開いてください。';
    document.getElementById('controls').style.display = 'none';
    return;
  }

  const { seed, mapCode, settings, events } = replay;
  const lastEventFrame = events.length ? events[events.length - 1].f : 0;

  const canvas       = document.getElementById('board');
  const scoreEl      = document.getElementById('score-val');
  const linesEl      = document.getElementById('lines-val');
  const holdCanvas   = document.getElementById('hold');
  const frameEl      = document.getElementById('frame-val');
  const seedEl       = document.getElementById('seed-val');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const restartBtn   = document.getElementById('restart-btn');
  const shareBtn     = document.getElementById('share-btn');
  const speedSel     = document.getElementById('speed-sel');

  shareBtn.onclick = async () => {
    const code = await encodeReplay(replay);
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('d', code);
    
    navigator.clipboard.writeText(url.toString()).then(() => {
      const originalText = shareBtn.textContent;
      shareBtn.textContent = 'コピー完了！';
      setTimeout(() => shareBtn.textContent = originalText, 2000);
    }).catch(err => {
      alert('コピーに失敗しました: ' + err);
    });
  };

  const nextCanvases = Array.from({ length: NEXT_COUNT }, (_, i) =>
    document.getElementById(`next${i}`)
  );

  holdCanvas.width  = BLOCK * 4;
  holdCanvas.height = BLOCK * 2;
  nextCanvases.forEach(c => { c.width = BLOCK * 4; c.height = BLOCK * 2; });

  seedEl.textContent = `seed ${seed}`;

  let game, input, renderer;
  let frame, eventIdx, paused, speed;
  let undoStack, pieceUndo;
  let snapshots;  // [{frame, eventIdx, gameSnap, inputSnap, undoStack, pieceUndo}, ...]
  let cachedMoveFrames = null;

  const pushUndo = () => {
    undoStack.push(pieceUndo);
    if (undoStack.length > 1000) undoStack.shift();
  };

  function takeSnapshot() {
    snapshots.push({
      frame,
      eventIdx,
      gameSnap:  game.snapshot(),
      inputSnap: input.snapshot(),
      undoStack: [...undoStack],
      pieceUndo,
    });
  }

  function restoreSnapshot(snap) {
    game.restore(snap.gameSnap);
    input.restore(snap.inputSnap);
    frame     = snap.frame;
    eventIdx  = snap.eventIdx;
    undoStack = [...snap.undoStack];
    pieceUndo = snap.pieceUndo;
  }

  function reset() {
    game = new Game({
      seed,
      lockDelayFrames: msToFrames(settings.lockDelay),
      attackEnabled: settings.attackEnabled,
      attackDifficulty: settings.attackDifficulty,
      attackStraightness: settings.attackStraightness,
      attackIntervalMin: settings.attackIntervalMin,
      attackIntervalMax: settings.attackIntervalMax,
      attackLinesMin: settings.attackLinesMin,
      attackLinesMax: settings.attackLinesMax,
    });
    if (mapCode && mapCode.length >= 200) applyMapCode(game, mapCode);
    input = new Input({
      das: msToFrames(settings.das),
      arr: msToFrames(settings.arr),
      dasCancel: settings.dasCancel,
      socd: settings.socd,
    });
    const attackCanvas = document.getElementById('attack-gauge');
    renderer = new Renderer(canvas, { attackCanvas });
    frame = 0;
    eventIdx = 0;
    paused = false;
    undoStack = [];
    pieceUndo = game.snapshot();
    snapshots = [];
    takeSnapshot();
    playPauseBtn.textContent = '一時停止';

    // スキップ処理
    const skipN = parseInt(params.get('n'), 10) || 0;
    if (skipN > 0) {
      if (!cachedMoveFrames) cachedMoveFrames = findMoveFrames();
      const targetFrame = cachedMoveFrames[Math.max(0, cachedMoveFrames.length - 1 - skipN)] || 0;
      if (targetFrame > 0) {
        while (frame < targetFrame) step();
      }
    }
  }

  function findMoveFrames() {
    const tempGame = new Game({
      seed,
      lockDelayFrames: msToFrames(settings.lockDelay),
      attackEnabled: settings.attackEnabled,
      attackDifficulty: settings.attackDifficulty,
      attackStraightness: settings.attackStraightness,
      attackIntervalMin: settings.attackIntervalMin,
      attackIntervalMax: settings.attackIntervalMax,
      attackLinesMin: settings.attackLinesMin,
      attackLinesMax: settings.attackLinesMax,
    });
    if (mapCode && mapCode.length >= 200) applyMapCode(tempGame, mapCode);
    const tempInput = new Input({
      das: msToFrames(settings.das),
      arr: msToFrames(settings.arr),
      dasCancel: settings.dasCancel,
      socd: settings.socd,
    });

    let f = 0;
    let ei = 0;
    const moves = [0];
    const tempUndoStack = [];
    let tempPieceUndo = tempGame.snapshot();

    while (f <= lastEventFrame) {
      while (ei < events.length && events[ei].f <= f) {
        const ev = events[ei++];
        if (ev.t === 'keydown') tempInput.keyDown(ev.d);
        else if (ev.t === 'keyup') tempInput.keyUp(ev.d);
      }
      f++;
      tempInput.update(f);

      if (!tempGame.isGameOver) {
        if (tempInput.justPressed('left')  || tempInput.repeat('left'))  tempGame.moveLeft();
        if (tempInput.justPressed('right') || tempInput.repeat('right')) tempGame.moveRight();
        if (tempInput.pressed('down')) {
          for (let i = 0; i < settings.sdf; i++) {
            const y = tempGame.current.y;
            tempGame.softDrop();
            if (tempGame.current.y === y) break;
          }
        }
        if (tempInput.justPressed('rotateCW'))  tempGame.rotateCW();
        if (tempInput.justPressed('rotateCCW')) tempGame.rotateCCW();
        if (tempInput.justPressed('rotate180')) tempGame.rotate180();
        if (tempInput.justPressed('hold')) {
          tempGame.hold();
          tempPieceUndo = tempGame.snapshot();
        }
        if (tempInput.justPressed('undo') && tempUndoStack.length > 0) {
          tempGame.restore(tempUndoStack.pop());
          tempPieceUndo = tempGame.snapshot();
          moves.pop();
        }
        if (tempInput.justPressed('harddrop')) {
          moves.push(f);
          tempUndoStack.push(tempPieceUndo);
          tempGame.hardDrop();
          tempPieceUndo = tempGame.snapshot();
        } else {
          const locked = tempGame.tick();
          if (locked) {
            moves.push(f);
            tempUndoStack.push(tempPieceUndo);
            tempPieceUndo = tempGame.snapshot();
          }
        }
      }
    }
    return moves;
  }

  function step() {
    if (frame > lastEventFrame) {
      if (!paused && !scrubbing) {
        paused = true;
        playPauseBtn.textContent = '再生';
      }
      return;
    }
    while (eventIdx < events.length && events[eventIdx].f <= frame) {
      const ev = events[eventIdx++];
      if (ev.t === 'keydown') input.keyDown(ev.d);
      else if (ev.t === 'keyup') input.keyUp(ev.d);
    }

    frame++;
    input.update(frame);

    if (!game.isGameOver) {
      if (input.justPressed('left')  || input.repeat('left'))  game.moveLeft();
      if (input.justPressed('right') || input.repeat('right')) game.moveRight();

      if (input.pressed('down')) {
        for (let i = 0; i < settings.sdf; i++) {
          const y = game.current.y;
          game.softDrop();
          if (game.current.y === y) break;
        }
      }

      if (input.justPressed('rotateCW'))  game.rotateCW();
      if (input.justPressed('rotateCCW')) game.rotateCCW();
      if (input.justPressed('rotate180')) game.rotate180();

      if (input.justPressed('hold')) {
        game.hold();
        pieceUndo = game.snapshot();
      }

      if (input.justPressed('harddrop')) {
        pushUndo();
        game.hardDrop();
        pieceUndo = game.snapshot();
        if (!settings.dasCarry) input.resetDas();
      }

      if (input.justPressed('undo') && undoStack.length > 0) {
        game.restore(undoStack.pop());
        pieceUndo = game.snapshot();
      }

      const locked = game.tick();
      if (locked) {
        pushUndo();
        pieceUndo = game.snapshot();
        if (!settings.dasCarry) input.resetDas();
      }
    }

    if (frame % SNAPSHOT_INTERVAL === 0) takeSnapshot();
  }

  function rewindTo(target) {
    target = Math.max(0, target);
    if (target >= frame) return;
    let idx = snapshots.length - 1;
    while (idx > 0 && snapshots[idx].frame > target) idx--;
    restoreSnapshot(snapshots[idx]);
    snapshots.length = idx + 1;
    while (frame < target) step();
  }

  function render() {
    renderer.draw(game);
    scoreEl.textContent = game.score;
    linesEl.textContent = game.linesCleared;
    frameEl.textContent = `${Math.min(frame, lastEventFrame)} / ${lastEventFrame}`;
    for (let i = 0; i < NEXT_COUNT; i++)
      drawPiecePreview(nextCanvases[i], game.next[i]);
    drawPiecePreview(holdCanvas, game.held);
  }

  const heldDir = { left: false, right: false };
  let scrubPrevPaused = false;
  let scrubbing = false;

  function getScrubDir() {
    if (heldDir.right && !heldDir.left) return +1;
    if (heldDir.left && !heldDir.right) return -1;
    return 0;
  }

  function updateScrubState() {
    const wasScrubbing = scrubbing;
    scrubbing = getScrubDir() !== 0;
    if (!wasScrubbing && scrubbing) {
      scrubPrevPaused = paused;
    } else if (wasScrubbing && !scrubbing) {
      paused = scrubPrevPaused;
      playPauseBtn.textContent = paused ? '再生' : '一時停止';
    }
  }

  function loop() {
    if (scrubbing) {
      const dir = getScrubDir();
      if (dir > 0) for (let i = 0; i < SCRUB_SPEED; i++) step();
      else if (dir < 0) rewindTo(frame - SCRUB_SPEED);
    } else if (!paused) {
      for (let i = 0; i < speed; i++) step();
    }
    render();
    requestAnimationFrame(loop);
  }

  playPauseBtn.addEventListener('click', () => {
    paused = !paused;
    playPauseBtn.textContent = paused ? '再生' : '一時停止';
  });

  restartBtn.addEventListener('click', () => reset());

  speedSel.addEventListener('change', () => {
    speed = Number(speedSel.value);
  });

  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'Space') {
      e.preventDefault();
      playPauseBtn.click();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      heldDir.right = true;
      updateScrubState();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      heldDir.left = true;
      updateScrubState();
    }
  });

  document.addEventListener('keyup', e => {
    if (e.code === 'ArrowRight') { heldDir.right = false; updateScrubState(); }
    else if (e.code === 'ArrowLeft') { heldDir.left = false; updateScrubState(); }
  });

  speed = Number(speedSel.value) || 1;
  reset();
  requestAnimationFrame(loop);
}

init();
