import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE, AUTHOR } from '~/site.config';
import { getPublishedPosts } from '~/utils/posts';
import { postHref } from '~/lib/routes';
import { CACHE_LIST } from '~/lib/cache';

/*
  Chạy lúc có request: người đăng ký RSS phải thấy bài mới ngay, không chờ build.

  RSS là chỗ staleness gây hại rõ nhất — người đọc RSS chủ động chờ bài mới, và một feed
  cũ nghĩa là họ bỏ luôn bài đó chứ không phải thấy muộn.
*/
export const prerender = false;

export const GET: APIRoute = async (context) => {
  const posts = await getPublishedPosts();

  /*
    Header cache phải đặt lên Response mà `rss()` TRẢ VỀ, không phải lên `Astro.response`.

    `rss()` dựng Response riêng của nó, nên header đặt vào `Astro.response` không tới được
    người đọc. Đã đo trên production: `/rss.xml` trả `x-vercel-cache: MISS` ở mọi request,
    493–683 ms, trong khi mọi route khác đã HIT ở khoảng 70 ms. Trình đọc RSS poll đều đặn
    nên đây đúng là chỗ cache có giá nhất.
  */
  const feed = await rss({
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

  feed.headers.set('Cache-Control', CACHE_LIST);

  return feed;
};
