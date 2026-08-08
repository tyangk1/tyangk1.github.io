/**
 * src/content/  →  Supabase   (chạy MỘT LẦN để chuyển nội dung đang có vào DB)
 *
 * Dùng khi:
 *   - Lần đầu chuyển từ nội dung dạng file sang database.
 *   - Sau này nếu bạn có bài viết bằng file và muốn nạp vào DB.
 *
 * KHÔNG dùng trong quy trình hằng ngày. Sau khi nội dung đã ở DB thì DB là nguồn
 * sự thật, và chiều đi là DB → file (xem `db-sync.mjs`). Chạy script này sau đó
 * sẽ ghi đè bản trong DB bằng bản trong file — chỉ làm khi bạn thật sự muốn vậy.
 *
 * Chạy: pnpm db:push
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { taoClient } from './lib/supabase.mjs';

const THU_MUC_BLOG = 'src/content/blog';
const THU_MUC_PROJECTS = 'src/content/projects';

function tachFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('File không có frontmatter');
  return { data: parseYaml(match[1]) ?? {}, body: match[2] };
}

/** Ngày trong YAML có thể là Date hoặc chuỗi — quy về 'YYYY-MM-DD'. */
function veNgay(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const supabase = taoClient();

// --- Bài viết --------------------------------------------------------------

const fileBlog = (await readdir(THU_MUC_BLOG)).filter((f) => /\.mdx?$/.test(f));
const baiViet = [];

for (const file of fileBlog) {
  const raw = await readFile(join(THU_MUC_BLOG, file), 'utf8');
  const { data, body } = tachFrontmatter(raw);

  baiViet.push({
    slug: file.replace(/\.mdx?$/, ''),
    title: data.title,
    description: data.description,
    content: body.trim(),
    published_at: veNgay(data.publishedAt),
    content_updated_at: veNgay(data.updatedAt),
    tags: data.tags ?? [],
    takeaways: data.takeaways ?? [],
    series_name: data.seriesName ?? null,
    series_part: data.seriesPart ?? null,
    cover_image: data.coverImage ?? null,
    cover_alt: data.coverAlt ?? null,
    draft: data.draft ?? false,
    featured: data.featured ?? false,
  });
}

// `onConflict: 'slug'` để chạy lại nhiều lần không tạo bản trùng.
const { error: loiBai } = await supabase.from('posts').upsert(baiViet, { onConflict: 'slug' });
if (loiBai) {
  console.error('✗ Đẩy bài viết thất bại:', loiBai.message);
  if (loiBai.details) console.error('  ', loiBai.details);
  process.exit(1);
}

// --- Dự án -----------------------------------------------------------------

const fileProject = (await readdir(THU_MUC_PROJECTS)).filter((f) => f.endsWith('.json'));
const duAn = [];

for (const file of fileProject) {
  const data = JSON.parse(await readFile(join(THU_MUC_PROJECTS, file), 'utf8'));
  duAn.push({
    slug: file.replace(/\.json$/, ''),
    name: data.name,
    description: data.description,
    year: data.year,
    status: data.status,
    tech: data.tech ?? [],
    url: data.url ?? null,
    repo: data.repo ?? null,
    featured: data.featured ?? false,
  });
}

const { error: loiDuAn } = await supabase.from('projects').upsert(duAn, { onConflict: 'slug' });
if (loiDuAn) {
  console.error('✗ Đẩy dự án thất bại:', loiDuAn.message);
  if (loiDuAn.details) console.error('  ', loiDuAn.details);
  process.exit(1);
}

console.log(`✓ Đã đẩy lên Supabase: ${baiViet.length} bài viết, ${duAn.length} dự án.`);
