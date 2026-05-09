import { Board } from './board.js';
import { Piece, getKicks } from './piece.js';
import { Randomizer } from './randomizer.js';

const GRAVITY_FRAMES = 60;
const LOCK_DELAY = 60;
const LOCK_MAX_RESETS = 15;
const NEXT_VISIBLE = 5;
const SPAWN_X = 3;
const SPAWN_Y = 0;

const GARBAGE_YELLOW_DELAY = 3; // 黄色から赤になるまでの手数
const GARBAGE_RED_DELAY = 2;    // 赤から点滅になるまでの手数
const GARBAGE_FLASH_DELAY = 2;  // 点滅からせり上がるまでの手数
const RISING_FRAMES = 20;       // せり上がり中の硬直フレーム数

export class Game {
  constructor({ 
    seed, 
    lockDelayFrames = LOCK_DELAY, 
    attackEnabled = false, 
    attackDifficulty = 2,
    attackStraightness = 50,
    attackIntervalMin = 10,
    attackIntervalMax = 20,
    attackLinesMin = 1,
    attackLinesMax = 4
  } = {}) {
    this.board = new Board();
    this._rng = new Randomizer(seed);
    this.score = 0;
    this.linesCleared = 0;
    this.isGameOver = false;
    this._frame = 0;
    this._gravityCounter = 0;
    this._lockCounter = 0;
    this._lockResets = 0;
    this._isLanding = false;
    this.gravityFrames = GRAVITY_FRAMES;
    this.lockDelayFrames = lockDelayFrames;

    this.held = null;
    this._canHold = true;

    // Attack system
    this.attackEnabled = attackEnabled;
    this.attackDifficulty = attackDifficulty;
    this.attackStraightness = attackStraightness;
    this.attackIntervalMin = attackIntervalMin;
    this.attackIntervalMax = attackIntervalMax;
    this.attackLinesMin = attackLinesMin;
    this.attackLinesMax = attackLinesMax;

    this.combo = -1;
    this.b2b = false;
    this.garbageQueue = []; // Array of { lines, hole, type, delay }
    this._attackRngState = seed >>> 0 || 1;
    this._piecesSinceLastAttack = 0;
    this._nextAttackInterval = 0; // Set on first check
    this._lastGarbageHole = -1;
    this._lastMoveWasRotate = false;
    this.isRising = false;
    this._risingCounter = 0;

    // First piece: consume from rng, then peek for next queue
    const firstType = this._rng.next();
    this.next = this._rng.peek(NEXT_VISIBLE);
    this.current = new Piece(firstType, 0, SPAWN_X, SPAWN_Y);
  }

  _attackRnd() {
    this._attackRngState ^= this._attackRngState << 13;
    this._attackRngState ^= this._attackRngState >> 17;
    this._attackRngState ^= this._attackRngState << 5;
    return (this._attackRngState >>> 0) / 0xffffffff;
  }

  _getNewAttackInterval() {
    const min = this.attackIntervalMin;
    const max = this.attackIntervalMax;
    return Math.floor(this._attackRnd() * (max - min + 1)) + min;
  }

  _getNewAttackLines() {
    const min = this.attackLinesMin;
    const max = this.attackLinesMax;
    return Math.floor(this._attackRnd() * (max - min + 1)) + min;
  }

  _canPlace(piece) {
    return piece.absoluteBlocks().every(([x, y]) => this.board.isValid(x, y));
  }

  _advanceNext() {
    // Consume the first item from next queue (it becomes current), refresh peek
    this._rng.next();
    this.next = this._rng.peek(NEXT_VISIBLE);
  }

