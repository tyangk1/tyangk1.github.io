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
    '# Trang quản trị. Chặn ở đây KHÔNG phải là bảo mật — robots.txt là lời đề',
    '# nghị, ai cũng đọc được và bot xấu thì bỏ qua. Bảo mật thật nằm ở Supabase',
    '# Auth cộng RLS: phải đăng nhập, và phải có tên trong bảng `admins` mới ghi',
    '# được. Dòng này chỉ để trang đăng nhập không xuất hiện trong kết quả tìm kiếm.',
    'Disallow: /admin',
    '',
    `Sitemap: ${absoluteUrl('/sitemap-index.xml')}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
