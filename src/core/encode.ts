import type { ErrorCorrectionLevel } from '../types';
import { getDataCodewordsCapacity, interleaveBlocks } from './errorCorrection';
import {
  ALPHANUMERIC_LUT,
  MODE_INDICATOR,
  VERSION_GROUPS,
  planSegments,
  charCountBits,
  segmentsDataBytes,
  type Segment,
} from './segments';

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

// Encodes every segment into a byte buffer of exactly `capacity` data
// codewords: per segment a mode indicator and character count followed by the
// payload, then the terminator, zero-padding to the byte boundary, and
// alternating pad codewords (§7.4.10).
function encodeIntoCodewords(
  data: string,
  segments: readonly Segment[],
  version: number,
  capacity: number,
  byteEncoded: Uint8Array | null,
): Uint8Array {
  const writer = new BitWriter(capacity);

  for (const seg of segments) {
    writer.writeBits(MODE_INDICATOR[seg.mode], 4);
    writer.writeBits(seg.charCount, charCountBits(seg.mode, version));

    if (seg.mode === 'numeric') {
      // Groups of 3 digits → 10 bits, 2 → 7 bits, 1 → 4 bits (ISO 18004 §7.4.3)
      for (let i = seg.start; i < seg.end; i += 3) {
        const remaining = Math.min(3, seg.end - i);
        let val = data.charCodeAt(i) - 48;
        if (remaining >= 2) val = val * 10 + (data.charCodeAt(i + 1) - 48);
        if (remaining >= 3) val = val * 10 + (data.charCodeAt(i + 2) - 48);
        writer.writeBits(val, remaining === 3 ? 10 : remaining === 2 ? 7 : 4);
      }
    } else if (seg.mode === 'alphanumeric') {
      // Pair of chars → first*45 + second, 11 bits; single char → 6 bits (§7.4.4)
      for (let i = seg.start; i < seg.end; i += 2) {
        if (i + 1 < seg.end) {
          const val =
            ALPHANUMERIC_LUT[data.charCodeAt(i)] * 45 +
            ALPHANUMERIC_LUT[data.charCodeAt(i + 1)];
          writer.writeBits(val, 11);
        } else {
          writer.writeBits(ALPHANUMERIC_LUT[data.charCodeAt(i)], 6);
        }
      }
    } else {
      // Each UTF-8 byte → 8 bits (§7.4.5)
      for (let i = seg.byteStart; i < seg.byteEnd; i++) {
        writer.writeBits((byteEncoded as Uint8Array)[i], 8);
      }
    }
  }

  // Backstop for the arithmetic capacity check: typed-array OOB writes are
  // silent, so any drift between segmentsDataBytes and the writer must fail loudly.
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
  segments: Segment[];
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
  // The scan and per-character tables are shared across the version groups.
  const plan = planSegments(data);
  const segmentsFor = (version: number): Segment[] => plan.forVersion(version);

  let version: number;
  let segments: Segment[];

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
    segments = segmentsFor(version);
    const capacity = getDataCodewordsCapacity(version, ecIdx);
    const totalBytes = segmentsDataBytes(segments, version);
    if (totalBytes > capacity) {
      throw new RangeError(
        `data too large for version ${version} with EC level "${ecLevel}" (needs ${totalBytes} bytes, capacity ${capacity})`,
      );
    }
  } else {
    // The character count indicator widths, and therefore the optimal
    // segmentation, are constant within a version group, so the search runs
    // three times at most rather than once per version.
    let found: { version: number; segments: Segment[] } | undefined;
    for (const [lo, hi] of VERSION_GROUPS) {
      const groupSegments = segmentsFor(lo);
      const totalBytes = segmentsDataBytes(groupSegments, lo);
      for (let v = lo; v <= hi; v++) {
        if (totalBytes <= getDataCodewordsCapacity(v, ecIdx)) {
          found = { version: v, segments: groupSegments };
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      throw new RangeError(
        `data too large for any QR version with EC level "${ecLevel}"`,
      );
    }
    version = found.version;
    segments = found.segments;
  }

  // UTF-8 encode only when a byte segment actually needs the bytes.
  const needsBytes = segments.some((seg) => seg.mode === 'byte');
  const byteEncoded = needsBytes ? getTextEncoder().encode(data) : null;

  const capacity = getDataCodewordsCapacity(version, ecIdx);
  const paddedBytes = encodeIntoCodewords(
    data,
    segments,
    version,
    capacity,
    byteEncoded,
  );

  const codewords = interleaveBlocks(paddedBytes, version, ecIdx);

  return { codewords, version, ecLevelIndex: ecIdx, segments };
}
