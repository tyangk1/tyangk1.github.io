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
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';

import { renderContent } from '../src/lib/render-content.ts';

const VERBOSE = process.argv.includes('--chi-tiet');
const REGENERATE = process.argv.includes('--cap-nhat');
const PROSE_OPEN = '<div class="prose mt-10">';

/**
 * Ảnh chụp vàng: HTML mà đường MDX lúc build sinh ra, đã chuẩn hoá và commit vào repo.
 *
 * Vì sao không đọc thẳng `dist/` nữa: trang bài giờ render lúc chạy, nên nó KHÔNG còn
 * được prerender — `dist/blog/<slug>/index.html` không tồn tại, và sự thật gốc để đối
 * chiếu biến mất cùng nó.
 *
 * Nhưng thứ cần bảo vệ vẫn còn nguyên: `Callout.astro` và `render-content.ts` mô tả
 * CÙNG một hộp bằng hai đoạn code khác nhau. Sửa một bên mà quên bên kia thì bài đổi
 * hình dạng, và không có gì báo. Ảnh chụp vàng giữ đúng lời hứa đó mà không cần build.
 *
 *   node scripts/check-renderer.mjs               so với ảnh chụp
 *   node scripts/check-renderer.mjs --cap-nhat    sinh lại ảnh chụp từ dist/
 *
 * Sinh lại CẦN một bản build còn prerender trang bài, tức phải tạm bật lại prerender
 * trong `src/pages/blog/[slug].astro`. Cố ý làm cho hơi khó: sinh lại ảnh chụp là nói
 * "hình dạng mới này mới đúng", và đó phải là một quyết định có ý thức, không phải một
 * bước tự động chạy kèm để làm bộ kiểm im lặng.
 */
const GOLDEN_DIR = 'tests/renderer-golden';

/**
 * Cắt phần bên trong `<div class="prose mt-10">`, đếm độ sâu thẻ div.
 *
 * Không thể tìm `</div>` đầu tiên: thân bài có `div` lồng bên trong (`code-block`,
 * `table-scroll`, `steps`), nên cách đó cắt giữa bài.
 */
function extractProseBody(html) {
  const start = html.indexOf(PROSE_OPEN);
  if (start === -1) return null;

  const i = start + PROSE_OPEN.length;
  const end = findClosingTag(html, i, 'div', 1);

  return end === -1 ? null : stripTakeaways(html.slice(i, end));
}

