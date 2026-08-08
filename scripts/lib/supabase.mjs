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

export const SUPABASE_URL = process.env['SUPABASE_URL'] ?? '';
export const SUPABASE_SERVICE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

/** Đã cấu hình đủ để nói chuyện với database chưa. */
export const daCauHinh = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

export function taoClient() {
  if (!daCauHinh) {
    throw new Error(
      'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Chép .env.example thành .env rồi điền hai giá trị đó.\n' +
        'Chạy Supabase cục bộ: npx supabase start (nó in ra URL và khoá).',
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
