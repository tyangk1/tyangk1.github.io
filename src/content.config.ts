import { defineCollection } from 'astro:content';
// Từ Astro 7, `z` phải lấy từ 'astro/zod' — bản cũ trong 'astro:content' đã bỏ.
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * Trang admin ghi ra `null`, chuỗi rỗng, hoặc mảng rỗng cho mỗi trường tuỳ chọn
 * để trống — Zod thì coi đó là "có giá trị nhưng sai kiểu" và báo lỗi build.
 *
 * Hàm này chạy TRƯỚC khi validate, quy mọi dạng "rỗng" về `undefined`, tức là
 * "không có". Nhờ vậy một bài mới tạo từ admin không cần điền hết mọi trường.
 */
const emptyToUndefined = (value: unknown): unknown =>
  value === null || value === '' || (Array.isArray(value) && value.length === 0)
    ? undefined
    : value;

/** Bọc một schema tuỳ chọn để nó chấp nhận cả các dạng rỗng nói trên. */
function optionalField<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(emptyToUndefined, schema.optional());
}

/**
 * Schema bài viết. Build sẽ FAIL nếu một bài sai schema — cố ý như vậy,
 * để lỗi lộ ra lúc build thay vì lúc độc giả đọc.
 */
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z
      .object({
        /** Ngắn gọn, đặt từ khoá chính ở đầu. Google cắt tiêu đề quá 70 ký tự. */
        title: z.string().min(1).max(70),
        /** Đây chính là meta description. 120–160 ký tự là khoảng Google hiển thị đủ. */
        description: z.string().min(120).max(160),
        publishedAt: z.coerce.date(),
        /** Chỉ điền khi sửa nội dung đáng kể — sẽ hiện "Cập nhật ..." trên bài. */
        updatedAt: optionalField(z.coerce.date()),
        /** 1–5 tag. Ít tag mà dùng nhất quán tốt hơn nhiều tag dùng một lần. */
        tags: z.array(z.string().min(1)).min(1).max(5),
        /**
         * 2–4 câu trả lời cho "bài này cho tôi cái gì", hiện thành hộp ở ĐẦU bài.
         * Giới hạn 4 là có chủ đích: quá bốn dòng thì nó thành mục lục thứ hai và
         * mất tác dụng níu người đọc.
         */
        takeaways: optionalField(z.array(z.string().min(1)).min(2).max(4)),
        /**
         * Ảnh bìa. Bỏ trống thì hệ thống tự sinh bìa bằng code.
         *
         * Nhận HAI dạng:
         *  - `image()`  — file cục bộ trong `src/assets/`. Astro tối ưu lúc build.
         *  - `z.url()`  — URL tuyệt đối, ví dụ ảnh trong Supabase Storage
         *                 (`pnpm anh:upload` in ra URL này).
         *
         * Thứ tự trong union quan trọng: `image()` phải đứng trước. Nó chỉ khớp
         * đường dẫn cục bộ giải được, nên một URL `https://…` sẽ rơi xuống nhánh
         * `z.url()`. Đảo lại thì mọi thứ đều là chuỗi và ảnh cục bộ mất tối ưu.
         */
        coverImage: optionalField(z.union([image(), z.url()])),
        /** Ảnh bìa bắt buộc có mô tả — thiếu là lỗi accessibility. */
        coverAlt: optionalField(z.string().min(1)),
        /** Bài nháp không được build ở production. */
        draft: z.boolean().default(false),
        /** Tối đa 3 bài featured sẽ hiện ở trang chủ. */
        featured: z.boolean().default(false),
        /**
         * Series được biểu diễn bằng HAI trường phẳng, không phải một object lồng.
         *
         * Lý do rất cụ thể: trang admin (Keystatic) không ghi được một object lồng
         * kiểu "có hoặc không" — `fields.conditional` của nó luôn ghi thành
         * `{ discriminant, value }`. Hai trường phẳng thì cả admin lẫn người sửa
         * tay đều biểu diễn được, và frontmatter cũng dễ đọc hơn.
         */
        seriesName: optionalField(z.string().min(1)),
        seriesPart: optionalField(z.number().int().positive()),
      })
      // Có ảnh bìa thì bắt buộc phải có alt.
      .refine((d) => !d.coverImage || Boolean(d.coverAlt), {
        error: 'Bài có `coverImage` thì bắt buộc phải có `coverAlt` để mô tả ảnh.',
        path: ['coverAlt'],
      })
      // Hai trường series phải đi cùng nhau, nếu không phần điều hướng series sẽ hỏng.
      .refine((d) => Boolean(d.seriesName) === (d.seriesPart !== undefined), {
        error: 'Phải điền cả `seriesName` và `seriesPart`, hoặc bỏ trống cả hai.',
        path: ['seriesPart'],
      }),
});

/**
 * Dự án hiện ở trang /projects — mỗi dự án một file JSON.
 *
 * Tách thành nhiều file thay vì một mảng trong `projects.json` để trang admin
 * (Keystatic) quản lý được từng dự án như một bản ghi riêng.
 */
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.json' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    year: z.number().int(),
    status: z.enum(['đang làm', 'hoàn thành', 'tạm dừng']),
    tech: z.array(z.string()),
    // Zod v4 dùng `z.url()` ở cấp cao nhất thay cho `z.string().url()` đã bỏ.
    url: z.url().optional(),
    repo: z.url().optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { blog, projects };
