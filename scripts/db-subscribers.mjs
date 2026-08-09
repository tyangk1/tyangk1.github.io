/**
 * Xuất danh sách đăng ký nhận bài mới.
 *
 * Đây là đường DUY NHẤT để đọc danh sách đó: bảng đã bật Row Level Security mà
 * không có policy select nào, nên chỉ khoá `service_role` (chạy ở máy bạn hoặc
 * trên CI) đọc được. Khoá công khai trong trình duyệt không đọc được dòng nào.
 *
 * Chạy:  pnpm db:subscribers                        → xem trên màn hình
 *        pnpm db:subscribers --csv                   → CSV để nạp vào nhà cung cấp mail
 *        pnpm db:subscribers --csv > danh-sach.csv
 */
import { createSupabaseClient } from './lib/supabase.mjs';

const toCsv = process.argv.includes('--csv');
const supabase = createSupabaseClient();

const { data, error } = await supabase
  .from('newsletter_subscribers')
  .select('email, confirmed, confirmed_at, source, created_at, unsubscribed_at')
  .order('created_at', { ascending: true });

if (error) {
  console.error(`✗ Không đọc được danh sách: ${error.message}`);
  process.exit(1);
}

const stillSubscribed = data.filter((r) => !r.unsubscribed_at);
const confirmed = stillSubscribed.filter((r) => r.confirmed);

/**
 * Gom hết thành một chuỗi rồi in một lần, và KHÔNG gọi `process.exit()`.
 *
 * Trên Windows, thoát tiến trình khi stdout còn đang ghi dở làm libuv ném
 * assertion `!(handle->flags & UV_HANDLE_CLOSING)` và mất dòng cuối. Để script
 * tự kết thúc thì stdout được xả hết.
 */
function print(row) {
  console.log(row.join('\n'));
}

if (toCsv) {
  // Chỉ xuất người ĐÃ xác nhận và chưa huỷ — đây là danh sách được phép gửi thư.
  print([
    'email,confirmed_at,source',
    ...confirmed.map((r) => `${r.email},${r.confirmed_at ?? ''},${r.source ?? ''}`),
  ]);
} else {
  const row = [
    `Tổng cộng:      ${data.length}`,
    `Còn theo dõi:   ${stillSubscribed.length}`,
    `Đã xác nhận:    ${confirmed.length}   ← chỉ gửi thư cho nhóm này`,
    `Chưa xác nhận:  ${stillSubscribed.length - confirmed.length}`,
    `Đã huỷ:         ${data.length - stillSubscribed.length}`,
    '',
  ];

  if (data.length === 0) {
    row.push('Chưa có ai đăng ký.');
  } else {
    for (const r of data) {
      const status = r.unsubscribed_at ? 'đã huỷ' : r.confirmed ? 'đã xác nhận' : 'chưa xác nhận';
      row.push(`  ${r.email.padEnd(36)} ${status.padEnd(14)} ${(r.source ?? '').slice(0, 30)}`);
    }

    if (confirmed.length < stillSubscribed.length) {
      row.push(
        '',
        '⚠ Có người chưa xác nhận. Họ chỉ xác nhận được khi bạn gửi email chứa link',
        '  gọi tới hàm confirm_newsletter(). Xem README phần "Newsletter".',
      );
    }
  }

  print(row);
}
