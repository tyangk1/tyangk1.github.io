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

const DIST = 'dist';

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
  if (!/<title>[^<]+<\/title>/.test(raw)) report(file, 'thiếu <title>');
  if (!/<meta name="description" content="[^"]+"/.test(raw)) report(file, 'thiếu meta description');
  if (!/<link rel="canonical" href="[^"]+"/.test(raw)) report(file, 'thiếu canonical');

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

    if (!ok) report(file, `link gãy: ${href}`);
  }
}

console.log(`Đã quét ${files.length} trang HTML.`);

if (problems.length > 0) {
  console.error(`\n${problems.length} vấn đề:\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log('✓ Không có id trùng, ảnh thiếu alt, link gãy hay thẻ meta thiếu.');
