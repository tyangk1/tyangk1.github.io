/**
 * So HTML do renderer runtime sinh ra với HTML mà bản build MDX đã sinh ra.
 *
 * Đây là bộ kiểm giữ cho hai đường render không lệch nhau. Nội dung bài giờ có thể
 * đi hai đường: qua `@astrojs/mdx` lúc build, hoặc qua `src/lib/render-content.ts`
 * lúc lưu bài. Hai đường cho ra HTML khác nhau nghĩa là bài đổi hình dạng tuỳ theo
 * đường nó đi — và không ai phát hiện ra cho tới khi nhìn một trang thật.
 *
 * Cách so: lấy thân bài trong `<div class="prose mt-10">` của trang đã build, đối
 * chiếu với kết quả render nguồn MDX tương ứng. Cần `pnpm build` trước.
 *
 *   node scripts/check-renderer.mjs          # tóm tắt
 *   node scripts/check-renderer.mjs --chi-tiet   # in chỗ lệch đầu tiên
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

import { renderContent } from '../src/lib/render-content.ts';

const CHI_TIET = process.argv.includes('--chi-tiet');
const MO = '<div class="prose mt-10">';

/**
 * Cắt phần bên trong `<div class="prose mt-10">`, đếm độ sâu thẻ div.
 *
 * Không thể tìm `</div>` đầu tiên: thân bài có `div` lồng bên trong (`code-block`,
 * `table-scroll`, `steps`), nên cách đó cắt giữa bài.
 */
function catThanBai(html) {
  const batDau = html.indexOf(MO);
  if (batDau === -1) return null;

  const i = batDau + MO.length;
  const het = hetThe(html, i, 'div', 1);

  return het === -1 ? null : boTakeaways(html.slice(i, het));
}

/** Vị trí thẻ đóng cân với `sau` thẻ mở đang hở, bắt đầu dò từ `tu`. */
function hetThe(html, tu, tag, sau) {
  const re = new RegExp(`<(/?)${tag}\\b`, 'g');
  re.lastIndex = tu;

  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    sau += m[1] ? -1 : 1;
    if (sau === 0) return m.index;
  }

  return -1;
}

/**
 * Bỏ hộp "điểm chính" ở đầu `.prose`.
 *
 * Hộp đó do template trang sinh ra từ frontmatter `takeaways`, KHÔNG có trong file
 * MDX — xem `[slug].astro`. Không bỏ nó thì mọi bài đều báo lệch ngay ký tự đầu, và
 * bộ kiểm chỉ đo đúng một thứ: chỗ tôi cắt sai.
 */
function boTakeaways(prose) {
  const s = prose.trimStart();
  if (!s.startsWith('<aside class="takeaways"')) return prose;

  const het = hetThe(s, 0, 'aside', 0);
  return het === -1 ? prose : s.slice(s.indexOf('>', het) + 1);
}

/** Bỏ frontmatter YAML để còn lại đúng thân bài. */
function boFrontmatter(mdx) {
  const m = mdx.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? mdx.slice(m[0].length) : mdx;
}

/**
 * Chuẩn hoá khoảng trắng giữa các thẻ trước khi so.
 *
 * Astro và bộ xử lý markdown đặt xuống dòng ở những chỗ khác nhau giữa các thẻ khối.
 * Chỗ đó không ảnh hưởng gì tới thứ người đọc thấy, nên nếu so từng byte thì mọi bài
 * đều "lệch" và bộ kiểm này thành vô dụng. Khác biệt THẬT là thẻ, thuộc tính, chữ.
 */
/**
 * Đưa hai bên về một cách viết, để chỉ còn khác biệt THẬT.
 *
 * Bộ kiểm này KHÔNG so từng byte, và đây là danh sách đầy đủ những gì được bỏ qua —
 * đọc nó trước khi tin kết quả. Cả bốn thứ dưới đây dựng ra DOM y hệt nhau; giữ
 * chúng lại thì mọi bài đều báo lệch và bộ kiểm mất hết giá trị.
 *
 *  1. Xuống dòng và thụt lề giữa các thẻ khối.
 *  2. Cách viết thực thể ký tự — xem `dongNhatThucThe`.
 *  3. `class=""` so với `class` trần (Astro viết cách sau cho chuỗi rỗng).
 *  4. `<path/>` so với `<path></path>`, và khoảng trắng trong `style`.
 *  5. Ký tự được escape trong nội dung văn bản — xem `dongNhatVanBan`.
 *
 * Khác biệt thật là: thẻ, tên thuộc tính, giá trị thuộc tính, và chữ.
 */
function chuanHoa(html) {
  return dongNhatVanBan(dongNhatThucThe(html))
    .replace(/\s+/g, ' ')
    .replace(/style="([^"]*)"/g, (_all, css) => `style="${dongNhatCss(css)}"`)
    .replace(/ ([a-z-]+)=""/g, ' $1')
    .replace(/\s*\/>/g, '>')
    .replace(/<\/(path|rect|circle|line|polyline|polygon|ellipse)>/g, '')
    .replace(/> </g, '><')
    .trim();
}

