/**
 * Builds assets/icon.png and assets/icon.ico with no native dependencies.
 * Windows Vista and later accept PNG images stored inside an ICO.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outDir = path.join(__dirname, '..', 'assets');

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blend(pixels, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
  const i = (y * size + x) * 4;
  const sa = a / 255;
  const da = pixels[i + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  pixels[i] = Math.round((r * sa + pixels[i] * da * (1 - sa)) / outA);
  pixels[i + 1] = Math.round((g * sa + pixels[i + 1] * da * (1 - sa)) / outA);
  pixels[i + 2] = Math.round((b * sa + pixels[i + 2] * da * (1 - sa)) / outA);
  pixels[i + 3] = Math.round(outA * 255);
}

function coverage(distance, radius) {
  const edge = radius - distance;
  if (edge >= 0.8) return 255;
  if (edge <= -0.8) return 0;
  return Math.round(((edge + 0.8) / 1.6) * 255);
}

function fillCircle(pixels, size, cx, cy, radius, color) {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const x1 = Math.min(size - 1, Math.ceil(cx + radius + 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + radius + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      blend(pixels, size, x, y, color[0], color[1], color[2], coverage(d, radius));
    }
  }
}

function strokeSegment(pixels, size, x1, y1, x2, y2, width, color) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(length * 2));
  const radius = width / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(pixels, size, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, radius, color);
  }
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const s = size;
  fillCircle(pixels, s, s * 0.5, s * 0.5, s * 0.46, [22, 24, 28]);
  strokeSegment(pixels, s, s * 0.28, s * 0.7, s * 0.68, s * 0.28, s * 0.11, [255, 90, 54]);
  fillCircle(pixels, s, s * 0.28, s * 0.7, s * 0.055, [255, 214, 10]);
  return pixels;
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = 6 + directory.length;
  const parts = [header, directory];
  images.forEach((image, index) => {
    const entry = index * 16;
    directory[entry] = image.size >= 256 ? 0 : image.size;
    directory[entry + 1] = image.size >= 256 ? 0 : image.size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
    parts.push(image.png);
  });
  return Buffer.concat(parts);
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const sizes = [16, 32, 48, 256];
  const images = sizes.map((size) => ({ size, png: encodePng(size, drawIcon(size)) }));
  fs.writeFileSync(path.join(outDir, 'icon.png'), images[images.length - 1].png);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(images));
}

main();
