import { getCollection, type CollectionEntry } from 'astro:content';
import { slugify } from '~/utils/format';
import { SITE } from '~/site.config';

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
  const homNay = ngayHomNay();

  const posts = await getCollection(
    'blog',
    ({ data }) => import.meta.env.DEV || (!data.draft && ngayCuaBai(data.publishedAt) <= homNay),
  );

  return posts.sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
}

/** Hôm nay theo múi giờ blog, dạng `YYYY-MM-DD`. Xem chú thích ở `SITE.timeZone`. */
function ngayHomNay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE.timeZone }).format(new Date());
}

/**
 * Ngày đăng của bài dưới dạng `YYYY-MM-DD` để so chuỗi với `ngayHomNay()`.
 *
 * Frontmatter `publishedAt: 2026-08-10` được Zod đổi thành Date lúc nửa đêm UTC,
 * nên `toISOString()` trả lại đúng ngày đã viết. KHÔNG dùng `Intl` với
 * `SITE.timeZone` ở đây: nó sẽ đổi mốc nửa đêm UTC đó sang giờ Việt Nam và với
 * múi giờ âm sẽ lùi mất một ngày — hai giá trị đang so không cùng bản chất, một
 * cái là ngày người viết gõ ra, cái kia là thời điểm thật.
 */
function ngayCuaBai(publishedAt: Date): string {
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
