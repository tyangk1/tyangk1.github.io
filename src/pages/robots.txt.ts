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
    // `/sitemap.xml`, không phải `/sitemap-index.xml`: sitemap giờ do
    // `src/pages/sitemap.xml.ts` sinh lúc có request, không phải `@astrojs/sitemap`.
    // Lý do đổi nằm trong file đó — bản integration đã tụt xuống 0 URL bài.
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
