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

/*
  Múi giờ phải khớp ở ba chỗ, nếu không thì bài đặt lịch lên sai ngày.

  Ba chỗ đó không import được từ nhau:
    src/site.config.ts        — TypeScript, dùng lúc build.
    scripts/lib/kiem-bai.mjs  — module này chạy CẢ trong trình duyệt nên không
                                đọc được file .ts.
    migration dat_lich_dang   — SQL, không import gì cả.

  Nên đây là ba bản chép tay. Chép tay thì phải có người canh, và đó là đoạn dưới.
  Lệch nhau là kiểu lỗi tệ nhất: không có gì sập, bài chỉ lên sớm hoặc muộn vài
  tiếng, và phải rất lâu sau mới có ai để ý.
*/
const NGUON_MUI_GIO = [
  ['src/site.config.ts', /timeZone:\s*'([^']+)'/],
  ['scripts/lib/kiem-bai.mjs', /MUI_GIO\s*=\s*'([^']+)'/],
  // Cố tình neo vào `)::date` chứ không chỉ `at time zone '...'`: chuỗi múi giờ còn
  // xuất hiện trong phần chú thích của file SQL, mà chú thích thì không phải cái chạy.
  ['supabase/migrations/20260810000000_dat_lich_dang.sql', /at time zone '([^']+)'\)::date/],
];

const daDoc = [];
for (const [file, mau] of NGUON_MUI_GIO) {
  const raw = await readFile(file, 'utf8');
  const m = raw.match(mau);
  if (!m) {
    console.error(`✗ Không tìm thấy khai báo múi giờ trong ${file}`);
    process.exit(1);
  }
  daDoc.push([file, m[1]]);
}

const khacNhau = new Set(daDoc.map(([, tz]) => tz));
if (khacNhau.size > 1) {
  console.error('\n✗ Múi giờ khai không khớp giữa các file — bài đặt lịch sẽ lên sai ngày:');
  for (const [file, tz] of daDoc) console.error(`    ${tz}  ${file}`);
  process.exit(1);
}

console.log(`✓ Múi giờ khớp ở ${daDoc.length} chỗ: ${daDoc[0][1]}`);
