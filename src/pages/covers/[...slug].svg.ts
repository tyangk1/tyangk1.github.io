import type { APIRoute } from 'astro';

import { SITE } from '~/site.config';
import { getPostBySlug } from '~/lib/post-live';
import { coverSvg } from '~/lib/cover-image';

/**
 * Ảnh bìa sinh bằng code, dùng cho bài không có ảnh bìa thật.
 *
 * Dùng SVG chứ không phải PNG: mỗi file chỉ vài KB (một ảnh PNG tương đương khoảng 60KB),
 * sắc nét ở mọi mật độ điểm ảnh, và không cần sinh nhiều kích cỡ.
 *
 * Sinh LÚC CÓ REQUEST, cùng lý do như ảnh OG: danh sách bài đọc từ database lúc chạy, nên
 * một bài vừa đăng mà chưa có ảnh bìa sẽ trỏ tới một file không tồn tại. Khác với ảnh OG,
 * chỗ này người đọc THẤY NGAY — ảnh bìa nằm trên thẻ bài ở trang chủ.
 */
export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = (params.slug ?? '').replace(/\.svg$/, '');
  const post = await getPostBySlug(slug, SITE.timeZone);

  if (!post) return new Response('Không có bài này', { status: 404 });

  const svg = coverSvg({ seed: post.id, tag: post.data.tags[0] ?? 'blog' });

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      /*
        Ảnh này chỉ phụ thuộc slug và tag đầu tiên, nên nó gần như không đổi — nhưng
        "gần như" không phải "không bao giờ": đổi tag đầu tiên là đổi màu ảnh bìa. Nên
        vẫn để CDN kiểm lại mỗi ngày thay vì hứa `immutable`.
      */
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
};