/** Vị trí thẻ đóng cân với `sau` thẻ mở đang hở, bắt đầu dò từ `tu`. */
function findClosingTag(html, from, tag, depth) {
  const re = new RegExp(`<(/?)${tag}\\b`, 'g');
  re.lastIndex = from;

  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index;
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
function stripTakeaways(prose) {
  const s = prose.trimStart();
  if (!s.startsWith('<aside class="takeaways"')) return prose;

  const end = findClosingTag(s, 0, 'aside', 0);
  return end === -1 ? prose : s.slice(s.indexOf('>', end) + 1);
}

/** Bỏ frontmatter YAML để còn lại đúng thân bài. */
function stripFrontmatter(mdx) {
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
 *  5. Ký tự được escape trong nội dung văn bản — xem `unescapeTextNodes`.
 *  6. MÀU token Shiki — xem `blurShikiColors`. Đây là chỗ bỏ qua nhiều nhất, đọc kỹ nó.
 *
 * Khác biệt thật là: thẻ, tên thuộc tính, giá trị thuộc tính, và chữ.
 */
function normalize(html) {
  return blurShikiColors(unescapeTextNodes(canonicalizeEntities(html)))
    .replace(/\s+/g, ' ')
    .replace(/style="([^"]*)"/g, (_all, css) => `style="${canonicalizeCss(css)}"`)
    .replace(/ ([a-z-]+)=""/g, ' $1')
    .replace(/\s*\/>/g, '>')
    .replace(/<\/(path|rect|circle|line|polyline|polygon|ellipse)>/g, '')
    .replace(/> </g, '><')
    .trim();
}

/**
 * Bỏ MÀU của token Shiki khỏi phép so — và đây là một chỗ hụt thật, không phải mẹo.
 *
 * SỰ VIỆC ĐÃ ĐO ĐƯỢC
 *
 * Shiki tô màu không tất định. Cùng một bài, cùng một tiến trình, chỉ khác ở việc TRƯỚC ĐÓ
 * đã render vài tài liệu khác hay chưa, thì số token có màu của theme sáng đổi: 96, rồi
 * 100, rồi 104 trên cùng một bài. Token "thua" rơi về màu chữ mặc định `#0E1116` trong khi
 * `--shiki-dark` vẫn đúng.
 *
 * Nó KHÔNG phải do đường render mới. Ảnh chụp vàng được sinh từ `astro build`, và chính
 * chúng cũng mang những con số khác nhau — nên đường build cũng dao động y như vậy, từ
 * trước khi có module này.
 *
 * ĐÃ THỬ VÀ KHÔNG CHỮA ĐƯỢC
 *
 *  - Render hâm nóng hai lượt cho mọi ngôn ngữ trước khi vào bài thật: vẫn rớt 2/12.
 *  - Khai `langs` tường minh để nạp ngữ pháp lúc tạo highlighter: vẫn rớt 2/14. Và nó làm
 *    cấu hình lệch với `astro.config.ts`, nên đã bỏ ra.
 *
 * VÌ SAO BỎ QUA MÀU THAY VÌ ĐỂ BỘ KIỂM CHẬP CHỜN
 *
 * Một bộ kiểm rớt ngẫu nhiên 15% số lần là một bộ kiểm sẽ bị bỏ qua, và khi nó bỏ qua thì
 * mất luôn phần nó bảo vệ thật: cấu trúc thẻ, class, chữ, thứ tự, neo heading, nút copy.
 * Bỏ đúng phần dao động thì phần còn lại kiểm được chắc chắn.
 *
 * CÁI GIÁ, NÓI RÕ: bộ kiểm này KHÔNG còn phát hiện được việc đổi theme Shiki hay đổi màu
 * token. Đổi theme trong `astro.config.ts` mà quên đổi trong `render-content.ts` sẽ KHÔNG
 * bị bắt ở đây. Chỗ đó phải kiểm bằng mắt, và chú thích trong `render-content.ts` nhắc
 * rằng hai cấu hình phải khớp từng chữ.
 */
function blurShikiColors(html) {
  return html.replace(/style="[^"]*--shiki-dark:[^"]*"/g, 'style="[shiki]"');
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
function unescapeTextNodes(html) {
  return html.replace(
    />([^<]*)</g,
    (_all, text) => `>${text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, '>')}<`,
  );
}

/** `a: b; c:d;` → `a:b;c:d` — cùng CSS, một cách viết. */
function canonicalizeCss(css) {
  return css
    .split(';')
    .map((decl) => decl.trim().replace(/:\s+/g, ':'))
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
function canonicalizeEntities(html) {
  const ENTITY_NAMES = { '22': 'quot', '26': 'amp', '27': '#39', '3c': 'lt', '3e': 'gt' };

  return html
    .replace(/&#x([0-9a-fA-F]{2});/g, (all, hex) => {
      const name = ENTITY_NAMES[hex.toLowerCase()];
      return name ? `&${name};` : all;
    })
    .replace(/&#(\d+);/g, (all, dec) => {
      const name = ENTITY_NAMES[Number(dec).toString(16)];
      return name && name !== '#39' ? `&${name};` : all;
    });
}

/** Chỗ lệch đầu tiên, kèm ngữ cảnh hai bên. */
function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;

  const from = Math.max(0, i - 90);
  return {
    index: i,
    build: a.slice(from, i + 130),
    runtime: b.slice(from, i + 130),
  };
}

