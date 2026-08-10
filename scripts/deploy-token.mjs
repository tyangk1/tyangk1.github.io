/**
 * Đặt token GitHub vào Supabase Vault, để nút "Đăng ngay" gọi được deploy.
 *
 * Chạy: pnpm deploy:token                  (đọc GITHUB_DEPLOY_TOKEN trong .env)
 *       pnpm deploy:token --token=ghp_...  (truyền trực tiếp)
 *
 * VÌ SAO VAULT CHỨ KHÔNG PHẢI MIGRATION
 *
 * Migration nằm trong repo công khai. Token viết vào đó là công bố nó — và không xoá được,
 * vì git giữ lịch sử. Vault mã hoá, và chỉ đọc được qua `vault.decrypted_secrets`, view mà
 * chỉ chủ database đọc; hàm `request_deploy()` là `security definer` nên nó đọc hộ.
 *
 * TOKEN NÀY CẦN QUYỀN GÌ
 *
 * Chỉ cần bắn `repository_dispatch` cho ĐÚNG repo này. Với fine-grained PAT: chọn một repo,
 * quyền Contents = Read and write. KHÔNG cần workflow, không cần org, không cần packages.
 *
 * Token cũ dạng classic (`ghp_...`) cũng chạy nhưng nó có quyền trên MỌI repo của bạn —
 * dùng tạm được, nhưng fine-grained thì blast radius nhỏ hơn hẳn.
 *
 * XOAY TOKEN thì phải chạy lại lệnh này. Không chạy thì nút "Đăng ngay" lặng lẽ trả 401 và
 * chỉ có cron 20 phút còn hoạt động.
 */
import { loadEnv, env } from './lib/env.mjs';
import { resolveAuth, makeRest, SUPABASE_URL } from './lib/db-auth.mjs';

await loadEnv();

const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';

const TOKEN = arg('token') || env('GITHUB_DEPLOY_TOKEN');
const REPO = arg('repo') || env('GITHUB_REPO') || 'tyangk1/tyangk1.github.io';

function exitWithError(...lines) {
  for (const l of lines) console.error(l);
  process.exitCode = 1;
}

async function main() {
  if (!TOKEN) {
    return exitWithError(
      '✗ Chưa có token GitHub.',
      '',
      '  pnpm deploy:token --token=<token>',
      '',
      '  Hoặc thêm GITHUB_DEPLOY_TOKEN vào .env rồi chạy `pnpm deploy:token`.',
      '',
      '  Tạo token: github.com/settings/personal-access-tokens',
      '    Repository access: chỉ repo này',
      '    Permissions: Contents = Read and write',
      '  Chỉ cần thế — token này chỉ dùng để bắn repository_dispatch.',
    );
  }

  // Kiểm token TRƯỚC khi cất. Cất một token sai thì nút "Đăng ngay" trả 401 và không có
  // gì chỉ ra rằng vấn đề nằm ở token — đúng loại lỗi im lặng đáng tránh nhất.
  const probe = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'deploy-token',
    },
  });

  if (!probe.ok) {
    return exitWithError(
      `✗ Token không dùng được với ${REPO}: HTTP ${probe.status}`,
      `  ${(await probe.text()).slice(0, 200)}`,
      '  Chưa cất gì vào Vault.',
    );
  }
  console.log(`✓ Token đọc được ${REPO}`);

  const auth = await resolveAuth();
  if (!auth.isServiceKey) {
    return exitWithError(
      '✗ Lệnh này cần SUPABASE_SERVICE_ROLE_KEY: chỉ chủ database ghi được vào Vault.',
    );
  }
  const rest = makeRest(auth);

  /*
    Ghi qua RPC `set_deploy_secret` chứ không INSERT thẳng vào `vault.secrets`.

    `vault.create_secret` lo phần mã hoá; INSERT thẳng thì cất bản RÕ vào một bảng tên là
    "vault" — tệ hơn cả không dùng Vault, vì nó trông như đã được bảo vệ.
  */
  for (const [name, value] of [
    ['github_deploy_token', TOKEN],
    ['github_repo', REPO],
  ]) {
    await rest('rpc/set_deploy_secret', {
      method: 'POST',
      body: { secret_name: name, secret_value: value },
    });
    console.log(`✓ Đã cất "${name}" vào Vault (${value.length} ký tự, không in ra đây)`);
  }

  console.log('');
  console.log('  Thử: bấm "Đăng ngay" trong admin, hoặc gọi rpc/request_deploy.');
  console.log('  Xoay token GitHub thì chạy lại lệnh này.');
}

await main();
