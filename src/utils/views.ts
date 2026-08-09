import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Post } from '~/utils/posts';

/**
 * Lượt xem, đọc lúc build từ file mà `pnpm sync` sinh ra.
 *
 * Đọc bằng `fs` chứ không `import` file JSON, vì file đó có thể chưa tồn tại
 * (repo mới clone, chưa cấu hình database). `import` một file không có là build
 * hỏng ngay; đọc bằng fs thì bắt được lỗi và trả về rỗng.
 */
const FILE = 'src/data/views.json';

export type BangLuotXem = Record<string, number>;

let cache: BangLuotXem | null = null;

export async function docLuotXem(): Promise<BangLuotXem> {
  if (cache) return cache;

  try {
    const raw = await readFile(resolve(process.cwd(), FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    cache =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as BangLuotXem) : {};
  } catch {
    // Chưa sync hoặc chưa có database — khối "Đọc nhiều nhất" sẽ tự ẩn.
    cache = {};
  }

  return cache;
}

/**
 * Các bài đọc nhiều nhất.
 *
 * Chỉ trả về khi có ÍT NHẤT `toiThieu` bài có lượt xem thật. Blog mới chạy mà
 * hiện "Đọc nhiều nhất: 3 lượt" thì phản tác dụng — nó nói với người đọc rằng
 * chưa ai đọc cả.
 */
export function baiDocNhieuNhat(
  posts: Post[],
  luotXem: BangLuotXem,
  { soLuong = 3, toiThieu = 3, nguongLuot = 20 } = {},
): { post: Post; views: number }[] {
  const xepHang = posts
    .map((post) => ({ post, views: luotXem[post.id] ?? 0 }))
    .filter((x) => x.views >= nguongLuot)
    .sort((a, b) => b.views - a.views);

  return xepHang.length >= toiThieu ? xepHang.slice(0, soLuong) : [];
}

/** "1.284" — dấu phân cách nghìn theo cách viết tiếng Việt. */
export function dinhDangLuot(views: number): string {
  return new Intl.NumberFormat('vi-VN').format(views);
}
