/**
 * Xử lý và tải ảnh lên Supabase Storage — dùng chung cho `pnpm image:upload` và
 * cho trang admin.
 *
 * Tách ra đây vì hai chỗ gọi phải cho ra ĐÚNG một kết quả. Nếu mỗi bên tự xử lý
 * thì sớm muộn chúng lệch nhau: một bên nén WebP một bên không, một bên đặt cache
 * một bên quên. Và cái quên cache thì không ai phát hiện cho tới lúc soi header.
 */
import sharp from 'sharp';

export const BUCKET = 'image-blog';

/**
 * Cache một năm.
 *
 * Supabase mặc định trả `cache-control: no-cache`, nghĩa là mỗi người đọc tải lại
 * ảnh từ đầu — đã đo trên bucket này. Một năm an toàn vì tên file mang nội dung:
 * sửa ảnh thì đổi tên, không ghi đè.
 */
export const CACHE_SECONDS = 31_536_000;

export const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/** Bỏ dấu tiếng Việt và mọi ký tự không an toàn cho URL. */
export function slugifyFileName(ten) {
  return ten
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Nén và thu nhỏ một ảnh.
 *
 * Trả về `{ content, duoi, originalWidth }`. SVG được đẩy nguyên bản: nó là văn bản,
 * sharp không xử lý được như ảnh raster.
 */
export async function processImage(
  originalBuffer,
  duoi,
  { rongToiDa = 1600, keepOriginal = false } = {},
) {
  if (keepOriginal || duoi === '.svg')
    return { content: originalBuffer, duoi, originalWidth: null };

  const image = sharp(originalBuffer);
  const meta = await image.metadata();

  const processed = await image
    // `withoutEnlargement` để ảnh nhỏ hơn ngưỡng không bị kéo giãn thành mờ.
    .resize({ width: rongToiDa, withoutEnlargement: true })
    // Áp EXIF orientation rồi bỏ EXIF — ảnh điện thoại hay bị quay.
    .rotate()
    .webp({ quality: 82 })
    .toBuffer();

  // Chỉ nhận bản WebP nếu nó THẬT SỰ nhỏ hơn. Với ảnh đã tối ưu sẵn hoặc ảnh rất
  // nhỏ, WebP đôi khi phình ra.
  return processed.length < originalBuffer.length
    ? { content: processed, duoi: '.webp', originalWidth: meta.width ?? null }
    : { content: originalBuffer, duoi, originalWidth: meta.width ?? null };
}

/**
 * Xử lý rồi tải lên Storage. Trả về `{ key, url, originalBytes, finalBytes, originalWidth }`.
 * Ném lỗi nếu Storage từ chối.
 */
export async function uploadImage(
  supabase,
  { ten, buffer, duoi, thuMuc, rongToiDa, keepOriginal, ghiDe },
) {
  if (!MIME[duoi]) {
    throw new Error(`Định dạng ${duoi} không nhận. Chỉ nhận: ${Object.keys(MIME).join(' ')}`);
  }

  const {
    content,
    duoi: duoiCuoi,
    originalWidth,
  } = await processImage(buffer, duoi, { rongToiDa, keepOriginal });
  const key = `${slugifyFileName(thuMuc)}/${slugifyFileName(ten) || 'image'}${duoiCuoi}`;

  const { error } = await supabase.storage.from(BUCKET).upload(key, content, {
    contentType: MIME[duoiCuoi],
    cacheControl: String(CACHE_SECONDS),
    upsert: Boolean(ghiDe),
  });

  if (error) {
    throw new Error(
      /exists/i.test(error.message)
        ? `${key} đã tồn tại. Bật ghi đè, hoặc đổi tên file.`
        : `Lỗi tải lên ${key}: ${error.message}`,
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return {
    key,
    url: data.publicUrl,
    originalBytes: buffer.length,
    finalBytes: content.length,
    originalWidth,
  };
}