/**
 * Bỏ escape của `"` `'` `>` trong NỘI DUNG VĂN BẢN.
 *
 * Hai serializer chọn escape khác nhau: Astro ghi `&quot;` `&#39;` `&gt;`, còn
 * rehype-stringify ghi ký tự trần. Ở nội dung văn bản, ba ký tự đó KHÔNG cần escape —
 * trình duyệt dựng ra cùng một text node. Ban đầu tôi tưởng đây là chuyện riêng của
 * code block và chỉ xử lý trong `<pre>`; nhưng rồi nó hiện ra ở `<code>` nội dòng
 * nữa, và hoá ra nó là khác biệt chung của cả trang.
 *
 * Chỉ chạm phần GIỮA các thẻ, không chạm giá trị thuộc tính: trong thuộc tính,
 * escape-hay-không là khác biệt THẬT — bỏ escape dấu ngoặc là đóng sớm giá trị và
 * mở đường chèn HTML. Cũng KHÔNG bỏ escape `&lt;` và `&amp;`: hai cái đó bỏ ra là
 * đổi cấu trúc, không phải đổi cách viết.
 */
function dongNhatVanBan(html) {
  return html.replace(
    />([^<]*)</g,
    (_all, van) => `>${van.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, '>')}<`,
  );
}

/** `a: b; c:d;` → `a:b;c:d` — cùng CSS, một cách viết. */
function dongNhatCss(css) {
  return css
    .split(';')
    .map((khai) => khai.trim().replace(/:\s+/g, ':'))
    .filter(Boolean)
    .join(';');
}

/**
 * Đưa thực thể ký tự về một cách viết.
 *
 * Astro viết `&quot;`, còn rehype-stringify viết `&#x22;`. Cùng một ký tự, DOM dựng
 * ra y hệt — đây là khác biệt về CÁCH VIẾT, không phải về nội dung.
 *
 * Cố ý chỉ đổi cách viết chứ KHÔNG giải mã hẳn về `"`. Giải mã hẳn thì "đã escape"
 * và "chưa escape" trở thành giống nhau, mà đó lại đúng là loại khác biệt cần bắt:
 * một bên escape dấu ngoặc trong thuộc tính, bên kia không, là lỗ chèn HTML.
 */
function dongNhatThucThe(html) {
  const TEN = { '22': 'quot', '26': 'amp', '27': '#39', '3c': 'lt', '3e': 'gt' };

  return html
    .replace(/&#x([0-9a-fA-F]{2});/g, (all, hex) => {
      const ten = TEN[hex.toLowerCase()];
      return ten ? `&${ten};` : all;
    })
    .replace(/&#(\d+);/g, (all, dec) => {
      const ten = TEN[Number(dec).toString(16)];
      return ten && ten !== '#39' ? `&${ten};` : all;
    });
}

/** Chỗ lệch đầu tiên, kèm ngữ cảnh hai bên. */
function lechDauTien(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;

  const tu = Math.max(0, i - 90);
  return {
    viTri: i,
    build: a.slice(tu, i + 130),
    runtime: b.slice(tu, i + 130),
  };
}

if (!existsSync('dist/blog')) {
  console.error('Chưa có dist/. Chạy `pnpm build` trước.');
  process.exit(1);
}

const files = readdirSync('src/content/blog').filter((f) => f.endsWith('.mdx'));
let dat = 0;
const lech = [];
const boQua = [];

for (const file of files.sort()) {
  const slug = file.replace(/\.mdx$/, '');
  const trang = `dist/blog/${slug}/index.html`;

  if (!existsSync(trang)) {
    boQua.push(`${slug} — không có trong dist (bài nháp hoặc hẹn giờ)`);
    continue;
  }

  const build = catThanBai(readFileSync(trang, 'utf8'));
  if (build === null) {
    boQua.push(`${slug} — không tìm thấy '${MO}' trong trang đã build`);
    continue;
  }

  const mdx = boFrontmatter(readFileSync(`src/content/blog/${file}`, 'utf8'));
  let ra;
  try {
    ra = await renderContent(mdx);
  } catch (e) {
    lech.push({ slug, ly_do: `render ném lỗi: ${e.message.split('\n')[0]}` });
    continue;
  }

  if (ra.unknown.length) {
    lech.push({ slug, ly_do: `component không nhận ra: ${ra.unknown.join(', ')}` });
    continue;
  }

  const a = chuanHoa(build);
  const b = chuanHoa(ra.html);

  if (a === b) {
    dat += 1;
    console.log(`  ✓ ${slug}  (${a.length} ký tự, khớp)`);
  } else {
    const d = lechDauTien(a, b);
    lech.push({
      slug,
      ly_do: `lệch ở ký tự ${d.viTri}/${a.length}`,
      ...(CHI_TIET ? { build: d.build, runtime: d.runtime } : {}),
    });
    console.log(`  ✗ ${slug}  lệch ở ký tự ${d.viTri}/${a.length}`);
  }
}

for (const b of boQua) console.log(`  – ${b}`);

console.log(`\n${dat}/${dat + lech.length} bài khớp.`);

if (lech.length) {
  console.log('\nKhông khớp:');
  for (const l of lech) {
    console.log(`\n  ${l.slug}: ${l.ly_do}`);
    if (l.build !== undefined) {
      console.log(`    build  : …${l.build}`);
      console.log(`    runtime: …${l.runtime}`);
    }
  }
  process.exit(1);
}

console.log('Renderer runtime cho ra HTML giống bản build.');
