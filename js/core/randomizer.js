const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// xorshift32 PRNG for reproducible sequences
function xorshift32(state) {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return state >>> 0;
}

export class Randomizer {
  constructor(seed) {
    this._state = seed >>> 0 || 1;
    this._queue = [];
    this._fillBag();
  }

  _rand() {
    this._state = xorshift32(this._state);
    return this._state;
  }

  _fillBag() {
    const bag = [...TYPES];
    while (bag.length > 0) {
      const i = this._rand() % bag.length;
      this._queue.push(bag.splice(i, 1)[0]);
    }
  }

  next() {
    if (this._queue.length === 0) this._fillBag();
    return this._queue.shift();
  }

  peek(n) {
    while (this._queue.length < n) this._fillBag();
    return this._queue.slice(0, n);
  }
}
