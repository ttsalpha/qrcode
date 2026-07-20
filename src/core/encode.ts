import type { ErrorCorrectionLevel, EncodingMode } from '../types';
import { getDataCodewordsCapacity, interleaveBlocks } from './errorCorrection';

const EC_LEVEL_INDEX: Record<ErrorCorrectionLevel, number> = {
  L: 0,
  M: 1,
  Q: 2,
  H: 3,
};

// Lazy singleton — avoids throwing at import time on runtimes without a
// global TextEncoder when only numeric/alphanumeric data is ever encoded.
let textEncoder: TextEncoder | undefined;
function getTextEncoder(): TextEncoder {
  return (textEncoder ??= new TextEncoder());
}

// 45-character set defined in ISO 18004 Table 5.
// The map value (index position) is the numeric value used during encoding.
function buildAlphanumericMap(): Map<string, number> {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const map = new Map<string, number>();
  for (let i = 0; i < chars.length; i++) {
    map.set(chars[i], i);
  }
  return map;
}

const ALPHANUMERIC_MAP = /* @__PURE__ */ buildAlphanumericMap();

function getAlphanumericValue(ch: string): number {
  return ALPHANUMERIC_MAP.get(ch) ?? -1;
}

function isNumeric(str: string): boolean {
  return /^[0-9]+$/.test(str);
}

function isAlphanumeric(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (!ALPHANUMERIC_MAP.has(str[i])) return false;
  }
  return true;
}

// Prefer the most compact mode that can represent all characters.
function detectMode(data: string): EncodingMode {
  if (isNumeric(data)) return 'numeric';
  if (isAlphanumeric(data)) return 'alphanumeric';
  return 'byte';
}

