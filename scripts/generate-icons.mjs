/**
 * Sinh icon PNG từ `public/favicon.svg`.
 *
 * Chạy lại sau mỗi lần sửa favicon: node scripts/generate-icons.mjs
 * Sinh sẵn ra file thay vì tạo lúc build, để `astro build` không phụ thuộc
 * thêm bước nào và deploy nhanh hơn.
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile('public/favicon.svg');

const sizes = [
  ['public/apple-touch-icon.png', 180],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
];

for (const [path, size] of sizes) {
  const png = await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path, png);
  console.log(`✓ ${path} (${size}×${size}, ${(png.length / 1024).toFixed(1)}KB)`);
}
