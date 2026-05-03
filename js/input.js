const OPPOSITE = { left: 'right', right: 'left' };

export class Input {
  constructor({ das = 10, arr = 2, dasCancel = true, socd = true } = {}) {
    this._das = das;
    this._arr = arr;
    this._dasCancel = dasCancel;
    this._socd = socd;
    this._held = new Map();     // action → frame first pressed (justPressed detection)
    this._dasStart = new Map(); // action → frame DAS starts from (resets on direction change)
    this._frame = 0;
    this._prevFrame = -1;
  }

  keyDown(action) {
    if (this._held.has(action)) return;
    this._held.set(action, this._frame);
    this._dasStart.set(action, this._frame);

    // Direction change: reset opposite direction's DAS so it doesn't keep firing
    if (this._dasCancel) {
      const opp = OPPOSITE[action];
      if (opp && this._dasStart.has(opp))
        this._dasStart.set(opp, this._frame);
    }
  }

  keyUp(action) {
    this._held.delete(action);
    this._dasStart.delete(action);
  }

  reset() {
    this._held.clear();
    this._dasStart.clear();
  }

  snapshot() {
    return {
      held:      new Map(this._held),
      dasStart:  new Map(this._dasStart),
      frame:     this._frame,
      prevFrame: this._prevFrame,
    };
  }

  restore(snap) {
    this._held      = new Map(snap.held);
    this._dasStart  = new Map(snap.dasStart);
    this._frame     = snap.frame;
    this._prevFrame = snap.prevFrame;
  }

  resetDas() {
    // ミノ設置後に DAS チャージだけリセット（キーの押下状態は維持）
    for (const key of this._dasStart.keys())
      this._dasStart.set(key, this._frame);
  }

  update(frame) {
    this._prevFrame = this._frame;
    this._frame = frame;
  }

  pressed(action) {
    return this._held.has(action);
  }

  justPressed(action) {
    if (!this._held.has(action)) return false;
    return this._held.get(action) === this._prevFrame;
  }

  repeat(action) {
    if (!this._dasStart.has(action)) return false;
    // SOCD: 両方向押し時は後から押したキーのみ発火（last key wins）
    if (this._socd) {
      const opp = OPPOSITE[action];
      if (opp && this._held.has(opp)) {
        const myFrame  = this._held.get(action) ?? -1;
        const oppFrame = this._held.get(opp)    ?? -1;
        if (oppFrame > myFrame) return false;
      }
    }
    const held = this._frame - this._dasStart.get(action);
    if (held < this._das) return false;
    if (held === this._das) return true;
    if (this._arr === 0) return true;
    return (held - this._das) % this._arr === 0;
  }
}
