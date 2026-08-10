/**
 * Đặt lại mật khẩu đăng nhập trang `/admin`.
 *
 * Chạy: pnpm admin:password                  (dùng ADMIN_EMAIL trong .env)
 *       pnpm admin:password --email=a@b.com  (chỉ định email khác)
 *
 * MẬT KHẨU ADMIN KHÔNG NẰM Ở ĐÂU CẢ, VÀ ĐÓ LÀ ĐÚNG
 *
 * Nó là mật khẩu của một user Supabase Auth: Supabase lưu bản ĐÃ BĂM trong `auth.users`.
 * Không ai đọc ngược ra được — không phải chủ project, không phải script này, không phải
 * Supabase. Mất thì chỉ có cách đặt lại, và đó là tính chất mong muốn của một hệ thống
 * lưu mật khẩu đúng cách.
 *
 * Nên script này KHÔNG "tìm lại" mật khẩu. Nó sinh mật khẩu mới, đặt vào Auth, ghi vào
 * `.env`, rồi ĐĂNG NHẬP THỬ để chứng minh nó dùng được.
 *
 * VÌ SAO GHI VÀO .env
 *
 * `.env` không phải chỗ dành cho mật khẩu của NGƯỜI — trình quản lý mật khẩu mới là chỗ
 * đúng. Nhưng nó thoả ba điều cần ngay: nằm trên máy, đã gitignore, và tìm được mà không
 * phải hỏi ai. Dòng ghi ra có kèm chú thích nhắc chuyển đi rồi xoá.
 *
 * KHÔNG in mật khẩu ra màn hình. Mật khẩu đi qua terminal là mật khẩu đi vào scrollback,
 * vào log, và vào ảnh chụp màn hình — dự án này đã mất sáu credential đúng theo cách đó.
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadEnv, env } from './lib/env.mjs';

await loadEnv();

const SUPABASE_URL = env('SUPABASE_URL') || env('PUBLIC_SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const PUBLIC_KEY = env('PUBLIC_SUPABASE_ANON_KEY');

const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';

const EMAIL = arg('email') || env('ADMIN_EMAIL');

function exitWithError(...lines) {
  for (const l of lines) console.error(l);
  process.exitCode = 1;
}

/**
 * Mật khẩu ĐỌC ĐƯỢC, dạng `xxxxx-xxxxx-xxxxx-xxxxx`.
 *
 * Mật khẩu bot thì máy đọc nên dùng base64 gì cũng được. Mật khẩu này có lúc phải gõ tay
 * trên điện thoại, nên chia nhóm cho dễ đọc. Bỏ các ký tự dễ nhầm: 0/O, 1/l/I, 2/Z, 5/S.
 *
 * 20 ký tự từ bộ 29 ≈ 97 bit — hơn mọi mật khẩu người tự nghĩ ra.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz346789';

function generatePassword() {
  const chars = [...randomBytes(20)].map((b) => ALPHABET[b % ALPHABET.length]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-');
}

function setOrAppend(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${key}=${value}`) : null;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return exitWithError(
      '✗ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.',
      '  Đặt lại mật khẩu cần quyền admin của Auth, khoá công khai không làm được.',
    );
  }

  if (!EMAIL) {
    return exitWithError(
      '✗ Không biết đặt lại cho ai.',
      '',
      '  pnpm admin:password --email=ban@example.com',
      '',
      '  Hoặc thêm ADMIN_EMAIL vào .env rồi chạy `pnpm admin:password`.',
    );
  }

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const list = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(EMAIL)}`,
    { headers },
  );
  const found = await list.json();
  const user = (found.users ?? []).find((u) => u.email === EMAIL);

  if (!user) {
    return exitWithError(
      `✗ Không thấy tài khoản ${EMAIL} trong Supabase Auth.`,
      '  Kiểm lại email, hoặc tạo tài khoản ở Dashboard → Authentication → Users.',
    );
  }

  const password = generatePassword();

  const upd = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!upd.ok) {
    return exitWithError(`✗ Đặt lại mật khẩu thất bại: ${(await upd.text()).slice(0, 200)}`);
  }
  console.log(`✓ Đã đặt mật khẩu mới cho ${EMAIL}`);

  let dotenv = '';
  try {
    dotenv = readFileSync('.env', 'utf8');
  } catch {}

  let updated = setOrAppend(dotenv, 'ADMIN_PASSWORD', password);
  if (updated !== null) {
    updated = setOrAppend(updated, 'ADMIN_EMAIL', EMAIL) ?? updated;
    writeFileSync('.env', updated, 'utf8');
  } else {
    appendFileSync(
      '.env',
      [
        '',
        '# --- Đăng nhập trang /admin -----------------------------------------------',
        '#',
        '# Hai dòng này KHÔNG được code nào đọc — chúng chỉ ở đây để bạn tìm lại được.',
        '# Mật khẩu thật nằm ở Supabase Auth, đã băm; không ai đọc ngược ra được.',
        '#',
        '# Chuyển vào trình quản lý mật khẩu rồi XOÁ hai dòng này. `.env` đã được',
        '# gitignore, nhưng nó không phải chỗ dành cho mật khẩu của người.',
        `ADMIN_EMAIL=${EMAIL}`,
        `ADMIN_PASSWORD=${password}`,
        '',
      ].join('\n'),
      'utf8',
    );
  }

  console.log('✓ Đã ghi ADMIN_EMAIL và ADMIN_PASSWORD vào .env — mở file đó để xem.');
  console.log(`  (${password.length} ký tự, dạng xxxxx-xxxxx-xxxxx-xxxxx; cố ý KHÔNG in ra đây)`);

  // Đăng nhập thử bằng ĐÚNG đường mà trang /admin dùng: khoá công khai + password grant.
  // Không có bước này thì script chỉ khẳng định là đã đổi, không chứng minh đổi thành cái
  // dùng được.
  if (!PUBLIC_KEY) {
    console.log('⚠ Thiếu PUBLIC_SUPABASE_ANON_KEY nên không đăng nhập thử được.');
    return;
  }

  const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  const auth = await login.json();

  if (!auth.access_token) {
    return exitWithError(
      `✗ Đổi được mật khẩu nhưng ĐĂNG NHẬP THỬ THẤT BẠI (HTTP ${login.status}).`,
      `  ${JSON.stringify(auth).slice(0, 200)}`,
    );
  }

  const posts = await fetch(`${SUPABASE_URL}/rest/v1/posts?select=slug`, {
    headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${auth.access_token}` },
  });
  const rows = await posts.json();

  console.log(`✓ Đăng nhập thử thành công, đọc được ${rows.length} bài (kể cả nháp).`);
  console.log('');
  console.log('  Đăng nhập ở: https://tyangk1.github.io/admin');
}

await main();
