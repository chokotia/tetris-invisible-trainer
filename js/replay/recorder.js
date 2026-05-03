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

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }
}

export function loadLastReplay() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
