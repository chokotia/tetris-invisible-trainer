export class Board {
  constructor(cols = 10, rows = 21) {
    this.cols = cols;
    this.rows = rows;
    this._cells = this._empty();
  }

  _empty() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
  }

  get(x, y) {
    return this._cells[y][x];
  }

  set(x, y, value) {
    this._cells[y][x] = value;
  }

  // 座標が空きセルかどうか（範囲外・埋まり済みはfalse）
  isValid(x, y) {
    if (x < 0 || x >= this.cols) return false;
    if (y >= this.rows) return false;
    if (y < 0) return true; // buffer zone above visible field
    return this._cells[y][x] === null;
  }

  // 埋まった行を消して消した行数を返す
  clearLines() {
    const kept = this._cells.filter(row => row.some(cell => cell === null));
    const cleared = this.rows - kept.length;
    if (cleared === 0) return 0;
    const empty = Array.from({ length: cleared }, () => Array(this.cols).fill(null));
    this._cells = [...empty, ...kept];
    return cleared;
  }

  pushGarbage(lines, holeColumn) {
    for (let i = 0; i < lines; i++) {
      const row = Array(this.cols).fill('X'); // 'X' represents garbage
      if (holeColumn >= 0 && holeColumn < this.cols) {
        row[holeColumn] = null;
      }
      this._cells.shift();
      this._cells.push(row);
    }
  }

  clear() {
    this._cells = this._empty();
  }

  getBoardState() {
    // 1. Flood fill to find reachable empty cells from the top
    const reachable = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    const queue = [];
    // Start from top row (y=0 is the buffer zone)
    for (let x = 0; x < this.cols; x++) {
      if (this.get(x, 0) === null) {
        reachable[0][x] = true;
        queue.push([x, 0]);
      }
    }

    while (queue.length > 0) {
      const [x, y] = queue.shift();
      const ds = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dy] of ds) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
          if (!reachable[ny][nx] && this.get(nx, ny) === null) {
            reachable[ny][nx] = true;
            queue.push([nx, ny]);
          }
        }
      }
    }

    // 2. Analyze columns for holes and overhangs
    let hasHole = false;
    let hasOverhang = false;

    for (let x = 0; x < this.cols; x++) {
      let foundBlock = false;
      for (let y = 0; y < this.rows; y++) {
        if (this.get(x, y) !== null) {
          foundBlock = true;
        } else if (foundBlock) {
          // Empty cell below a block
          if (!reachable[y][x]) {
            hasHole = true; // Closed space
          } else {
            hasOverhang = true; // Reachable hole (overhang)
          }
        }
      }
    }

    if (hasHole) return 'red';
    if (hasOverhang) return 'yellow';
    return 'none';
  }
}
