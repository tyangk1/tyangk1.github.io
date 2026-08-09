/**
 * Kiểm một bài viết TRƯỚC khi ghi vào database.
 *
 * Đây là lớp kiểm thứ ba, và nó tồn tại vì lý do trải nghiệm chứ không vì bảo mật:
 *
 *   - Postgres (CHECK constraint) chặn lúc GHI — nhưng thông báo của nó là
 *     `violates check constraint "posts_description_do_dai"`, thứ không nói cho
 *     người viết biết mô tả đang dài bao nhiêu và cần bao nhiêu.
 *   - Zod chặn lúc ĐỌC ở bước build — quá muộn, lúc đó bài đã nằm trong database.
 *
 * Hàm này nói bằng tiếng Việt, ngay lúc đang gõ. Nó KHÔNG thay thế hai lớp kia:
 * mọi ràng buộc ở đây đều đối chiếu 1-1 với CHECK constraint trong
 * `supabase/migrations/20260808000000_khoi_tao_noi_dung.sql`.
 */

/**
 * Múi giờ quyết định "hôm nay" là ngày nào.
 *
 * PHẢI khớp `SITE.timeZone` trong `src/site.config.ts`. Không import được từ đó
 * vì file này còn chạy trong trình duyệt (cả hai trang admin đều nạp nó như ES
 * module), mà trình duyệt không đọc được file TypeScript. `pnpm check:content`
 * so hai giá trị và fail nếu lệch.
 */
export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Hôm nay theo múi giờ blog, dạng `YYYY-MM-DD`.
 *
 * Dùng `Intl` chứ không tự cộng 7 tiếng: cộng tay thì đúng với Việt Nam nhưng sai
 * ngay khi ai đó đổi `TIME_ZONE` sang vùng có giờ mùa hè. `en-CA` là locale duy
 * nhất trong danh sách chuẩn cho ra sẵn `YYYY-MM-DD`.
 */
export function today(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(at);
}

/**
 * Trạng thái thật của một bài, suy ra từ `draft` VÀ `published_at`.
 *
 * Ba trạng thái, không phải hai — đây là chỗ mà bản trước sai: nó chỉ nhìn
 * `draft`, nên bài để ngày ở tương lai vẫn hiện "đã đăng" và lên site ngay.
 *
 *   draft     — còn là nháp, không ai thấy ngoài chính mình.
 *   scheduled — xong rồi nhưng chưa tới ngày. Tới ngày thì TỰ lên, không cần làm gì.
 *   published — đang trên site.
 */
export function postStatus(post, homNay = today()) {
  if (post.draft) return 'draft';
  const date = String(post.published_at ?? '').slice(0, 10);
  return date > homNay ? 'scheduled' : 'published';
}

/** Nhãn tiếng Việt cho ba trạng thái trên, dùng chung cho hai trang admin. */
export const STATUS_LABELS = {
  draft: 'nháp',
  scheduled: 'đặt lịch',
  published: 'đã đăng',
};

export const LIMITS = {
  titleMax: 70,
  descriptionMin: 120,
  descriptionMax: 160,
  tagsMin: 1,
  tagsMax: 5,
  takeawaysMin: 2,
  takeawaysMax: 4,
};

/** Trả về mảng lỗi, rỗng nghĩa là hợp lệ. */
export function validatePost(post) {
  const errors = [];
  const d = (v) => (typeof v === 'string' ? v.trim() : v);

  const slug = d(post.slug) ?? '';
  if (!slug) {
    errors.push({ field: 'slug', message: 'Chưa có slug.' });
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    errors.push({
      field: 'slug',
      message: 'Slug chỉ được dùng chữ thường không dấu, số và gạch ngang.',
    });
  }

  const title = d(post.title) ?? '';
  if (!title) {
    errors.push({ field: 'title', message: 'Chưa có tiêu đề.' });
  } else if (title.length > LIMITS.titleMax) {
    errors.push({
      field: 'title',
      message: `Tiêu đề ${title.length} ký tự, tối đa ${LIMITS.titleMax} — Google cắt phần dôi.`,
    });
  }

  const desc = d(post.description) ?? '';
  if (desc.length < LIMITS.descriptionMin || desc.length > LIMITS.descriptionMax) {
    errors.push({
      field: 'description',
      message: `Mô tả ${desc.length} ký tự, phải trong khoảng ${LIMITS.descriptionMin}–${LIMITS.descriptionMax}.`,
    });
  }

  if (!d(post.content)) {
    errors.push({ field: 'content', message: 'Thân bài đang rỗng.' });
  }

  if (!post.published_at) {
    errors.push({ field: 'published_at', message: 'Chưa có ngày đăng.' });
  }

  const tags = (post.tags ?? []).filter((t) => d(t));
  if (tags.length < LIMITS.tagsMin || tags.length > LIMITS.tagsMax) {
    errors.push({
      field: 'tags',
      message: `Đang có ${tags.length} tag, cần ${LIMITS.tagsMin}–${LIMITS.tagsMax}.`,
    });
  }

  const tk = (post.takeaways ?? []).filter((t) => d(t));
  if (tk.length !== 0 && (tk.length < LIMITS.takeawaysMin || tk.length > LIMITS.takeawaysMax)) {
    errors.push({
      field: 'takeaways',
      message: `Điểm chính đang có ${tk.length} dòng — hoặc bỏ trống hẳn, hoặc ${LIMITS.takeawaysMin}–${LIMITS.takeawaysMax} dòng.`,
    });
  }

  const hasName = Boolean(d(post.series_name));
  const hasPart =
    post.series_part !== null && post.series_part !== undefined && post.series_part !== '';
  if (hasName !== hasPart) {
    errors.push({
      field: 'series',
      message: 'Series phải điền cả tên và số phần, hoặc bỏ trống cả hai.',
    });
  } else if (hasPart && Number(post.series_part) < 1) {
    errors.push({ field: 'series', message: 'Số phần của series phải từ 1 trở lên.' });
  }

  if (d(post.cover_image) && !d(post.cover_alt)) {
    errors.push({
      field: 'cover_alt',
      message: 'Có ảnh bìa thì bắt buộc có mô tả ảnh (alt) — thiếu là lỗi accessibility.',
    });
  }

  return errors;
}

/** Chuẩn hoá dữ liệu form thành đúng hình dạng bảng `posts`. */
export function normalizePost(post) {
  const blankToNull = (v) => {
    const s = typeof v === 'string' ? v.trim() : v;
    return s === '' || s === undefined ? null : s;
  };

  return {
    slug: (post.slug ?? '').trim(),
    title: (post.title ?? '').trim(),
    description: (post.description ?? '').trim(),
    content: post.content ?? '',
    published_at: blankToNull(post.published_at),
    content_updated_at: blankToNull(post.content_updated_at),
    tags: (post.tags ?? []).map((t) => String(t).trim()).filter(Boolean),
    takeaways: (post.takeaways ?? []).map((t) => String(t).trim()).filter(Boolean),
    series_name: blankToNull(post.series_name),
    series_part: blankToNull(post.series_part) === null ? null : Number(post.series_part),
    cover_image: blankToNull(post.cover_image),
    cover_alt: blankToNull(post.cover_alt),
    draft: Boolean(post.draft),
    featured: Boolean(post.featured),
  };
}
