/**
 * Kiểm CÚ PHÁP của mọi script trong repo — kể cả script nằm trong file HTML.
 *
 * LỖ HỔNG NÀY ĐÃ LÀM TRẮNG TRANG ADMIN
 *
 * `scripts/admin/index.html` có dòng
 *   toast(Không gọi được deploy: ${j.errors ?? r.status}, 'bad');
 * — mất hai dấu nháy ngược, nên `${...}` không còn là chuỗi mà thành lời gọi hàm sai cú
 * pháp. Một lỗi cú pháp ở bất cứ đâu trong khối script khiến TOÀN BỘ khối không parse, nên
 * admin cục bộ trắng trang hoàn toàn.
 *
 * Không bộ kiểm nào lúc đó thấy: `astro check` không đọc script trong file HTML, `pnpm build`
 * không đụng tới `scripts/`, và không có gì mở trang lên để xem. Nó chỉ lộ ra khi có người
 * mở admin.
 *
 * NGUYÊN NHÂN GỐC, để không lặp lại: here-string `@"..."@` của PowerShell coi dấu nháy ngược
 * là KÝ TỰ ESCAPE và ăn mất nó. Mọi đoạn code đi qua đó đều mất template literal.
 *
 * VÌ SAO KIỂM CÚ PHÁP CHỨ KHÔNG DÒ DẤU NHÁY NGƯỢC: bản đầu tôi dò "dòng có ${ mà không có
 * dấu nháy ngược" và nó cho 34 kết quả, trong đó 33 là dương tính giả — template literal
 * nhiều dòng thì `${` ở dòng giữa hoàn toàn hợp lệ. Kiểm cú pháp thì không có dương tính giả,
 * và nó bắt được MỌI lỗi cú pháp chứ không riêng loại này.
 *
 * Chạy: pnpm check:scripts
 */
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOTS = ['scripts', 'src'];
const SKIP = new Set(['node_modules', 'dist', '.astro', '.vercel', '.playwright-mcp']);

const scratch = mkdtempSync(join(tmpdir(), 'check-scripts-'));
const problems = [];
let checked = 0;

/** Kiểm một đoạn code bằng `node --check`. `label` dùng để báo chỗ trong file gốc. */
function checkCode(code, label) {
  const file = join(scratch, `block-${checked}.mjs`);
  writeFileSync(file, code, 'utf8');
  checked += 1;

  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    const line = out.match(/block-\d+\.mjs:(\d+)/)?.[1];
    const message = out.match(/^\s*(SyntaxError:.*)$/m)?.[1] ?? 'lỗi cú pháp';
    problems.push({ label, line, message });
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;

    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }

    const ext = extname(name);
    const source = () => readFileSync(path, 'utf8');

    if (ext === '.mjs' || ext === '.js') {
      checkCode(source(), path);
      continue;
    }

    /*
      File HTML: tách từng khối `<script>` và kiểm riêng.

      Báo vị trí theo dòng của FILE GỐC, không theo dòng trong khối — người sửa cần biết mở
      file nào ở dòng nào, chứ không cần biết khối thứ mấy.
    */
    if (ext === '.html') {
      const html = source();
      for (const block of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
        const code = block[1];
        if (!code.trim()) continue;

        const startLine = html.slice(0, block.index).split('\n').length;
        const before = problems.length;
        checkCode(code, path);

        // Đổi số dòng trong khối thành số dòng trong file.
        const added = problems[before];
        if (added?.line) added.line = startLine + Number(added.line) - 1;
      }
    }
  }
}

try {
  for (const root of ROOTS) walk(root);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`Đã kiểm cú pháp ${checked} khối script.`);

if (problems.length === 0) {
  console.log('✓ Không có lỗi cú pháp.');
  process.exit(0);
}

console.log('');
for (const p of problems) {
  console.log(`  ✗ ${p.label}${p.line ? `:${p.line}` : ''}`);
  console.log(`      ${p.message}`);
}
process.exit(1);
