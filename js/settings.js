const STORAGE_KEY = 'tetris-settings';

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
  replaySkipN: 0,
  attackEnabled: true,
  attackDifficulty: 3,
  attackCustom: false,
  attackStraightness: 50,
  attackIntervalMin: 10,
  attackIntervalMax: 20,
  attackLinesMin: 1,
  attackLinesMax: 4,
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
    retryPrev: 'Shift+KeyR',
    undo:      'IntlYen',
    openReplay: 'PageDown',
    toggleInvisible: 'Digit1',
  },
};

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...DEFAULTS,
      ...saved,
      keys: { ...DEFAULTS.keys, ...(saved.keys || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
