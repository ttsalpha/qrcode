import type { ErrorCorrectionLevel, EncodingMode } from '../types';
import { getDataCodewordsCapacity, interleaveBlocks } from './errorCorrection';

const EC_LEVEL_INDEX: Record<ErrorCorrectionLevel, number> = {
  L: 0,
  M: 1,
  Q: 2,
  H: 3,
};

// 45-character set defined in ISO 18004 Table 5.
// The map value (index position) is the numeric value used during encoding.
const ALPHANUMERIC_MAP = new Map<string, number>(
  [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'].map((ch, i) => [ch, i]),
);

function getAlphanumericValue(ch: string): number {
  return ALPHANUMERIC_MAP.get(ch) ?? -1;
}

function isNumeric(str: string): boolean {
  return /^[0-9]*$/.test(str);
}

function isAlphanumeric(str: string): boolean {
  return [...str].every((ch) => ALPHANUMERIC_MAP.has(ch));
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

// Builds the raw bit stream for one QR data segment.
//
// Numeric:      groups of 3 digits → 10 bits, 2 → 7 bits, 1 → 4 bits (ISO 18004 §7.4.3)
// Alphanumeric: pair of chars → first*45 + second, 11 bits; single char → 6 bits (§7.4.4)
// Byte:         each UTF-8 byte → 8 bits (§7.4.5)
function encodeData(
  data: string,
  mode: EncodingMode,
  version: number,
): number[] {
  const bits: number[] = [];

  function pushBits(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
  }

  // Pre-encode for byte mode so we use the byte length (not the string length)
  // for the character count indicator and reuse the same buffer for data.
  const byteEncoded = mode === 'byte' ? new TextEncoder().encode(data) : null;

  pushBits(MODE_INDICATOR[mode], 4);

  const charCount = byteEncoded !== null ? byteEncoded.length : data.length;
  pushBits(charCount, charCountBits(mode, version));

  if (mode === 'numeric') {
    for (let i = 0; i < data.length; i += 3) {
      const group = data.slice(i, i + 3);
      const val = parseInt(group, 10);
      if (group.length === 3) pushBits(val, 10);
      else if (group.length === 2) pushBits(val, 7);
      else pushBits(val, 4);
    }
  } else if (mode === 'alphanumeric') {
    for (let i = 0; i < data.length; i += 2) {
      if (i + 1 < data.length) {
        const val =
          getAlphanumericValue(data[i]) * 45 +
          getAlphanumericValue(data[i + 1]);
        pushBits(val, 11);
      } else {
        pushBits(getAlphanumericValue(data[i]), 6);
      }
    }
  } else {
    for (const byte of byteEncoded!) {
      pushBits(byte, 8);
    }
  }

  return bits;
}

// Packs a bit array into bytes, MSB first. The last byte is zero-padded.
function bitsToBytes(bits: number[]): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] ?? 0);
    }
    bytes.push(byte);
  }
  return bytes;
}

// 0xEC and 0x11 are the two alternating pad codewords specified in ISO 18004 §7.4.10.
const PAD_BYTES = [0xec, 0x11];

function padDataCodewords(bytes: number[], capacity: number): number[] {
  const result = bytes.slice();
  if (result.length > capacity) {
    return result.slice(0, capacity);
  }
  let padIdx = 0;
  while (result.length < capacity) {
    result.push(PAD_BYTES[padIdx % 2]);
    padIdx++;
  }
  return result;
}

export interface EncodeResult {
  codewords: number[];
  version: number;
  ecLevelIndex: number;
  mode: EncodingMode;
}

export function encodeQR(
  data: string,
  ecLevel: ErrorCorrectionLevel = 'M',
  requestedVersion?: number,
): EncodeResult {
  const ecIdx = EC_LEVEL_INDEX[ecLevel];
  const mode = detectMode(data);

  // Find the minimum version whose data capacity fits the encoded bit stream.
  // We call encodeData twice per candidate version because the character count
  // indicator width depends on the version group — we can't pre-compute the
  // exact bit count without knowing which group we land in.
  let version = 1;
  if (requestedVersion !== undefined) {
    version = requestedVersion;
  } else {
    for (let v = 1; v <= 40; v++) {
      const capacity = getDataCodewordsCapacity(v, ecIdx);
      const bits = encodeData(data, mode, v);
      // +4 for terminator; round up to next byte boundary
      const totalBytes = Math.ceil((bits.length + 4) / 8);
      if (totalBytes <= capacity) {
        version = v;
        break;
      }
    }
  }

  const capacity = getDataCodewordsCapacity(version, ecIdx);
  const dataBits = encodeData(data, mode, version);

  // Terminator: up to 4 zero bits to signal end of data (ISO 18004 §7.4.9)
  const maxBits = capacity * 8;
  const terminatorLen = Math.min(4, maxBits - dataBits.length);
  for (let i = 0; i < terminatorLen; i++) {
    dataBits.push(0);
  }

  // Pad to byte boundary with zeros
  while (dataBits.length % 8 !== 0) {
    dataBits.push(0);
  }

  const dataBytes = bitsToBytes(dataBits);
  const paddedBytes = padDataCodewords(dataBytes, capacity);

  const codewords = interleaveBlocks(paddedBytes, version, ecIdx);

  return { codewords, version, ecLevelIndex: ecIdx, mode };
}
