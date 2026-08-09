/**
 * Ảnh ở máy  →  Supabase Storage  →  in ra URL để dán vào bài.
 *
 * Chạy:
 *   pnpm anh:upload ./anh/so-do.png
 *   pnpm anh:upload ./anh/*.jpg
 *   pnpm anh:upload ./anh/so-do.png --thu-muc=cache-http --rong=1600
 *
 * Cờ:
 *   --thu-muc=<tên>  Thư mục con trong bucket. Mặc định: năm hiện tại.
 *   --rong=<px>      Thu nhỏ về bề rộng này nếu ảnh lớn hơn. Mặc định 1600.
 *   --giu-goc        Không chuyển sang WebP, giữ đúng định dạng gốc.
 *   --ghi-de         Ghi đè nếu đã có file cùng tên.
 *
 * Phần xử lý ảnh nằm ở `lib/anh.mjs` — dùng chung với trang admin, để hai đường
 * vào không bao giờ cho ra kết quả khác nhau.
 */
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { taoClient, daCauHinh } from './lib/supabase.mjs';
import { BUCKET, MIME, taiAnhLen } from './lib/anh.mjs';

function docCo(ten, macDinh) {
  const found = process.argv.find((a) => a.startsWith(`--${ten}=`));
  return found ? found.slice(ten.length + 3) : macDinh;
}

const duongDan = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const giuGoc = process.argv.includes('--giu-goc');
const ghiDe = process.argv.includes('--ghi-de');
const rongToiDa = Number(docCo('rong', '1600'));
const thuMuc = docCo('thu-muc', String(new Date().getFullYear()));

function thoatLoi(...dong) {
  for (const d of dong) console.error(d);
  process.exitCode = 1;
}

async function main() {
  if (!daCauHinh) {
    return thoatLoi(
      '✗ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.',
      '  Lấy ở Supabase Dashboard → Project Settings → API keys.',
    );
  }

  if (duongDan.length === 0) {
    return thoatLoi(
      'Cách dùng: pnpm anh:upload <đường-dẫn-ảnh> [...]',
      '',
      'Cờ:',
      '  --thu-muc=<tên>  Thư mục con trong bucket (mặc định: năm hiện tại)',
      `  --rong=<px>      Thu nhỏ nếu rộng hơn (mặc định ${rongToiDa})`,
      '  --giu-goc        Giữ định dạng gốc, không chuyển WebP',
      '  --ghi-de         Ghi đè file cùng tên',
    );
  }

  if (!Number.isFinite(rongToiDa) || rongToiDa < 100) {
    return thoatLoi(`✗ --rong phải là số ≥ 100, nhận được "${docCo('rong', '')}".`);
  }

  const supabase = taoClient();
  const ketQua = [];

  for (const path of duongDan) {
    try {
      await stat(path);
    } catch {
      console.error(`✗ Không thấy file: ${path}`);
      process.exitCode = 1;
      continue;
    }

    const duoi = extname(path).toLowerCase();
    if (!MIME[duoi]) {
      console.error(`✗ Bỏ qua ${basename(path)} — bucket chỉ nhận: ${Object.keys(MIME).join(' ')}`);
      process.exitCode = 1;
      continue;
    }

    try {
      const r = await taiAnhLen(supabase, {
        ten: basename(path, duoi),
        buffer: await readFile(path),
        duoi,
        thuMuc,
        rongToiDa,
        giuGoc,
        ghiDe,
      });

      if (r.rongGoc && r.rongGoc > rongToiDa) {
        console.log(`  ${basename(path)}: ${r.rongGoc}px → ${rongToiDa}px`);
      }

      ketQua.push(r);
    } catch (e) {
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }

  if (ketQua.length === 0) return;

  console.log(`\n✓ Đã tải lên ${ketQua.length} ảnh vào bucket "${BUCKET}".\n`);

  for (const r of ketQua) {
    const giam = r.goc > 0 ? Math.round((1 - r.cuoi / r.goc) * 100) : 0;
    const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
    console.log(`${r.key}  ${kb(r.goc)} → ${kb(r.cuoi)}${giam > 0 ? ` (-${giam}%)` : ''}`);
    console.log(`${r.url}\n`);
  }

  console.log('Dùng làm ảnh bìa — thêm vào frontmatter của bài:');
  console.log(`  coverImage: ${ketQua[0].url}`);
  console.log('  coverAlt: mô tả ảnh bằng một câu\n');
  console.log('Chèn vào giữa bài:');
  console.log(`  <Figure src="${ketQua[0].url}" alt="..." caption="..." />`);
  console.log('\nHoặc dùng trang admin để làm mọi thứ trong một chỗ: pnpm admin');
}

await main();
