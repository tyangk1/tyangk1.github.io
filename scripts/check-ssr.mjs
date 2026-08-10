/**
 * Kiểm những trang chạy lúc có request — thứ `check:html` không còn thấy.
 *
 * VÌ SAO CẦN
 *
 * `check:html` quét file HTML trong `dist/client`. Trang bài giờ chạy on-demand nên
 * không có file nào ở đó, và vùng phủ của bộ kiểm tụt từ 32 trang xuống 23 — mất đúng
 * những trang nội dung dày nhất, tức nơi dễ có ảnh thiếu alt và id trùng nhất. Script
 * này bù lại phần đó: dựng máy chủ, gọi từng route bài, kiểm trên HTML thật nhận về.
 *
 * Nó tự bật và tự tắt máy chủ, nên chạy được trong CI mà không cần bước dàn dựng nào.
 *
 *   pnpm check:ssr        (phải `pnpm build` trước)
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.SSR_CHECK_PORT ?? 4326);
const GOC = `http://127.0.0.1:${PORT}`;
const VANG = 'tests/renderer-golden';

if (!existsSync('dist/server/entry.mjs')) {
  console.error('Chưa có dist/server/entry.mjs. Chạy `pnpm build` trước.');
  process.exit(1);
}

const may = spawn(process.execPath, ['dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logMay = '';
may.stdout.on('data', (d) => (logMay += d));
may.stderr.on('data', (d) => (logMay += d));

const dungMay = () => may.kill();
process.on('exit', dungMay);

/** Chờ máy chủ nhận kết nối. Không chờ thì phép thử đầu tiên luôn hỏng. */
async function choSan() {
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(`${GOC}/404`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return false;
}

if (!(await choSan())) {
  console.error(`Máy chủ không lên sau 15 giây.\n${logMay}`);
  process.exit(1);
}

const loi = [];
const bao = (duong, thongDiep) => loi.push(`${duong} — ${thongDiep}`);

const slugs = existsSync(VANG)
  ? readdirSync(VANG)
      .filter((f) => f.endsWith('.html'))
      .map((f) => f.replace(/\.html$/, ''))
  : [];

if (slugs.length === 0) {
  console.error(`Không có ảnh chụp nào trong ${VANG}/ — không biết phải kiểm route nào.`);
  process.exit(1);
}

/** Bộ luật dùng chung cho mọi trang HTML — cùng luật với `check:html`. */
function kiemTrangHtml(duong, html, { canMucLuc = false } = {}) {
  if (!/<title>[^<]+<\/title>/.test(html)) bao(duong, 'thiếu <title>');

  // Trang `noindex` được miễn description và canonical, cùng lý do như `check:html`:
  // hai thẻ đó tồn tại để máy tìm kiếm hiển thị, mà trang đã nói "đừng index".
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  if (!noindex) {
    if (!/<meta name="description" content="[^"]+"/.test(html)) bao(duong, 'thiếu meta description');
    if (!/<link rel="canonical" href="[^"]+"/.test(html)) bao(duong, 'thiếu canonical');
  }

  // `alt=""` là hợp lệ (ảnh trang trí), thiếu hẳn thuộc tính thì không.
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) bao(duong, `ảnh thiếu alt: ${m[0].slice(0, 70)}`);
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const trung = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (trung.length) bao(duong, `id trùng: ${[...new Set(trung)].join(', ')}`);

  if (canMucLuc && !/data-toc-link="/.test(html)) bao(duong, 'mục lục rỗng');
}

// ── Trang bài ─────────────────────────────────────────────────────────────────
for (const slug of slugs.sort()) {
  const duong = `/blog/${slug}`;
  const res = await fetch(`${GOC}${duong}`);
  const html = await res.text();

  if (res.status !== 200) {
    bao(duong, `HTTP ${res.status}`);
    continue;
  }

  kiemTrangHtml(duong, html, { canMucLuc: true });
  if (!html.includes('class="prose')) bao(duong, 'không tìm thấy khối .prose');
}

/*
  ── Trang danh sách ───────────────────────────────────────────────────────────

  Chúng cũng chạy on-demand nên `check:html` không thấy chúng nữa. Sau khi chuyển, số
  trang HTML mà `check:html` quét được tụt còn 6 — nếu không kiểm ở đây thì trang chủ
  không còn được kiểm alt ảnh hay id trùng bởi bất cứ bộ kiểm nào.
*/
const TRANG_DANH_SACH = ['/', '/blog', '/tags', '/search'];

for (const duong of TRANG_DANH_SACH) {
  const res = await fetch(`${GOC}${duong}`);
  const html = await res.text();

  if (res.status !== 200) {
    bao(duong, `HTTP ${res.status}`);
    continue;
  }

  kiemTrangHtml(duong, html);
}

// Từng trang tag, lấy tên tag từ chính trang /tags thay vì viết cứng danh sách.
const trangTags = await (await fetch(`${GOC}/tags`)).text();
const slugTags = [...new Set([...trangTags.matchAll(/href="\/tags\/([a-z0-9-]+)"/g)].map((m) => m[1]))];

for (const t of slugTags) {
  const duong = `/tags/${t}`;
  const res = await fetch(`${GOC}${duong}`);
  if (res.status !== 200) {
    bao(duong, `HTTP ${res.status}`);
    continue;
  }
  kiemTrangHtml(duong, await res.text());
}

// ── Hai endpoint XML: phải hợp lệ và phải CÓ bài ──────────────────────────────
const sitemap = await fetch(`${GOC}/sitemap.xml`);
const xmlSitemap = await sitemap.text();
const soUrlBai = (xmlSitemap.match(/<loc>[^<]*\/blog\/[a-z0-9-]+<\/loc>/g) ?? []).length;

if (sitemap.status !== 200) bao('/sitemap.xml', `HTTP ${sitemap.status}`);
else if (soUrlBai < slugs.length) {
  // Đây chính là lỗi đã xảy ra thật: sitemap vẫn hợp lệ XML nhưng rỗng phần bài viết,
  // nên Google mất đường phát hiện mọi bài. Kiểm số lượng, không chỉ kiểm HTTP 200.
  bao('/sitemap.xml', `chỉ có ${soUrlBai} URL bài, cần ít nhất ${slugs.length}`);
}

const rss = await fetch(`${GOC}/rss.xml`);
const xmlRss = await rss.text();
const soItem = (xmlRss.match(/<item>/g) ?? []).length;

if (rss.status !== 200) bao('/rss.xml', `HTTP ${rss.status}`);
else if (soItem < slugs.length) bao('/rss.xml', `chỉ có ${soItem} item, cần ít nhất ${slugs.length}`);

// ── Tìm kiếm ──────────────────────────────────────────────────────────────────
const timJson = await fetch(`${GOC}/search.json?q=${encodeURIComponent('tieng viet')}`);
if (timJson.status !== 200) {
  bao('/search.json', `HTTP ${timJson.status}`);
} else {
  const kq = await timJson.json();
  // Gõ KHÔNG DẤU phải ra bài có dấu — đó là điểm quan trọng nhất của bộ tìm kiếm này.
  if (!(kq.ket_qua ?? []).length) bao('/search.json', 'gõ không dấu "tieng viet" ra 0 kết quả');
}

const timTrang = await fetch(`${GOC}/search?q=${encodeURIComponent('tieng viet')}`);
const htmlTim = await timTrang.text();
// Kết quả phải nằm NGAY trong HTML, tức là trang chạy được khi JS bị chặn.
if (!/id="search-results"[\s\S]{0,400}<li/.test(htmlTim)) {
  bao('/search?q=', 'không có kết quả trong HTML — trang tìm kiếm phụ thuộc JS');
}

// ── Những đường phải 404, không được 200 trang trống hay 500 ───────────────────
for (const [ten, duong] of [
  ['slug bài không tồn tại', '/blog/khong-he-ton-tai-bao-gio'],
  ['tag không tồn tại', '/tags/khong-he-ton-tai-bao-gio'],
  ['/blog/page/1 trùng với /blog', '/blog/page/1'],
  ['số trang quá lớn', '/blog/page/999'],
  ['số trang không phải số', '/blog/page/abc'],
  ['số trang không nguyên', '/blog/page/2.5'],
]) {
  const res = await fetch(`${GOC}${duong}`);
  if (res.status !== 404) bao(duong, `${ten}: HTTP ${res.status}, cần 404`);
}

dungMay();

console.log(
  `Đã gọi ${slugs.length} route bài, ${TRANG_DANH_SACH.length} trang danh sách, ` +
    `${slugTags.length} trang tag, sitemap, RSS và tìm kiếm.`,
);

if (loi.length) {
  console.log('');
  for (const l of loi) console.log(`  ✗ ${l}`);
  console.log(`\n${loi.length} vấn đề.`);
  process.exit(1);
}

console.log('✓ Không có ảnh thiếu alt, id trùng, mục lục rỗng hay thẻ meta thiếu.');