/*
  PHẦN 1 — ca kiểm tĩnh.

  Chín bài thật không đi qua những đường này: không bài nào có component bịa ra, thẻ
  thiếu đóng, component lồng nhau, hay `<Figure>`. Nên phần so với bản build ở dưới
  KHÔNG kiểm được chúng, và đó đúng là những chỗ dễ vỡ nhất.

  Chạy trước phần so, và không cần `dist/` — nhờ vậy vẫn dùng được khi chưa build.
*/
const CASES = [
  {
    name: 'component bịa ra thì bị bắt',
    mdx: 'Đoạn mở.\n\n<Bogus foo="bar">Nội dung.</Bogus>\n',
    check: (r) => (r.unknown.includes('Bogus') ? null : `unknown = [${r.unknown}]`),
  },
  {
    name: 'thẻ mở thiếu thẻ đóng thì bị bắt',
    mdx: '<Callout type="note" title="Hở">\nNội dung không bao giờ được đóng.\n',
    check: (r) => (r.unknown.includes('Callout') ? null : `unknown = [${r.unknown}]`),
  },
  {
    name: 'Callout type lạ thì báo lỗi, không âm thầm về note',
    mdx: '<Callout type="success">\nXong rồi.\n</Callout>\n',
    check: (r) =>
      r.invalid.some((v) => v.includes('success')) ? null : `invalid = [${r.invalid}]`,
  },
  {
    name: 'cả bốn type hợp lệ đều ra đúng nhãn',
    mdx: ['note', 'tip', 'warning', 'danger']
      .map((t) => `<Callout type="${t}">\nRuột.\n</Callout>`)
      .join('\n\n'),
    check: (r) => {
      if (r.invalid.length) return `invalid = [${r.invalid}]`;
      const missing = ['Ghi chú', 'Mách nhỏ', 'Lưu ý', 'Cẩn thận'].filter(
        (label) => !r.html.includes(`<span>${label}</span>`),
      );
      return missing.length ? `thiếu nhãn: ${missing.join(', ')}` : null;
    },
  },
  {
    name: 'component lồng nhau: Steps bên trong Callout',
    mdx: '<Callout type="tip" title="Ba bước">\n<Steps>\n1. Một.\n2. Hai.\n</Steps>\n</Callout>\n',
    check: (r) => {
      if (r.unknown.length || r.invalid.length) return `unknown/invalid còn sót`;
      const i = r.html.indexOf('class="callout');
      const j = r.html.indexOf('class="steps"');
      if (i === -1 || j === -1) return 'thiếu callout hoặc steps';
      if (j < i) return 'steps nằm ngoài callout';
      return r.html.includes('<li>') ? null : 'danh sách không thành <li>';
    },
  },
  {
    name: 'ruột component được xử lý như markdown',
    mdx: '<Callout type="note">\nCó `mã nội dòng` và **chữ đậm**.\n</Callout>\n',
    check: (r) =>
      r.html.includes('<code>mã nội dòng</code>') && r.html.includes('<strong>chữ đậm</strong>')
        ? null
        : 'ruột không được xử lý như markdown',
  },
  {
    name: 'Figure thiếu alt thì bị bắt',
    mdx: '<Figure src="https://a.b/c.png" caption="Chú thích" />\n',
    check: (r) => (r.invalid.some((v) => v.includes('alt')) ? null : `invalid = [${r.invalid}]`),
  },
  {
    name: 'Figure đủ thuộc tính thì không báo lỗi',
    mdx: '<Figure src="https://a.b/c.png" alt="Mô tả" caption="Chú thích" />\n',
    check: (r) => {
      if (r.invalid.length || r.unknown.length) return `invalid=[${r.invalid}] unknown=[${r.unknown}]`;
      return r.html.includes('alt="Mô tả"') && r.html.includes('<figcaption>Chú thích</figcaption>')
        ? null
        : 'HTML không có alt hoặc chú thích';
    },
  },
  {
    /*
      Ca này ban đầu tôi viết sai: nó đòi dấu ngoặc kép phải được escape. Tiêu đề đi
      vào NỘI DUNG VĂN BẢN của `<span>`, và ở đó dấu ngoặc kép không cần escape —
      chỉ `<` mới cần, vì `<` mở một thẻ. Kiểm sai thì hoặc báo động giả, hoặc tệ hơn,
      buộc phải "sửa" code cho vừa một yêu cầu không có thật.
    */
    name: 'dấu < trong tiêu đề bị escape, không thành thẻ',
    mdx: '<Callout type="note" title=\'Dấu " và <thẻ>\'>\nRuột.\n</Callout>\n',
    check: (r) => {
      if (r.html.includes('<thẻ>')) return '`<thẻ>` lọt vào HTML thành thẻ thật';
      if (!r.html.includes('&#x3C;thẻ') && !r.html.includes('&lt;thẻ')) {
        return 'không thấy `<thẻ>` ở dạng đã escape';
      }
      return null;
    },
  },
];

let casesPassed = 0;
const caseFailures = [];

