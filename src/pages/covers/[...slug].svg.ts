import type { APIRoute, GetStaticPaths } from 'astro';
import { getPublishedPosts } from '~/utils/posts';
import { coverSvg } from '~/lib/cover-image';

/**
 * Ảnh bìa của từng bài, sinh lúc build thành file SVG tĩnh trong `dist/covers/`.
 *
 * Dùng SVG chứ không phải PNG: mỗi file chỉ vài KB (một ảnh PNG tương đương
 * khoảng 60KB), sắc nét ở mọi mật độ điểm ảnh, và không cần sinh nhiều kích cỡ.
 */
export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getPublishedPosts();

  return posts.map((post) => ({
    params: { slug: post.id },
    props: { seed: post.id, tag: post.data.tags[0] ?? 'blog' },
  }));
};

interface Props {
  seed: string;
  tag: string;
}

export const GET: APIRoute<Props> = ({ props }) => {
  return new Response(coverSvg(props), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
