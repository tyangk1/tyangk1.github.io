/**
 * Mọi `$('id')` trong JS phải có một `id="…"` tương ứng trong markup.
 *
 * VÌ SAO CẦN
 *
 * Hai admin dùng helper `$(id)` = `document.getElementById(id)`. Xoá hay đổi tên một phần
 * tử trong markup mà quên chỗ gọi thì `$()` trả `null`, rồi `.onclick` trên `null` ném
 * TypeError — và một TypeError lúc khởi tạo làm ĐỨT cả phần còn lại của script. Admin
 * trắng trang, y như lỗi cú pháp.
 *
 * Đã tự tạo ra đúng lỗi này hai lần trong một lượt: bỏ `aside` khỏi trình soạn làm mất
 * `#ds` và ba nút điều hướng, trong khi JS vẫn gọi chúng. `astro check` không bắt được —
 * nó kiểm kiểu, không biết `getElementById` sẽ tìm thấy gì lúc chạy.
 *
 * GIỚI HẠN, nói rõ: chỉ bắt được id viết THẲNG trong `$('...')`. Id dựng động
 * (`$('row-' + i)`) thì không, và không nên cố đoán — đoán sai thì thành báo động giả.
 *
 * Chạy: pnpm check:admin-ids
 */
import { readFileSync } from 'node:fs';

const FILES = ['src/pages/admin.astro', 'scripts/admin/index.html'];

let problems = 0;

for (const file of FILES) {
  const source = readFileSync(file, 'utf8');

  /*
    Bỏ qua dòng comment.

    Lần chạy đầu nó báo `$('btn-list')` là thiếu — nhưng chỗ khớp là chính CHÚ THÍCH tôi vừa
    viết để giải thích rằng nút đó đã bỏ. Đúng cùng loại dương tính giả với bộ dò template
    literal trước đó: quét cả comment thì bắt được cả những chỗ chỉ đang NÓI VỀ code.
  */
  const called = new Set();
  for (const line of source.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) continue;

    for (const m of line.matchAll(/\$\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) called.add(m[1]);
  }

  const declared = new Set();
  for (const m of source.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)) declared.add(m[1]);

  const missing = [...called].filter((id) => !declared.has(id));

  console.log(`${file}: JS gọi ${called.size} id, markup khai ${declared.size}`);

  for (const id of missing) {
    console.log(`  ✗ $('${id}') không có phần tử nào mang id đó`);
    problems += 1;
  }
}

if (problems === 0) {
  console.log('✓ Mọi id JS gọi đều tồn tại trong markup.');
  process.exit(0);
}

console.log(`\n${problems} id bị gọi mà không tồn tại — admin sẽ ném TypeError lúc khởi tạo.`);
process.exit(1);
