/**
 * Generates electron/icon.ico for Credential Manager.
 * Icon: dark navy background, gold ring + center dot (security/key theme).
 * Run: node gen-icon.js
 * No external dependencies required.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const SIZES = [256, 64, 48, 32, 16];

// Color palette – gold on dark navy
const BG_R = 0x0d, BG_G = 0x11, BG_B = 0x17;   // #0d1117
const AC_R = 0xf5, AC_G = 0x9e, AC_B = 0x0b;   // #f59e0b  (amber/gold)

function makeImageBMP(size) {
  const pixelData = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = size / 2 - 0.5;
      const cy = size / 2 - 0.5;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const outerR = size / 2 - 1;
      const ringW  = Math.max(2, size * 0.13);
      const innerR = outerR - ringW;
      const dotR   = Math.max(1, size * 0.11);

      let R = 0, G = 0, B = 0, A = 0;

      if (dist <= outerR) {
        // Outer ring – gold
        R = AC_R; G = AC_G; B = AC_B; A = 255;

        if (dist <= innerR) {
          // Inner background – dark navy
          R = BG_R; G = BG_G; B = BG_B; A = 255;

          // Center dot – gold
          if (dist <= dotR) {
            R = AC_R; G = AC_G; B = AC_B; A = 255;
          }

          // Radial tick marks at 12/3/6/9 o'clock
          const angle   = Math.atan2(y - cy, x - cx);
          const cardinal = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
          for (const a of cardinal) {
            const diff = Math.abs(((angle - a) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
            if (diff < 0.16 && dist > innerR * 0.5 && dist < innerR * 0.88) {
              R = AC_R; G = AC_G; B = AC_B; A = 200;
            }
          }
        }
      }

      // BMP rows are stored bottom-up
      const row = size - 1 - y;
      const i   = (row * size + x) * 4;
      pixelData[i]     = B;
      pixelData[i + 1] = G;
      pixelData[i + 2] = R;
      pixelData[i + 3] = A;
    }
  }

  const andMask = Buffer.alloc(Math.ceil(size / 8) * 4 * size, 0);

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);   // doubled for ICO format
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(pixelData.length + andMask.length, 20);

  return Buffer.concat([header, pixelData, andMask]);
}

const images      = SIZES.map(makeImageBMP);
const count       = images.length;
const headerBytes = 6 + count * 16;

const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(count, 4);

const dirEntries = [];
let offset = headerBytes;
for (let i = 0; i < count; i++) {
  const s = SIZES[i];
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  dirEntries.push(e);
  offset += images[i].length;
}

const ico = Buffer.concat([icoHeader, ...dirEntries, ...images]);
const out = path.join(__dirname, 'icon.ico');
fs.writeFileSync(out, ico);
console.log(`icon.ico written: ${ico.length} bytes  (sizes: ${SIZES.join(', ')} px)`);
