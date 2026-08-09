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

export const GIOI_HAN = {
  titleToiDa: 70,
  descriptionMin: 120,
  descriptionMax: 160,
  tagsMin: 1,
  tagsMax: 5,
  takeawaysMin: 2,
  takeawaysMax: 4,
};

/** Trả về mảng lỗi, rỗng nghĩa là hợp lệ. */
export function kiemBai(bai) {
  const loi = [];
  const d = (v) => (typeof v === 'string' ? v.trim() : v);

  const slug = d(bai.slug) ?? '';
  if (!slug) {
    loi.push({ truong: 'slug', thongDiep: 'Chưa có slug.' });
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    loi.push({
      truong: 'slug',
      thongDiep: 'Slug chỉ được dùng chữ thường không dấu, số và gạch ngang.',
    });
  }

  const title = d(bai.title) ?? '';
  if (!title) {
    loi.push({ truong: 'title', thongDiep: 'Chưa có tiêu đề.' });
  } else if (title.length > GIOI_HAN.titleToiDa) {
    loi.push({
      truong: 'title',
      thongDiep: `Tiêu đề ${title.length} ký tự, tối đa ${GIOI_HAN.titleToiDa} — Google cắt phần dôi.`,
    });
  }

  const desc = d(bai.description) ?? '';
  if (desc.length < GIOI_HAN.descriptionMin || desc.length > GIOI_HAN.descriptionMax) {
    loi.push({
      truong: 'description',
      thongDiep: `Mô tả ${desc.length} ký tự, phải trong khoảng ${GIOI_HAN.descriptionMin}–${GIOI_HAN.descriptionMax}.`,
    });
  }

  if (!d(bai.content)) {
    loi.push({ truong: 'content', thongDiep: 'Thân bài đang rỗng.' });
  }

  if (!bai.published_at) {
    loi.push({ truong: 'published_at', thongDiep: 'Chưa có ngày đăng.' });
  }

  const tags = (bai.tags ?? []).filter((t) => d(t));
  if (tags.length < GIOI_HAN.tagsMin || tags.length > GIOI_HAN.tagsMax) {
    loi.push({
      truong: 'tags',
      thongDiep: `Đang có ${tags.length} tag, cần ${GIOI_HAN.tagsMin}–${GIOI_HAN.tagsMax}.`,
    });
  }

  const tk = (bai.takeaways ?? []).filter((t) => d(t));
  if (tk.length !== 0 && (tk.length < GIOI_HAN.takeawaysMin || tk.length > GIOI_HAN.takeawaysMax)) {
    loi.push({
      truong: 'takeaways',
      thongDiep: `Điểm chính đang có ${tk.length} dòng — hoặc bỏ trống hẳn, hoặc ${GIOI_HAN.takeawaysMin}–${GIOI_HAN.takeawaysMax} dòng.`,
    });
  }

  const coTen = Boolean(d(bai.series_name));
  const coPhan =
    bai.series_part !== null && bai.series_part !== undefined && bai.series_part !== '';
  if (coTen !== coPhan) {
    loi.push({
      truong: 'series',
      thongDiep: 'Series phải điền cả tên và số phần, hoặc bỏ trống cả hai.',
    });
  } else if (coPhan && Number(bai.series_part) < 1) {
    loi.push({ truong: 'series', thongDiep: 'Số phần của series phải từ 1 trở lên.' });
  }

  if (d(bai.cover_image) && !d(bai.cover_alt)) {
    loi.push({
      truong: 'cover_alt',
      thongDiep: 'Có ảnh bìa thì bắt buộc có mô tả ảnh (alt) — thiếu là lỗi accessibility.',
    });
  }

  return loi;
}

/** Chuẩn hoá dữ liệu form thành đúng hình dạng bảng `posts`. */
export function chuanHoaBai(bai) {
  const rong = (v) => {
    const s = typeof v === 'string' ? v.trim() : v;
    return s === '' || s === undefined ? null : s;
  };

  return {
    slug: (bai.slug ?? '').trim(),
    title: (bai.title ?? '').trim(),
    description: (bai.description ?? '').trim(),
    content: bai.content ?? '',
    published_at: rong(bai.published_at),
    content_updated_at: rong(bai.content_updated_at),
    tags: (bai.tags ?? []).map((t) => String(t).trim()).filter(Boolean),
    takeaways: (bai.takeaways ?? []).map((t) => String(t).trim()).filter(Boolean),
    series_name: rong(bai.series_name),
    series_part: rong(bai.series_part) === null ? null : Number(bai.series_part),
    cover_image: rong(bai.cover_image),
    cover_alt: rong(bai.cover_alt),
    draft: Boolean(bai.draft),
    featured: Boolean(bai.featured),
  };
}
