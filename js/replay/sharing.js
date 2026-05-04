const ACTION_MAP = [
  'left', 'right', 'down', 'harddrop', 
  'rotateCW', 'rotateCCW', 'rotate180', 'hold'
];

const SETTING_KEYS = [
  'das', 'arr', 'sdf', 'lockDelay', 'dasCancel', 'socd', 'dasCarry', 
  'attackEnabled', 'attackDifficulty', 'attackStraightness', 
  'attackIntervalMin', 'attackIntervalMax', 'attackLinesMin', 'attackLinesMax'
];

/**
 * リプレイをバイナリ化し、さらに圧縮してエンコードする
 */
export async function encodeReplay(replay) {
  const { seed, mapCode, settings, events } = replay;
  const buffer = [];

  // V4: Binary + Deflate
  buffer.push(4); 

  // Seed (4 bytes)
  const seedArr = new Uint32Array([seed]);
  buffer.push(...new Uint8Array(seedArr.buffer));

  // Settings
  buffer.push(settings.das & 0xFF, (settings.das >> 8) & 0xFF);
  buffer.push(settings.arr & 0xFF, (settings.arr >> 8) & 0xFF);
  buffer.push(settings.sdf & 0xFF);
  buffer.push(settings.lockDelay & 0xFF, (settings.lockDelay >> 8) & 0xFF);
  let flags = 0;
  if (settings.dasCancel) flags |= 1;
  if (settings.socd)      flags |= 2;
  if (settings.dasCarry)  flags |= 4;
  if (settings.attackEnabled) flags |= 8;
  buffer.push(flags, settings.attackDifficulty, settings.attackStraightness, settings.attackIntervalMin, settings.attackIntervalMax, settings.attackLinesMin, settings.attackLinesMax);

  // MapCode
  const mcBytes = new TextEncoder().encode(mapCode || '');
  buffer.push(mcBytes.length & 0xFF, (mcBytes.length >> 8) & 0xFF);
  buffer.push(...mcBytes);

  // Events (All events included for safety)
  let lastFrame = 0;
  for (const e of events) {
    const df = e.f - lastFrame;
    const actionIdx = ACTION_MAP.indexOf(e.d);
    if (actionIdx === -1) continue;
    const typeIdx = e.t === 'keydown' ? 0 : 1;
    const typeAction = (actionIdx << 1) | typeIdx;

    if (df < 15) {
      buffer.push((typeAction << 4) | df);
    } else {
      buffer.push((typeAction << 4) | 15);
      let remain = df - 15;
      while (remain >= 0x80) {
        buffer.push((remain & 0x7F) | 0x80);
        remain >>= 7;
      }
      buffer.push(remain & 0x7F);
    }
    lastFrame = e.f;
  }

  const rawUint8 = new Uint8Array(buffer);
  const uncompressedLen = rawUint8.length;
  
  // --- 圧縮処理 ---
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(rawUint8);
  writer.close();
  const compressedBuffer = await new Response(cs.readable).arrayBuffer();
  const compressedUint8 = new Uint8Array(compressedBuffer);
  const compressedLen = compressedUint8.length;

  console.log(`[Replay Compression] Uncompressed: ${uncompressedLen} bytes, Compressed: ${compressedLen} bytes (Ratio: ${((compressedLen / uncompressedLen) * 100).toFixed(1)}%)`);

  const binString = Array.from(compressedUint8, byte => String.fromCharCode(byte)).join("");
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 圧縮された文字列から復元する
 */
export async function decodeReplay(str) {
  try {
    const binString = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const compressedUint8 = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) compressedUint8[i] = binString.charCodeAt(i);

    // --- 解凍処理 ---
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(compressedUint8);
    writer.close();
    const decompressedBuffer = await new Response(ds.readable).arrayBuffer();
    const uint8 = new Uint8Array(decompressedBuffer);

    let offset = 0;
    const version = uint8[offset++];
    if (version !== 4) throw new Error('Unsupported version or corrupt data');

    const seed = new Uint32Array(uint8.slice(offset, offset + 4).buffer)[0];
    offset += 4;

    const settings = {};
    settings.das = uint8[offset++] | (uint8[offset++] << 8);
    settings.arr = uint8[offset++] | (uint8[offset++] << 8);
    settings.sdf = uint8[offset++];
    settings.lockDelay = uint8[offset++] | (uint8[offset++] << 8);
    const flags = uint8[offset++];
    settings.dasCancel = !!(flags & 1);
    settings.socd      = !!(flags & 2);
    settings.dasCarry  = !!(flags & 4);
    settings.attackEnabled = !!(flags & 8);
    settings.attackDifficulty = uint8[offset++];
    settings.attackStraightness = uint8[offset++];
    settings.attackIntervalMin = uint8[offset++];
    settings.attackIntervalMax = uint8[offset++];
    settings.attackLinesMin = uint8[offset++];
    settings.attackLinesMax = uint8[offset++];

    const mcLen = uint8[offset++] | (uint8[offset++] << 8);
    const mapCode = new TextDecoder().decode(uint8.slice(offset, offset + mcLen));
    offset += mcLen;

    const events = [];
    let currentFrame = 0;
    while (offset < uint8.length) {
      const first = uint8[offset++];
      const typeAction = first >> 4;
      let df = first & 0x0F;
      if (df === 15) {
        let shift = 0, val = 0;
        while (true) {
          const byte = uint8[offset++];
          val |= (byte & 0x7F) << shift;
          if (!(byte & 0x80)) break;
          shift += 7;
        }
        df = 15 + val;
      }
      currentFrame += df;
      events.push({
        f: currentFrame,
        t: (typeAction & 1) === 0 ? 'keydown' : 'keyup',
        d: ACTION_MAP[typeAction >> 1]
      });
    }

    return { seed, mapCode, settings, events };
  } catch (e) {
    console.error('Failed to decode replay:', e);
    return null;
  }
}
