import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';

/**
 * Sinh ảnh xem trước (Open Graph) lúc build.
 *
 * satori dựng SVG từ một cây giống HTML, sharp đổi SVG đó thành PNG.
 * Toàn bộ chạy trên máy build nên người đọc chỉ nhận về một file ảnh tĩnh.
 */

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Đường dẫn tính từ thư mục gốc dự án, KHÔNG dùng `import.meta.url`.
 * Lý do: lúc build, file này bị gom vào một chunk nằm trong `dist/`, nên
 * `import.meta.url` trỏ vào chỗ không có thư mục font. Hàm chỉ chạy trên máy
 * build (Astro luôn chạy từ thư mục gốc dự án) nên `process.cwd()` là mốc đúng.
 */
function fontPath(file: string): string {
  return resolve(process.cwd(), 'src/assets/fonts', file);
}

/**
 * Fontsource cắt font theo subset Unicode, nên không có file nào chứa đủ cả
 * chữ Latin lẫn dấu tiếng Việt. Cách xử lý: nạp cả ba subset thành ba "họ font"
 * riêng rồi để satori tự lùi dần khi một họ thiếu ký tự.
 *
 * Thứ tự quan trọng: subset `vietnamese` phải đứng trước, vì nó là subset duy
 * nhất chứa các chữ như "ế", "ợ", "ữ". Đảo thứ tự thì tiêu đề tiếng Việt sẽ ra
 * một hàng ô vuông.
 */
export const OG_FONT_STACK = 'BeVietnamViet, BeVietnamExt, BeVietnamLatin';

const FONT_FILES = [
  { family: 'BeVietnamViet', subset: 'vietnamese' },
  { family: 'BeVietnamExt', subset: 'latin-ext' },
  { family: 'BeVietnamLatin', subset: 'latin' },
] as const;

let fontCache: Awaited<ReturnType<typeof loadFonts>> | null = null;

async function loadFonts() {
  const weights = [400, 700] as const;

  const fonts = await Promise.all(
    FONT_FILES.flatMap(({ family, subset }) =>
      weights.map(async (weight) => ({
        name: family,
        data: await readFile(fontPath(`be-vietnam-pro-${subset}-${weight}-normal.woff`)),
        weight,
        style: 'normal' as const,
      })),
    ),
  );

  return fonts;
}

export interface OgOptions {
  title: string;
  /** Dòng nhỏ phía trên tiêu đề, thường là tên blog hoặc tên chuyên mục. */
  eyebrow: string;
  /** Dòng nhỏ phía dưới, thường là tên tác giả và ngày đăng. */
  footer: string;
}

const COLORS = {
  bg: '#16181c',
  fg: '#eceef1',
  muted: '#9aa1ab',
  accent: '#6ba3f5',
};

function markup({ title, eyebrow, footer }: OgOptions) {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: COLORS.bg,
        fontFamily: OG_FONT_STACK,
        padding: '72px',
        // Vạch màu nhấn chạy dọc mép trái — dấu hiệu nhận diện đơn giản mà đủ.
        borderLeft: `16px solid ${COLORS.accent}`,
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', fontSize: 28, color: COLORS.accent, letterSpacing: '0.02em' },
            children: eyebrow,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.25,
              color: COLORS.fg,
              // Tiêu đề tối đa 70 ký tự nên luôn vừa; giới hạn này chỉ để phòng.
              maxHeight: 320,
              overflow: 'hidden',
            },
            children: title,
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', fontSize: 28, color: COLORS.muted },
            children: footer,
          },
        },
      ],
    },
  };
}

export async function renderOgImage(options: OgOptions): Promise<ArrayBuffer> {
  fontCache ??= await loadFonts();

  const svg = await satori(markup(options) as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: fontCache,
  });

  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

  // Buffer của Node là một view trên bộ nhớ dùng chung, nên phải cắt đúng đoạn
  // của ảnh này trước khi trả về, không đưa cả vùng nhớ nền ra ngoài.
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
}
