/**
 * Sinh ảnh bìa cho từng bài viết — bằng code, không dùng ảnh stock.
 *
 * Ba lý do chọn cách này thay vì đi tìm ảnh:
 *  1. Nhất quán: mọi bài trông như cùng một toà soạn làm ra.
 *  2. Không tốn công: viết bài xong là có bìa, không phải lục Unsplash.
 *  3. Nhẹ: mỗi ảnh là SVG 2–4KB, sắc nét ở mọi độ phân giải.
 *
 * Kết quả deterministic: cùng một slug luôn cho ra đúng một hình. Bài viết
 * không bao giờ tự đổi bìa giữa hai lần build.
 *
 * KHÔNG có chữ trong SVG. Ảnh được nhúng qua thẻ `<img>`, mà SVG trong `<img>`
 * bị cô lập — không nhận CSS lẫn font của trang, nên chữ sẽ rơi về font hệ thống
 * và lệch hẳn khỏi phần còn lại. Nhãn chủ đề vì vậy được đặt bằng HTML thật lên
 * trên ảnh (xem `PostCard.astro`).
 */

/** 18 tông chia đều vòng màu, cách nhau 20°. */
const HUE_STEPS = 18;

/**
 * Sáu hoạ tiết. Chủ đề khác nhau ra hoạ tiết khác nhau, nên một lưới thẻ nhìn
 * vào là thấy đa dạng — chứ không phải sáu biến thể của cùng một hình.
 */
const MOTIFS = ['arcs', 'grid', 'waves', 'blocks', 'dots', 'bands'] as const;
type Motif = (typeof MOTIFS)[number];

/** Băm chuỗi thành số nguyên 32 bit. FNV-1a, đủ tốt và ngắn. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tag chính quyết định cả tông màu lẫn hoạ tiết, nên các bài cùng chủ đề nhìn
 * vào là nhận ra ngay cùng một họ.
 *
 * Cân nhắc ở đây: có thể chia màu theo thứ tự tag để bảo đảm không tag nào trùng
 * màu, nhưng làm vậy thì thêm một tag mới sẽ đổi màu của tất cả bài cũ. Băm từ
 * tên tag thì màu mỗi bài cố định vĩnh viễn — đổi lại đôi khi hai tag rơi vào
 * cùng tông. Với blog, ổn định quan trọng hơn.
 */
export function hueForTag(tag: string): number {
  return (hash(tag.toLowerCase()) % HUE_STEPS) * (360 / HUE_STEPS);
}

export function motifForTag(tag: string): Motif {
  // Dịch hạt giống đi để hoạ tiết không dính chặt vào màu: hai tag cùng tông
  // vẫn có khả năng ra hai hoạ tiết khác nhau.
  return MOTIFS[hash(`${tag.toLowerCase()}::motif`) % MOTIFS.length] as Motif;
}

interface CoverOptions {
  /** Thường là id bài viết — quyết định các biến thể trong cùng một hoạ tiết. */
  seed: string;
  /** Tag chính — quyết định màu và hoạ tiết. */
  tag: string;
  width?: number;
  height?: number;
}

type Ctx = {
  w: number;
  h: number;
  hue: number;
  random: () => number;
  between: (min: number, max: number) => number;
};

// --- Các hoạ tiết -----------------------------------------------------------

