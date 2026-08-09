/**
 * Nạp `.env` vào `process.env`.
 *
 * Cần vì các script chạy bằng `node` thuần, không qua Vite — Vite mới là thứ tự đọc
 * `.env` cho code trong `src/`.
 *
 * Trước đây hàm này nằm trong `lib/supabase.mjs`, nên script nào cần đọc biến môi
 * trường cũng phải import module Supabase để lấy tác dụng phụ. Tách ra đây vì nạp
 * biến môi trường không phải việc của module database.
 *
 * KHÔNG ghi đè biến đã có: trên CI, biến đến từ Actions và phải thắng file `.env`
 * (nếu vì lý do gì đó có file đó trong checkout).
 */
import { readFile } from 'node:fs/promises';

/** `.env` trước, `.env.local` sau — nhưng vì không ghi đè, `.env` thắng. */
const FILES = ['.env', '.env.local'];

let daNap = false;

export async function loadEnv() {
  if (daNap) return;
  daNap = true;

  for (const file of FILES) {
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      continue; // Không có file thì bỏ qua — biến có thể đã đặt sẵn ở môi trường.
    }

    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

/** Đọc một biến sau khi đã nạp. Trả '' thay vì undefined để chỗ gọi khỏi phải kiểm. */
export function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}
