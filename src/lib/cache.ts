/**
 * Header cache cho những route chạy lúc có request.
 *
 * VÌ SAO CẦN
 *
 * Site tĩnh miễn nhiễm với việc database chập: HTML đã nằm trên CDN. Đổi sang đọc
 * database lúc có request là đánh mất tính miễn nhiễm đó — một lần Supabase nghẽn là
 * trang lỗi. Tầng cache CDN mua lại phần lớn: người đọc thứ hai trong cùng phút không
 * chạm database, và `stale-while-revalidate` cho CDN trả bản cũ trong lúc lấy bản mới,
 * nên một cú nghẽn ngắn không ai thấy.
 *
 * Nó cũng chặn luôn hoá đơn: không có cache thì mỗi người đọc là hai truy vấn Supabase.
 *
 * `max-age=0` cho TRÌNH DUYỆT, `s-maxage` cho CDN
 *
 * Hai con số khác nhau là có chủ đích. Cache trình duyệt nằm trên máy người đọc và
 * KHÔNG xoá được từ xa; cache CDN thì xoá được và xoá có hiệu lực ngay. Nên chỗ nào giữ
 * bản cũ thì phải là chỗ mình còn quyền — đó là CDN. Đặt `max-age=60` là tự khoá mình:
 * sửa xong một bài, xoá cache CDN, mà người vừa đọc vẫn thấy bản cũ suốt một phút và
 * không có cách nào can thiệp.
 */

/**
 * Danh sách bài: trang chủ, /blog, /tags, RSS, sitemap.
 *
 * 60 giây là đánh đổi giữa "bài mới hiện ra nhanh" và "số truy vấn database". Sửa một
 * bài rồi bấm "Đăng ngay" thì đường xoá cache vẫn chạy, nên 60 giây này là mức chờ TỆ
 * NHẤT khi không làm gì cả, không phải mức chờ thường gặp.
 */
export const CACHE_LIST = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

/**
 * Một bài cụ thể.
 *
 * Ngắn hơn danh sách: người sửa bài thường tải lại chính trang đó để xem, nên chờ 60
 * giây ở đây gây khó chịu nhất và tiết kiệm được ít nhất — một bài chỉ có một URL.
 */
export const CACHE_POST = 'public, max-age=0, s-maxage=30, stale-while-revalidate=300';

/** Trang lỗi. Không cache lâu, vì thứ làm nó lỗi thường được sửa ngay sau đó. */
export const CACHE_NOT_FOUND = 'public, max-age=0, s-maxage=10';

/**
 * Không cache gì cả — cho phản hồi phụ thuộc thứ người đọc gõ vào.
 *
 * Dùng cho `/search?q=...`. Hai lý do, và lý do thứ hai mới là lý do chính:
 *
 *  1. Truy vấn tìm kiếm gần như vô hạn biến thể, nên tỉ lệ trúng cache thấp tới mức vô
 *     nghĩa, còn mỗi biến thể lại chiếm một chỗ.
 *  2. Câu người ta gõ vào hộp tìm kiếm là dữ liệu riêng của họ. Vercel cache theo URL đầy
 *     đủ, kể cả query string — nên cache nó nghĩa là giữ lại câu đó trên máy chủ biên.
 *     Không có lý do gì để làm vậy.
 *
 * `/search` KHÔNG có truy vấn thì lại là một trang danh sách bình thường, và nó dùng
 * `CACHE_LIST`. Phân biệt hai trường hợp thay vì chọn một cái cho cả hai.
 */
export const CACHE_PRIVATE = 'no-store';

export function setCache(response: { headers: Headers }, value: string): void {
  response.headers.set('Cache-Control', value);
}
