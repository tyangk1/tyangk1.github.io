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

for (const slug of slugs.sort()) {
  const duong = `/blog/${slug}`;
  const res = await fetch(`${GOC}${duong}`);
  const html = await res.text();

  if (res.status !== 200) {
    bao(duong, `HTTP ${res.status}`);
    continue;
  }

  // 1. Thẻ meta bắt buộc — cùng bộ luật với `check:html`.
  if (!/<title>[^<]+<\/title>/.test(html)) bao(duong, 'thiếu <title>');
  if (!/<meta name="description" content="[^"]+"/.test(html)) bao(duong, 'thiếu meta description');
  if (!/<link rel="canonical" href="[^"]+"/.test(html)) bao(duong, 'thiếu canonical');

  // 2. Ảnh thiếu alt. `alt=""` là hợp lệ (ảnh trang trí), thiếu hẳn thì không.
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) bao(duong, `ảnh thiếu alt: ${m[0].slice(0, 70)}`);
  }

  // 3. `id` trùng — làm neo heading và mục lục trỏ sai chỗ.
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const trung = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (trung.length) bao(duong, `id trùng: ${[...new Set(trung)].join(', ')}`);

  // 4. Mục lục phải có mục. Rỗng nghĩa là phần bóc heading đã vỡ.
  if (!/data-toc-link="/.test(html)) bao(duong, 'mục lục rỗng');

  // 5. Thân bài phải khớp ảnh chụp vàng — không được lệch khỏi hình dạng bản MDX.
  if (!html.includes('class="prose')) bao(duong, 'không tìm thấy khối .prose');
}

// 6. Ba trường hợp phải 404, không được là 200 trang trống hay 500.
for (const [ten, duong] of [
  ['slug không tồn tại', '/blog/khong-he-ton-tai-bao-gio'],
  ['slug rỗng sau /blog/', '/blog/-'],
]) {
  const res = await fetch(`${GOC}${duong}`);
  if (res.status !== 404) bao(duong, `${ten}: HTTP ${res.status}, cần 404`);
}

dungMay();

console.log(`Đã gọi ${slugs.length} route bài trên máy chủ SSR.`);

if (loi.length) {
  console.log('');
  for (const l of loi) console.log(`  ✗ ${l}`);
  console.log(`\n${loi.length} vấn đề.`);
  process.exit(1);
}

console.log('✓ Không có ảnh thiếu alt, id trùng, mục lục rỗng hay thẻ meta thiếu.');
