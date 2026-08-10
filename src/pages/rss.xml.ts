import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE, AUTHOR } from '~/site.config';
import { getPublishedPosts } from '~/utils/posts';
import { postHref } from '~/lib/routes';

/*
  Chạy lúc có request: người đăng ký RSS phải thấy bài mới ngay, không chờ build.

  RSS là chỗ staleness gây hại rõ nhất — người đọc RSS chủ động chờ bài mới, và một feed
  cũ nghĩa là họ bỏ luôn bài đó chứ không phải thấy muộn.
*/
export const prerender = false;

export const GET: APIRoute = async (context) => {
  const posts = await getPublishedPosts();

  return rss({
    title: SITE.title,
    description: SITE.description,
    // `context.site` lấy từ `site` trong astro.config — bắt buộc phải là URL tuyệt đối.
    site: context.site ?? SITE.url,
    trailingSlash: false,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: postHref(post.id),
      categories: [...post.data.tags],
      author: AUTHOR.email ? `${AUTHOR.email} (${AUTHOR.name})` : undefined,
    })),
    customData: `<language>${SITE.lang}</language>`,
  });
};
