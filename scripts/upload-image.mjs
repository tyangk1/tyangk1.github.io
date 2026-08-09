/**
 * Ảnh ở máy  →  Supabase Storage  →  in ra URL để dán vào bài.
 *
 * Chạy:
 *   pnpm image:upload ./anh/so-do.png
 *   pnpm image:upload ./anh/*.jpg
 *   pnpm image:upload ./anh/so-do.png --thu-muc=cache-http --rong=1600
 *
 * Cờ:
 *   --thu-muc=<tên>  Thư mục con trong bucket. Mặc định: năm hiện tại.
 *   --rong=<px>      Thu nhỏ về bề rộng này nếu ảnh lớn hơn. Mặc định 1600.
 *   --giu-originalBytes        Không chuyển sang WebP, giữ đúng định dạng gốc.
 *   --ghi-de         Ghi đè nếu đã có file cùng tên.
 *
 * Phần xử lý ảnh nằm ở `lib/anh.mjs` — dùng chung với trang admin, để hai đường
 * vào không bao giờ cho ra kết quả khác nhau.
 */
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { createSupabaseClient, isConfigured } from './lib/supabase.mjs';
import { BUCKET, MIME, uploadImage } from './lib/images.mjs';

function readEnv(ten, macDinh) {
  const found = process.argv.find((a) => a.startsWith(`--${ten}=`));
  return found ? found.slice(ten.length + 3) : macDinh;
}

const paths = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const keepOriginal = process.argv.includes('--giu-originalBytes');
const ghiDe = process.argv.includes('--ghi-de');
const maxWidth = Number(readEnv('rong', '1600'));
const dir = readEnv('thu-muc', String(new Date().getFullYear()));

function exitWithError(...dong) {
  for (const d of dong) console.error(d);
  process.exitCode = 1;
}

async function main() {
  if (!isConfigured) {
    return exitWithError(
      '✗ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.',
      '  Lấy ở Supabase Dashboard → Project Settings → API keys.',
    );
  }

  if (paths.length === 0) {
    return exitWithError(
      'Cách dùng: pnpm image:upload <đường-dẫn-ảnh> [...]',
      '',
      'Cờ:',
      '  --thu-muc=<tên>  Thư mục con trong bucket (mặc định: năm hiện tại)',
      `  --rong=<px>      Thu nhỏ nếu rộng hơn (mặc định ${maxWidth})`,
      '  --giu-originalBytes        Giữ định dạng gốc, không chuyển WebP',
      '  --ghi-de         Ghi đè file cùng tên',
    );
  }

  if (!Number.isFinite(maxWidth) || maxWidth < 100) {
    return exitWithError(`✗ --rong phải là số ≥ 100, nhận được "${readEnv('rong', '')}".`);
  }

  const supabase = createSupabaseClient();
  const ketQua = [];

  for (const path of paths) {
    try {
      await stat(path);
    } catch {
      console.error(`✗ Không thấy file: ${path}`);
      process.exitCode = 1;
      continue;
    }

    const ext = extname(path).toLowerCase();
    if (!MIME[ext]) {
      console.error(`✗ Bỏ qua ${basename(path)} — bucket chỉ nhận: ${Object.keys(MIME).join(' ')}`);
      process.exitCode = 1;
      continue;
    }

    try {
      const r = await uploadImage(supabase, {
        ten: basename(path, ext),
        buffer: await readFile(path),
        ext,
        dir,
        maxWidth,
        keepOriginal,
        ghiDe,
      });

      if (r.originalWidth && r.originalWidth > maxWidth) {
        console.log(`  ${basename(path)}: ${r.originalWidth}px → ${maxWidth}px`);
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
    const saved = r.originalBytes > 0 ? Math.round((1 - r.finalBytes / r.originalBytes) * 100) : 0;
    const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
    console.log(
      `${r.key}  ${kb(r.originalBytes)} → ${kb(r.finalBytes)}${saved > 0 ? ` (-${saved}%)` : ''}`,
    );
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
