/**
 * Đổi một dòng bảng `posts` thành hình dạng mà trang đang dùng.
 *
 * Vì sao tách riêng: phép map cột-database sang trường-frontmatter trước đây chỉ nằm
 * trong `scripts/db-sync.mjs`. Giờ trang bài đọc thẳng database lúc chạy, nên phép map
 * đó cần cho CẢ HAI đường. Viết bản thứ hai là gieo sẵn một lỗi: thêm một cột rồi chỉ
 * sửa một chỗ, và bài đi đường này sẽ khác bài đi đường kia — thứ không ai phát hiện
 * được bằng cách đọc code, chỉ thấy khi so hai trang thật.
 *
 * `snake_case` ở database, `camelCase` ở frontmatter: đó là quy ước của hai thế giới
 * khác nhau, không phải sự thiếu nhất quán. Chỗ dịch giữa chúng là đúng file này.
 */

/** Một dòng `posts` như PostgREST trả về. Chỉ khai những cột thực sự dùng. */
export interface PostRow {
  slug: string;
  title: string;
  description: string;
  content: string;
  published_at: string;
  content_updated_at: string | null;
  tags: string[] | null;
  takeaways: string[] | null;
  series_name: string | null;
  series_part: number | null;
  cover_image: string | null;
  cover_alt: string | null;
  draft: boolean;
  featured: boolean;
}

/** Các trường frontmatter, đúng tên như trong `src/content.config.ts`. */
export function rowToFrontmatter(row: PostRow) {
  return {
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
  };
}

/**
 * Hình dạng tối thiểu mà trang bài và các hàm trong `~/utils/posts` thực sự đọc.
 *
 * Cố ý KHÔNG cố dựng lại đủ `CollectionEntry<'blog'>`: kiểu đó còn `collection`,
 * `filePath`, `digest`, `rendered`… đều là chi tiết của Content Layer và không có
 * nghĩa gì với một dòng database. Khai đúng phần được đọc thì chỗ nào đọc thêm sẽ
 * hiện ra thành lỗi kiểu, chứ không lặng lẽ thành `undefined` lúc chạy.
 */
export interface PostLike {
  id: string;
  body: string;
  data: {
    title: string;
    description: string;
    publishedAt: Date;
    updatedAt?: Date;
    tags: string[];
    takeaways?: string[];
    seriesName?: string;
    seriesPart?: number;
    coverImage?: string;
    coverAlt?: string;
    draft: boolean;
    featured: boolean;
  };
}

/** `null` của database thành `undefined`, để khớp `optionalField` của schema. */
function opt<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

export function rowToPost(row: PostRow): PostLike {
  return {
    // `id` của Content Layer là tên file không đuôi, và `db-sync` ghi file theo slug —
    // nên `id` và `slug` vốn là một. Giữ đúng như vậy để `postHref(post.id)` và mọi
    // chỗ so sánh `p.id !== post.id` không phải đổi.
    id: row.slug,
    body: row.content,
    data: {
      title: row.title,
      description: row.description,

      /*
        `published_at` là cột `date`, nên PostgREST trả về "2026-08-10" — không có giờ,
        không có múi giờ. `new Date("2026-08-10")` được hiểu là UTC nửa đêm, và đó là
        điều mình muốn ở đây: schema dùng `z.coerce.date()` trên đúng chuỗi ấy, nên
        đường database và đường file cho ra CÙNG một mốc thời gian. Tự ghép giờ địa
        phương vào là làm hai đường lệch nhau đúng một ngày ở một nửa số múi giờ.
      */
      publishedAt: new Date(row.published_at),
      updatedAt: row.content_updated_at ? new Date(row.content_updated_at) : undefined,

      tags: row.tags ?? [],
      takeaways: opt(row.takeaways),
      seriesName: opt(row.series_name),
      seriesPart: opt(row.series_part),

      /*
        Ảnh bìa từ database luôn là URL tuyệt đối (Supabase Storage).

        Schema cho phép `coverImage` là `image()` — file trong `src/assets/`, được Astro
        tối ưu lúc build. Đường này KHÔNG có dạng đó: một dòng database không trỏ được
        vào file trong repo. Chưa bài nào dùng ảnh cục bộ, và nếu dùng thì phải qua
        `pnpm image:upload` để thành URL.
      */
      coverImage: opt(row.cover_image),
      coverAlt: opt(row.cover_alt),

      draft: row.draft,
      featured: row.featured,
    },
  };
}
