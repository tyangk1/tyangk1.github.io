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
import { isConfigured, createSupabaseClient, SUPABASE_URL, isPublicKey } from './lib/supabase.mjs';
import { today } from './lib/post.mjs';

const BLOG_DIR = 'src/content/blog';
const PROJECTS_DIR = 'src/content/projects';
const VIEWS_FILE = 'src/data/views.json';

/**
 * Ghi một giá trị thành YAML.
 *
 * Mẹo: YAML là tập cha của JSON, nên `JSON.stringify` cho ra YAML hợp lệ và
 * escape đúng mọi trường hợp (dấu nháy, dấu hai chấm, xuống dòng, emoji).
 * Nhờ vậy không cần thư viện YAML nào cho phần GHI, và không có nguy cơ tự viết
 * escape sai.
 */
function yamlValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  // Ngày dạng 'YYYY-MM-DD' để nguyên, không cần nháy.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return JSON.stringify(value);
}

function buildFrontmatter(fields) {
  const lines = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  return `---\n${lines.join('\n')}\n---\n`;
}

/** Xoá các file cũ trong thư mục để bài đã xoá ở DB cũng biến mất khỏi site. */
async function clearDir(dir, exts) {
  await mkdir(dir, { recursive: true });
  for (const name of await readdir(dir)) {
    if (exts.some((d) => name.endsWith(d))) await rm(join(dir, name));
  }
}

