import type { EncodingMode } from '../types';

// 4-bit mode indicators per ISO 18004 Table 2.
export const MODE_INDICATOR: Record<EncodingMode, number> = {
  numeric: 0b0001,
  alphanumeric: 0b0010,
  byte: 0b0100,
};

// 45-character set defined in ISO 18004 Table 5. Indexed by ASCII char code so
// encoding never allocates single-char strings or hits a Map. The stored value
// (the char's position in the set) is the numeric value used during encoding;
// -1 marks a code outside the set.
function buildAlphanumericLookup(): Int8Array {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const lut = new Int8Array(128).fill(-1);
  for (let i = 0; i < chars.length; i++) lut[chars.charCodeAt(i)] = i;
  return lut;
}

export const ALPHANUMERIC_LUT = /* @__PURE__ */ buildAlphanumericLookup();

// Alphanumeric value for a code point, or -1 if unsupported.
export function alnumValue(code: number): number {
  return code < 128 ? ALPHANUMERIC_LUT[code] : -1;
}

// Character count indicator width varies by version group (ISO 18004 Table 3).
// Versions 1–9 use narrower indicators; 27–40 need the widest.
export function charCountBits(mode: EncodingMode, version: number): number {
  if (mode === 'numeric') {
    if (version <= 9) return 10;
    if (version <= 26) return 12;
    return 14;
  }
  if (mode === 'alphanumeric') {
    if (version <= 9) return 9;
    if (version <= 26) return 11;
    return 13;
  }
  // byte mode
  if (version <= 9) return 8;
  return 16;
}

// The three version groups the indicator widths above switch on. Within a group
// every width is identical, so the optimal segmentation is identical too.
export const VERSION_GROUPS: ReadonlyArray<readonly [number, number]> = [
  [1, 9],
  [10, 26],
  [27, 40],
];

// Exact payload bit count per mode (ISO 18004 §7.4.3–7.4.5), computed
// arithmetically so version selection never has to build a bit stream.
// `charCount` is the UTF-8 byte length in byte mode, code point count otherwise.
const NUMERIC_REMAINDER_BITS = [0, 4, 7];

export function payloadBits(mode: EncodingMode, charCount: number): number {
  if (mode === 'numeric') {
    return (
      10 * Math.floor(charCount / 3) + NUMERIC_REMAINDER_BITS[charCount % 3]
    );
  }
  if (mode === 'alphanumeric') {
    return 11 * Math.floor(charCount / 2) + 6 * (charCount % 2);
  }
  return 8 * charCount;
}

export interface Segment {
  mode: EncodingMode;
  /** UTF-16 index range in the source string. */
  start: number;
  end: number;
  /** Value written into the character count indicator. */
  charCount: number;
  /** Range in the UTF-8 encoding of the whole string; only used in byte mode. */
  byteStart: number;
  byteEnd: number;
}

// Total data codewords a segment list needs at a given version, including each
// segment's header and the 4-bit terminator, rounded up to a byte.
export function segmentsDataBytes(
  segments: readonly Segment[],
  version: number,
): number {
  let bits = 0;
  for (const seg of segments) {
    bits +=
      4 +
      charCountBits(seg.mode, version) +
      payloadBits(seg.mode, seg.charCount);
  }
  return Math.ceil((bits + 4) / 8);
}

// A whole string encoded in one mode. Used for the all-digit fast path.
export function singleSegment(
  data: string,
  mode: EncodingMode,
  charCount: number,
  byteLength: number,
): Segment {
  return {
    mode,
    start: 0,
    end: data.length,
    charCount,
    byteStart: 0,
    byteEnd: byteLength,
  };
}

const NUMERIC = 0;
const ALNUM = 1;
const BYTE = 2;
const MODE_OF_INDEX: readonly EncodingMode[] = [
  'numeric',
  'alphanumeric',
  'byte',
];

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

// Per-character cost in sixths of a bit, so the fractional rates of numeric
// (10 bits / 3 chars) and alphanumeric (11 bits / 2 chars) stay exact integers.
const COST_NUMERIC = 20;
const COST_ALNUM = 33;
const COST_BYTE_PER_UTF8_BYTE = 48;

// Splits `data` into the segment list with the smallest total bit cost at the
// given version, by dynamic programming over (character, mode). Switching mode
// costs a fresh header, so the search trades a 4-bit indicator plus a character
// count against the cheaper per-character rate of a denser mode.
//
// Only the version group matters: charCountBits is constant within one, so
// callers compute this once per group rather than once per version.
// One-pass classification with no allocation. ASCII covers every numeric and
// alphanumeric character, so the common case never leaves the fast branch.
interface Scan {
  count: number; // code points
  totalBytes: number; // UTF-8 length
  digits: number;
  alnums: number; // includes digits
}

function scan(data: string): Scan {
  let count = 0;
  let totalBytes = 0;
  let digits = 0;
  let alnums = 0;
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    if (c < 0x80) {
      totalBytes++;
      if (c >= 48 && c <= 57) {
        digits++;
        alnums++;
      } else if (ALPHANUMERIC_LUT[c] >= 0) {
        alnums++;
      }
    } else if (c < 0x800) {
      totalBytes += 2;
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < data.length) {
      totalBytes += 4; // surrogate pair
      i++;
    } else {
      totalBytes += 3;
    }
    count++;
  }
  return { count, totalBytes, digits, alnums };
}

