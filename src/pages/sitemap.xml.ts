import type { APIRoute } from 'astro';

import { SITE } from '~/site.config';
import { getPublishedPosts, collectTags } from '~/utils/posts';
import { absoluteUrl } from '~/utils/format';
import { postHref, blogPageHref } from '~/lib/routes';
import { CACHE_LIST } from '~/lib/cache';

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

interface SitemapEntry {
  path: string;
  lastmod?: Date;
  /** Ưu tiên tương đối trong site. Chỉ là gợi ý, Google không hứa dùng nó. */
  priority?: string;
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

  const entries: SitemapEntry[] = [
    { path: '/', priority: '1.0' },
    { path: '/blog', priority: '0.9' },
    { path: '/tags', priority: '0.5' },
    { path: '/about', priority: '0.7' },
    { path: '/now', priority: '0.4' },
    { path: '/projects', priority: '0.6' },
  ];

  /*
    KHÔNG đưa `/search` và `/admin` vào.

    Cả hai đã bị `robots.txt` chặn, và vừa chặn vừa khai trong sitemap là tín hiệu tự mâu
    thuẫn — sitemap nghĩa là "hãy index trang này". Google sẽ nghe robots.txt nên không có
    hại thật, nhưng nó chỉ đường cho người lạ tới trang đăng nhập một cách vô ích.
  */

  for (const post of posts) {
    entries.push({
      path: postHref(post.id),
      lastmod: post.data.updatedAt ?? post.data.publishedAt,
      priority: '0.8',
    });
  }

  for (const tag of collectTags(posts)) {
    entries.push({ path: `/tags/${tag.slug}`, priority: '0.5' });
  }

  // Trang 1 là `/blog`, đã có ở trên — phân trang bắt đầu từ trang 2.
  const pageCount = Math.max(1, Math.ceil(posts.length / SITE.postsPerPage));
  for (let p = 2; p <= pageCount; p += 1) {
    entries.push({ path: blogPageHref(p), priority: '0.3' });
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((m) =>
      [
        '  <url>',
        `    <loc>${xmlEscape(absoluteUrl(m.path))}</loc>`,
        m.lastmod ? `    <lastmod>${m.lastmod.toISOString().slice(0, 10)}</lastmod>` : '',
        m.priority ? `    <priority>${m.priority}</priority>` : '',
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
      'Cache-Control': CACHE_LIST,
    },
  });
};
