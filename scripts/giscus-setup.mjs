/**
 * Lấy tự động bốn giá trị cấu hình giscus cho một repo.
 *
 * Thay cho việc mở giscus.app, dán tên repo, rồi copy tay từng ô. Script gọi
 * đúng API mà chính trang đó dùng, nên kết quả giống hệt.
 *
 * Chạy:  pnpm giscus:setup <chu-so-huu>/<ten-repo>
 * Ví dụ: pnpm giscus:setup tenban/blog
 */

const repo = process.argv[2];

if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.error(
    'Cách dùng: pnpm giscus:setup <chu-so-huu>/<ten-repo>\n' +
      'Ví dụ:     pnpm giscus:setup tenban/blog',
  );
  process.exit(1);
}

const res = await fetch(`https://giscus.app/api/discussions/categories?repo=${repo}`);

if (!res.ok) {
  // giscus trả 403 cho cả ba nguyên nhân dưới đây, nên phải liệt kê hết chứ
  // không đoán bừa một cái.
  console.error(`✗ giscus không đọc được repo "${repo}" (HTTP ${res.status}).\n`);
  console.error('Ba nguyên nhân, kiểm theo đúng thứ tự này:\n');
  console.error('  1. Repo phải PUBLIC.');
  console.error('     Settings → General → Danger Zone → Change visibility\n');
  console.error('  2. Phải bật Discussions.');
  console.error('     Settings → General → Features → tick "Discussions"\n');
  console.error('  3. Phải cài app giscus vào repo đó.');
  console.error('     https://github.com/apps/giscus → Install → chọn repo này\n');
  console.error('Làm xong cả ba thì chạy lại lệnh này.');
  process.exit(1);
}

const data = await res.json();
const categories = data.categories ?? [];

if (categories.length === 0) {
  console.error(
    `✗ Repo "${repo}" đã bật Discussions nhưng chưa có category nào.\n` +
      '  Vào tab Discussions của repo, tạo một category (ví dụ "Announcements").',
  );
  process.exit(1);
}

// Ưu tiên "Announcements": chỉ chủ repo mở được thread mới, nên khách không tạo
// được discussion rác. Đây cũng là lựa chọn giscus khuyến nghị.
const chon =
  categories.find((c) => c.name === 'Announcements') ??
  categories.find((c) => c.name === 'General') ??
  categories[0];

console.log(`✓ Đọc được repo "${repo}".\n`);
console.log(`Category dùng: ${chon.name}`);

if (chon.name !== 'Announcements') {
  console.log(
    '\n⚠ Nên dùng category "Announcements": chỉ chủ repo mở được thread mới,\n' +
      '  nên khách không tạo được discussion rác. Tạo nó ở tab Discussions rồi chạy lại.',
  );
}

console.log('\nDán bốn dòng này vào .env:\n');
console.log(`PUBLIC_GISCUS_REPO=${repo}`);
console.log(`PUBLIC_GISCUS_REPO_ID=${data.repositoryId}`);
console.log(`PUBLIC_GISCUS_CATEGORY=${chon.name}`);
console.log(`PUBLIC_GISCUS_CATEGORY_ID=${chon.id}`);

if (categories.length > 1) {
  console.log(`\nCác category khác nếu muốn đổi:`);
  for (const c of categories) {
    if (c.id !== chon.id) console.log(`  ${c.name.padEnd(22)} ${c.id}`);
  }
}
