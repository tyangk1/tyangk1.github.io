import type { APIRoute } from 'astro';
import { absoluteUrl } from '~/utils/format';

/**
 * Sinh robots.txt thay vì để file tĩnh trong `public/`, để URL sitemap luôn
 * khớp với `site` trong astro.config — đổi domain một chỗ là xong.
 */
export const GET: APIRoute = () => {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Trang tìm kiếm sinh nội dung động, không có giá trị với máy tìm kiếm.',
    'Disallow: /search',
    '',
    `Sitemap: ${absoluteUrl('/sitemap-index.xml')}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
