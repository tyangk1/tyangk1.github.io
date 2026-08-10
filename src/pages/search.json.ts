import type { APIRoute } from 'astro';

import { searchPosts } from '~/lib/post-live';
import { postHref } from '~/lib/routes';

/**
 * Kết quả tìm kiếm dạng JSON, cho phần gõ-tới-đâu-thấy-tới-đó.
 *
 * Trang `/search` tự nó đã render kết quả phía máy chủ khi có `?q=`, nên nó chạy được
 * không cần JS. Endpoint này chỉ để giữ lại cảm giác tức thì của bản Pagefind cũ: gõ thêm
 * một chữ thì danh sách đổi mà không tải lại trang.
 *
 * Trả kèm `href` đã dựng sẵn thay vì để trình duyệt tự ghép từ `slug`. Quy tắc dựng URL
 * bài nằm ở `~/lib/routes`, và có hai bản dựng URL thì sớm muộn chúng lệch nhau.
 */
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q') ?? '';

  try {
    const rows = await searchPosts(q, 20);

    return new Response(
      JSON.stringify({
        q,
        count: rows.length,
        results: rows.map((r) => ({
          slug: r.slug,
          href: postHref(r.slug),
          title: r.title,
          description: r.description,
          published_at: r.published_at,
          tags: r.tags ?? [],
        })),
      }),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          /*
            Không cache ở CDN.

            Truy vấn tìm kiếm là gần như vô hạn biến thể, nên tỉ lệ trúng cache thấp tới
            mức vô nghĩa, còn mỗi biến thể lại chiếm một chỗ trong cache. Tệ hơn: một câu
            người ta gõ vào hộp tìm kiếm là dữ liệu riêng của họ, và không có lý do gì để
            nó nằm lại trên máy chủ biên.
          */
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    /*
      Lỗi tìm kiếm trả 503, KHÔNG trả 200 kèm danh sách rỗng.

      Danh sách rỗng nghĩa là "không có bài nào khớp" — một câu trả lời sai nếu thật ra
      database không trả lời được. Người đọc sẽ kết luận blog không có bài về chủ đề đó và
      đi mất, mà không ai biết đã có lỗi.
    */
    return new Response(
      JSON.stringify({ q, error: 'Không tìm kiếm được lúc này.' }),
      { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
};
