const STORAGE_KEY = 'tetris-last-replay';

export class Recorder {
  constructor({ seed, mapCode, settings }) {
    this.data = {
      version: 1,
      seed,
      mapCode: mapCode || '',
      settings: structuredClone(settings),
      events: [],
    };
  }

  record(frame, type, data) {
    this.data.events.push({ f: frame, t: type, d: data });
  }

  recordUndo(frame, targetIdx, targetFrame, heldActions = []) {
    this.data.events.push({ f: frame, t: 'undo', d: { targetIdx, targetFrame, heldActions } });
  }

  // NOTE: localStorageへの保存は行わない方針のため、saveメソッドは空にするか削除検討
  save() {
    // 互換性のために残すが何もしない
  }
}

// NOTE: localStorageからの読み込みは行わない方針
export function loadLastReplay() {
  return null;
}
