/**
 * Lấy tự động bốn giá trị cấu hình giscus cho một repo.
 *
 * Thay cho việc mở giscus.app, dán tên repo, rồi copy tay từng ô. Script gọi
 * đúng API mà chính trang đó dùng, nên kết quả giống hệt.
 *
 * Chạy:  pnpm giscus:setup <chu-so-huu>/<ten-repo>
 * Ví dụ: pnpm giscus:setup tenban/blog
 */

/**
 * Thoát với lỗi mà KHÔNG dùng `process.exit()`.
 *
 * Trên Windows, `process.exit()` ngay sau `console.error` nhiều dòng làm libuv
 * vỡ: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file
 * src\win\async.c` — process bị bắn về mã 9 và dòng assertion đó in chồng lên
 * đúng phần hướng dẫn mà người dùng cần đọc. Gán `exitCode` rồi `return` để Node
 * xả hết stdout trước khi kết thúc.
 */
function thoatLoi(...dong) {
  for (const d of dong) console.error(d);
  process.exitCode = 1;
}

/**
 * Bọc vào một hàm để `return` dừng được luồng.
 *
 * Ở phạm vi module thì không có `return`, nên bản trước buộc phải dùng
 * `process.exit(1)` — và chính nó gây ra lỗi libuv nói trên. Đổi sang `exitCode`
 * mà vẫn để code ở phạm vi module thì tệ hơn hẳn: script in lỗi rồi CHẠY TIẾP
 * xuống fetch và ném TypeError vì `data` chưa có gì.
 */
async function main() {
  const repo = process.argv[2];

  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return thoatLoi(
      'Cách dùng: pnpm giscus:setup <chu-so-huu>/<ten-repo>\n' +
        'Ví dụ:     pnpm giscus:setup tenban/blog',
    );
  }

  const res = await fetch(`https://giscus.app/api/discussions/categories?repo=${repo}`);

  if (!res.ok) {
    // giscus trả 403 cho cả ba nguyên nhân dưới đây, nên phải liệt kê hết chứ
    // không đoán bừa một cái.
    return thoatLoi(
      `✗ giscus không đọc được repo "${repo}" (HTTP ${res.status}).\n`,
      'Ba nguyên nhân, kiểm theo đúng thứ tự này:\n',
      '  1. Repo phải PUBLIC.',
      '     Settings → General → Danger Zone → Change visibility\n',
      '  2. Phải bật Discussions.',
      '     Settings → General → Features → tick "Discussions"\n',
      '  3. Phải cài app giscus vào repo đó.',
      '     https://github.com/apps/giscus → Install → chọn repo này\n',
      'Làm xong cả ba thì chạy lại lệnh này.',
    );
  }

  const data = await res.json();
  const categories = data.categories ?? [];

  if (categories.length === 0) {
    return thoatLoi(
      `✗ Repo "${repo}" đã bật Discussions nhưng chưa có category nào.\n` +
        '  Vào tab Discussions của repo, tạo một category (ví dụ "Announcements").',
    );
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

  console.log(
    '\nBản deploy đọc biến lúc BUILD, và .env không được commit — nên phải đặt\n' +
      'cùng bộ giá trị này thành Actions variables. Xem README, mục "Bật bình luận".',
  );
}

await main();