// Per-code-point tables, built only when the search actually runs.
interface CharTables {
  cpIndex: Int32Array;
  cpBytes: Uint8Array;
  cpClass: Uint8Array; // 0 = byte only, 1 = alphanumeric, 2 = digit
}

function buildTables(data: string, count: number): CharTables {
  const cpIndex = new Int32Array(count);
  const cpBytes = new Uint8Array(count);
  const cpClass = new Uint8Array(count);
  let n = 0;
  for (let i = 0; i < data.length; ) {
    const cp = data.codePointAt(i) as number;
    cpIndex[n] = i;
    cpBytes[n] = utf8Length(cp);
    if (cp >= 48 && cp <= 57) cpClass[n] = 2;
    else if (alnumValue(cp) >= 0) cpClass[n] = 1;
    n++;
    i += cp > 0xffff ? 2 : 1;
  }
  return { cpIndex, cpBytes, cpClass };
}

/**
 * Optimal segments for one string. The character scan and the per-code-point
 * tables are shared across versions, because version selection asks for the
 * same string at one version per group.
 */
export interface SegmentPlan {
  forVersion(version: number): Segment[];
}

export function planSegments(data: string): SegmentPlan {
  const { count, totalBytes, digits, alnums } = scan(data);

  // Uniform inputs have a provably optimal single segment, so skip the search:
  // all digits is already the densest mode; all alphanumeric with no digit has
  // no denser mode available; nothing alphanumeric leaves only byte mode.
  let uniform: Segment | undefined;
  if (digits === count) {
    uniform = singleSegment(data, 'numeric', count, totalBytes);
  } else if (alnums === count && digits === 0) {
    // With digits present the search can still win by splitting out a numeric run.
    uniform = singleSegment(data, 'alphanumeric', count, totalBytes);
  } else if (alnums === 0) {
    uniform = singleSegment(data, 'byte', totalBytes, totalBytes);
  }
  if (uniform) {
    const only = [uniform];
    return { forVersion: () => only };
  }

  let tables: CharTables | undefined;
  return {
    forVersion(version: number): Segment[] {
      tables ??= buildTables(data, count);
      return search(data, version, count, tables);
    },
  };
}

export function buildSegments(data: string, version: number): Segment[] {
  return planSegments(data).forVersion(version);
}

// Dynamic program over (character, mode). Switching mode costs a fresh header,
// so the search trades a 4-bit indicator plus a character count against the
// cheaper per-character rate of a denser mode.
function search(
  data: string,
  version: number,
  count: number,
  { cpIndex, cpBytes, cpClass }: CharTables,
): Segment[] {
  const headNumeric = (4 + charCountBits('numeric', version)) * 6;
  const headAlnum = (4 + charCountBits('alphanumeric', version)) * 6;
  const headByte = (4 + charCountBits('byte', version)) * 6;
  const headCosts = [headNumeric, headAlnum, headByte];

  // charModes[i * 3 + j] is the mode character i is encoded in, on the cheapest
  // path whose state after character i is mode j. -1 means unreachable.
  const charModes = new Int8Array(count * 3).fill(-1);
  let costs = new Float64Array(3);
  let prevCosts = new Float64Array([headNumeric, headAlnum, headByte]);

  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const cls = cpClass[i];
    costs[NUMERIC] = Infinity;
    costs[ALNUM] = Infinity;

    // Extend the current segment: byte mode accepts every character.
    costs[BYTE] = prevCosts[BYTE] + cpBytes[i] * COST_BYTE_PER_UTF8_BYTE;
    charModes[base + BYTE] = BYTE;
    if (cls !== 0) {
      costs[ALNUM] = prevCosts[ALNUM] + COST_ALNUM;
      charModes[base + ALNUM] = ALNUM;
    }
    if (cls === 2) {
      costs[NUMERIC] = prevCosts[NUMERIC] + COST_NUMERIC;
      charModes[base + NUMERIC] = NUMERIC;
    }

    // Or start a new segment here, paying a header. A segment boundary lands on
    // a byte boundary, so the running cost rounds up to a whole bit first.
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        if (charModes[base + k] === -1) continue;
        const newCost = Math.ceil(costs[k] / 6) * 6 + headCosts[j];
        if (charModes[base + j] === -1 || newCost < costs[j]) {
          costs[j] = newCost;
          charModes[base + j] = k;
        }
      }
    }
    const swap = prevCosts;
    prevCosts = costs;
    costs = swap;
  }

  let endMode = NUMERIC;
  for (let j = 1; j < 3; j++) {
    if (prevCosts[j] < prevCosts[endMode]) endMode = j;
  }

  const modeOf = new Int8Array(count);
  let cursor = endMode;
  for (let i = count - 1; i >= 0; i--) {
    cursor = charModes[i * 3 + cursor];
    modeOf[i] = cursor;
  }

  const segments: Segment[] = [];
  let byteOffset = 0;
  let i = 0;
  while (i < count) {
    const mode = modeOf[i];
    let end = i;
    let bytes = 0;
    while (end < count && modeOf[end] === mode) {
      bytes += cpBytes[end];
      end++;
    }
    segments.push({
      mode: MODE_OF_INDEX[mode],
      start: cpIndex[i],
      end: end < count ? cpIndex[end] : data.length,
      charCount: mode === BYTE ? bytes : end - i,
      byteStart: byteOffset,
      byteEnd: byteOffset + bytes,
    });
    byteOffset += bytes;
    i = end;
  }
  return segments;
}
