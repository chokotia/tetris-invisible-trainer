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
    retry:     'KeyR',
    nextProblem: 'KeyN',
    prevProblem: 'KeyB',
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
    // Migration: 
    // Old scheme: retry='KeyR' (Next), retryPrev='Shift+KeyR' (Prev)
    // New scheme: nextProblem='KeyN', prevProblem='KeyB', retry='KeyR' (Restart)
    if (saved.keys) {
      // If user customized 'retry' (old Next), migrate it to 'nextProblem' ONLY if it wasn't the old default 'KeyR'
      if (saved.keys.retry && saved.keys.retry !== 'KeyR' && !saved.keys.nextProblem) {
        s.keys.nextProblem = saved.keys.retry;
      }
      // If user customized 'retryPrev' (old Prev), migrate it to 'prevProblem' ONLY if it wasn't the old default 'Shift+KeyR'
      if (saved.keys.retryPrev && saved.keys.retryPrev !== 'Shift+KeyR' && !saved.keys.prevProblem) {
        s.keys.prevProblem = saved.keys.retryPrev;
      }
      
      // If the saved 'retry' was the old default 'KeyR', it now correctly maps to the NEW 'retry' (Restart) default.
      // The new 'nextProblem' and 'prevProblem' will naturally take 'KeyN' and 'KeyB' from DEFAULTS.
    }
    // Ensure only current keys exist
    const currentKeys = {};
    for (const k of Object.keys(DEFAULTS.keys)) {
      currentKeys[k] = s.keys[k] || DEFAULTS.keys[k];
    }
    s.keys = currentKeys;

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