// Character count indicator width varies by version group (ISO 18004 Table 3).
// Versions 1–9 use narrower indicators; 27–40 need the widest.
function charCountBits(mode: EncodingMode, version: number): number {
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

// 4-bit mode indicators per ISO 18004 Table 2.
const MODE_INDICATOR: Record<EncodingMode, number> = {
  numeric: 0b0001,
  alphanumeric: 0b0010,
  byte: 0b0100,
};

// Exact payload bit count per mode (ISO 18004 §7.4.3–7.4.5), computed
// arithmetically so version selection never has to build a bit stream.
// `charCount` is the UTF-8 byte length in byte mode, string length otherwise.
const NUMERIC_REMAINDER_BITS = [0, 4, 7];

function payloadBits(mode: EncodingMode, charCount: number): number {
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

// Total data bytes needed for one segment at a given version, including the
// 4-bit mode indicator and the (up to) 4-bit terminator, rounded up to a byte.
function totalDataBytes(
  mode: EncodingMode,
  charCount: number,
  version: number,
): number {
  const bits = 4 + charCountBits(mode, version) + payloadBits(mode, charCount);
  // +4 for terminator; round up to next byte boundary
  return Math.ceil((bits + 4) / 8);
}

// Writes bits MSB-first into a preallocated byte buffer.
class BitWriter {
  readonly bytes: Uint8Array;
  private bitPos = 0;

  constructor(byteCapacity: number) {
    this.bytes = new Uint8Array(byteCapacity);
  }

  writeBits(value: number, length: number): void {
    let pos = this.bitPos;
    for (let i = length - 1; i >= 0; i--) {
      if ((value >> i) & 1) {
        this.bytes[pos >> 3] |= 0x80 >> (pos & 7);
      }
      pos++;
    }
    this.bitPos = pos;
  }

  get bitLength(): number {
    return this.bitPos;
  }

  // Advances the cursor without writing — the buffer is already zeroed.
  skipBits(count: number): void {
    this.bitPos += count;
  }

  alignToByte(): void {
    this.bitPos = (this.bitPos + 7) & ~7;
  }
}

// 0xEC and 0x11 are the two alternating pad codewords specified in ISO 18004 §7.4.10.
const PAD_BYTES = [0xec, 0x11];

// Encodes the data segment directly into a byte buffer of exactly `capacity`
// data codewords: mode indicator, character count, payload, terminator,
// zero-padding to the byte boundary, then alternating pad codewords (§7.4.10).
function encodeIntoCodewords(
  data: string,
  mode: EncodingMode,
  version: number,
  capacity: number,
  byteEncoded: Uint8Array | null,
): Uint8Array {
  const writer = new BitWriter(capacity);

  writer.writeBits(MODE_INDICATOR[mode], 4);

  const charCount = byteEncoded !== null ? byteEncoded.length : data.length;
  writer.writeBits(charCount, charCountBits(mode, version));

  if (mode === 'numeric') {
    // Groups of 3 digits → 10 bits, 2 → 7 bits, 1 → 4 bits (ISO 18004 §7.4.3)
    const len = data.length;
    for (let i = 0; i < len; i += 3) {
      const remaining = len - i;
      let val = data.charCodeAt(i) - 48;
      if (remaining >= 2) val = val * 10 + (data.charCodeAt(i + 1) - 48);
      if (remaining >= 3) val = val * 10 + (data.charCodeAt(i + 2) - 48);
      writer.writeBits(val, remaining >= 3 ? 10 : remaining === 2 ? 7 : 4);
    }
  } else if (mode === 'alphanumeric') {
    // Pair of chars → first*45 + second, 11 bits; single char → 6 bits (§7.4.4)
    for (let i = 0; i < data.length; i += 2) {
      if (i + 1 < data.length) {
        const val =
          getAlphanumericValue(data[i]) * 45 +
          getAlphanumericValue(data[i + 1]);
        writer.writeBits(val, 11);
      } else {
        writer.writeBits(getAlphanumericValue(data[i]), 6);
      }
    }
  } else {
    // Each UTF-8 byte → 8 bits (§7.4.5)
    for (const byte of byteEncoded!) {
      writer.writeBits(byte, 8);
    }
  }

  // Backstop for the arithmetic capacity check: typed-array OOB writes are
  // silent, so any drift between totalDataBytes and the writer must fail loudly.
  const maxBits = capacity * 8;
  if (writer.bitLength > maxBits) {
    throw new RangeError(
      `encoded data (${writer.bitLength} bits) exceeds capacity (${maxBits} bits) for the selected version`,
    );
  }

  // Terminator: up to 4 zero bits to signal end of data (ISO 18004 §7.4.9)
  writer.skipBits(Math.min(4, maxBits - writer.bitLength));
  writer.alignToByte();

  // Alternating pad codewords fill the remaining capacity
  const bytes = writer.bytes;
  let padIdx = 0;
  for (let i = writer.bitLength >> 3; i < capacity; i++) {
    bytes[i] = PAD_BYTES[padIdx % 2];
    padIdx++;
  }

  return bytes;
}

export interface EncodeResult {
  codewords: Uint8Array;
  version: number;
  ecLevelIndex: number;
  mode: EncodingMode;
}

export function encodeQR(
  data: string,
  ecLevel: ErrorCorrectionLevel = 'M',
  requestedVersion?: number,
): EncodeResult {
  if (data.length === 0) {
    throw new RangeError('data must not be empty');
  }

  const ecIdx = EC_LEVEL_INDEX[ecLevel];
  const mode = detectMode(data);

  // UTF-8 encode once up front — the byte length drives both the character
  // count indicator and the version capacity check.
  const byteEncoded = mode === 'byte' ? getTextEncoder().encode(data) : null;
  const charCount = byteEncoded !== null ? byteEncoded.length : data.length;

  // Find the minimum version whose data capacity fits the encoded stream.
  // Pure arithmetic — no bit stream is built until the version is known.
  let version = 1;
  if (requestedVersion !== undefined) {
    if (
      !Number.isInteger(requestedVersion) ||
      requestedVersion < 1 ||
      requestedVersion > 40
    ) {
      throw new RangeError(
        `version must be an integer between 1 and 40, got ${requestedVersion}`,
      );
    }
    version = requestedVersion;
    const capacity = getDataCodewordsCapacity(version, ecIdx);
    const totalBytes = totalDataBytes(mode, charCount, version);
    if (totalBytes > capacity) {
      throw new RangeError(
        `data too large for version ${version} with EC level "${ecLevel}" (needs ${totalBytes} bytes, capacity ${capacity})`,
      );
    }
  } else {
    let found = false;
    for (let v = 1; v <= 40; v++) {
      if (
        totalDataBytes(mode, charCount, v) <= getDataCodewordsCapacity(v, ecIdx)
      ) {
        version = v;
        found = true;
        break;
      }
    }
    if (!found) {
      throw new RangeError(
        `data too large for any QR version with EC level "${ecLevel}"`,
      );
    }
  }

  const capacity = getDataCodewordsCapacity(version, ecIdx);
  const paddedBytes = encodeIntoCodewords(
    data,
    mode,
    version,
    capacity,
    byteEncoded,
  );

  const codewords = interleaveBlocks(paddedBytes, version, ecIdx);

  return { codewords, version, ecLevelIndex: ecIdx, mode };
}
