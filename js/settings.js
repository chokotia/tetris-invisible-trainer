const STORAGE_KEY = 'tetris-settings';

export const PRACTICE_KEY = 'tetris-practice';

export const DEFAULTS = {
  das: 117,   // ms (≈ 7f @ 60fps)
  arr: 0,     // ms (0 = instant)
  sdf: 1,
  lockDelay: 1000,  // ms (接地後ロックまでの猶予)
  dasCancel: true,
  socd: true,
  dasCarry: true,
  invisible: true,
  showGhost: true,
  showActivePiece: true,
  autoRefreshSeed: false,
  attackEnabled: true,
  attackDifficulty: 3,
  attackCustom: false,
  attackStraightness: 50,
  attackIntervalMin: 10,
  attackIntervalMax: 20,
  attackLinesMin: 1,
  attackLinesMax: 4,
  attackYellowDelay: 3,
  attackRedDelay: 2,
  attackFlashDelay: 2,
  problemType: 'none',
  problemGarbageType: '9',
  keys: {
    left:      'ArrowLeft',
    right:     'ArrowRight',
    down:      'ArrowDown',
    harddrop:  'ArrowUp',
    rotateCW:  'KeyX',
    rotateCCW: 'KeyZ',
    rotate180: 'KeyC',
    hold:      'ShiftLeft',
    retry:     'KeyS',
    nextProblem: 'KeyR',
    prevProblem: 'Shift+KeyR',
    undo:      'IntlYen',
    openReplay: 'PageDown',
    toggleInvisible: 'Digit1',
  },
};

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const s = {
      ...DEFAULTS,
      ...saved,
      keys: { ...DEFAULTS.keys, ...(saved.keys || {}) },
    };
    // Migration: the old 'retry' (Next) is now 'nextProblem', and 'retryPrev' (Prev) is 'prevProblem'.
    // The new 'retry' is for actual retry (delta=0).
    if (saved.keys) {
      if (saved.keys.retry && !saved.keys.nextProblem) {
        s.keys.nextProblem = saved.keys.retry;
        // If we migrated the old 'retry' value to 'nextProblem', 
        // we should reset 'retry' to its new default ('KeyS') unless it was already explicitly set to something else in a newer version
        // (But since this is the version that introduces the change, we just reset it).
        s.keys.retry = DEFAULTS.keys.retry;
      }
      if (saved.keys.retryPrev && !saved.keys.prevProblem) {
        s.keys.prevProblem = saved.keys.retryPrev;
      }
    }
    return s;
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function loadPractice() {
  try { return JSON.parse(localStorage.getItem(PRACTICE_KEY) || '{}'); }
  catch { return {}; }
}

export function savePractice(p) {
  localStorage.setItem(PRACTICE_KEY, JSON.stringify(p));
}
