/**
 * Supabase  →  src/content/blog/*.mdx  và  src/content/projects/*.json
 *
 * Đây là bước ĐẦU TIÊN của `pnpm build`. Database là nguồn sự thật; các file
 * trong `src/content/` là bản sao tạm, sinh ra rồi bỏ (đã cho vào .gitignore).
 *
 * Vì sao đi qua file thay vì để Astro đọc thẳng database?
 *
 *   Bộ thành phần trong bài (Callout, PullQuote, Steps, Figure) là MDX, và trình
 *   biên dịch MDX của Astro cần FILE thật. Content Layer của Astro có
 *   `renderMarkdown()` nhưng nó chỉ dựng Markdown thuần — dùng nó là mất toàn bộ
 *   bộ thành phần đó.
 *
 *   Đi qua file thì giữ được nguyên vẹn: MDX components, Zod validate, ảnh OG,
 *   ảnh bìa sinh bằng code, chỉ mục Pagefind, và bản build vẫn tĩnh 100%.
 *
 * Chạy: pnpm sync
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { daCauHinh, taoClient } from './lib/supabase.mjs';

const THU_MUC_BLOG = 'src/content/blog';
const THU_MUC_PROJECTS = 'src/content/projects';
const FILE_LUOT_XEM = 'src/data/luot-xem.json';

/**
 * Ghi một giá trị thành YAML.
 *
 * Mẹo: YAML là tập cha của JSON, nên `JSON.stringify` cho ra YAML hợp lệ và
 * escape đúng mọi trường hợp (dấu nháy, dấu hai chấm, xuống dòng, emoji).
 * Nhờ vậy không cần thư viện YAML nào cho phần GHI, và không có nguy cơ tự viết
 * escape sai.
 */
function yamlGiaTri(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  // Ngày dạng 'YYYY-MM-DD' để nguyên, không cần nháy.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return JSON.stringify(value);
}

function dungFrontmatter(fields) {
  const dong = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    dong.push(`${key}: ${yamlGiaTri(value)}`);
  }
  return `---\n${dong.join('\n')}\n---\n`;
}

/** Xoá các file cũ trong thư mục để bài đã xoá ở DB cũng biến mất khỏi site. */
async function donThuMuc(dir, duoi) {
  await mkdir(dir, { recursive: true });
  for (const name of await readdir(dir)) {
    if (duoi.some((d) => name.endsWith(d))) await rm(join(dir, name));
  }
}

async function dongBoBaiViet(supabase, layCaNhap) {
  let query = supabase.from('posts').select('*').order('published_at', { ascending: false });
  // Ở production chỉ lấy bài đã đăng. Ở dev lấy cả bài nháp để xem trước.
  if (!layCaNhap) query = query.eq('draft', false);

  const { data, error } = await query;
  if (error) throw new Error(`Đọc bảng posts thất bại: ${error.message}`);

  await donThuMuc(THU_MUC_BLOG, ['.mdx', '.md']);

  for (const row of data) {
    const frontmatter = dungFrontmatter({
      title: row.title,
      description: row.description,
      publishedAt: row.published_at,
      updatedAt: row.content_updated_at,
      tags: row.tags,
      takeaways: row.takeaways,
      seriesName: row.series_name,
      seriesPart: row.series_part,
      coverImage: row.cover_image,
      coverAlt: row.cover_alt,
      draft: row.draft,
      featured: row.featured,
    });

    const body = row.content.replace(/\s*$/, '') + '\n';
    await writeFile(join(THU_MUC_BLOG, `${row.slug}.mdx`), `${frontmatter}\n${body}`, 'utf8');
  }

  return data.length;
}

async function dongBoDuAn(supabase) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('year', { ascending: false });
  if (error) throw new Error(`Đọc bảng projects thất bại: ${error.message}`);

  await donThuMuc(THU_MUC_PROJECTS, ['.json']);

  for (const row of data) {
    const obj = {
      name: row.name,
      description: row.description,
      year: row.year,
      status: row.status,
      tech: row.tech,
      featured: row.featured,
    };
    if (row.url) obj.url = row.url;
    if (row.repo) obj.repo = row.repo;

    await writeFile(
      join(THU_MUC_PROJECTS, `${row.slug}.json`),
      `${JSON.stringify(obj, null, 2)}\n`,
      'utf8',
    );
  }

  return data.length;
}

