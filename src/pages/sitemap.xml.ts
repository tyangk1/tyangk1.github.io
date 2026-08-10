import type { APIRoute } from 'astro';

import { SITE } from '~/site.config';
import { getPublishedPosts, collectTags } from '~/utils/posts';
import { absoluteUrl } from '~/utils/format';
import { postHref, blogPageHref } from '~/lib/routes';
import { CACHE_DANH_SACH } from '~/lib/cache';

/**
 * Sitemap tự sinh, thay cho `@astrojs/sitemap`.
 *
 * VÌ SAO PHẢI TỰ VIẾT
 *
 * Integration đó liệt kê những route SINH RA FILE lúc build. Trang bài và các trang danh
 * sách giờ chạy lúc có request nên không sinh file nào — đã đo: sitemap tụt còn 22 URL và
 * 0 URL bài, tức Google mất đường phát hiện mọi bài viết. Đó là bước lùi im lặng: file
 * sitemap vẫn tồn tại, vẫn hợp lệ XML, chỉ là không còn bài nào trong đó.
 *
 * Tự sinh còn được thêm một thứ integration không làm được: bài vừa đăng có mặt trong
 * sitemap NGAY, không chờ build.
 *
 * `lastmod` lấy `content_updated_at` nếu có, không thì `published_at`. Không bịa ngày
 * hôm nay cho mọi URL — một sitemap khai mọi trang vừa đổi là một sitemap bị bỏ qua.
 */
export const prerender = false;

interface MucSitemap {
  duong: string;
  suaLuc?: Date;
  /** Ưu tiên tương đối trong site. Chỉ là gợi ý, Google không hứa dùng nó. */
  uuTien?: string;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts();

  const muc: MucSitemap[] = [
    { duong: '/', uuTien: '1.0' },
    { duong: '/blog', uuTien: '0.9' },
    { duong: '/tags', uuTien: '0.5' },
    { duong: '/about', uuTien: '0.7' },
    { duong: '/now', uuTien: '0.4' },
    { duong: '/projects', uuTien: '0.6' },
  ];

  /*
    KHÔNG đưa `/search` và `/admin` vào.

    Cả hai đã bị `robots.txt` chặn, và vừa chặn vừa khai trong sitemap là tín hiệu tự mâu
    thuẫn — sitemap nghĩa là "hãy index trang này". Google sẽ nghe robots.txt nên không có
    hại thật, nhưng nó chỉ đường cho người lạ tới trang đăng nhập một cách vô ích.
  */

  for (const post of posts) {
    muc.push({
      duong: postHref(post.id),
      suaLuc: post.data.updatedAt ?? post.data.publishedAt,
      uuTien: '0.8',
    });
  }

  for (const tag of collectTags(posts)) {
    muc.push({ duong: `/tags/${tag.slug}`, uuTien: '0.5' });
  }

  // Trang 1 là `/blog`, đã có ở trên — phân trang bắt đầu từ trang 2.
  const soTrang = Math.max(1, Math.ceil(posts.length / SITE.postsPerPage));
  for (let p = 2; p <= soTrang; p += 1) {
    muc.push({ duong: blogPageHref(p), uuTien: '0.3' });
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...muc.map((m) =>
      [
        '  <url>',
        `    <loc>${xmlEscape(absoluteUrl(m.duong))}</loc>`,
        m.suaLuc ? `    <lastmod>${m.suaLuc.toISOString().slice(0, 10)}</lastmod>` : '',
        m.uuTien ? `    <priority>${m.uuTien}</priority>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': CACHE_DANH_SACH,
    },
  });
};
