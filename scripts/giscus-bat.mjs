/**
 * Bật bình luận trên BẢN DEPLOY sau khi đã cài app giscus.
 *
 * Vì sao cần script này: `src/env.ts` đọc biến lúc BUILD, và `.env` nằm trong
 * .gitignore — nên bật giscus ở máy KHÔNG làm nó hiện trên site thật. Bản deploy
 * lấy giá trị từ GitHub Actions variables. Thiếu bước đó thì bình luận chạy ở máy
 * mà im lặng tắt trên production, không có lỗi nào để lần ra.
 *
 * Script làm ba việc:
 *   1. Kiểm app giscus ĐÃ được cài chưa. Chưa cài thì dừng — bật biến lúc chưa
 *      cài app khiến mỗi trang bài hiện hộp lỗi "giscus is not installed on this
 *      repository", tệ hơn hẳn so với không có khối bình luận.
 *   2. Tra 4 giá trị cấu hình rồi đặt thành Actions variables.
 *   3. Kích hoạt workflow Deploy để site build lại ngay.
 *
 * Chạy:
 *   GH_TOKEN=<token> pnpm giscus:bat
 *
 * Token cần scope `repo` (để đặt variables) và `workflow` (để chạy Deploy).
 * Tạo ở https://github.com/settings/tokens — và thu hồi sau khi xong.
 */
import { readFile } from 'node:fs/promises';

const REPO = 'tyangk1/tyangk1.github.io';

function thoatLoi(...dong) {
  for (const d of dong) console.error(d);
  process.exitCode = 1;
}

/** Đọc SITE.url để nhắc đúng domain nếu người dùng đã đổi tên miền. */
async function docRepoTuConfig() {
  try {
    const raw = await readFile('.env', 'utf8');
    const m = raw.match(/^\s*#?\s*PUBLIC_GISCUS_REPO=(.+)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch {
    // không có .env thì dùng mặc định
  }
  return REPO;
}

async function main() {
  const token = process.env['GH_TOKEN'] ?? process.env['GITHUB_TOKEN'] ?? '';

  if (!token) {
    return thoatLoi(
      '✗ Thiếu GH_TOKEN.',
      '',
      '  Tạo token ở https://github.com/settings/tokens với scope `repo` + `workflow`,',
      '  rồi chạy:',
      '',
      '      $env:GH_TOKEN="ghp_..."; pnpm giscus:bat        (PowerShell)',
      '      GH_TOKEN=ghp_... pnpm giscus:bat                (bash)',
      '',
      '  Thu hồi token ngay sau khi xong.',
    );
  }

  const repo = await docRepoTuConfig();

  // --- 1. App giscus đã cài chưa ------------------------------------------
  //
  // API của giscus trả 403 cho cả ba nguyên nhân (repo private, chưa bật
  // Discussions, chưa cài app), nhưng repo này đã public và đã bật Discussions
  // nên 403 ở đây chỉ còn một nghĩa: chưa cài app.
  console.log(`Kiểm app giscus trên ${repo}…`);

  const res = await fetch(`https://giscus.app/api/discussions/categories?repo=${repo}`);

  if (!res.ok) {
    return thoatLoi(
      `✗ giscus chưa đọc được repo (HTTP ${res.status}) — app chưa được cài.`,
      '',
      '  Cài tại: https://github.com/apps/giscus',
      `  → Install → chọn repo ${repo}`,
      '',
      '  Bước này phải do chính chủ tài khoản bấm: cài GitHub App là hành động cấp',
      '  quyền, GitHub không có API để làm thay. Cài xong thì chạy lại lệnh này.',
    );
  }

  const data = await res.json();
  const categories = data.categories ?? [];

  if (categories.length === 0) {
    return thoatLoi(
      '✗ Repo đã bật Discussions nhưng chưa có category nào.',
      '  Vào tab Discussions của repo và tạo một category (ví dụ "Announcements").',
    );
  }

  const chon =
    categories.find((c) => c.name === 'Announcements') ??
    categories.find((c) => c.name === 'General') ??
    categories[0];

  console.log(`✓ App đã cài. Dùng category "${chon.name}".`);

  // --- 2. Đặt Actions variables ------------------------------------------
  const bien = {
    PUBLIC_GISCUS_REPO: repo,
    PUBLIC_GISCUS_REPO_ID: data.repositoryId,
    PUBLIC_GISCUS_CATEGORY: chon.name,
    PUBLIC_GISCUS_CATEGORY_ID: chon.id,
  };

  const chung = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const goc = `https://api.github.com/repos/${repo}/actions/variables`;

  for (const [name, value] of Object.entries(bien)) {
    // POST để tạo; đã tồn tại thì API trả 409, lúc đó PATCH để cập nhật.
    let r = await fetch(goc, {
      method: 'POST',
      headers: chung,
      body: JSON.stringify({ name, value }),
    });

    if (r.status === 409) {
      r = await fetch(`${goc}/${name}`, {
        method: 'PATCH',
        headers: chung,
        body: JSON.stringify({ name, value }),
      });
    }

    if (!r.ok) {
      return thoatLoi(
        `✗ Không đặt được biến ${name}: HTTP ${r.status}`,
        '  Token có đủ scope `repo` chưa?',
      );
    }

    console.log(`  ✓ ${name}`);
  }

  // --- 3. Chạy Deploy ----------------------------------------------------
  //
  // Biến chỉ có tác dụng ở lần build TIẾP THEO. Không kích hoạt Deploy thì phải
  // chờ tới lần push sau mới thấy bình luận, và người dùng sẽ tưởng script hỏng.
  const r = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/deploy.yml/dispatches`,
    {
      method: 'POST',
      headers: chung,
      body: JSON.stringify({ ref: 'main' }),
    },
  );

  if (!r.ok) {
    console.error(`\n⚠ Đã đặt biến xong nhưng không chạy được Deploy (HTTP ${r.status}).`);
    console.error('  Token có scope `workflow` chưa? Hoặc tự bấm Run workflow ở tab Actions.');
    process.exitCode = 1;
    return;
  }

  console.log('\n✓ Đã kích hoạt Deploy. Khoảng 1–2 phút nữa bình luận sẽ hiện trên site.');
  console.log(`  Theo dõi: https://github.com/${repo}/actions`);
  console.log('\nĐừng quên bỏ dấu # ở bốn dòng giscus trong .env để bản chạy ở máy cũng có.');
}

await main();