async function syncPosts(supabase, includeDrafts) {
  let query = supabase.from('posts').select('*').order('published_at', { ascending: false });

  /*
    Ở production chỉ lấy bài đã đăng VÀ đã tới ngày. Ở dev lấy hết để xem trước.

    Hai điều kiện, không phải một. Bỏ `lte` thì bài đặt ngày 10/12 lên site ngay
    hôm nay — đặt lịch chẳng có tác dụng gì. Đây chính là lỗi của bản trước.

    Lọc ở đây dù RLS đã lọc, vì `pnpm sync` chạy bằng service key và service key
    ĐI XUYÊN RLS. Chỉ dựa vào policy thì lệnh sync ở máy mình lại là đường duy
    nhất làm rò bài chưa tới hạn.
  */
  if (!includeDrafts) query = query.eq('draft', false).lte('published_at', today());

  const { data, error } = await query;
  if (error) throw new Error(`Đọc bảng posts thất bại: ${error.message}`);

  await clearDir(BLOG_DIR, ['.mdx', '.md']);

  for (const row of data) {
    const frontmatter = buildFrontmatter({
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
    await writeFile(join(BLOG_DIR, `${row.slug}.mdx`), `${frontmatter}\n${body}`, 'utf8');
  }

  return data.length;
}

async function syncProjects(supabase) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('year', { ascending: false });
  if (error) throw new Error(`Đọc bảng projects thất bại: ${error.message}`);

  await clearDir(PROJECTS_DIR, ['.json']);

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
      join(PROJECTS_DIR, `${row.slug}.json`),
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
async function syncViews(supabase) {
  const { data, error } = await supabase
    .from('post_views')
    .select('slug, views')
    .order('views', { ascending: false });

  await mkdir('src/data', { recursive: true });

  if (error) {
    // Bảng lượt xem chưa có (chưa chạy migration) thì đừng làm hỏng build —
    // khối "Đọc nhiều nhất" chỉ đơn giản là không hiện.
    console.warn(`⚠ Không đọc được lượt xem (${error.message}). Ghi file rỗng.`);
    await writeFile(VIEWS_FILE, '{}\n', 'utf8');
    return 0;
  }

  const map = Object.fromEntries(data.map((row) => [row.slug, Number(row.views)]));
  await writeFile(VIEWS_FILE, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return data.length;
}

// --- Chạy ------------------------------------------------------------------

const includeDrafts = process.argv.includes('--drafts');

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
const allowOffline = process.argv.includes('--allow-offline');

/** Có nội dung sẵn trên đĩa để dùng tạm hay không. */
async function hasExistingContent() {
  try {
    return (await readdir(BLOG_DIR)).some((f) => /\.mdx?$/.test(f));
  } catch {
    return false;
  }
}

function skip(lyDo) {
  console.warn(`⚠ ${lyDo}\n  Bỏ qua bước đồng bộ, dùng nội dung đang có trong src/content/.`);
}

/** Project trên supabase.co, không phải stack chạy bằng Docker ở máy. */
function isHosted() {
  return /^https:\/\/[a-z0-9-]+\.supabase\./i.test(SUPABASE_URL);
}

/**
 * Gợi ý cách sửa, chọn theo ĐÚNG nguyên nhân.
 *
 * Bản trước luôn in "Database cục bộ chưa bật? → pnpm db:start". Với project
 * hosted mà chưa chạy migration, câu đó dẫn người đọc đi sai hoàn toàn: database
 * vẫn sống, chỉ là không có bảng nào. Đã mất một lượt debug vì nó.
 */
function fixHint(message) {
  const missingTables = /Could not find the table|does not exist|schema cache/i.test(message);

  if (missingTables && isHosted()) {
    return [
      '  Database kết nối được nhưng CHƯA CÓ BẢNG — chưa chạy migration lần nào.',
      '',
      '  Chạy hai lệnh này (cần mật khẩu database ở Supabase Dashboard →',
      '  Project Settings → Database → Database password):',
      '',
      `      npx supabase link --project-ref ${SUPABASE_URL.replace(/^https:\/\/([^.]+).*$/, '$1')}`,
      '      npx supabase db push',
      '',
      '  Sau đó nạp nội dung mẫu: pnpm db:push',
    ].join('\n');
  }

  if (missingTables) {
    return '  Database chưa có bảng. Dựng lại từ migration: pnpm db:reset';
  }

  if (isHosted()) {
    return [
      '  Kiểm SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong .env.',
      '  Khoá secret bị chặn nếu request trông như đến từ trình duyệt.',
    ].join('\n');
  }

  return [
    '  Database cục bộ chưa bật?  →  pnpm db:start',
    '  Đang chạy `pnpm dev`?      →  lệnh dev đã tự cho phép chạy offline.',
  ].join('\n');
}

/**
 * Bọc vào hàm để `return` dừng được luồng, và KHÔNG dùng `process.exit()`.
 *
 * Trên Windows, `process.exit()` ngay sau nhiều dòng `console.error` làm libuv vỡ
 * assertion (`src\win\async.c`), process bị bắn về mã -1073740791 và dòng
 * assertion in chồng lên đúng phần hướng dẫn cần đọc.
 */
async function main() {
  if (!isConfigured) {
    if (allowOffline || (await hasExistingContent())) {
      return skip('Chưa cấu hình Supabase (thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    }
    console.error(
      '✗ Chưa cấu hình Supabase và cũng không có nội dung nào trong src/content/.\n' +
        '  Chép .env.example thành .env rồi điền SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n' +
        '  Bật database cục bộ: pnpm db:start',
    );
    process.exitCode = 1;
    return;
  }

  // Khoá công khai không thấy bài nháp vì RLS lọc. Với CI thì đúng; với `pnpm dev`
  // ở máy thì người viết sẽ tưởng bài nháp bị mất, nên phải nói rõ.
  if (isPublicKey && includeDrafts) {
    console.warn(
      '⚠ Đang dùng khoá CÔNG KHAI, nên `--drafts` không lấy được bài nháp (RLS lọc).\n' +
        '  Muốn xem bài nháp ở máy thì điền SUPABASE_SERVICE_ROLE_KEY vào .env.',
    );
  }

  try {
    const supabase = createSupabaseClient();
    const postCount = await syncPosts(supabase, includeDrafts);
    const projectCount = await syncProjects(supabase);
    const soLuotXem = await syncViews(supabase);

    console.log(
      `✓ Đồng bộ từ Supabase: ${postCount} bài viết${includeDrafts ? ' (kể cả nháp)' : ''}, ` +
        `${projectCount} dự án, lượt xem của ${soLuotXem} bài.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (allowOffline && (await hasExistingContent())) {
      return skip(`Không đọc được database (${message}).`);
    }

    console.error(`✗ Không đồng bộ được nội dung từ database.\n  ${message}\n`);
    console.error(fixHint(message));
    process.exitCode = 1;
  }
}

await main();