for (const testCase of CASES) {
  let verdict;
  try {
    verdict = testCase.check(await renderContent(testCase.mdx));
  } catch (e) {
    verdict = `ném lỗi: ${e.message.split('\n')[0]}`;
  }

  if (verdict === null) {
    casesPassed += 1;
  } else {
    caseFailures.push(`${testCase.name} — ${verdict}`);
  }
}

console.log(`Ca kiểm tĩnh: ${casesPassed}/${CASES.length} đạt.`);
for (const l of caseFailures) console.log(`  ✗ ${l}`);
console.log('');

/*
  PHẦN 2 — so với ảnh chụp vàng.
*/
if (REGENERATE) {
  if (!existsSync('dist/blog')) {
    console.error(
      'Cần một bản build CÒN prerender trang bài để sinh ảnh chụp.\n' +
        'Tạm đặt `prerender = true` trong src/pages/blog/[slug].astro, chạy `pnpm build`, rồi chạy lại.',
    );
    process.exit(1);
  }

  mkdirSync(GOLDEN_DIR, { recursive: true });
  let written = 0;

  for (const file of readdirSync('src/content/blog').filter((f) => f.endsWith('.mdx')).sort()) {
    const slug = file.replace(/\.mdx$/, '');
    const pagePath = `dist/blog/${slug}/index.html`;
    if (!existsSync(pagePath)) continue;

    const prose = extractProseBody(readFileSync(pagePath, 'utf8'));
    if (prose === null) continue;

    writeFileSync(`${GOLDEN_DIR}/${slug}.html`, `${normalize(prose)}\n`, 'utf8');
    written += 1;
  }

  console.log(`Đã ghi ${written} ảnh chụp vào ${GOLDEN_DIR}/.`);
  process.exit(0);
}

if (!existsSync(GOLDEN_DIR)) {
  console.error(`Chưa có ${GOLDEN_DIR}/. Xem chú thích ở đầu file để sinh.`);
  process.exit(1);
}

const goldens = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.html'));
let passed = 0;
const mismatches = [];
const skipped = [];

for (const g of goldens.sort()) {
  const slug = g.replace(/\.html$/, '');
  const source = `src/content/blog/${slug}.mdx`;

  if (!existsSync(source)) {
    skipped.push(`${slug} — có ảnh chụp nhưng không còn file MDX`);
    continue;
  }

  const build = readFileSync(`${GOLDEN_DIR}/${g}`, 'utf8').trim();
  const mdx = stripFrontmatter(readFileSync(source, 'utf8'));
  let rendered;
  try {
    rendered = await renderContent(mdx);
  } catch (e) {
    mismatches.push({ slug, reason: `render ném lỗi: ${e.message.split('\n')[0]}` });
    continue;
  }

  if (rendered.unknown.length || rendered.invalid.length) {
    mismatches.push({
      slug,
      reason: [
        rendered.unknown.length ? `component không nhận ra: ${rendered.unknown.join(', ')}` : '',
        ...rendered.invalid,
      ]
        .filter(Boolean)
        .join(' | '),
    });
    continue;
  }

  const a = normalize(build);
  const b = normalize(rendered.html);

  if (a === b) {
    passed += 1;
    console.log(`  ✓ ${slug}  (${a.length} ký tự, khớp)`);
  } else {
    const d = firstDifference(a, b);
    mismatches.push({
      slug,
      reason: `lệch ở ký tự ${d.index}/${a.length}`,
      ...(VERBOSE ? { build: d.build, runtime: d.runtime } : {}),
    });
    console.log(`  ✗ ${slug}  lệch ở ký tự ${d.index}/${a.length}`);
  }
}

for (const b of skipped) console.log(`  – ${b}`);

console.log(`\n${passed}/${passed + mismatches.length} bài khớp.`);

if (caseFailures.length) {
  console.log(`\n${caseFailures.length} ca kiểm tĩnh không đạt — xem danh sách phía trên.`);
  process.exit(1);
}

if (mismatches.length) {
  console.log('\nKhông khớp:');
  for (const l of mismatches) {
    console.log(`\n  ${l.slug}: ${l.reason}`);
    if (l.build !== undefined) {
      console.log(`    build  : …${l.build}`);
      console.log(`    runtime: …${l.runtime}`);
    }
  }
  process.exit(1);
}

console.log('Renderer runtime cho ra HTML giống bản build.');