  _isTSpin() {
    if (this.current.type !== 'T' || !this._lastMoveWasRotate) return { isTSpin: false, isMini: false };

    const corners = [[0, 0], [2, 0], [0, 2], [2, 2]];
    let occupied = 0;
    for (const [dx, dy] of corners) {
      if (!this.board.isValid(this.current.x + dx, this.current.y + dy)) {
        occupied++;
      }
    }

    if (occupied < 3) return { isTSpin: false, isMini: false };

    const frontCornersMap = {
      0: [[0, 0], [2, 0]],
      1: [[2, 0], [2, 2]],
      2: [[0, 2], [2, 2]],
      3: [[0, 0], [0, 2]],
    };
    const fronts = frontCornersMap[this.current.rotation];
    let frontOccupied = 0;
    for (const [dx, dy] of fronts) {
      if (!this.board.isValid(this.current.x + dx, this.current.y + dy)) frontOccupied++;
    }

    return { isTSpin: true, isMini: frontOccupied < 2 };
  }

  _calculateAttack(cleared, isTSpin, isMini) {
    if (cleared === 0) return 0;
    
    let base = 0;
    if (isTSpin) {
      if (isMini) base = [0, 1, 2][cleared] ?? 0;
      else base = [0, 2, 4, 6][cleared] ?? 0;
    } else {
      base = [0, 0, 1, 2, 4][cleared] ?? 0;
    }

    let bonus = 0;
    const isDifficult = cleared === 4 || isTSpin;
    if (isDifficult) {
      if (this.b2b) bonus += 1;
      this.b2b = true;
    } else {
      this.b2b = false;
    }

    this.combo++;
    // Combo table: 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5...
    const comboBonus = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5][this.combo] ?? 5;
    return base + bonus + comboBonus;
  }

  _offsetGarbage(attack) {
    while (attack > 0 && this.garbageQueue.length > 0) {
      const g = this.garbageQueue[0];
      if (g.lines <= attack) {
        attack -= g.lines;
        this.garbageQueue.shift();
      } else {
        g.lines -= attack;
        attack = 0;
      }
    }
    return attack;
  }

  _generateGarbage() {
    if (!this.attackEnabled) return;
    this._piecesSinceLastAttack++;

    if (this._nextAttackInterval <= 0) {
      this._nextAttackInterval = this._getNewAttackInterval();
    }

    if (this._piecesSinceLastAttack >= this._nextAttackInterval) {
      this._piecesSinceLastAttack = 0;
      this._nextAttackInterval = this._getNewAttackInterval();
      
      const lines = this._getNewAttackLines();
      
      let hole;
      if (this._lastGarbageHole !== -1 && this._attackRnd() < (this.attackStraightness / 100)) {
        hole = this._lastGarbageHole;
      } else {
        hole = Math.floor(this._attackRnd() * this.board.cols);
        this._lastGarbageHole = hole;
      }
      
      this.garbageQueue.push({ lines, hole, type: 'yellow', delay: GARBAGE_YELLOW_DELAY });
    }
  }

  _lock() {
    const { isTSpin, isMini } = this._isTSpin();

    for (const [x, y] of this.current.absoluteBlocks())
      if (y >= 0) this.board.set(x, y, this.current.type);

    const cleared = this.board.clearLines();
    this.linesCleared += cleared;
    
    // 1. 相殺 (Offset)
    if (cleared > 0) {
      const attack = this._calculateAttack(cleared, isTSpin, isMini);
      this._offsetGarbage(attack);
    } else {
      this.combo = -1;
    }

    // 2. 攻撃の進行 (Garbage Progression)
    for (let i = 0; i < this.garbageQueue.length; i++) {
      const g = this.garbageQueue[i];

      if (g.type === 'yellow') {
        g.delay--;
        if (g.delay <= 0) {
          g.type = 'red';
          g.delay = GARBAGE_RED_DELAY;
        }
      } else if (g.type === 'red') {
        if (cleared === 0) {
          g.delay--;
          if (g.delay <= 0) {
            g.type = 'flashing';
            g.delay = GARBAGE_FLASH_DELAY;
          }
        }
      } else if (g.type === 'flashing') {
        if (cleared === 0) {
          g.delay--;
        }
      }
    }

    // 3. せり上がり判定 (Rising)
    if (cleared === 0 && this.garbageQueue.length > 0) {
      const first = this.garbageQueue[0];
      if (first.type === 'flashing' && first.delay <= 0) {
        this.isRising = true;
        this._risingCounter = RISING_FRAMES;
        
        this.garbageQueue.shift();
        this.board.pushGarbage(first.lines, first.hole);
      }
    }
    
    this._generateGarbage();

    this.score += [0, 100, 300, 500, 800][cleared] ?? 0;

    this._gravityCounter = 0;
    this._lockCounter = 0;
    this._lockResets = 0;
    this._isLanding = false;
    this._canHold = true;
    this._lastMoveWasRotate = false;

    const nextType = this.next[0];
    this._advanceNext();
    const next = new Piece(nextType, 0, SPAWN_X, SPAWN_Y);

    if (!this._canPlace(next)) {
      this.isGameOver = true;
      this.current = next;
      return;
    }
    this.current = next;
  }

  resetCurrentPiece() {
    this.current = new Piece(this.current.type, 0, SPAWN_X, SPAWN_Y);
    this._gravityCounter = 0;
    this._lockCounter = 0;
    this._lockResets = 0;
    this._isLanding = false;
    this._lastMoveWasRotate = false;
  }

  _tryMove(piece, isRotation = false) {
    if (!this._canPlace(piece)) return false;
    this.current = piece;
    this._lastMoveWasRotate = isRotation;
    // Reset lock delay on any successful move/rotate while landing
    if (this._isLanding && this._lockResets < LOCK_MAX_RESETS) {
      this._lockCounter = 0;
      this._lockResets++;
    }
    return true;
  }

  _tryRotate(rotated, fromRot, toRot) {
    const kicks = getKicks(rotated.type, fromRot, toRot);
    for (const [dx, dy] of kicks) {
      const kicked = new Piece(rotated.type, rotated.rotation, rotated.x + dx, rotated.y + dy);
      if (this._tryMove(kicked, true)) return true;
    }
    return false;
  }

  moveLeft() {
    const p = this.current;
    this._tryMove(new Piece(p.type, p.rotation, p.x - 1, p.y), false);
  }

  moveRight() {
    const p = this.current;
    this._tryMove(new Piece(p.type, p.rotation, p.x + 1, p.y), false);
  }

  rotateCW() {
    const from = this.current.rotation;
    const to = (from + 1) % 4;
    this._tryRotate(this.current.rotatedCW(), from, to);
  }

  rotateCCW() {
    const from = this.current.rotation;
    const to = (from + 3) % 4;
    this._tryRotate(this.current.rotatedCCW(), from, to);
  }

  rotate180() {
    // No standard SRS kicks for 180; try direct and basic offsets
    const rotated = this.current.rotatedCW().rotatedCW();
    const kicks = [[0,0],[0,-1],[0,1],[-1,0],[1,0]];
    const from = this.current.rotation;
    const to = (from + 2) % 4;
    for (const [dx, dy] of kicks) {
      const kicked = new Piece(rotated.type, rotated.rotation, rotated.x + dx, rotated.y + dy);
      if (this._tryMove(kicked, true)) return;
    }
  }

  hold() {
    if (!this._canHold) return;
    this._canHold = false;

    const currentType = this.current.type;
    if (this.held === null) {
      // First hold: take next piece from queue
      const nextType = this.next[0];
      this._advanceNext();
      this.current = new Piece(nextType, 0, SPAWN_X, SPAWN_Y);
    } else {
      // Swap current with held
      this.current = new Piece(this.held, 0, SPAWN_X, SPAWN_Y);
    }
    this.held = currentType;

    // Reset lock state for the new piece
    this._gravityCounter = 0;
    this._lockCounter = 0;
    this._lockResets = 0;
    this._isLanding = false;
    this._lastMoveWasRotate = false;
  }

  softDrop() {
    const p = this.current;
    if (this._tryMove(new Piece(p.type, p.rotation, p.x, p.y + 1), false))
      this.score += 1;
  }

  hardDrop() {
    let dropped = 0;
    while (true) {
      const p = this.current;
      const below = new Piece(p.type, p.rotation, p.x, p.y + 1);
      if (!this._canPlace(below)) break;
      this.current = below;
      dropped++;
    }
    this.score += dropped * 2;
    // We don't reset _lastMoveWasRotate here because it should persist from the last move/rotate 
    // before the hard drop, but actually in most games, hard drop itself is not a move.
    // Wait, if I rotate then hard drop, it SHOULD be a T-spin.
    // So I should NOT reset it here. _lock will use it and then reset it.
    this._lock();
  }

  ghostY() {
    let y = this.current.y;
    const p = this.current;
    while (true) {
      const below = new Piece(p.type, p.rotation, p.x, y + 1);
      if (!this._canPlace(below)) break;
      y++;
    }
    return y;
  }

  snapshot() {
    return {
      board:           this.board._cells.map(row => [...row]),
      current:         { type: this.current.type, rotation: this.current.rotation, x: this.current.x, y: this.current.y },
      held:            this.held,
      _canHold:        this._canHold,
      next:            [...this.next],
      rngState:        this._rng._state,
      rngQueue:        [...this._rng._queue],
      score:           this.score,
      linesCleared:    this.linesCleared,
      isGameOver:      this.isGameOver,
      _gravityCounter: this._gravityCounter,
      _lockCounter:    this._lockCounter,
      _lockResets:     this._lockResets,
      _isLanding:      this._isLanding,
      // Attack system
      combo:           this.combo,
      b2b:             this.b2b,
      garbageQueue:    this.garbageQueue.map(g => ({...g})),
      _attackRngState: this._attackRngState,
      _piecesSinceLastAttack: this._piecesSinceLastAttack,
      _nextAttackInterval: this._nextAttackInterval,
      _lastGarbageHole: this._lastGarbageHole,
      _lastMoveWasRotate: this._lastMoveWasRotate,
      isRising:        this.isRising,
      _risingCounter:  this._risingCounter,
    };
  }

  restore(snap) {
    this.board._cells    = snap.board.map(row => [...row]);
    this.current         = new Piece(snap.current.type, snap.current.rotation, snap.current.x, snap.current.y);
    this.held            = snap.held;
    this._canHold        = snap._canHold;
    this.next            = [...snap.next];
    this._rng._state     = snap.rngState;
    this._rng._queue     = [...snap.rngQueue];
    this.score           = snap.score;
    this.linesCleared    = snap.linesCleared;
    this.isGameOver      = snap.isGameOver;
    this._gravityCounter = snap._gravityCounter;
    this._lockCounter    = snap._lockCounter;
    this._lockResets     = snap._lockResets;
    this._isLanding      = snap._isLanding;
    // Attack system
    this.combo           = snap.combo ?? -1;
    this.b2b             = snap.b2b ?? false;
    this.garbageQueue    = (snap.garbageQueue ?? []).map(g => ({...g}));
    this._attackRngState = snap._attackRngState ?? 1;
    this._piecesSinceLastAttack = snap._piecesSinceLastAttack ?? 0;
    this._nextAttackInterval = snap._nextAttackInterval ?? 0;
    this._lastGarbageHole = snap._lastGarbageHole ?? -1;
    this._lastMoveWasRotate = snap._lastMoveWasRotate ?? false;
    this.isRising        = snap.isRising ?? false;
    this._risingCounter  = snap._risingCounter ?? 0;
  }

  tick() {
    if (this.isGameOver) return false;

    // Handle rising animation delay
    if (this.isRising) {
      this._risingCounter--;
      if (this._risingCounter <= 0) {
        this.isRising = false;
      }
      this._frame++;
      return false;
    }

    const p = this.current;
    const below = new Piece(p.type, p.rotation, p.x, p.y + 1);
    const canFall = this._canPlace(below);

    if (canFall) {
      this._isLanding = false;
      this._gravityCounter++;
      if (this._gravityCounter >= this.gravityFrames) {
        this._gravityCounter = 0;
        this.current = below;
      }
    } else {
      this._isLanding = true;
      this._lockCounter++;
      if (this._lockCounter >= this.lockDelayFrames) {
        this._lock();
        this._frame++;
        return true; // ロック発生
      }
    }

    this._frame++;
    return false;
  }
}
