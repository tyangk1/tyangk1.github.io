/**
 * Chọn cách xác thực với Supabase cho các script chạy tự động.
 *
 * HAI ĐƯỜNG, CHỌN THEO THỨ CÓ SẴN
 *
 *   Ở MÁY  — `SUPABASE_SERVICE_ROLE_KEY` trong `.env`. Tiện, và khoá không rời khỏi máy.
 *   TRÊN CI — tài khoản bot có tên trong bảng `admins`, đăng nhập lấy JWT.
 *
 * VÌ SAO CI KHÔNG DÙNG SERVICE KEY
 *
 * Service key đi xuyên toàn bộ RLS: nó đọc được bảng email người đăng ký, mọi bài nháp,
 * mọi bucket, và cả schema `auth`. Đặt nó vào GitHub Actions là cho một script soạn bài
 * đúng bộ quyền của chủ database.
 *
 * Tài khoản bot thì vẫn bị RLS ràng, quyền của nó do các cột trong bảng `admins` quyết
 * định, và thu hồi bằng cách xoá MỘT DÒNG. Hiện có hai bot với hai bộ quyền khác nhau:
 *
 *   bot soạn bài   can_read_subscribers = false  — ghi bài, KHÔNG thấy email của ai
 *   bot newsletter can_read_subscribers = true   — cần địa chỉ mới gửi được thư
 *
 * Tách ra file này vì cả `ai-draft-post.mjs` lẫn `newsletter-send.mjs` đều cần đúng
 * logic này. Chép hai bản thì sớm muộn một bản sẽ quên nhánh nào đó.
 */
import { loadEnv, env } from './env.mjs';

await loadEnv();

export const SUPABASE_URL = env('SUPABASE_URL') || env('PUBLIC_SUPABASE_URL');

/**
 * @param {object} [opts]
 * @param {string} [opts.emailVar]    tên biến chứa email bot (mỗi việc một bot).
 * @param {string} [opts.passwordVar] tên biến chứa mật khẩu bot.
 * @returns {Promise<{apikey: string, bearer: string, how: string, isServiceKey: boolean}>}
 */
export async function resolveAuth({
  emailVar = 'SUPABASE_BOT_EMAIL',
  passwordVar = 'SUPABASE_BOT_PASSWORD',
} = {}) {
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey) {
    return {
      apikey: serviceKey,
      bearer: serviceKey,
      how: 'service key (ở máy)',
      isServiceKey: true,
    };
  }

  const publicKey = env('PUBLIC_SUPABASE_ANON_KEY');
  const email = env(emailVar);
  const password = env(passwordVar);

  if (!publicKey || !email || !password) {
    throw new Error(
      [
        'Thiếu cách xác thực với database. Cần MỘT trong hai:',
        '',
        '  Ở máy:  SUPABASE_SERVICE_ROLE_KEY',
        `  Trên CI: PUBLIC_SUPABASE_ANON_KEY + ${emailVar} + ${passwordVar}`,
      ].join('\n'),
    );
  }

  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) {
    throw new Error(`Đăng nhập tài khoản bot thất bại: ${JSON.stringify(j).slice(0, 200)}`);
  }

  return {
    apikey: publicKey,
    bearer: j.access_token,
    how: `tài khoản bot ${email}`,
    isServiceKey: false,
  };
}

/**
 * Client supabase-js dùng đúng bộ xác thực đã chọn.
 *
 * Với service key thì đưa thẳng vào chỗ khoá. Với JWT của bot thì khoá vẫn là khoá công
 * khai, còn JWT đi trong header `Authorization` — đó là cách supabase-js hiểu "tôi là
 * người dùng này", và cũng là lý do RLS vẫn áp dụng cho bot.
 */
export async function makeClient(auth) {
  const { createClient } = await import('@supabase/supabase-js');

  return createClient(SUPABASE_URL, auth.apikey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(auth.isServiceKey
      ? {}
      : { global: { headers: { Authorization: `Bearer ${auth.bearer}` } } }),
  });
}

/** Hàm gọi REST đã gắn sẵn xác thực. Ném lỗi kèm nguyên văn phản hồi khi không 2xx. */
export function makeRest(auth) {
  const base = {
    apikey: auth.apikey,
    Authorization: `Bearer ${auth.bearer}`,
    'Content-Type': 'application/json',
  };

  return async function rest(path, { method = 'GET', body, prefer } = {}) {
    const headers = prefer ? { ...base, Prefer: prefer } : base;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${String(text).slice(0, 300)}`);
    return json;
  };
}
