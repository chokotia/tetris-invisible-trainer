const ACTION_MAP = [
  'left', 'right', 'down', 'harddrop', 
  'rotateCW', 'rotateCCW', 'rotate180', 'hold',
  'undo', 'toggleInvisible'
];

const SETTING_KEYS = [
  'das', 'arr', 'sdf', 'lockDelay', 'dasCancel', 'socd', 'dasCarry', 
  'attackEnabled', 'attackDifficulty', 'attackStraightness', 
  'attackIntervalMin', 'attackIntervalMax', 'attackLinesMin', 'attackLinesMax',
  'invisible'
];

/**
 * バイナリ形式でリプレイをパックする (極限まで短くする)
 */
export function encodeReplay(replay) {
  const { seed, mapCode, settings, events } = replay;
  const buffer = [];

  // 1. Version (1 byte)
  buffer.push(3); // Binary format version 3: support 5-bit action types and more flags

  // 2. Seed (4 bytes)
  const seedArr = new Uint32Array([seed]);
  buffer.push(...new Uint8Array(seedArr.buffer));

  // 3. Settings
  // ms系は2バイト, その他は1バイト, booleanはビットフラグ
  buffer.push(settings.das & 0xFF, (settings.das >> 8) & 0xFF);
  buffer.push(settings.arr & 0xFF, (settings.arr >> 8) & 0xFF);
  buffer.push(settings.sdf & 0xFF);
  buffer.push(settings.lockDelay & 0xFF, (settings.lockDelay >> 8) & 0xFF);
  
  let flags = 0;
  if (settings.dasCancel)  flags |= 1;
  if (settings.socd)       flags |= 2;
  if (settings.dasCarry)   flags |= 4;
  if (settings.attackEnabled) flags |= 8;
  if (settings.invisible)     flags |= 16;
  buffer.push(flags);

  buffer.push(settings.attackDifficulty);
  buffer.push(settings.attackStraightness);
  buffer.push(settings.attackIntervalMin);
  buffer.push(settings.attackIntervalMax);
  buffer.push(settings.attackLinesMin);
  buffer.push(settings.attackLinesMax);

  // 4. MapCode
  const mcBytes = new TextEncoder().encode(mapCode || '');
  buffer.push(mcBytes.length & 0xFF, (mcBytes.length >> 8) & 0xFF);
  buffer.push(...mcBytes);

  // 5. Events
  let lastFrame = 0;
  for (const e of events) {
    const df = e.f - lastFrame;
    const typeIdx = e.t === 'keydown' ? 0 : 1;
    const actionIdx = ACTION_MAP.indexOf(e.d);
    if (actionIdx === -1) continue;

    const typeAction = (actionIdx << 1) | typeIdx; // Up to 5 bits (0-31)

    // Version 3: [typeAction: 5bit | df_low: 3bit]
    if (df < 7) {
      buffer.push((typeAction << 3) | df);
    } else {
      buffer.push((typeAction << 3) | 7);
      // 残りのdfを可変長で書く (7bitずつ)
      let remain = df - 7;
      while (remain >= 0x80) {
        buffer.push((remain & 0x7F) | 0x80);
        remain >>= 7;
      }
      buffer.push(remain & 0x7F);
    }
    lastFrame = e.f;
  }

  const uint8 = new Uint8Array(buffer);
  const binString = Array.from(uint8, byte => String.fromCharCode(byte)).join("");
  return btoa(binString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * バイナリ形式から復元する
 */
export function decodeReplay(str) {
  try {
    const binString = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const uint8 = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) uint8[i] = binString.charCodeAt(i);

    let offset = 0;
    const version = uint8[offset++];
    if (version === 1) return decodeV1(uint8); // 互換性
    
    const seed = new Uint32Array(uint8.slice(offset, offset + 4).buffer)[0];
    offset += 4;

    const settings = {};
    settings.das = uint8[offset++] | (uint8[offset++] << 8);
    settings.arr = uint8[offset++] | (uint8[offset++] << 8);
    settings.sdf = uint8[offset++];
    settings.lockDelay = uint8[offset++] | (uint8[offset++] << 8);
    
    const flags = uint8[offset++];
    settings.dasCancel  = !!(flags & 1);
    settings.socd       = !!(flags & 2);
    settings.dasCarry   = !!(flags & 4);
    settings.attackEnabled = !!(flags & 8);
    if (version >= 3) {
      settings.invisible = !!(flags & 16);
    }

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
      let typeAction, df;

      if (version === 2) {
        // Version 2: [typeAction: 4bit | df_low: 4bit]
        typeAction = first >> 4;
        df = first & 0x0F;
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
      } else {
        // Version 3: [typeAction: 5bit | df_low: 3bit]
        typeAction = first >> 3;
        df = first & 0x07;
        if (df === 7) {
          let shift = 0, val = 0;
          while (true) {
            const byte = uint8[offset++];
            val |= (byte & 0x7F) << shift;
            if (!(byte & 0x80)) break;
            shift += 7;
          }
          df = 7 + val;
        }
      }

      const typeIdx = typeAction & 1;
      const actionIdx = typeAction >> 1;

      currentFrame += df;
      events.push({
        f: currentFrame,
        t: typeIdx === 0 ? 'keydown' : 'keyup',
        d: ACTION_MAP[actionIdx]
      });
    }

    return { seed, mapCode, settings, events };
  } catch (e) {
    console.error('Failed to decode replay:', e);
    return null;
  }
}

// 以前のJSON形式(V1)のデコードロジック（互換性用）
function decodeV1(uint8) {
  const json = new TextDecoder().decode(uint8);
  const data = JSON.parse(json);
  const [version, seed, mapCode, sArr, eArr] = data;
  const settings = {};
  SETTING_KEYS.forEach((k, i) => {
    const v = sArr[i];
    if (k === 'dasCancel' || k === 'socd' || k === 'dasCarry' || k === 'attackEnabled') {
      settings[k] = !!v;
    } else {
      settings[k] = v;
    }
  });
  const events = [];
  let currentFrame = 0;
  for (let i = 0; i < eArr.length; i += 2) {
    const df = eArr[i];
    const typeAction = eArr[i + 1];
    const typeIdx = typeAction & 1;
    const actionIdx = typeAction >> 1;
    currentFrame += df;
    events.push({ f: currentFrame, t: typeIdx === 0 ? 'keydown' : 'keyup', d: ACTION_MAP[actionIdx] });
  }
  return { seed, mapCode, settings, events };
}
