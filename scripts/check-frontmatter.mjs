/**
 * Kiểm nhanh độ dài `title` và `description` của mọi bài viết.
 *
 * Astro cũng chặn ở bước build, nhưng nó dừng ngay ở bài sai đầu tiên.
 * Script này liệt kê TẤT CẢ bài sai cùng lúc, tiện hơn khi viết nhiều bài.
 *
 * Chạy: pnpm check:content
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'src/content/blog';
const LIMITS = { title: [1, 70], description: [120, 160] };

/**
 * Đọc giá trị một trường trong frontmatter.
 *
 * Phải xử lý được cả hai cách viết, vì file có thể do người gõ tay hoặc do trang
 * admin ghi ra — và chúng viết khác nhau:
 *
 *   description: 'Một dòng'          ← gõ tay
 *   description: >-                  ← trang admin, khi câu dài
 *     Dòng đầu
 *     dòng sau
 *
 * Không xử lý dạng thứ hai thì script sẽ đo đúng hai ký tự (">-") và báo sai
 * cho mọi bài viết từ admin.
 */
function readField(frontmatter, field) {
  const lines = frontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (index === -1) return '';

  const inline = (lines[index] ?? '').slice(field.length + 1).trim();

  // Block scalar: `>`, `>-`, `>+`, `|`, `|-`, `|+`
  if (/^[|>][-+]?$/.test(inline)) {
    const body = [];
    for (const line of lines.slice(index + 1)) {
      // Khối kết thúc khi gặp dòng không thụt lề (và không rỗng).
      if (line.trim() !== '' && !/^\s/.test(line)) break;
      body.push(line.trim());
    }
    // `>` gộp các dòng thành một đoạn; `|` giữ nguyên ngắt dòng.
    return inline.startsWith('>') ? body.join(' ').trim() : body.join('\n').trim();
  }

  return inline.replace(/^['"]|['"]$/g, '');
}

const files = (await readdir(DIR)).filter((f) => /\.mdx?$/.test(f));
let failed = 0;

for (const file of files) {
  const raw = await readFile(join(DIR, file), 'utf8');
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';

  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    const value = readField(frontmatter, field);
    const length = value.length;

    if (length < min || length > max) {
      console.error(`✗ ${file}\n  ${field}: ${length} ký tự (cần ${min}–${max})\n  "${value}"`);
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} trường sai độ dài.`);
  process.exit(1);
}

console.log(`✓ ${files.length} bài viết, frontmatter hợp lệ.`);
