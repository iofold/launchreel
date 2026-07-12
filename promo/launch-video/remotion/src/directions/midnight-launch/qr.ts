// qr.ts — self-contained byte-mode QR encoder (zero deps).
// Returns a boolean matrix (true = dark module). Supports versions 1–4, EC levels
// L/M/Q/H, byte (8-bit) mode, with automatic smallest-version fit and mask selection.
// Algorithm mirrors Nayuki's reference QR generator (finder/timing/alignment placement,
// Reed–Solomon over GF(256), BCH format bits, 8-mask penalty scoring). Verified against a
// live scan; used only for the end-card CTA (https://launchreel.xyz), so v2-M suffices.

export type ECLevel = "L" | "M" | "Q" | "H";

// ---- GF(256), primitive polynomial 0x11d --------------------------------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];

function rsGenPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly; // length degree+1, poly[0] === 1
}

function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGenPoly(ecCount);
  const res = data.concat(new Array(ecCount).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

// ---- Error-correction characteristics: [ecPerBlock, blocks1, data1, blocks2, data2] -------
// Covers versions 1–4 for every EC level (enough for any short URL). Index: EC_TABLE[ver][ec].
type ECRow = [number, number, number, number, number];
const EC_TABLE: Record<number, Record<ECLevel, ECRow>> = {
  1: { L: [7, 1, 19, 0, 0], M: [10, 1, 16, 0, 0], Q: [13, 1, 13, 0, 0], H: [17, 1, 9, 0, 0] },
  2: { L: [10, 1, 34, 0, 0], M: [16, 1, 28, 0, 0], Q: [22, 1, 22, 0, 0], H: [28, 1, 16, 0, 0] },
  3: { L: [15, 1, 55, 0, 0], M: [26, 1, 44, 0, 0], Q: [18, 2, 17, 0, 0], H: [22, 2, 13, 0, 0] },
  4: { L: [20, 1, 80, 0, 0], M: [18, 2, 32, 0, 0], Q: [26, 2, 24, 0, 0], H: [16, 4, 9, 0, 0] },
};
const FORMAT_BITS: Record<ECLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

const getBit = (v: number, i: number): boolean => ((v >>> i) & 1) !== 0;

function totalDataCodewords(row: ECRow): number {
  const [, b1, d1, b2, d2] = row;
  return b1 * d1 + b2 * d2;
}

// ---- Encode text → interleaved data+EC codewords for a chosen version/EC -------------------
function makeCodewords(bytes: number[], version: number, ec: ECLevel): number[] {
  const row = EC_TABLE[version][ec];
  const [ecPerBlock, blocks1, data1, blocks2, data2] = row;
  const totalData = totalDataCodewords(row);

  // Bit buffer: mode (byte=0100) + 8-bit count + data.
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8); // 8-bit count indicator valid for versions 1–9
  for (const b of bytes) push(b, 8);

  // Terminator (up to 4 zero bits), then pad to byte boundary.
  const capacityBits = totalData * 8;
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  // Assemble data codewords, pad with alternating 0xEC / 0x11.
  const dataCw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataCw.push(b);
  }
  const PAD = [0xec, 0x11];
  for (let p = 0; dataCw.length < totalData; p++) dataCw.push(PAD[p % 2]);

  // Split into blocks, compute EC per block.
  const blocks: { data: number[]; ec: number[] }[] = [];
  let pos = 0;
  const addBlocks = (count: number, dataLen: number) => {
    for (let i = 0; i < count; i++) {
      const d = dataCw.slice(pos, pos + dataLen);
      pos += dataLen;
      blocks.push({ data: d, ec: rsEncode(d, ecPerBlock) });
    }
  };
  addBlocks(blocks1, data1);
  addBlocks(blocks2, data2);

  // Interleave data codewords, then EC codewords.
  const out: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++)
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ---- Matrix construction ------------------------------------------------------------------
type Grid = number[][]; // -1 unset, 0 light, 1 dark

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function buildFunctionPatterns(version: number): { modules: Grid; isFn: boolean[][]; size: number } {
  const size = version * 4 + 17;
  const modules: Grid = Array.from({ length: size }, () => new Array(size).fill(-1));
  const isFn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark ? 1 : 0;
    isFn[y][x] = true;
  };

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns (centers), Chebyshev rings.
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  // Alignment patterns (skip the three that collide with finders).
  const pos = alignmentPositions(version, size);
  const n = pos.length;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      const ax = pos[i];
      const ay = pos[j];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  // Reserve *exactly* the format-info cells (mark function, don't clobber timing at
  // index 6 or over-reserve data cells) — values are written later by drawFormat().
  const reserve = (x: number, y: number) => {
    isFn[y][x] = true;
    if (modules[y][x] === -1) modules[y][x] = 0;
  };
  for (let i = 0; i <= 5; i++) reserve(8, i);
  reserve(8, 7);
  reserve(8, 8);
  reserve(7, 8);
  for (let i = 9; i < 15; i++) reserve(14 - i, 8);
  for (let i = 0; i < 8; i++) reserve(size - 1 - i, 8);
  for (let i = 8; i < 15; i++) reserve(8, size - 15 + i);
  set(8, size - 8, true); // always-dark module

  return { modules, isFn, size };
}

