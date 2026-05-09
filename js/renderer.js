import { PIECES } from './core/piece.js';

const BLOCK = 30;
const GHOST_ALPHA = 0.6; // Increased alpha for the gray border style

export class Renderer {
  constructor(canvas, { cols = 10, rows = 20, attackCanvas = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.attackCanvas = attackCanvas;
    this.attackCtx = attackCanvas?.getContext('2d');
    this.cols = cols;
    this.rows = rows;
    this.invisible = false;
    this.peek = false;
    this.showGhost = true;
    this.showActivePiece = true;
    canvas.width = BLOCK * cols;
    canvas.height = BLOCK * rows;
    if (attackCanvas) {
      attackCanvas.width = 12;
      attackCanvas.height = BLOCK * rows;
    }
  }

  _color(type) {
    if (type === 'X') return '#777'; // Garbage color
    return PIECES[type]?.color ?? '#888';
  }

  _drawBlock(x, y, color, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
    ctx.globalAlpha = 1;
  }

  _drawGhostBlock(x, y) {
    const ctx = this.ctx;
    const px = x * BLOCK;
    const py = y * BLOCK;
    const size = BLOCK;

    ctx.save();
    
    // Low opacity for the whole block to let background show through
    ctx.globalAlpha = 0.4;

    // Outer border (Thicker, muted gray)
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);

    // Inner border (Slightly darker, creates the double-line depth)
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 5, py + 5, size - 10, size - 10);

    ctx.restore();
  }

  draw(game) {
    const ctx = this.ctx;
    // 1. Fill the entire board with the GRID color (#333)
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Draw "Empty" cells as smaller blocks to reveal the #333 grid lines
    ctx.fillStyle = '#1a1a1a';
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        // Drawing with 1px margin on all sides creates a 2px thick grid
        ctx.fillRect(x * BLOCK + 1, y * BLOCK + 1, BLOCK - 2, BLOCK - 2);
      }
    }

    // 3. Draw filled board blocks at FULL size to cover the grid inside the piece
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const cell = game.board.get(x, y + 1);
        if (cell && (!this.invisible || this.peek || cell === 'X' || cell === '8')) {
          this._drawBlock(x, y, this._color(cell));
        }
      }
    }

    // 4. Draw Ghost
    if (this.showGhost || this.peek) {
      const ghostY = game.ghostY();
      for (const [dx, dy] of game.current.blocks())
        this._drawGhostBlock(
          dx + game.current.x,
          dy + ghostY - 1
        );
    }

    // 5. Draw Current piece at FULL size
    if (this.showActivePiece || this.peek) {
      for (const [x, y] of game.current.absoluteBlocks())
        this._drawBlock(x, y - 1, this._color(game.current.type));
    }

    // 6. Draw Attack Gauge
    if (this.attackCtx) {
      this.drawAttackGauge(game.garbageQueue);
    }
  }

  drawAttackGauge(queue) {
    const ctx = this.attackCtx;
    const h = this.attackCanvas.height;
    const w = this.attackCanvas.width;
    ctx.clearRect(0, 0, w, h);

    let currentY = h;
    for (const g of queue) {
      const blockHeight = g.lines * BLOCK;
      
      // 1. 攻撃ブロックの描画色決定
      if (g.type === 'flashing') {
        ctx.fillStyle = '#ff0000'; // 濃い赤色
      } else if (g.type === 'red') {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; // 薄い背景が少し透過している赤色
      } else {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)'; // 薄い背景が少し透過している黄色
      }
      
      ctx.fillRect(0, currentY - blockHeight, w, blockHeight);
      
      // 2. ブロック間の切れ目（黒い線）
      ctx.fillStyle = '#000';
      ctx.fillRect(0, currentY - blockHeight, w, 2); 
      
      currentY -= blockHeight;
      if (currentY < 0) break;
    }
  }

  drawNext(canvases, nextTypes) {
    for (let i = 0; i < canvases.length; i++) {
      const c = canvases[i];
      const type = nextTypes[i];
      if (!c || !type) continue;
      const ctx = c.getContext('2d');
      c.width = BLOCK * 4;
      c.height = BLOCK * 4;
      ctx.fillStyle = '#333'; // Match body background
      ctx.fillRect(0, 0, c.width, c.height);
      const blocks = PIECES[type].blocks[0];
      for (const [x, y] of blocks)
        this._drawBlockOnCtx(ctx, x, y, this._color(type));
    }
  }

  _drawBlockOnCtx(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
  }
}
