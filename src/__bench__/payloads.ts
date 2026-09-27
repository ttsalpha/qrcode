// Shared benchmark payloads covering the main mode/version spread.
export const SHORT_ALNUM = 'HELLO WORLD'; // v1, alphanumeric
export const MEDIUM_URL =
  'https://order.example.com/store/4821/table/17?session=f3a9c1d2-7b64-4e08-9a35-2c1d8e6f0b47&lang=en&utm_source=qr'; // v7, byte
export const LONG_ALNUM = 'A'.repeat(1000); // ~v22, alphanumeric
export const LONG_NUMERIC = '1'.repeat(2000); // numeric
// Structured payload with long digit runs between short alphanumeric tags:
// the shape the segmentation search actually splits.
export const MIXED_EMVCO =
  '00020101021238570010A00000072701270006970436011312345678901230208QRIBFTTA53037045802VN62150811Thanh toan6304A1B2';
