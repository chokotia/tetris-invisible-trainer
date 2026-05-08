import { Game } from './core/game.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { PIECES } from './core/piece.js';
import { loadSettings, saveSettings } from './settings.js';
import { Recorder } from './replay/recorder.js';
import { encodeReplay } from './replay/sharing.js';
import { applyMapCode, generateProblemMapCode } from './core/mapcode.js';

const BLOCK = 30;
const NEXT_COUNT = 5;
const PRACTICE_KEY = 'tetris-practice';

function loadPractice() {
  try { return JSON.parse(localStorage.getItem(PRACTICE_KEY) || '{}'); }
  catch { return {}; }
}

function savePractice(p) {
  localStorage.setItem(PRACTICE_KEY, JSON.stringify(p));
}

function drawPiecePreview(canvas, type) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!type) return;
  const blocks = PIECES[type].blocks[0];
  const minX = Math.min(...blocks.map(([x]) => x));
  const maxX = Math.max(...blocks.map(([x]) => x));
  const minY = Math.min(...blocks.map(([, y]) => y));
  const maxY = Math.max(...blocks.map(([, y]) => y));
  const pieceWidth = (maxX - minX + 1) * BLOCK;
  const pieceHeight = (maxY - minY + 1) * BLOCK;
  const offsetX = (canvas.width - pieceWidth) / 2 - minX * BLOCK;
  const offsetY = (canvas.height - pieceHeight) / 2 - minY * BLOCK;
  ctx.fillStyle = PIECES[type].color;
  for (const [x, y] of blocks) {
    ctx.fillRect(x * BLOCK + offsetX, y * BLOCK + offsetY, BLOCK, BLOCK);
  }
}

function buildKeyMap(keys) {
  const map = {};
  for (const [action, code] of Object.entries(keys))
    map[code] = action;
  return map;
}

