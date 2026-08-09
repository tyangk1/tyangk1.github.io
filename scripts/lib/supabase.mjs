/**
 * Client Supabase dùng chung cho các script chạy ở máy / trên CI.
 *
 * Dùng khoá `service_role` chứ không phải `anon`, vì hai script cần quyền mà
 * khoá công khai không có: đọc bài nháp (để xem trước ở dev) và ghi dữ liệu.
 *
 * KHOÁ NÀY KHÔNG BAO GIỜ ĐƯỢC LỌT VÀO CODE PHÍA TRÌNH DUYỆT. Nó bỏ qua toàn bộ
 * Row Level Security. Vì vậy tên biến KHÔNG có tiền tố `PUBLIC_` — Astro chỉ đưa
 * biến `PUBLIC_*` vào bundle client, nên cách đặt tên này tự bảo vệ.
 */
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

/** Đọc .env thủ công vì script chạy bằng `node` thuần, không qua Vite. */
async function napEnv() {
  for (const file of ['.env', '.env.local']) {
    try {
      const raw = await readFile(file, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (process.env[key] !== undefined) continue;
        process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      // Không có file .env thì bỏ qua — biến có thể đã đặt sẵn ở môi trường.
    }
  }
}

await napEnv();

export const SUPABASE_URL = process.env['SUPABASE_URL'] ?? process.env['PUBLIC_SUPABASE_URL'] ?? '';
export const SUPABASE_SERVICE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

/**
 * Khoá công khai, dùng làm phương án dự phòng khi KHÔNG có khoá secret.
 *
 * Vì sao có: workflow tự động publish chỉ cần ĐỌC bài đã đăng, dự án và lượt xem —
 * và khoá công khai đọc được cả ba (đã kiểm: 8 bài kèm `content` đầy đủ, 4 dự án).
 * Nhờ vậy không phải đặt `SUPABASE_SERVICE_ROLE_KEY` vào GitHub Actions. Bí mật
 * không tồn tại ở đó là bí mật không thể rò rỉ ở đó.
 *
 * Giới hạn phải biết: với khoá công khai thì RLS lọc hết bài nháp, nên
 * `--drafts` sẽ KHÔNG thấy bài nháp. Đó là đúng cho CI (production không đăng bài
 * nháp) nhưng sai cho `pnpm dev` ở máy — nên script cảnh báo rõ.
 */
export const SUPABASE_ANON_KEY = process.env['PUBLIC_SUPABASE_ANON_KEY'] ?? '';

/** Khoá thực sự đang dùng, và nó là loại nào. */
export const KHOA = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
export const laKhoaCongKhai = !SUPABASE_SERVICE_KEY && Boolean(SUPABASE_ANON_KEY);

/** Đã cấu hình đủ để nói chuyện với database chưa. */
export const daCauHinh = Boolean(SUPABASE_URL && KHOA);

export function taoClient() {
  if (!daCauHinh) {
    throw new Error(
      'Thiếu SUPABASE_URL, và cả SUPABASE_SERVICE_ROLE_KEY lẫn PUBLIC_SUPABASE_ANON_KEY.\n' +
        'Chép .env.example thành .env rồi điền.\n' +
        'Chạy Supabase cục bộ: npx supabase start (nó in ra URL và khoá).',
    );
  }

  return createClient(SUPABASE_URL, KHOA, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
