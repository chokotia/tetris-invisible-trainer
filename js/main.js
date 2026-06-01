import { Game } from './core/game.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { PIECES } from './core/piece.js';
import { loadSettings, saveSettings, loadPractice, savePractice } from './settings.js';
import { Recorder } from './replay/recorder.js';
import { encodeReplay, decodeReplay } from './replay/sharing.js';
import { applyMapCode, generateProblemMapCode } from './core/mapcode.js';

const BLOCK = 30;
const NEXT_COUNT = 5;

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

async function init() {
  const settings = loadSettings();
  let practice = loadPractice();
  
  if (settings.autoRefreshSeed) {
    practice.sessionSeed = (Math.random() * 0xFFFFFFFF) >>> 0;
    practice.counter = 0;
  } else {
    practice.sessionSeed = practice.sessionSeed || (Math.random() * 0xFFFFFFFF) >>> 0;
    practice.counter = practice.counter || 0;
  }
  savePractice(practice);

  const problemSeed = () => (practice.sessionSeed + practice.counter) >>> 0;

  const canvas       = document.getElementById('board');
  const scoreEl      = document.getElementById('score-val');
  const linesEl      = document.getElementById('lines-val');
  const gameoverEl   = document.getElementById('gameover');
  const holdCanvas   = document.getElementById('hold');
  const counterEl    = document.getElementById('practice-counter');
  const stateIndicator = document.getElementById('state-indicator');
  const nextCanvases = Array.from({ length: NEXT_COUNT }, (_, i) =>
    document.getElementById(`next${i}`)
  );

  holdCanvas.width  = BLOCK * 4;
  holdCanvas.height = BLOCK * 2;
  nextCanvases.forEach(c => { c.width = BLOCK * 4; c.height = BLOCK * 2; });

  const msToFrames = ms => Math.max(0, Math.round(ms * 60 / 1000));

  const REPLAY_SETTING_KEYS = [
    'das', 'arr', 'sdf', 'gravity', 'lockDelay', 'dasCancel', 'socd', 'dasCarry', 
    'attackEnabled', 'attackDifficulty', 'attackStraightness', 
    'attackIntervalMin', 'attackIntervalMax', 'attackLinesMin', 'attackLinesMax',
    'attackYellowDelay', 'attackRedDelay', 'attackFlashDelay',
    'invisible', 'showGhost', 'showActivePiece', 
    'problemType', 'problemGarbageType'
  ];

  let recorder;

  function newGame() {
    const seed = problemSeed();
    const g = new Game({ 
      seed, 
      gravityFrames: msToFrames(settings.gravity),
      lockDelayFrames: msToFrames(settings.lockDelay),
      attackEnabled: settings.attackEnabled,
      attackDifficulty: settings.attackDifficulty,
      attackStraightness: settings.attackStraightness,
      attackIntervalMin: settings.attackIntervalMin,
      attackIntervalMax: settings.attackIntervalMax,
      attackLinesMin: settings.attackLinesMin,
      attackLinesMax: settings.attackLinesMax,
      attackYellowDelay: settings.attackYellowDelay,
      attackRedDelay: settings.attackRedDelay,
      attackFlashDelay: settings.attackFlashDelay,
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

  function runFrameLogic(customSettings = null) {
    if (game.isGameOver) return;
    const currentSettings = customSettings || settings;

    if (input.justPressed('left')  || input.repeat('left'))  game.moveLeft();
    if (input.justPressed('right') || input.repeat('right')) game.moveRight();
    if (input.pressed('down')) {
      for (let i = 0; i < currentSettings.sdf; i++) {
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
      if (!currentSettings.dasCarry) input.resetDas();
    }
    if (input.justPressed('undo') && undoStack.length > 0) {
      const snap = undoStack.pop();
      game.restore(snap.gameSnap);
      const heldActions = Array.from(input.snapshot().held.keys());
      recorder.recordUndo(frame, snap.recorderIdx, snap.frame, heldActions);
      pieceUndo = getUndoSnapshot();
    }
    if (input.justPressed('toggleInvisible')) {
      renderer.peek = !renderer.peek;
    }
    if (input.justPressed('nextProblem')) {
      restart(+1);
    }
    if (input.justPressed('prevProblem')) {
      restart(-1);
    }
    if (input.justPressed('retry')) {
      restart(0);
    }
    const locked = game.tick();
    if (locked) {
      pushUndo();
      pieceUndo = getUndoSnapshot();
      if (!currentSettings.dasCarry) input.resetDas();
    }
  }

  const attackCanvas = document.getElementById('attack-gauge');

  const renderer = new Renderer(canvas, { attackCanvas });
  renderer.invisible = !!settings.invisible;
  renderer.showGhost = !!settings.showGhost;
  renderer.showActivePiece = !!settings.showActivePiece;
  let KEY_MAP = buildKeyMap(settings.keys);

  function updatePracticeUI() {
    counterEl.textContent = `#${practice.counter}`;
  }
  updatePracticeUI();

  let activeResume = null;

  function performResume() {
    if (!activeResume) return;
    const { replay, targetFrame } = activeResume;
    console.log("Performing resume to frame:", targetFrame);

    game = new Game({
      seed: replay.seed,
      gravityFrames: msToFrames(replay.settings.gravity ?? 1000),
      lockDelayFrames: msToFrames(replay.settings.lockDelay),
      attackEnabled: replay.settings.attackEnabled,
      attackDifficulty: replay.settings.attackDifficulty,
      attackStraightness: replay.settings.attackStraightness,
      attackIntervalMin: replay.settings.attackIntervalMin,
      attackIntervalMax: replay.settings.attackIntervalMax,
      attackLinesMin: replay.settings.attackLinesMin,
      attackLinesMax: replay.settings.attackLinesMax,
      attackYellowDelay: replay.settings.attackYellowDelay,
      attackRedDelay: replay.settings.attackRedDelay,
      attackFlashDelay: replay.settings.attackFlashDelay,
    });
    if (replay.mapCode) applyMapCode(game, replay.mapCode);
    
    const originalEvents = replay.events;
    // シミュレーション中は記録を行わないようにダミーを置く
    recorder = { record: () => {}, recordUndo: () => {}, data: { events: [] } };
    input.reset();
    frame = 0;
    undoStack.length = 0;

    let ei = 0;
    while (frame < targetFrame) {
      while (ei < originalEvents.length && originalEvents[ei].f <= frame) {
        const ev = originalEvents[ei++];
        if (ev.t === 'keydown') input.keyDown(ev.d);
        else if (ev.t === 'keyup') input.keyUp(ev.d);
      }
      frame++;
      input.update(frame);
      // 再現中はリプレイ時の設定（SDFなど）を使用する
      runFrameLogic(replay.settings);
    }
    // targetFrame時点での入力イベントも反映させておく
    while (ei < originalEvents.length && originalEvents[ei].f <= targetFrame) {
      const ev = originalEvents[ei++];
      if (ev.t === 'keydown') input.keyDown(ev.d);
      else if (ev.t === 'keyup') input.keyUp(ev.d);
    }

    // 本物のレコーダーを初期化し、targetFrameまでのイベントをコピー
    recorder = new Recorder({ seed: replay.seed, mapCode: replay.mapCode, settings: replay.settings });
    recorder.data.events = originalEvents.filter(ev => ev.f <= targetFrame);

    // Stuck key 対策：シミュレーション時点で押されていたキーをKeyUpとして記録し、入力をリセット
    // これにより、新しいプレイではキーが離された状態から始まり、リプレイもそれに追随する
    const heldActions = Array.from(input.snapshot().held.keys());
    for (const action of heldActions) {
      recorder.record(targetFrame, 'keyup', action);
    }
    input.reset();

    game.resetCurrentPiece(); // 出現位置（一番上）から開始する
    pieceUndo = getUndoSnapshot();
    gameoverEl.classList.remove('show');
    updatePracticeUI();
  }

  // URLパラメータからのレジューム処理
  const params = new URLSearchParams(window.location.search);
  const resumeD = params.get('resume_d');
  const resumeF = parseInt(params.get('resume_f'), 10);
  if (resumeD && !isNaN(resumeF)) {
    console.log("Resume params detected:", { resumeF });
    decodeReplay(resumeD).then(replay => {
      if (replay) {
        activeResume = { replay, targetFrame: resumeF };
        performResume();
        // URLをきれいにする (デバッグのため一時的に無効化する場合はコメントアウト)
        // window.history.replaceState({}, '', 'index.html');
      } else {
        console.error("Failed to decode resume replay data");
      }
    });
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const shifted = (e.shiftKey && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight')
      ? 'Shift+' + e.code : null;
    const code = (shifted && KEY_MAP[shifted]) ? shifted : e.code;
    const action = KEY_MAP[code];
    if (!action) return;
    e.preventDefault();
    if (action === 'openReplay') {
      encodeReplay(recorder.data).then(code => {
        const url = activeResume 
          ? `replay.html?d=${code}&f=${activeResume.targetFrame}`
          : `replay.html?d=${code}`;
        window.open(url, '_blank');
      });
      return;
    }
    input.keyDown(action);
    recorder.record(frame, 'keydown', action);
  });

  document.addEventListener('keyup', e => {
    if (e.target.tagName === 'INPUT') return;
    const a1 = KEY_MAP[e.code];
    if (a1 && a1 !== 'openReplay') { input.keyUp(a1); recorder.record(frame, 'keyup', a1); }
    const a2 = KEY_MAP['Shift+' + e.code];
    if (a2 && a2 !== 'openReplay') { input.keyUp(a2); recorder.record(frame, 'keyup', a2); }
  });

  function restart(delta = 0) {
    if (delta !== 0) {
      activeResume = null;
    }

    if (delta === 0 && activeResume) {
      performResume();
      return;
    }

    practice.counter = Math.max(0, practice.counter + delta);
    savePractice(practice);
    game = newGame();
    undoStack.length = 0;
    frame = 0;
    pieceUndo = getUndoSnapshot();
    gameoverEl.classList.remove('show');
    input.reset();
    renderer.peek = false;
    updatePracticeUI();
  }

  document.getElementById('restart-btn').addEventListener('click', () => restart(0));

  function loop() {
    frame++;
    input.update(frame);
    runFrameLogic();
    
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
    
    updatePracticeUI();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
init().catch(console.error);