/**
 * Lượt xem, ghi ra một file dữ liệu riêng chứ không nhét vào frontmatter.
 *
 * Lý do: lượt xem thay đổi liên tục còn nội dung thì không. Trộn vào frontmatter
 * thì mỗi lần sync là mọi file bài viết đều "đổi", và không còn phân biệt được
 * đâu là sửa nội dung thật.
 *
 * Số này dùng cho khối "Đọc nhiều nhất" ở trang chủ — nó chốt tại thời điểm
 * build. Con số hiện trên từng trang bài là số trực tiếp, lấy từ trình duyệt.
 */
async function dongBoLuotXem(supabase) {
  const { data, error } = await supabase
    .from('post_views')
    .select('slug, views')
    .order('views', { ascending: false });

  await mkdir('src/data', { recursive: true });

  if (error) {
    // Bảng lượt xem chưa có (chưa chạy migration) thì đừng làm hỏng build —
    // khối "Đọc nhiều nhất" chỉ đơn giản là không hiện.
    console.warn(`⚠ Không đọc được lượt xem (${error.message}). Ghi file rỗng.`);
    await writeFile(FILE_LUOT_XEM, '{}\n', 'utf8');
    return 0;
  }

  const map = Object.fromEntries(data.map((row) => [row.slug, Number(row.views)]));
  await writeFile(FILE_LUOT_XEM, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return data.length;
}

// --- Chạy ------------------------------------------------------------------

const layCaNhap = process.argv.includes('--drafts');

/**
 * `--allow-offline` chỉ dùng cho `pnpm dev`.
 *
 * Hai ngữ cảnh cần hai cách xử lý khác nhau, và đây là chỗ dễ làm sai:
 *
 *   - `pnpm dev`   — quên bật database thì cứ chạy tiếp với nội dung đang có trên
 *                    đĩa. Chặn ở đây chỉ gây khó chịu, không bảo vệ được gì.
 *   - `pnpm build` — PHẢI vỡ. Deploy âm thầm bằng nội dung cũ là loại lỗi tệ
 *                    nhất: site vẫn xanh, không ai biết bài mới chưa lên.
 */
const choPhepOffline = process.argv.includes('--allow-offline');

/** Có nội dung sẵn trên đĩa để dùng tạm hay không. */
async function coNoiDungSan() {
  try {
    return (await readdir(THU_MUC_BLOG)).some((f) => /\.mdx?$/.test(f));
  } catch {
    return false;
  }
}

function boQua(lyDo) {
  console.warn(`⚠ ${lyDo}\n  Bỏ qua bước đồng bộ, dùng nội dung đang có trong src/content/.`);
  process.exit(0);
}

if (!daCauHinh) {
  if (choPhepOffline || (await coNoiDungSan())) {
    boQua('Chưa cấu hình Supabase (thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }
  console.error(
    '✗ Chưa cấu hình Supabase và cũng không có nội dung nào trong src/content/.\n' +
      '  Chép .env.example thành .env rồi điền SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  Bật database cục bộ: pnpm db:start',
  );
  process.exit(1);
}

try {
  const supabase = taoClient();
  const soBai = await dongBoBaiViet(supabase, layCaNhap);
  const soDuAn = await dongBoDuAn(supabase);
  const soLuotXem = await dongBoLuotXem(supabase);

  console.log(
    `✓ Đồng bộ từ Supabase: ${soBai} bài viết${layCaNhap ? ' (kể cả nháp)' : ''}, ` +
      `${soDuAn} dự án, lượt xem của ${soLuotXem} bài.`,
  );
} catch (error) {
  const thongDiep = error instanceof Error ? error.message : String(error);

  if (choPhepOffline && (await coNoiDungSan())) {
    boQua(`Không kết nối được database (${thongDiep}).`);
  }

  console.error(
    `✗ Không đồng bộ được nội dung từ database.\n  ${thongDiep}\n\n` +
      '  Database cục bộ chưa bật?  →  pnpm db:start\n' +
      '  Đang chạy `pnpm dev`?      →  lệnh dev đã tự cho phép chạy offline.',
  );
  process.exit(1);
}
