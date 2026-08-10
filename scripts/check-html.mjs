/**
 * Kiểm tra HTML đã build trong `dist/`.
 *
 * Đây là những lỗi Lighthouse hoặc không bắt, hoặc chỉ bắt trên đúng trang bạn
 * đang mở. Script này quét TẤT CẢ các trang cùng lúc.
 *
 * Chạy: pnpm check:html   (phải `pnpm build` trước)
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/*
  `dist/client`, không phải `dist`.

  Có adapter thì Astro chia output làm hai: `dist/client` là thứ phục vụ cho trình duyệt,
  `dist/server` là mã chạy trên máy chủ. Trỏ vào `dist` thì script vẫn tìm ra file HTML
  (nó đệ quy), nhưng phần kiểm LIÊN KẾT NỘI BỘ sẽ sai hết: một link `/tags/astro` được
  giải thành `dist/tags/astro` — đường không tồn tại — nên mọi liên kết đúng đều bị báo
  là hỏng. Kiểm sai kiểu này tệ hơn không kiểm, vì nó dạy người ta bỏ qua kết quả.
*/
const DIST = 'dist/client';

/*
  Route chạy lúc có request, nên KHÔNG có file nào trên đĩa để đối chiếu.

  Trang bài đọc database lúc có request, nên `dist/client/blog/<slug>/index.html` không
  tồn tại. Không có ngoại lệ này thì mọi link tới mọi bài đều bị báo gãy — 20 báo động
  giả, và một bộ kiểm toàn báo động giả là bộ kiểm bị bỏ qua.

  Cố ý đối chiếu với thư mục nội dung chứ không phải một mẫu `^/blog/.+$`. Mẫu đó nhận
  cả `/blog/bai-khong-he-ton-tai`, tức là bỏ luôn thứ bộ kiểm này sinh ra để bắt: link
  gõ sai slug. Ở đây tập slug đúng vẫn là tập file MDX mà `db-sync` vừa ghi ra.
*/
const SLUG_BAI = new Set(
  (await readdir('src/content/blog').catch(() => [])).map((f) => f.replace(/\.mdx?$/, '')),
);

function laRouteChay(duong) {
  if (duong === '/404') return true;

  const m = duong.match(/^\/blog\/([^/]+)$/);
  return m ? SLUG_BAI.has(m[1]) : false;
}

async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found;
}

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/** Bỏ phần <head> và các khối script/style để không quét nhầm nội dung bên trong. */
function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

const problems = [];
const report = (file, message) => problems.push(`${relative(DIST, file)} — ${message}`);

const files = await htmlFiles(DIST);

for (const file of files) {
  const raw = await readFile(file, 'utf8');
  const body = stripNoise(raw);

  // 1. id trùng nhau trong cùng một trang: screen reader nhảy sai chỗ,
  //    và `aria-labelledby` trỏ vào phần tử không mong muốn.
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) report(file, `id trùng: "${id}"`);
    seen.add(id);
  }

  // 2. Ảnh thiếu alt.
  for (const [tag] of body.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(tag)) report(file, `<img> thiếu alt: ${tag.slice(0, 90)}`);
  }

  // 3. Mỗi trang đúng một h1.
  const h1Count = (body.match(/<h1\b/g) ?? []).length;
  if (h1Count !== 1) report(file, `có ${h1Count} thẻ <h1> (cần đúng 1)`);

  // 4. Thẻ meta bắt buộc.
  //
  // Trang `noindex` được miễn `description` và `canonical`: hai thẻ đó tồn tại để
  // máy tìm kiếm hiển thị và chọn URL chuẩn, mà trang đã nói "đừng index" thì
  // không có gì để hiển thị. Đặt canonical trên trang noindex còn là tín hiệu tự
  // mâu thuẫn. `<title>` thì vẫn bắt buộc — nó là tên tab của người đang mở.
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(raw);

  if (!/<title>[^<]+<\/title>/.test(raw)) report(file, 'thiếu <title>');

  if (!noindex) {
    if (!/<meta name="description" content="[^"]+"/.test(raw))
      report(file, 'thiếu meta description');
    if (!/<link rel="canonical" href="[^"]+"/.test(raw)) report(file, 'thiếu canonical');
  }

  // 5. Link nội bộ trỏ vào trang không tồn tại.
  for (const match of body.matchAll(/href="(\/[^"#?]*)"/g)) {
    const href = match[1];
    if (href.startsWith('//')) continue;

    const clean = href.replace(/\/$/, '');
    const target = join(DIST, clean.split('/').join(sep));

    const ok =
      (await exists(target)) ||
      (await exists(`${target}.html`)) ||
      (await exists(join(target, 'index.html')));

    if (!ok && !laRouteChay(clean)) report(file, `link gãy: ${href}`);
  }
}

console.log(`Đã quét ${files.length} trang HTML.`);

if (problems.length > 0) {
  console.error(`\n${problems.length} vấn đề:\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log('✓ Không có id trùng, ảnh thiếu alt, link gãy hay thẻ meta thiếu.');
