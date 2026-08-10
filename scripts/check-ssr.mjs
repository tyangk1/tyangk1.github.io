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

const GOLDEN_DIR = 'tests/renderer-golden';

/**
 * Chạy được vào MỘT SITE THẬT, không chỉ vào bản build ở máy.
 *
 *   pnpm check:ssr                                       tự dựng máy chủ từ dist/
 *   node scripts/check-ssr.mjs --url=https://abc.vercel.app   gọi thẳng site đã deploy
 *
 * Vì sao đáng có: sau khi deploy lên Vercel, câu hỏi thật là "site THẬT có đúng không",
 * và cách trả lời không phải là tin vào một bản build ở máy khác. Cùng một bộ luật, chạy
 * vào cả hai chỗ, nên không có phép kiểm nào chỉ đúng ở một phía.
 */
const urlArg = process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length);
const PORT = Number(process.env.SSR_CHECK_PORT ?? 4326);
const ORIGIN = (urlArg ?? `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');

let server = null;
let serverLog = '';

/** Chờ máy chủ nhận kết nối. Không chờ thì phép thử đầu tiên luôn hỏng. */
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(`${ORIGIN}/404`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return false;
}

const stopServer = () => server?.kill();

if (!urlArg) {
  if (!existsSync('dist/server/entry.mjs')) {
    console.error(
      'Chưa có dist/server/entry.mjs.\n' +
        'Chạy `pnpm build` với BUILD_ADAPTER=node, hoặc dùng --url=<site đã deploy>.',
    );
    process.exit(1);
  }

  server = spawn(process.execPath, ['dist/server/entry.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));
  process.on('exit', stopServer);
}

if (!(await waitForServer())) {
  console.error(`Không gọi được ${ORIGIN} sau 15 giây.\n${serverLog}`);
  process.exit(1);
}

console.log(`Kiểm ${ORIGIN}\n`);

const problems = [];
const report = (path, message) => problems.push(`${path} — ${message}`);

const slugs = existsSync(GOLDEN_DIR)
  ? readdirSync(GOLDEN_DIR)
      .filter((f) => f.endsWith('.html'))
      .map((f) => f.replace(/\.html$/, ''))
  : [];

if (slugs.length === 0) {
  console.error(`Không có ảnh chụp nào trong ${GOLDEN_DIR}/ — không biết phải kiểm route nào.`);
  process.exit(1);
}

/**
 * Mọi route chạy lúc request PHẢI khai `s-maxage`.
 *
 * Thiếu nó thì CDN không cache, và mỗi người đọc là một vòng tới database. Lỗ này đã xảy ra
 * thật: `src/pages/blog/[slug].astro` — route được đọc nhiều nhất site — không đặt header,
 * nên nó trả `x-vercel-cache: MISS` ở mọi request, 966–2360 ms mỗi lần. Không có phép kiểm
 * nào thấy, vì trang vẫn trả đúng nội dung; chỉ đo trên site thật mới lộ ra.
 *
 * Kiểm `s-maxage` chứ không phải chỉ `Cache-Control` tồn tại: `no-store` cũng là một
 * Cache-Control hợp lệ, và nó đúng cho `/search.json` nhưng sai cho một trang bài.
 */
function checkCacheHeader(path, res) {
  const value = res.headers.get('cache-control') ?? '';

  if (!value) {
    report(path, 'không có Cache-Control — CDN sẽ không cache, mỗi người đọc một vòng database');
    return;
  }
  if (!/s-maxage=\d+/.test(value)) {
    report(path, `Cache-Control thiếu s-maxage: "${value}"`);
  }
}

/** Bộ luật dùng chung cho mọi trang HTML — cùng luật với `check:html`. */
function checkHtmlPage(path, html, { needsToc = false } = {}) {
  if (!/<title>[^<]+<\/title>/.test(html)) report(path, 'thiếu <title>');

  // Trang `noindex` được miễn description và canonical, cùng lý do như `check:html`:
  // hai thẻ đó tồn tại để máy tìm kiếm hiển thị, mà trang đã nói "đừng index".
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  if (!noindex) {
    if (!/<meta name="description" content="[^"]+"/.test(html)) report(path, 'thiếu meta description');
    if (!/<link rel="canonical" href="[^"]+"/.test(html)) report(path, 'thiếu canonical');
  }

  // `alt=""` là hợp lệ (ảnh trang trí), thiếu hẳn thuộc tính thì không.
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) report(path, `ảnh thiếu alt: ${m[0].slice(0, 70)}`);
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const duplicates = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (duplicates.length) report(path, `id trùng: ${[...new Set(duplicates)].join(', ')}`);

  if (needsToc && !/data-toc-link="/.test(html)) report(path, 'mục lục rỗng');
}

// ── Trang bài ─────────────────────────────────────────────────────────────────
for (const slug of slugs.sort()) {
  const path = `/blog/${slug}`;
  const res = await fetch(`${ORIGIN}${path}`);
  const html = await res.text();

  if (res.status !== 200) {
    report(path, `HTTP ${res.status}`);
    continue;
  }

  checkCacheHeader(path, res);
  checkHtmlPage(path, html, { needsToc: true });
  if (!html.includes('class="prose')) report(path, 'không tìm thấy khối .prose');
}

/*
  ── Trang danh sách ───────────────────────────────────────────────────────────

  Chúng cũng chạy on-demand nên `check:html` không thấy chúng nữa. Sau khi chuyển, số
  trang HTML mà `check:html` quét được tụt còn 6 — nếu không kiểm ở đây thì trang chủ
  không còn được kiểm alt ảnh hay id trùng bởi bất cứ bộ kiểm nào.
*/
const LIST_PAGES = ['/', '/blog', '/tags', '/search'];

for (const path of LIST_PAGES) {
  const res = await fetch(`${ORIGIN}${path}`);
  const html = await res.text();

  if (res.status !== 200) {
    report(path, `HTTP ${res.status}`);
    continue;
  }

  checkCacheHeader(path, res);
  checkHtmlPage(path, html);
}

// Từng trang tag, lấy tên tag từ chính trang /tags thay vì viết cứng danh sách.
const tagsPageHtml = await (await fetch(`${ORIGIN}/tags`)).text();
const tagSlugs = [...new Set([...tagsPageHtml.matchAll(/href="\/tags\/([a-z0-9-]+)"/g)].map((m) => m[1]))];

for (const t of tagSlugs) {
  const path = `/tags/${t}`;
  const res = await fetch(`${ORIGIN}${path}`);
  if (res.status !== 200) {
    report(path, `HTTP ${res.status}`);
    continue;
  }
  checkCacheHeader(path, res);
  checkHtmlPage(path, await res.text());
}

// ── Hai endpoint XML: phải hợp lệ và phải CÓ bài ──────────────────────────────
const sitemap = await fetch(`${ORIGIN}/sitemap.xml`);
const sitemapXml = await sitemap.text();
const postUrlCount = (sitemapXml.match(/<loc>[^<]*\/blog\/[a-z0-9-]+<\/loc>/g) ?? []).length;

if (sitemap.status !== 200) report('/sitemap.xml', `HTTP ${sitemap.status}`);
else if (postUrlCount < slugs.length) {
  // Đây chính là lỗi đã xảy ra thật: sitemap vẫn hợp lệ XML nhưng rỗng phần bài viết,
  // nên Google mất đường phát hiện mọi bài. Kiểm số lượng, không chỉ kiểm HTTP 200.
  report('/sitemap.xml', `chỉ có ${postUrlCount} URL bài, cần ít nhất ${slugs.length}`);
}

const rss = await fetch(`${ORIGIN}/rss.xml`);
const rssXml = await rss.text();
const itemCount = (rssXml.match(/<item>/g) ?? []).length;

if (rss.status !== 200) report('/rss.xml', `HTTP ${rss.status}`);
else if (itemCount < slugs.length) report('/rss.xml', `chỉ có ${itemCount} item, cần ít nhất ${slugs.length}`);

// ── Tìm kiếm ──────────────────────────────────────────────────────────────────
const searchJson = await fetch(`${ORIGIN}/search.json?q=${encodeURIComponent('tieng viet')}`);
if (searchJson.status !== 200) {
  report('/search.json', `HTTP ${searchJson.status}`);
} else {
  const payload = await searchJson.json();
  // Gõ KHÔNG DẤU phải ra bài có dấu — đó là điểm quan trọng nhất của bộ tìm kiếm này.
  if (!(payload.results ?? []).length) report('/search.json', 'gõ không dấu "tieng viet" ra 0 kết quả');
}

const searchPage = await fetch(`${ORIGIN}/search?q=${encodeURIComponent('tieng viet')}`);
const searchHtml = await searchPage.text();

/*
  Tìm SLUG của bài trong HTML, không phải tìm một thẻ `<li>` nào đó.

  Bản đầu tôi viết `/id="search-results"[\s\S]{0,400}<li/` và nó BÁO ĐẠT SAI trên một bản
  deploy chạy code cũ — code đó không có tìm kiếm phía máy chủ nào cả, `<ul id="search-results">`
  rỗng, nhưng mẫu trên khớp vào `<li>` của danh sách tag ở khối "Duyệt theo chủ đề" ngay bên
  dưới. Một phép kiểm báo đạt trên đúng thứ nó sinh ra để bắt thì tệ hơn không có nó.

  Giờ đòi đúng hai điều kiện cụ thể: link tới bài khớp truy vấn, và số kết quả trong dòng
  trạng thái. Cả hai chỉ có thể do máy chủ sinh ra.
*/
if (!searchHtml.includes('/blog/css-cho-tieng-viet')) {
  report('/search?q=', 'HTML không có link tới bài khớp — tìm kiếm không chạy phía máy chủ');
}
if (!/\d+ kết quả cho/.test(searchHtml)) {
  report('/search?q=', 'HTML không có dòng "N kết quả cho" — trang phụ thuộc JS');
}

/*
  ── Ảnh OG và ảnh bìa ─────────────────────────────────────────────────────────

  Kiểm cả CONTENT-TYPE và SỐ BYTE, không chỉ HTTP 200. Một endpoint sinh ảnh lỗi vẫn trả
  200 kèm chuỗi rỗng rất dễ, và khi đó bài chia sẻ lên mạng xã hội ra khung trắng — thứ
  không sửa lại được, vì các nền tảng cache ảnh xem trước theo URL.
*/
for (const slug of slugs.sort()) {
  const ogPath = `/og/${slug}.png`;
  const og = await fetch(`${ORIGIN}${ogPath}`);
  const ogBytes = og.ok ? (await og.arrayBuffer()).byteLength : 0;

  if (og.status !== 200) report(ogPath, `HTTP ${og.status}`);
  else if (!(og.headers.get('content-type') ?? '').includes('image/png')) {
    report(ogPath, `content-type = ${og.headers.get('content-type')}`);
  } else if (ogBytes < 2000) report(ogPath, `chỉ ${ogBytes} byte — ảnh gần như rỗng`);

  const coverPath = `/covers/${slug}.svg`;
  const cover = await fetch(`${ORIGIN}${coverPath}`);
  const coverText = cover.ok ? await cover.text() : '';

  if (cover.status !== 200) report(coverPath, `HTTP ${cover.status}`);
  else if (!coverText.includes('<svg')) report(coverPath, 'không phải SVG');
}

const ogHome = await fetch(`${ORIGIN}/og/trang-chu.png`);
if (ogHome.status !== 200) report('/og/trang-chu.png', `HTTP ${ogHome.status}`);

// ── Những đường phải 404, không được 200 trang trống hay 500 ───────────────────
for (const [name, path] of [
  ['slug bài không tồn tại', '/blog/khong-he-ton-tai-bao-gio'],
  ['tag không tồn tại', '/tags/khong-he-ton-tai-bao-gio'],
  ['/blog/page/1 trùng với /blog', '/blog/page/1'],
  ['số trang quá lớn', '/blog/page/999'],
  ['số trang không phải số', '/blog/page/abc'],
  ['số trang không nguyên', '/blog/page/2.5'],
  ['ảnh OG của bài không tồn tại', '/og/khong-he-ton-tai-bao-gio.png'],
  ['ảnh bìa của bài không tồn tại', '/covers/khong-he-ton-tai-bao-gio.svg'],
]) {
  const res = await fetch(`${ORIGIN}${path}`);
  if (res.status !== 404) report(path, `${name}: HTTP ${res.status}, cần 404`);
}

stopServer();

console.log(
  `Đã gọi ${slugs.length} route bài, ${LIST_PAGES.length} trang danh sách, ` +
    `${tagSlugs.length} trang tag, sitemap, RSS và tìm kiếm.`,
);

if (problems.length) {
  console.log('');
  for (const l of problems) console.log(`  ✗ ${l}`);
  console.log(`\n${problems.length} vấn đề.`);
  process.exit(1);
}

console.log('✓ Không có ảnh thiếu alt, id trùng, mục lục rỗng hay thẻ meta thiếu.');
