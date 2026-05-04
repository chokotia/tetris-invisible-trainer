// mapCode: 200-char string, row-major (row0=top), '0'=empty, '1'-'7'=IOTSZ JL, '8'=visible grey, '9'=invisible-sensitive grey
const MAP_CODE_TYPES = [null, 'I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export function applyMapCode(game, mapCode) {
  if (!mapCode || mapCode.length < 200) return;
  for (let r = 0; r < 20; r++)
    for (let c = 0; c < 10; c++) {
      const ch = mapCode[r * 10 + c];
      const idx = parseInt(ch, 10);
      const cell = (idx >= 1 && idx <= 7) ? MAP_CODE_TYPES[idx] : 
                   (ch === '8' ? '8' : 
                   (ch === '9' ? '9' : 
                   (ch === '0' ? null : '8')));
      game.board.set(c, r + 1, cell);
    }
}
