import type { MarkdownHeading } from 'astro';

import { rowToPost, type PostLike, type PostRow } from './post-row.ts';

/**
 * Đọc bài THẲNG TỪ DATABASE lúc có request, không qua bước build.
 *
 * Đây là chỗ bỏ vòng build khỏi đường đăng bài. Content Layer của Astro biên dịch bài
 * lúc build và cất vào `.astro/data-store.json`, nên `getCollection()` luôn trả về bản
 * chụp lúc build — đổi database không làm nó đổi. Trang bài dùng module này thay vì
 * `getCollection()` thì sửa một bài là trang đổi ngay ở lần tải kế tiếp.
 *
 * Dùng khoá anon, KHÔNG dùng service key. Trang này ai cũng gọi được, nên nó phải
 * chạy bằng đúng quyền của người lạ: RLS là thứ chặn bài nháp và bài chưa tới hạn.
 * Đặt service key ở đây là biến mọi lỗi truy vấn thành một đường rò cả bảng.
 */

const REST_PAGE_LIMIT = 200;

function env(name: string): string {
  // `import.meta.env` được thay lúc build; `process.env` đọc được lúc chạy. Thử cả hai
  // để cùng một file dùng được ở dev, ở build tĩnh, và ở máy chủ SSR.
  // `?.` vì Node thuần không định nghĩa `import.meta.env` — xem chú thích cùng chỗ trong
  // `src/site.config.ts`, nơi việc thiếu nó làm chết cả file config.
  const fromVite = (import.meta as { env?: Record<string, string | undefined> }).env;
  return fromVite?.[name] ?? process.env[name] ?? '';
}