function placeData(modules: Grid, isFn: boolean[][], size: number, codewords: number[]) {
  let i = 0; // bit index, MSB first
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip vertical timing column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && i < totalBits) {
          modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7)) ? 1 : 0;
          i++;
        }
      }
    }
  }
}

const maskFn = (mask: number, x: number, y: number): boolean => {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
};

function drawFormat(modules: Grid, size: number, ec: ECLevel, mask: number) {
  const data = (FORMAT_BITS[ec] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const put = (x: number, y: number, i: number) => (modules[y][x] = getBit(bits, i) ? 1 : 0);
  for (let i = 0; i <= 5; i++) put(8, i, i);
  put(8, 7, 6);
  put(8, 8, 7);
  put(7, 8, 8);
  for (let i = 9; i < 15; i++) put(14 - i, 8, i);
  for (let i = 0; i < 8; i++) put(size - 1 - i, 8, i);
  for (let i = 8; i < 15; i++) put(8, size - 15 + i, i);
  modules[size - 8][8] = 1; // always-dark
}

function penalty(modules: Grid, size: number): number {
  let score = 0;
  const at = (x: number, y: number) => modules[y][x] === 1;
  // Rule 1: runs of 5+ same colour (rows then cols).
  for (let y = 0; y < size; y++) {
    let run = 1;
    for (let x = 1; x < size; x++) {
      if (at(x, y) === at(x - 1, y)) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score++;
      } else run = 1;
    }
  }
  for (let x = 0; x < size; x++) {
    let run = 1;
    for (let y = 1; y < size; y++) {
      if (at(x, y) === at(x, y - 1)) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score++;
      } else run = 1;
    }
  }
  // Rule 2: 2×2 same-colour blocks.
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  // Rule 3: finder-like 1:1:3:1:1 with 4 light on a side (rows + cols).
  const core = [true, false, true, true, true, false, true];
  const rowMatch = (get: (i: number) => boolean, len: number) => {
    let count = 0;
    for (let s = 0; s + 7 <= len; s++) {
      let ok = true;
      for (let k = 0; k < 7; k++) if (get(s + k) !== core[k]) { ok = false; break; }
      if (!ok) continue;
      const before = [1, 2, 3, 4].every((d) => s - d < 0 || !get(s - d));
      const after = [1, 2, 3, 4].every((d) => s + 6 + d >= len || !get(s + 6 + d));
      if (before || after) count++;
    }
    return count;
  };
  for (let y = 0; y < size; y++) score += 40 * rowMatch((x) => at(x, y), size);
  for (let x = 0; x < size; x++) score += 40 * rowMatch((y) => at(x, y), size);
  // Rule 4: dark-module proportion.
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (at(x, y)) dark++;
  const percent = (dark * 100) / (size * size);
  const k = Math.floor(Math.abs(percent - 50) / 5);
  score += k * 10;
  return score;
}

function smallestVersion(byteLen: number, ec: ECLevel): number {
  for (let v = 1; v <= 4; v++) {
    const row = EC_TABLE[v][ec];
    const capacity = totalDataCodewords(row) - 2; // minus mode nibble + count byte
    if (byteLen <= capacity) return v;
  }
  throw new Error(`QR: ${byteLen} bytes too long for versions 1–4 at EC ${ec}`);
}

/** Encode `text` (UTF-8, byte mode) into a boolean matrix. true = dark module. */
export function qrMatrix(text: string, ec: ECLevel = "M", forceMask?: number): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = smallestVersion(bytes.length, ec);
  const codewords = makeCodewords(bytes, version, ec);
  const { modules, isFn, size } = buildFunctionPatterns(version);
  placeData(modules, isFn, size, codewords);

  // Try all 8 masks, keep the lowest-penalty result (or a forced mask, for tests).
  let best: Grid | null = null;
  let bestScore = Infinity;
  const maskStart = forceMask ?? 0;
  const maskEnd = forceMask !== undefined ? forceMask + 1 : 8;
  for (let mask = maskStart; mask < maskEnd; mask++) {
    const trial = modules.map((r) => r.slice());
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (!isFn[y][x] && maskFn(mask, x, y)) trial[y][x] ^= 1;
    drawFormat(trial, size, ec, mask);
    const s = penalty(trial, size);
    if (s < bestScore) {
      bestScore = s;
      best = trial;
    }
  }
  return best!.map((r) => r.map((c) => c === 1));
}
