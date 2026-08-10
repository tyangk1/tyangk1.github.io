import type { APIRoute } from 'astro';

import { SITE, AUTHOR } from '~/site.config';
import { getPostBySlug } from '~/lib/post-live';
import { formatDate } from '~/utils/format';
import { renderOgImage, type OgOptions } from '~/lib/og-image';

/**
 * Ảnh xem trước cho từng bài, sinh LÚC CÓ REQUEST.
 *
 * VÌ SAO ĐỔI
 *
 * Trước đây `getStaticPaths` sinh sẵn `dist/og/*.png` lúc build. Nhưng danh sách bài giờ
 * đọc từ database lúc chạy, nên một bài vừa đăng có `og:image` trỏ tới một file KHÔNG tồn
 * tại — chia sẻ lên Facebook hay Zalo sẽ ra khung trắng. Và đó là loại lỗi không sửa lại
 * được sau khi đã chia sẻ: các nền tảng cache ảnh xem trước theo URL, nên bản trắng dính
 * luôn ở bài đăng đó.
 *
 * Sửa tiêu đề bài cũng vậy: ảnh cũ mang tiêu đề cũ tới lần build kế tiếp.
 *
 * CÁI GIÁ
 *
 * Mỗi ảnh tốn một lần satori + sharp, khoảng vài trăm ms. Tầng cache CDN bên dưới nghĩa là
 * mỗi ảnh chỉ dựng lại một lần mỗi ngày, và người đọc gần như không bao giờ chờ nó —
 * chỉ có bot của mạng xã hội đi lấy.
 */
export const prerender = false;

/** Slug dành riêng cho ảnh mặc định của trang chủ. Không phải bài viết. */
const HOME = 'trang-chu';

export const GET: APIRoute = async ({ params }) => {
  const slug = (params.slug ?? '').replace(/\.png$/, '');

  let options: OgOptions;

  if (slug === HOME) {
    options = {
      title: SITE.tagline,
      eyebrow: SITE.title,
      footer: SITE.url.replace(/^https?:\/\//, ''),
    };
  } else {
    const post = await getPostBySlug(slug, SITE.timeZone);

    /*
      Không có bài thì 404, không phải ảnh mặc định.

      Trả ảnh mặc định cho một slug sai nghe như "an toàn hơn", nhưng nó che mất lỗi: một
      `og:image` gõ sai đường dẫn vẫn ra ảnh, nên không ai phát hiện cho tới khi thấy bài
      nào cũng chia sẻ ra cùng một ảnh.
    */
    if (!post) return new Response('Không có bài này', { status: 404 });

    options = {
      title: post.data.title,
      eyebrow: post.data.seriesName ?? SITE.title,
      footer: `${AUTHOR.name} · ${formatDate(post.data.publishedAt)}`,
    };
  }

  const png = await renderOgImage(options);

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      /*
        KHÔNG dùng `immutable` nữa.

        Bản tĩnh dùng `max-age=31536000, immutable` và điều đó đúng khi ảnh sinh lúc build:
        URL chỉ đổi khi build lại. Giờ nội dung ảnh phụ thuộc tiêu đề bài trong database,
        nên `immutable` là một lời hứa sai — sửa tiêu đề xong thì trình duyệt và CDN vẫn
        giữ ảnh cũ cả năm, và không có cách nào bảo chúng bỏ.

        `s-maxage` một ngày cộng `stale-while-revalidate` một tuần: bot mạng xã hội gần như
        luôn nhận bản đã cache, mà sửa tiêu đề thì trong vòng một ngày ảnh cũng theo.
      */
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
};