/** Ngày hôm nay theo múi giờ của site, dạng YYYY-MM-DD. */
function today(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/**
 * Các cột cần đọc, khai tên rõ ràng thay vì `*`.
 *
 * `content` là cột nặng nhất bảng. Danh sách bài (dùng cho bài liên quan, bài kề,
 * series) KHÔNG cần nó, nên hai truy vấn dùng hai bộ cột khác nhau — bằng không mỗi
 * lần mở một bài là tải toàn bộ chữ của mọi bài.
 */
const COLUMNS_FULL = [
  'slug',
  'title',
  'description',
  'content',
  'published_at',
  'content_updated_at',
  'tags',
  'takeaways',
  'series_name',
  'series_part',
  'cover_image',
  'cover_alt',
  'draft',
  'featured',
].join(',');

const COLUMNS_LIGHT = COLUMNS_FULL.split(',')
  .filter((c) => c !== 'content')
  .join(',');

async function queryPosts(query: string): Promise<PostRow[]> {
  const url = env('PUBLIC_SUPABASE_URL');
  const key = env('PUBLIC_SUPABASE_ANON_KEY');

  if (!url || !key) {
    throw new Error(
      'Thiếu PUBLIC_SUPABASE_URL hoặc PUBLIC_SUPABASE_ANON_KEY — trang bài đọc database lúc chạy nên cần hai biến này.',
    );
  }

  const res = await fetch(`${url}/rest/v1/posts?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    throw new Error(`Đọc bảng posts thất bại (HTTP ${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as PostRow[];
}

/*
  Lọc "đã đăng" ở ĐÂY dù RLS cũng lọc.

  Không phải vì không tin RLS, mà vì hai lý do khác nhau cần hai lớp: RLS bảo vệ khi có
  người gọi API trực tiếp; điều kiện dưới đây bảo vệ khi policy bị sửa sai, và nó nói rõ
  ý định ngay tại chỗ đọc. Cùng đúng một luật với `db-sync.mjs`: `draft = false` VÀ
  `published_at <= hôm nay`. Thiếu điều kiện thứ hai thì đặt lịch không còn nghĩa gì —
  đó đúng là lỗi của bản trước.
*/
function publishedFilter(timeZone: string): string {
  return `draft=eq.false&published_at=lte.${today(timeZone)}`;
}

/** Một bài theo slug. `null` nếu không có, là bài nháp, hoặc chưa tới ngày đăng. */
export async function getPostBySlug(slug: string, timeZone: string): Promise<PostLike | null> {
  const rows = await queryPosts(
    `select=${COLUMNS_FULL}&slug=eq.${encodeURIComponent(slug)}&${publishedFilter(timeZone)}&limit=1`,
  );

  return rows[0] ? rowToPost(rows[0]) : null;
}

/**
 * Danh sách bài đã đăng, mới nhất trước — cho bài liên quan, bài kề, series.
 *
 * Không có `content`, nên `body` là chuỗi rỗng. Chỗ nào cần `body` của bài khác thì
 * phải đọc riêng bài đó; hiện không chỗ nào cần.
 */
export async function fetchPublishedPosts(timeZone: string): Promise<PostLike[]> {
  const rows = await queryPosts(
    `select=${COLUMNS_LIGHT}&${publishedFilter(timeZone)}&order=published_at.desc&limit=${REST_PAGE_LIMIT}`,
  );

  return rows.map((row) => rowToPost({ ...row, content: '' }));
}

export interface SearchHit {
  slug: string;
  title: string;
  description: string;
  published_at: string;
  tags: string[] | null;
  rank: number;
}

/**
 * Tìm bài bằng full-text search của Postgres.
 *
 * Gọi RPC `search_posts` (xem migration `20260815000000_full_text_search.sql`). Hàm đó là
 * `security invoker` nên RLS vẫn áp dụng — khoá anon không lấy được bài nháp, và điều đó
 * đã được kiểm bằng cách tấn công chính nó, có đối chứng.
 *
 * Gọi từ PHÍA MÁY CHỦ chứ không từ trình duyệt. Khoá anon vốn công khai nên đây không
 * phải chuyện bảo mật; lý do là để trang tìm kiếm chạy được khi không có JS, và để chỗ
 * đổi cách tìm kiếm về sau chỉ có một.
 */
export async function searchPosts(q: string, limit = 20): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];

  const url = env('PUBLIC_SUPABASE_URL');
  const key = env('PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Thiếu PUBLIC_SUPABASE_URL hoặc PUBLIC_SUPABASE_ANON_KEY.');

  const res = await fetch(`${url}/rest/v1/rpc/search_posts`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: term, max_results: limit }),
  });

  if (!res.ok) {
    throw new Error(`Tìm kiếm thất bại (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  return (await res.json()) as SearchHit[];
}

/** Giải mã thực thể ký tự, để chữ trong mục lục là chữ chứ không phải `&amp;`. */
function decodeEntities(text: string): string {
  const ENTITY_NAMES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_a, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_a, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (all, ten) => ENTITY_NAMES[ten.toLowerCase()] ?? all);
}

/**
 * Bóc heading từ HTML đã render, để dựng mục lục.
 *
 * Ở đường build, `render(post)` trả sẵn `headings`. Đường này không có, nên phải đọc
 * lại từ HTML. Không phải giải pháp chắp vá: `id` trong HTML CHÍNH LÀ đích mà mục lục
 * trỏ tới, nên lấy từ đó thì mục lục không bao giờ trỏ vào một neo không tồn tại —
 * điều mà tính lại slug từ tiêu đề lần thứ hai không bảo đảm được.
 */
export function headingsFromHtml(html: string): MarkdownHeading[] {
  const hits: MarkdownHeading[] = [];

  for (const m of html.matchAll(/<h([234])\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const text = decodeEntities(
      m[3]!
        // Bỏ neo `#` mà `rehypeContent` chèn vào cuối heading — nó là điều hướng,
        // không phải phần của tiêu đề, và để lại thì mục lục nào cũng có dấu # ở cuối.
        .replace(/<a\b[^>]*class="heading-anchor"[\s\S]*?<\/a>/g, '')
        .replace(/<[^>]+>/g, ''),
    ).trim();

    hits.push({ depth: Number(m[1]), slug: m[2]!, text });
  }

  return hits;
}
