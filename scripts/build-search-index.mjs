/**
 * Dựng chỉ mục tìm kiếm Pagefind sau khi trang bài thôi được prerender.
 *
 * VẤN ĐỀ
 *
 * Pagefind lập chỉ mục bằng cách đọc HTML ĐÃ BUILD. Trang bài giờ chạy lúc có request
 * nên không còn file HTML nào để đọc — đã đo: chỉ mục tụt xuống 23 trang / 523 từ,
 * tức chỉ còn các trang danh sách, không một chữ nào trong bài. Tìm "cache CDN" không
 * ra bài viết về cache CDN. Vỡ hoàn toàn, mà lại vỡ im lặng: trang tìm kiếm vẫn chạy,
 * vẫn trả về "không tìm thấy".
 *
 * CÁCH LÀM
 *
 * Sinh HTML của từng bài vào một thư mục TẠM chỉ để Pagefind đọc, rồi chỉ lấy thư mục
 * `pagefind/` ra và bỏ thư mục tạm đi.
 *
 * Cố ý KHÔNG ghi thẳng vào `dist/client/blog/<slug>/index.html`: adapter Node ở chế độ
 * standalone phục vụ file tĩnh TRƯỚC khi tới route, nên một file sót lại ở đó sẽ che
 * mất route SSR và người đọc nhận về bản chụp lúc build — đúng cái bệnh vừa chữa xong.
 * Thư mục tạm thì không có cách nào sót vào chỗ phục vụ.
 *
 * GIỚI HẠN CÒN LẠI, NÓI RÕ
 *
 * Chỉ mục này vẫn sinh lúc build, nên một bài vừa sửa xong chỉ tìm được sau lần build
 * kế tiếp. Đó KHÔNG phải bước lùi — trước đây cả site đều như vậy. Muốn tìm kiếm live
 * thì phải đổi sang full-text search của Postgres, và việc đó đi cùng việc cho trang
 * chủ / trang tag chạy on-demand, vì cả ba đều là "danh sách bài" chứ không phải "một
 * bài".
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

import { parse as parseYaml } from 'yaml';

import { renderContent } from '../src/lib/render-content.ts';

const DIST = 'dist/client';
const TAM = '.pagefind-build';
const BLOG = 'src/content/blog';

if (!existsSync(DIST)) {
  console.error(`Chưa có ${DIST}/. Chạy \`astro build\` trước.`);
  process.exit(1);
}

rmSync(TAM, { recursive: true, force: true });
mkdirSync(TAM, { recursive: true });

/** Copy mọi file .html của bản build, để chỉ mục vẫn phủ cả trang danh sách. */
function copyHtml(tu) {
  for (const item of readdirSync(tu, { withFileTypes: true })) {
    const duong = join(tu, item.name);
    if (item.isDirectory()) {
      copyHtml(duong);
    } else if (item.name.endsWith('.html')) {
      const dich = join(TAM, relative(DIST, duong));
      mkdirSync(dirname(dich), { recursive: true });
      cpSync(duong, dich);
    }
  }
}

copyHtml(DIST);

/** Tách frontmatter YAML khỏi thân bài. */
function tach(mdx) {
  const m = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: mdx };
  return { data: parseYaml(m[1]) ?? {}, body: mdx.slice(m[0].length) };
}

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/*
  Trang chỉ để lập chỉ mục, không phải trang để người đọc xem.

  Nó cần đúng ba thứ Pagefind lấy: `<html lang>` để chọn bộ tách từ, `<title>` và `<h1>`
  để làm tiêu đề kết quả, và thân bài để làm nội dung khớp. KHÔNG cần CSS, không cần
  layout, không cần điều hướng — và nếu có thì tệ hơn, vì chữ trong menu sẽ lẫn vào
  đoạn trích của mọi kết quả.
*/
function trangChiMuc({ title, description, html }) {
  return `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><title>${escape(title)}</title>
<meta name="description" content="${escape(description).replace(/"/g, '&quot;')}"></head>
<body><main><h1>${escape(title)}</h1>
${html}
</main></body>
</html>
`;
}

const files = readdirSync(BLOG).filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
let soBai = 0;

for (const file of files.sort()) {
  const slug = file.replace(/\.mdx?$/, '');
  const { data, body } = tach(readFileSync(join(BLOG, file), 'utf8'));

  const { html, unknown, invalid } = await renderContent(body);
  if (unknown.length || invalid.length) {
    console.error(
      `  ✗ ${slug}: ${[...unknown.map((u) => `component lạ ${u}`), ...invalid].join(' | ')}`,
    );
    process.exit(1);
  }

  const dich = join(TAM, 'blog', slug, 'index.html');
  mkdirSync(dirname(dich), { recursive: true });
  writeFileSync(
    dich,
    trangChiMuc({ title: data.title ?? slug, description: data.description ?? '', html }),
    'utf8',
  );
  soBai += 1;
}

const ra = spawnSync(`npx pagefind --site ${TAM}`, { shell: true, encoding: 'utf8' });
const log = `${ra.stdout ?? ''}${ra.stderr ?? ''}`;

if (ra.status !== 0) {
  console.error(log);
  process.exit(1);
}

const soTrang = log.match(/Indexed (\d+) pages?/)?.[1] ?? '?';
const soTu = log.match(/Indexed (\d+) words?/)?.[1] ?? '?';

rmSync(join(DIST, 'pagefind'), { recursive: true, force: true });
cpSync(join(TAM, 'pagefind'), join(DIST, 'pagefind'), { recursive: true });
rmSync(TAM, { recursive: true, force: true });

console.log(`Chỉ mục tìm kiếm: ${soTrang} trang, ${soTu} từ khác nhau (${soBai} bài + trang danh sách).`);

/*
  Sàn kiểm: MỞ chỉ mục ra xem, không tin dòng log.

  Bản đầu tôi đặt sàn ở "Indexed N words" và nó báo động giả ngay: con số đó là số từ
  KHÁC NHAU trong từ vựng chỉ mục, không phải tổng số từ. Chín bài tiếng Việt dùng chung
  rất nhiều từ, nên 1.257 là bình thường, còn sàn 3.000 của tôi thì vô nghĩa.
  Đọc thẳng fragment thì đo được đúng thứ cần biết: thân bài CÓ trong chỉ mục hay không.

  Kiểm cái này quan trọng vì nó vỡ im lặng: trang tìm kiếm vẫn chạy, vẫn trả về "không
  tìm thấy", và không có gì để phân biệt "không có bài nào khớp" với "chỉ mục rỗng".
*/
if (soBai > 0) {
  const { gunzipSync } = await import('node:zlib');
  const thuMuc = join(DIST, 'pagefind', 'fragment');

  let tongKyTu = 0;
  let soTrangDay = 0;

  for (const f of readdirSync(thuMuc)) {
    const s = gunzipSync(readFileSync(join(thuMuc, f))).toString();
    const j = JSON.parse(s.slice(s.indexOf('{')));
    tongKyTu += (j.content ?? '').length;
    if ((j.word_count ?? 0) > 600) soTrangDay += 1;
  }

  console.log(`  nội dung trong chỉ mục: ${tongKyTu} ký tự, ${soTrangDay} trang dài (bài thật).`);

  if (soTrangDay === 0) {
    console.error('\n✗ Không trang nào trong chỉ mục dài quá 600 từ — thân bài không vào được.');
    process.exit(1);
  }
}
