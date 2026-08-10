import { getCollection, type CollectionEntry } from 'astro:content';
import { slugify } from '~/utils/format';
import { SITE } from '~/site.config';
import { layBaiDaDang } from '~/lib/post-live';

export type Post = CollectionEntry<'blog'>;

/**
 * Nguồn duy nhất để lấy bài viết. Mọi trang đều phải đi qua hàm này —
 * nhờ vậy quy tắc "bài nào được lên production" chỉ tồn tại ở một chỗ.
 *
 * Hai điều kiện loại bài ở production:
 *
 *   draft            — còn đang viết.
 *   ngày ở tương lai — đã đặt lịch, chưa tới hạn.
 *
 * Ở dev thì thấy hết, vì mục đích của dev là xem trước thứ chưa lên.
 *
 * Đây là tầng chặn thứ ba sau RLS policy và `db-sync`. Hai tầng kia đã đủ cho
 * luồng bình thường; tầng này bắt trường hợp file MDX được commit tay vào
 * `src/content/blog/` mà không đi qua database.
 */
export async function getPublishedPosts(): Promise<Post[]> {
  try {
    /*
      Database là nguồn sự thật, không phải `src/content/blog`.

      Content Layer biên dịch bài LÚC BUILD, nên `getCollection()` trả về bản chụp lúc
      build và một bài mới không hiện ra tới lần build kế tiếp. Đọc thẳng database ở đây
      làm cho MỌI trang dùng hàm này thành live cùng lúc — trang chủ, tag, RSS, sitemap —
      thay vì phải sửa từng trang một.

      Ép kiểu sang `Post` được giải thích trong `~/lib/post-live`: phần các trang thật sự
      đọc đã khai đủ trong `PostLike`.
    */
    return (await layBaiDaDang(SITE.timeZone)) as unknown as Post[];
  } catch (loi) {
    /*
      Không có database thì CHỈ ở dev mới lùi về file MDX.

      Ở production thì cố tình để lỗi nổ ra. Lùi về bản chụp lúc build nghe như một lưới
      an toàn, nhưng nó có một cách hỏng cụ thể và không sửa lại được: một bài đã bị rút
      xuống nháp vẫn còn trong bản chụp, nên site sẽ ĐĂNG LẠI thứ tác giả vừa rút. Trang
      lỗi thì người ta thấy và sửa; đăng lại bài đã rút thì không ai thấy.

      Ở dev thì ngược lại: `pnpm dev --allow-offline` tồn tại để viết bài khi không có
      mạng, và ở đó bản chụp là đúng thứ cần.
    */
    if (!import.meta.env.DEV) throw loi;

    console.warn(`[posts] không đọc được database, lùi về src/content/blog: ${loi}`);

    const today = todayInSiteZone();
    const posts = await getCollection(
      'blog',
      ({ data }) => import.meta.env.DEV || (!data.draft && postDate(data.publishedAt) <= today),
    );

    return posts.sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
  }
}

/** Hôm nay theo múi giờ blog, dạng `YYYY-MM-DD`. Xem chú thích ở `SITE.timeZone`. */
function todayInSiteZone(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE.timeZone }).format(new Date());
}

/**
 * Ngày đăng của bài dưới dạng `YYYY-MM-DD` để so chuỗi với `todayInSiteZone()`.
 *
 * Frontmatter `publishedAt: 2026-08-10` được Zod đổi thành Date lúc nửa đêm UTC,
 * nên `toISOString()` trả lại đúng ngày đã viết. KHÔNG dùng `Intl` với
 * `SITE.timeZone` ở đây: nó sẽ đổi mốc nửa đêm UTC đó sang giờ Việt Nam và với
 * múi giờ âm sẽ lùi mất một ngày — hai giá trị đang so không cùng bản chất, một
 * cái là ngày người viết gõ ra, cái kia là thời điểm thật.
 */
function postDate(publishedAt: Date): string {
  return publishedAt.toISOString().slice(0, 10);
}

/** Bài được đánh dấu `featured`, dùng cho khối nổi bật ở trang chủ. */
export function featuredPosts(posts: Post[], limit = 3): Post[] {
  return posts.filter((p) => p.data.featured).slice(0, limit);
}

export interface TagCount {
  /** Tên tag hiển thị, giữ nguyên dấu tiếng Việt. */
  name: string;
  /** Dạng dùng trong URL, đã bỏ dấu. */
  slug: string;
  count: number;
}

/** Đếm số bài theo tag, sắp xếp nhiều bài nhất lên trước. */
export function collectTags(posts: Post[]): TagCount[] {
  const map = new Map<string, TagCount>();

  for (const post of posts) {
    for (const name of post.data.tags) {
      const slug = slugify(name);
      const existing = map.get(slug);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(slug, { name, slug, count: 1 });
      }
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
}

export function postsByTag(posts: Post[], tagSlug: string): Post[] {
  return posts.filter((post) => post.data.tags.some((t: string) => slugify(t) === tagSlug));
}

/**
 * Bài liên quan: chấm điểm theo số tag trùng, hoà thì bài mới hơn thắng.
 * Đủ tốt cho blog cá nhân và không cần thêm bất kỳ dependency nào.
 */
export function relatedPosts(current: Post, all: Post[], limit = 3): Post[] {
  const currentTags = new Set(current.data.tags.map((t: string) => slugify(t)));

  return all
    .filter((p) => p.id !== current.id)
    .map((post) => ({
      post,
      score: post.data.tags.filter((t: string) => currentTags.has(slugify(t))).length,
    }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.post.data.publishedAt.valueOf() - a.post.data.publishedAt.valueOf(),
    )
    .slice(0, limit)
    .map((x) => x.post);
}

/**
 * Bài trước / bài sau theo thứ tự thời gian.
 * `posts` phải là mảng đã sắp xếp mới nhất trước (kết quả của getPublishedPosts).
 */
export function adjacentPosts(
  current: Post,
  posts: Post[],
): { newer: Post | undefined; older: Post | undefined } {
  const index = posts.findIndex((p) => p.id === current.id);
  if (index === -1) return { newer: undefined, older: undefined };
  return { newer: posts[index - 1], older: posts[index + 1] };
}

/** Các bài cùng series, sắp theo thứ tự phần. */
export function seriesPosts(current: Post, posts: Post[]): Post[] {
  const name = current.data.seriesName;
  if (!name) return [];

  return posts
    .filter((p) => p.data.seriesName === name)
    .sort((a, b) => (a.data.seriesPart ?? 0) - (b.data.seriesPart ?? 0));
}