function init() {
  const settings = loadSettings();
  let practice = loadPractice();
  practice.sessionSeed = (Math.random() * 0xFFFFFFFF) >>> 0;
  practice.counter = 0;
  savePractice(practice);

  const problemSeed = () => (practice.sessionSeed + practice.counter) >>> 0;

  const canvas       = document.getElementById('board');
  const scoreEl      = document.getElementById('score-val');
  const linesEl      = document.getElementById('lines-val');
  const gameoverEl   = document.getElementById('gameover');
  const holdCanvas   = document.getElementById('hold');
  const counterEl    = document.getElementById('practice-counter');
  const seedEl       = document.getElementById('practice-seed');
  const mapCodeInput = document.getElementById('map-code');
  const stateIndicator = document.getElementById('state-indicator');
  const nextCanvases = Array.from({ length: NEXT_COUNT }, (_, i) =>
    document.getElementById(`next${i}`)
  );

  holdCanvas.width  = BLOCK * 4;
  holdCanvas.height = BLOCK * 2;
  nextCanvases.forEach(c => { c.width = BLOCK * 4; c.height = BLOCK * 2; });

  mapCodeInput.value = practice.mapCode || '';
  mapCodeInput.addEventListener('input', () => {
    practice.mapCode = mapCodeInput.value.trim();
    savePractice(practice);
  });

  const msToFrames = ms => Math.max(0, Math.round(ms * 60 / 1000));

  const REPLAY_SETTING_KEYS = [
    'das', 'arr', 'sdf', 'lockDelay', 'dasCancel', 'socd', 'dasCarry', 
    'attackEnabled', 'attackDifficulty', 'attackStraightness', 
    'attackIntervalMin', 'attackIntervalMax', 'attackLinesMin', 'attackLinesMax',
    'invisible', 'problemType', 'problemGarbageType'
  ];

  let recorder;

  function newGame() {
    const seed = problemSeed();
    const g = new Game({ 
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

    let mapCode = practice.mapCode || '';
    if (settings.problemType && settings.problemType !== 'none') {
      mapCode = generateProblemMapCode(seed, settings.problemType, settings.problemGarbageType);
    }

    if (mapCode && mapCode.length >= 200)
      applyMapCode(g, mapCode);

    const replaySettings = Object.fromEntries(
      REPLAY_SETTING_KEYS.map(k => [k, settings[k]])
    );
    recorder = new Recorder({ seed, mapCode: mapCode, settings: replaySettings });
    return g;
  }

  let game = newGame();
  let frame = 0;
  const undoStack = [];

  const input = new Input({
    das: msToFrames(settings.das),
    arr: msToFrames(settings.arr),
    dasCancel: settings.dasCancel,
    socd: settings.socd,
  });

  const getUndoSnapshot = () => ({
    gameSnap: game.snapshot(),
    inputSnap: input.snapshot(),
    recorderIdx: recorder.data.events.length,
    frame: frame,
  });

  let pieceUndo = getUndoSnapshot();

  const pushUndo = () => {
    undoStack.push(pieceUndo);
    if (undoStack.length > 1000) undoStack.shift();
  };

  const attackCanvas = document.getElementById('attack-gauge');
  if (settings.autoInvisible) {
    settings.invisible = true;
    saveSettings(settings);
  }

  const renderer = new Renderer(canvas, { attackCanvas });
  renderer.invisible = !!settings.invisible;
  let KEY_MAP = buildKeyMap(settings.keys);

  function updatePracticeUI() {
    counterEl.textContent = `#${practice.counter}`;
    seedEl.textContent = `seed ${practice.sessionSeed}`;
  }
  updatePracticeUI();

  document.addEventListener('keydown', e => {
    const shifted = (e.shiftKey && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight')
      ? 'Shift+' + e.code : null;
    const code = (shifted && KEY_MAP[shifted]) ? shifted : e.code;
    const action = KEY_MAP[code];
    if (!action) return;
    e.preventDefault();
    if (action === 'openReplay') {
      encodeReplay(recorder.data).then(code => {
        window.open(`replay.html?d=${code}&n=${settings.replaySkipN}`, '_blank');
      });
      return;
    }
    input.keyDown(action);
    recorder.record(frame, 'keydown', action);
  });

  document.addEventListener('keyup', e => {
    const a1 = KEY_MAP[e.code];
    if (a1 && a1 !== 'openReplay') { input.keyUp(a1); recorder.record(frame, 'keyup', a1); }
    const a2 = KEY_MAP['Shift+' + e.code];
    if (a2 && a2 !== 'openReplay') { input.keyUp(a2); recorder.record(frame, 'keyup', a2); }
  });

  function restart(delta = 0) {
    practice.counter = Math.max(0, practice.counter + delta);
    savePractice(practice);
    game = newGame();
    undoStack.length = 0;
    frame = 0;
    pieceUndo = getUndoSnapshot();
    gameoverEl.classList.remove('show');
    input.reset();
    updatePracticeUI();
    if (settings.autoInvisible) {
      settings.invisible = true;
      renderer.invisible = true;
      saveSettings(settings);
    }
  }

  document.getElementById('restart-btn').addEventListener('click', () => restart(0));

  function loop() {
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
        pieceUndo = getUndoSnapshot();
      }
      if (input.justPressed('harddrop')) {
        pushUndo();
        game.hardDrop();
        pieceUndo = getUndoSnapshot();
        if (!settings.dasCarry) input.resetDas();
      }
      if (input.justPressed('undo') && undoStack.length > 0) {
        const snap = undoStack.pop();
        game.restore(snap.gameSnap);
        const heldActions = Array.from(input.snapshot().held.keys());
        recorder.recordUndo(frame, snap.recorderIdx, snap.frame, heldActions);
        pieceUndo = getUndoSnapshot();
      }
      if (input.justPressed('toggleInvisible')) {
        settings.invisible = !settings.invisible;
        renderer.invisible = settings.invisible;
        saveSettings(settings);
      }
      if (input.justPressed('retry'))     restart(+1);
      if (input.justPressed('retryPrev')) restart(-1);
      const locked = game.tick();
      if (locked) {
        pushUndo();
        pieceUndo = getUndoSnapshot();
        if (!settings.dasCarry) input.resetDas();
      }
      renderer.draw(game);
      scoreEl.textContent = game.score;
      linesEl.textContent = game.linesCleared;
      const boardState = game.board.getBoardState();
      if (boardState === 'red') {
        stateIndicator.style.backgroundColor = 'red';
      } else if (boardState === 'yellow') {
        stateIndicator.style.backgroundColor = 'yellow';
      } else {
        stateIndicator.style.backgroundColor = 'transparent';
      }
      for (let i = 0; i < NEXT_COUNT; i++)
        drawPiecePreview(nextCanvases[i], game.next[i]);
      drawPiecePreview(holdCanvas, game.held);
      if (game.isGameOver) gameoverEl.classList.add('show');
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
init();
