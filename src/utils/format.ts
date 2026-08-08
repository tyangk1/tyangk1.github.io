import { SITE } from '~/site.config';

const longDate = new Intl.DateTimeFormat('vi-VN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: SITE.timeZone,
});

const shortDate = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: SITE.timeZone,
});

/** "8 tháng 8, 2026" — dùng trong nội dung bài. */
export function formatDate(date: Date): string {
  return longDate.format(date);
}

/** "08/08/2026" — dùng ở chỗ hẹp như thẻ bài viết. */
export function formatDateShort(date: Date): string {
  return shortDate.format(date);
}

/** Giá trị cho thuộc tính `datetime` của thẻ <time>, ví dụ "2026-08-08". */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Bỏ dấu tiếng Việt và chuyển thành slug an toàn cho URL.
 * "Kiến trúc hệ thống" -> "kien-truc-he-thong"
 */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      // Sau NFD, dấu thanh tách ra thành ký tự Mark riêng — xoá toàn bộ nhóm Mark.
      .replace(/\p{M}/gu, '')
      // đ/Đ không phải là "d + dấu" nên phải xử lý riêng.
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Ghép URL tuyệt đối từ đường dẫn tương đối. Dùng cho canonical, OG, RSS —
 * những chỗ bắt buộc phải là URL đầy đủ.
 */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).href;
}

/**
 * Chuẩn hoá pathname: bỏ dấu `/` ở cuối (trừ trang chủ) để canonical của
 * `/blog` và `/blog/` không bị Google coi là hai trang khác nhau.
 */
export function canonicalPath(pathname: string): string {
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '');
}