function arcs({ w, h, between }: Ctx): string {
  // Tâm đặt lệch ra ngoài khung: nhìn như một mảng lớn bị cắt, giống cách tạp
  // chí crop ảnh, thay vì một hình tròn nằm gọn giữa khung.
  const cx = between(-0.1, 0.3) * w;
  const cy = between(0.25, 0.85) * h;
  const count = Math.floor(between(6, 10));
  const gap = between(85, 130);

  return Array.from({ length: count }, (_, i) => {
    const r = (i + 1) * gap;
    const o = (0.3 - i * 0.028).toFixed(3);
    const sw = i === count - 3 ? 8 : 1.8;
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="${sw}"/>`;
  }).join('');
}

function grid({ w, h, between }: Ctx): string {
  // Lưới phối cảnh: các đường dọc tụ về một điểm, các đường ngang giãn dần.
  //
  // Số cột, số hàng và độ cong đều lấy từ hạt giống. Bản trước cố định cols=14 và
  // 9 hàng, chỉ cho điểm tụ nhích qua lại — hai bài cùng chủ đề vì thế ra hai
  // hình gần như trùng nhau khi nằm cạnh nhau trong lưới thẻ.
  const vpx = between(0.22, 0.78) * w;
  const vpy = between(-0.5, -0.08) * h;
  const cols = Math.floor(between(9, 19));
  const rows = Math.floor(between(7, 12));
  // Số mũ nhỏ → các hàng ngang gần đều; số mũ lớn → dồn hẳn về đáy.
  const curve = between(1.5, 2.6);

  const verticals = Array.from({ length: cols + 1 }, (_, i) => {
    const x = (i / cols) * w;
    return `<line x1="${x.toFixed(0)}" y1="${h}" x2="${vpx.toFixed(0)}" y2="${vpy.toFixed(0)}" stroke="#fff" stroke-opacity="0.13" stroke-width="1.5"/>`;
  }).join('');

  const horizontals = Array.from({ length: rows }, (_, i) => {
    // Luỹ thừa để khoảng cách giãn ra khi xuống gần đáy — đó là thứ tạo cảm
    // giác chiều sâu.
    const y = h * (0.18 + 0.82 * Math.pow(i / (rows - 1), curve));
    const o = (0.09 + i * 0.022).toFixed(3);
    return `<line x1="0" y1="${y.toFixed(0)}" x2="${w}" y2="${y.toFixed(0)}" stroke="#fff" stroke-opacity="${o}" stroke-width="1.5"/>`;
  }).join('');

  return verticals + horizontals;
}

function waves({ w, h, hue, between }: Ctx): string {
  const count = Math.floor(between(6, 9));
  const amp = between(90, 150);

  return Array.from({ length: count }, (_, i) => {
    const y = h * (0.18 + (i / count) * 0.84);
    const phase = i % 2 === 0 ? 1 : -1;
    const d = `M -60 ${y.toFixed(0)} C ${(w * 0.28).toFixed(0)} ${(y - amp * phase).toFixed(0)}, ${(w * 0.62).toFixed(0)} ${(y + amp * phase).toFixed(0)}, ${w + 60} ${(y - amp * 0.45 * phase).toFixed(0)}`;
    const accent = i === 1 || i === count - 2;
    const o = accent ? between(0.6, 0.8).toFixed(2) : (0.42 - i * 0.035).toFixed(3);
    return `<path d="${d}" fill="none" stroke="${accent ? `hsl(${hue} 88% 70%)` : '#fff'}" stroke-opacity="${o}" stroke-width="${accent ? 9 : 3.5}" stroke-linecap="round"/>`;
  }).join('');
}

function blocks({ w, h, hue, random, between }: Ctx): string {
  const cols = 10;
  const rows = 6;
  const cw = w / cols;
  const ch = h / rows;
  const out: string[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const roll = random();
      // Đa số ô để trống, chỉ một phần nhỏ được tô — mảng trống là thứ giữ cho
      // hoạ tiết trông có chủ đích chứ không rối.
      if (roll > 0.32) continue;

      const inset = between(6, 16);
      const filled = roll < 0.11;
      const x = c * cw + inset;
      const y = r * ch + inset;
      const size = Math.min(cw, ch) - inset * 2;

      out.push(
        filled
          ? `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${size.toFixed(0)}" height="${size.toFixed(0)}" rx="6" fill="hsl(${hue} 75% 68%)" fill-opacity="${between(0.55, 0.9).toFixed(2)}"/>`
          : `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${size.toFixed(0)}" height="${size.toFixed(0)}" rx="6" fill="none" stroke="#fff" stroke-opacity="${between(0.14, 0.3).toFixed(2)}" stroke-width="2"/>`,
      );
    }
  }

  return out.join('');
}

function dots({ w, h, hue, between }: Ctx): string {
  const step = 46;
  const fx = between(0.15, 0.75) * w;
  const fy = between(0.2, 0.8) * h;
  const maxDist = Math.hypot(w, h) * 0.6;
  const out: string[] = [];

  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      // Bán kính giảm dần khi ra xa tiêu điểm — tạo một vùng sáng tụ lại, thay
      // vì một ma trận điểm đều tẻ nhạt.
      const t = Math.min(1, Math.hypot(x - fx, y - fy) / maxDist);
      const r = 9 * (1 - t) + 1.5;
      const o = (0.5 * (1 - t) + 0.05).toFixed(3);
      const color = t < 0.22 ? `hsl(${hue} 85% 72%)` : '#fff';
      out.push(
        `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="${o}"/>`,
      );
    }
  }

  return out.join('');
}

