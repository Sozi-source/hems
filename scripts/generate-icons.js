const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generateIcon(size) {
  const width = size;
  const height = size;
  const rawRows = [];
  const radius = Math.floor(size * 0.22);
  const center = size / 2;

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const idx = 1 + x * 4;
      // Rounded rect check
      const dx = Math.max(Math.abs(x - center) - (center - radius), 0);
      const dy = Math.max(Math.abs(y - center) - (center - radius), 0);
      const isInside = (dx * dx + dy * dy) <= (radius * radius);

      if (isInside) {
        // Draw 'H' in the center
        const hWidth = size * 0.44;
        const hHeight = size * 0.52;
        const stemWidth = size * 0.12;
        const barHeight = size * 0.11;
        const leftX = center - hWidth / 2;
        const rightX = center + hWidth / 2 - stemWidth;
        const topY = center - hHeight / 2;
        const bottomY = center + hHeight / 2;
        const barY = center - barHeight / 2;

        const inLeftStem = (x >= leftX && x <= leftX + stemWidth && y >= topY && y <= bottomY);
        const inRightStem = (x >= rightX && x <= rightX + stemWidth && y >= topY && y <= bottomY);
        const inBar = (x >= leftX && x <= rightX + stemWidth && y >= barY && y <= barY + barHeight);

        if (inLeftStem || inRightStem || inBar) {
          // White letter H
          row[idx] = 255;
          row[idx + 1] = 255;
          row[idx + 2] = 255;
          row[idx + 3] = 255;
        } else {
          // Indigo background #4F46E5 (79, 70, 229)
          row[idx] = 79;
          row[idx + 1] = 70;
          row[idx + 2] = 229;
          row[idx + 3] = 255;
        }
      } else {
        // Transparent
        row[idx] = 0;
        row[idx + 1] = 0;
        row[idx + 2] = 0;
        row[idx + 3] = 0;
      }
    }
    rawRows.push(row);
  }

  const uncompressed = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(uncompressed);

  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ];

  return Buffer.concat(chunks);
}

const pubDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });

fs.writeFileSync(path.join(pubDir, 'icon-192.png'), generateIcon(192));
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), generateIcon(512));
fs.writeFileSync(path.join(pubDir, 'favicon.ico'), generateIcon(32));
console.log('Icons generated successfully in public/');
