import type { APIRoute, GetStaticPaths } from 'astro';
import { SITE, AUTHOR } from '~/site.config';
import { getPublishedPosts } from '~/utils/posts';
import { formatDate } from '~/utils/format';
import { renderOgImage, type OgOptions } from '~/lib/og-image';

/**
 * Một ảnh xem trước cho mỗi bài viết, cộng thêm một ảnh mặc định cho các trang
 * còn lại. Sinh lúc build, nên `dist/og/*.png` là file tĩnh thuần.
 */
export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getPublishedPosts();

  const postRoutes = posts.map((post) => ({
    params: { slug: post.id },
    props: {
      title: post.data.title,
      eyebrow: post.data.seriesName ?? SITE.title,
      footer: `${AUTHOR.name} · ${formatDate(post.data.publishedAt)}`,
    } satisfies OgOptions,
  }));

  return [
    {
      params: { slug: 'trang-chu' },
      props: {
        title: SITE.tagline,
        eyebrow: SITE.title,
        footer: SITE.url.replace(/^https?:\/\//, ''),
      } satisfies OgOptions,
    },
    ...postRoutes,
  ];
};

export const GET: APIRoute<OgOptions> = async ({ props }) => {
  const png = await renderOgImage(props);

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