function bands({ w, h, hue, between }: Ctx): string {
  // Góc nghiêng đảo được cả hai chiều. Bản trước chỉ chạy trong khoảng -36..-16
  // nên mọi bìa `bands` đều nghiêng cùng một hướng với cùng một độ — hai bài
  // cùng chủ đề đứng cạnh nhau trông như một ảnh bị dán hai lần.
  const angle = between(0, 1) < 0.5 ? between(-42, -14) : between(14, 42);
  // Pha của dải nhấn cũng lấy từ hạt giống, nên vị trí các dải sáng khác nhau.
  const accentPhase = Math.floor(between(0, 4));
  // Hệ số bề dày: có bìa toàn dải mảnh, có bìa vài dải rất dày.
  const scale = between(0.6, 1.5);
  const out: string[] = [];

  // Dải bị xoay nên phải phủ rộng hơn khung mới không để lộ góc trống: chạy từ
  // -h tới w+h, và cứ điền tới khi hết chiều ngang chứ không cố định số dải.
  const start = -h;
  const end = w + h;
  let x = start;
  let i = 0;

  while (x < end) {
    const bw = between(18, 105) * scale;
    const gap = between(40, 120) * scale;
    // Rải màu nhấn theo chu kỳ để bìa nào cũng có vài dải nổi trong khung.
    const accent = i % 4 === accentPhase;

    out.push(
      `<rect x="${x.toFixed(0)}" y="${(-h * 0.5).toFixed(0)}" width="${bw.toFixed(0)}" height="${(h * 2).toFixed(0)}" fill="${accent ? `hsl(${hue} 84% 66%)` : '#fff'}" fill-opacity="${accent ? between(0.5, 0.72).toFixed(2) : between(0.07, 0.18).toFixed(2)}"/>`,
    );

    x += bw + gap;
    i += 1;
  }

  return `<g transform="rotate(${angle.toFixed(1)} ${(w / 2).toFixed(0)} ${(h / 2).toFixed(0)})">${out.join('')}</g>`;
}

const RENDERERS: Record<Motif, (ctx: Ctx) => string> = {
  arcs,
  grid,
  waves,
  blocks,
  dots,
  bands,
};

// --- Ghép ------------------------------------------------------------------

export function coverSvg({ seed, tag, width = 1600, height = 900 }: CoverOptions): string {
  const random = seededRandom(hash(seed));
  const between = (min: number, max: number) => min + random() * (max - min);

  // Tông gốc lấy từ tag, nhưng lệch nhẹ theo từng bài. ±14° vẫn nằm trong cùng
  // một vùng màu nên nhìn vào biết ngay cùng chủ đề, đủ để hai bài cùng tag
  // không dùng chung đúng một mã màu. Chấm màu ở TagPill vẫn dùng tông gốc —
  // lệch 14° thì mắt không đọc ra là hai màu khác nhau.
  const hue = (hueForTag(tag) + between(-14, 14) + 360) % 360;
  const hue2 = (hue + 26) % 360;
  const motif = motifForTag(tag);

  const ctx: Ctx = { w: width, h: height, hue, random, between };
  const layer = RENDERERS[motif](ctx);

  const glowX = between(0.15, 0.8).toFixed(3);
  const glowY = between(0.15, 0.8).toFixed(3);

  // `preserveAspectRatio="xMidYMid slice"` để ảnh luôn phủ kín khung chứa,
  // giống `object-fit: cover` của ảnh bitmap.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" role="presentation">
  <defs>
    ${
      /* Độ bão hoà và độ sáng cố tình để thấp. Bản trước dùng 56%/20% cộng vệt
         sáng 88% làm những tông như xanh lá loè hẳn ra, đọc như đồ chơi chứ
         không như bìa tạp chí. Bìa là NỀN, không phải thứ giành sự chú ý với
         tiêu đề. */ ''
    }
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 42% 15%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 48% 7%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="${glowX}" cy="${glowY}" r="0.75">
      <stop offset="0" stop-color="hsl(${hue} 62% 45%)" stop-opacity="0.3"/>
      <stop offset="1" stop-color="hsl(${hue} 62% 45%)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="scrim" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="hsl(${hue2} 64% 6%)" stop-opacity="0.75"/>
      <stop offset="0.55" stop-color="hsl(${hue2} 64% 6%)" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <g>${layer}</g>
  ${
    /* Lớp tối dần ở đáy: nhãn chủ đề đặt bằng HTML lên đó luôn đủ tương phản,
       bất kể hoạ tiết bên dưới sáng tối thế nào. */ ''
  }
  <rect width="${width}" height="${height}" fill="url(#scrim)"/>
  ${
    /* Vạch nhận diện ở mép trên. Hạ độ sáng từ 64% xuống 52% — ở 64% nó là thứ
       sáng nhất trên cả trang và hút mắt khỏi tiêu đề. */ ''
  }
  <rect width="${width}" height="6" fill="hsl(${hue} 64% 52%)"/>
</svg>`;
}
