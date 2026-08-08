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
 */
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import sharp from 'sharp';
import { taoClient, daCauHinh } from './lib/supabase.mjs';

const BUCKET = 'anh-blog';

/**
 * Cache một năm.
 *
 * Supabase mặc định trả `cache-control: no-cache`, nghĩa là mỗi người đọc tải lại
 * ảnh từ đầu — đã đo trên bucket này. Một năm là an toàn vì tên file mang nội
 * dung: sửa ảnh thì đổi tên, không ghi đè. Cùng lý do với việc hash tên file
 * trong bản build.
 */
const CACHE_GIAY = 31_536_000;

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/** Bỏ dấu tiếng Việt và mọi ký tự không an toàn cho URL. */
function slugTenFile(ten) {
  return ten
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function docCo(ten, macDinh) {
  const found = process.argv.find((a) => a.startsWith(`--${ten}=`));
  return found ? found.slice(ten.length + 3) : macDinh;
}

const duongDan = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const giuGoc = process.argv.includes('--giu-goc');
const ghiDe = process.argv.includes('--ghi-de');
const rongToiDa = Number(docCo('rong', '1600'));
const thuMuc = slugTenFile(docCo('thu-muc', String(new Date().getFullYear())));

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

    let noiDung = await readFile(path);
    const goc = noiDung.length;
    let duoiCuoi = duoi;

    // SVG là văn bản, sharp không xử lý được như ảnh raster — đẩy nguyên bản.
    if (!giuGoc && duoi !== '.svg') {
      const anh = sharp(noiDung);
      const meta = await anh.metadata();

      // `withoutEnlargement` để ảnh nhỏ hơn ngưỡng không bị kéo giãn thành mờ.
      const daXuLy = await anh
        .resize({ width: rongToiDa, withoutEnlargement: true })
        .rotate() // Áp EXIF orientation rồi bỏ EXIF — ảnh điện thoại hay bị quay.
        .webp({ quality: 82 })
        .toBuffer();

      // Chỉ nhận bản WebP nếu nó thật sự nhỏ hơn. Với ảnh đã tối ưu sẵn hoặc
      // ảnh rất nhỏ, WebP đôi khi lớn hơn bản gốc.
      if (daXuLy.length < noiDung.length) {
        noiDung = daXuLy;
        duoiCuoi = '.webp';
      }

      if (meta.width && meta.width > rongToiDa) {
        console.log(`  ${basename(path)}: ${meta.width}px → ${rongToiDa}px`);
      }
    }

    const ten = slugTenFile(basename(path, duoi)) || 'anh';
    const key = `${thuMuc}/${ten}${duoiCuoi}`;

    const { error } = await supabase.storage.from(BUCKET).upload(key, noiDung, {
      contentType: MIME[duoiCuoi],
      cacheControl: String(CACHE_GIAY),
      upsert: ghiDe,
    });

    if (error) {
      const trung = /exists/i.test(error.message);
      console.error(
        trung
          ? `✗ ${key} đã tồn tại. Thêm --ghi-de để ghi đè, hoặc đổi tên file.`
          : `✗ Lỗi tải lên ${key}: ${error.message}`,
      );
      process.exitCode = 1;
      continue;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
    ketQua.push({ key, url: data.publicUrl, goc, cuoi: noiDung.length });
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
}

await main();
