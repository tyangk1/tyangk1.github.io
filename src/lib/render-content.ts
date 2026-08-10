import { createMarkdownProcessor, rehypeHeadingIds } from '@astrojs/markdown-remark';

// Đuôi `.ts` là CỐ Ý, không phải quên gọn.
//
// Module này được nạp từ hai phía: Astro/Vite (tự suy ra đuôi file) và Node thuần
// khi script soạn bài hoặc admin cục bộ gọi nó. Node ESM KHÔNG suy ra đuôi file —
// viết `./icons` thì Node ném ERR_MODULE_NOT_FOUND. Vite chấp nhận cả hai cách,
// nên viết rõ đuôi là cách duy nhất cùng lúc đúng cho cả hai.
import { rehypeContent } from './rehype-content.ts';
import { STROKE_ICONS, FILLED_ICONS, isFilledIcon, type IconName } from './icons.ts';

/**
 * Dựng HTML thân bài từ nguồn MDX, KHÔNG cần bước build.
 *
 * Vì sao cần: nội dung bài nằm trong database, nhưng Content Layer của Astro biên
 * dịch bài lúc build. Nên sửa một bài chỉ hiện ra sau khi build lại — đó là lý do
 * "đăng ngay" mất 56 giây thay vì 1 giây. Module này cắt bỏ chỗ phụ thuộc đó.
 *
 * Chỗ này KHÔNG nằm trong đường request. Render chạy lúc LƯU BÀI rồi cất HTML vào
 * cột `content_html`; trang chỉ đọc một dòng và chèn vào. Ba cái được cùng lúc:
 * biên dịch một lần mỗi lần lưu thay vì một lần mỗi người đọc, lỗi render nổ ra
 * trước mặt người viết chứ không nổ trên trang người đọc, và TTFB không phải gánh
 * chi phí biên dịch.
 *
 * ĐÁNH ĐỔI ĐÃ BIẾT: `<Figure>` ở đây ra `<img>` thường, không đi qua `astro:assets`
 * (thứ TẢI ảnh về và sinh srcset lúc build — không tồn tại ngoài lúc build). Hiện
 * chưa bài nào dùng `<Figure>`; khi cần thì đi qua image service của Vercel, và
 * chỗ phải sửa là đúng một hàm `figureHtml` bên dưới.
 */

/** Escape cho nội dung văn bản. Astro tự làm việc này với `{bieu_thuc}`. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape cho giá trị thuộc tính — thêm dấu nháy so với escape văn bản. */
function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

/**
 * Dựng lại `Icon.astro` ở dạng chuỗi.
 *
 * Cố ý sao lại nguyên thứ tự thuộc tính của component: nhờ vậy so HTML cũ với HTML
 * mới là so được từng byte, và một khác biệt thật không bị lẫn giữa hàng trăm khác
 * biệt vô nghĩa do thứ tự thuộc tính.
 */
function icon(name: IconName, size: number, className = ''): string {
  const filled = isFilledIcon(name);
  const paths = filled ? FILLED_ICONS[name] : STROKE_ICONS[name];

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" ` +
    `stroke="${filled ? 'none' : 'currentColor'}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" ` +
    `class="${escapeAttr(className)}" aria-hidden="true" focusable="false">${paths}</svg>`
  );
}

/** Bảng tra của `Callout.astro`. Bốn kiểu, không có kiểu nào khác. */
const CALLOUT_PRESET: Record<string, { icon: IconName; label: string }> = {
  note: { icon: 'info', label: 'Ghi chú' },
  tip: { icon: 'bulb', label: 'Mách nhỏ' },
  warning: { icon: 'warning', label: 'Lưu ý' },
  danger: { icon: 'danger', label: 'Cẩn thận' },
};

/** Đọc `key="value"` / `key='value'` / `key` từ chuỗi thuộc tính của thẻ. */
function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (let m = re.exec(raw); m !== null; m = re.exec(raw)) {
    attrs[m[1]!] = m[2] ?? m[3] ?? m[4] ?? '';
  }

  return attrs;
}

/**
 * Bỏ phần thụt lề chung của khối con.
 *
 * Trong MDX người viết thụt ruột component vào cho dễ đọc. Markdown thì coi thụt 4
 * dấu cách là khối mã, nên giữ nguyên thụt lề sẽ biến một đoạn văn thành code block.
 */
function dedent(text: string): string {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n');
  const indents = lines
    .filter((l) => l.trim() !== '')
    .map((l) => l.match(/^[ \t]*/)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;

  return lines.map((l) => l.slice(cut)).join('\n');
}

/**
 * Bọc phần ruột bằng dòng trống ở hai đầu.
 *
 * Đây là mấu chốt của cả module. CommonMark: một khối HTML kết thúc ở DÒNG TRỐNG,
 * và sau dòng trống đó thì lại là markdown. Nên nếu thẻ mở nằm gọn trên một dòng và
 * cách phần ruột bằng dòng trống thì phần ruột được xử lý như markdown — đúng như
 * MDX làm với children. Thiếu dòng trống là cả khối thành HTML thô: dấu backtick
 * còn nguyên là chữ, đoạn văn không có `<p>`. Đã đo cả hai đường trước khi viết.
 */
function withMarkdownBody(open: string, body: string, close: string): string {
  const inner = dedent(body);
  if (!inner) return `${open}${close}`;

  return `${open}\n\n${inner}\n\n${close}`;
}

function calloutHtml(attrs: Record<string, string>, body: string, problems: string[]): string {
  const type = attrs['type'] ?? 'note';
  const preset = CALLOUT_PRESET[type];

  /*
    Type lạ thì BÁO LỖI, không âm thầm rơi về `note`.

    `Callout.astro` viết `PRESET[type] ?? PRESET['note']`, nên một type sai không làm
    vỡ build — nó ra hộp sai màu sai nhãn và không ai biết. Đã trả giá thật để học:
    prompt soạn bài ghi `info | warning | success | tip` trong khi component chỉ nhận
    `note | tip | warning | danger`, và một bài AI đã đăng với hai type không tồn tại.
    Sửa prompt là sửa một lần; báo lỗi ở đây là sửa cả loại lỗi.
  */
  if (!preset) {
    problems.push(
      `<Callout type="${type}"> — type không tồn tại. ` +
        `Chỉ có: ${Object.keys(CALLOUT_PRESET).join(', ')}.`,
    );
  }

  const chosen = preset ?? CALLOUT_PRESET['note']!;
  const title = attrs['title']?.trim() ? attrs['title'] : chosen.label;

  return withMarkdownBody(
    `<aside class="callout callout--${escapeAttr(type)}">` +
      `<p class="callout__label">${icon(chosen.icon, 17)}` +
      `<span>${escapeText(title)}</span></p>` +
      `<div class="callout__body">`,
    body,
    `</div></aside>`,
  );
}

function stepsHtml(_attrs: Record<string, string>, body: string, _loi: string[]): string {
  return withMarkdownBody('<div class="steps">', body, '</div>');
}

function pullQuoteHtml(attrs: Record<string, string>, body: string, _loi: string[]): string {
  const cite = attrs['cite']?.trim()
    ? `<figcaption class="pullquote__cite">${escapeText(attrs['cite'])}</figcaption>`
    : '';

  return withMarkdownBody(
    `<figure class="pullquote">${icon('quote', 30, 'pullquote__mark')}` +
      `<blockquote class="pullquote__text">`,
    body,
    `</blockquote>${cite}</figure>`,
  );
}

function figureHtml(attrs: Record<string, string>, problems: string[]): string {
  // `alt` là bắt buộc, đúng như tài liệu của `Figure.astro`: chú thích phía dưới là
  // thứ mọi người đọc, `alt` là thứ dành riêng cho người dùng screen reader — cái nọ
  // không thay thế được cái kia. Thiếu `alt` là lỗi accessibility thật, và nó lặng lẽ
  // hơn mọi lỗi khác vì trang vẫn hiện ra bình thường với người nhìn thấy ảnh.
  if (!attrs['src']?.trim()) problems.push('<Figure> thiếu thuộc tính src.');
  if (attrs['alt'] === undefined) problems.push('<Figure> thiếu thuộc tính alt (bắt buộc).');

  const size =
    (attrs['width'] ? ` width="${escapeAttr(attrs['width'])}"` : '') +
    (attrs['height'] ? ` height="${escapeAttr(attrs['height'])}"` : '');
  const caption = attrs['caption']?.trim()
    ? `<figcaption>${escapeText(attrs['caption'])}</figcaption>`
    : '';

  return (
    `<figure class="figure">` +
    `<img src="${escapeAttr(attrs['src'] ?? '')}" alt="${escapeAttr(attrs['alt'] ?? '')}"` +
    `${size} loading="lazy" decoding="async">${caption}</figure>`
  );
}

const PAIRED: Record<
  string,
  (attrs: Record<string, string>, body: string, problems: string[]) => string
> = {
  Callout: calloutHtml,
  Steps: stepsHtml,
  PullQuote: pullQuoteHtml,
};

/** Tên component được phép. Gặp tên khác thì báo lỗi thay vì lặng lẽ bỏ qua. */
export const KNOWN_COMPONENTS = [...Object.keys(PAIRED), 'Figure'];

/**
 * Đổi thẻ component thành HTML, trước khi markdown được phân tích.
 *
 * Chạy vòng lặp thay từ trong ra ngoài: mỗi vòng thay các cặp thẻ KHÔNG chứa cặp
 * nào khác bên trong. Nhờ vậy `<Callout>` bọc `<Steps>` cũng đúng, và không cần
 * regex nào phải hiểu lồng nhau — thứ regex không làm được.
 */
export function expandComponents(source: string, problems: string[] = []): string {
  /*
    Phần thuộc tính là `(?:"…"|'…'|[^>])*`, KHÔNG phải `[^>]*`.

    Với `[^>]*` thì thẻ bị cắt ở dấu `>` đầu tiên — kể cả khi dấu đó nằm TRONG giá trị
    thuộc tính. Một tiêu đề như `title="Bước 1 -> Bước 2"` là đủ để vỡ: thuộc tính bị
    cắt giữa, phần còn lại rơi xuống thân bài. Ca kiểm tĩnh bắt được chỗ này.
  */
  const attrPart = `(?:"[^"]*"|'[^']*'|[^>])*`;

  let out = source.replace(
    new RegExp(`<Figure\\b(${attrPart}?)/>`, 'g'),
    (_all, rawAttrs: string) => figureHtml(parseAttrs(rawAttrs), problems),
  );

  const names = Object.keys(PAIRED).join('|');
  const innermost = new RegExp(
    `<(${names})\\b(${attrPart})>((?:(?!<(?:${names})\\b)[\\s\\S])*?)<\\/\\1>`,
  );

  // Chặn trên là số cặp thẻ có thể có; hết vòng mà còn thẻ là có thẻ không đóng.
  for (let guard = 0; guard < 200; guard += 1) {
    const next = out.replace(innermost, (_all, name: string, rawAttrs: string, body: string) =>
      PAIRED[name]!(parseAttrs(rawAttrs), body, problems),
    );
    if (next === out) break;
    out = next;
  }

  return out;
}

/**
 * Component còn sót sau khi expand — tên bịa ra, hoặc thẻ mở thiếu thẻ đóng.
 *
 * Phải quét NGUỒN đã expand, KHÔNG quét HTML đã render. Bản đầu tôi quét HTML và nó
 * không bắt được gì cả: parser HTML hạ tên thẻ lạ thành chữ thường, nên `<Bogus>`
 * thành `<bogus>` và mẫu `<[A-Z]` không bao giờ khớp. Cửa kiểm trông như đang chạy
 * mà thực ra luôn trả về rỗng — loại lỗi tệ nhất. Ca kiểm tĩnh bắt được nó.
 */
export function unknownComponents(expanded: string): string[] {
  const found = new Set<string>();
  for (const m of expanded.matchAll(/<\/?([A-Z][A-Za-z0-9]*)[\s/>]/g)) found.add(m[1]!);

  return [...found];
}

/**
 * Bộ xử lý markdown, dựng một lần rồi dùng lại.
 *
 * Dựng lại mỗi lần render là nạp lại toàn bộ ngữ pháp Shiki — tốn hàng trăm ms.
 * Cấu hình dưới đây phải KHỚP `astro.config.ts`; lệch một theme là code block
 * đổi màu mà không ai nhận ra cho tới khi so ảnh.
 */
let processorPromise: Promise<Awaited<ReturnType<typeof createMarkdownProcessor>>> | null = null;

function getProcessor() {
  processorPromise ??= createProcessor();

  return processorPromise;
}

async function createProcessor() {
  const processor = await createMarkdownProcessor({
    // `rehypeHeadingIds` phải đứng TRƯỚC `rehypeContent`, cùng lý do như trong
    // `astro.config.ts`: mặc định Astro gắn id cho heading ở CUỐI pipeline, nên nếu
    // không gọi sớm thì lúc `rehypeContent` chạy các heading chưa có id và không có
    // chỗ nào để gắn neo `#`. Đã trả giá để biết: bản đầu heading có id nhưng mất
    // sạch neo, và chỉ bộ kiểm so với HTML bản build mới chỉ ra được.
    rehypePlugins: [rehypeHeadingIds, rehypeContent],
    shikiConfig: {
      /*
        Phải KHỚP TỪNG CHỮ với `shikiConfig` trong `astro.config.ts`.

        Đã thử thêm `langs` để nạp ngữ pháp sớm, nhằm chữa một chỗ dao động màu của Shiki
        (xem chú thích trong `scripts/check-renderer.mjs`). Nó KHÔNG chữa được, và giữ lại
        thì hai cấu hình lệch nhau — mà giữ chúng không lệch mới đúng là việc bộ kiểm tồn
        tại để làm. Nên đã bỏ ra.
      */
      themes: {
        light: 'github-light-high-contrast',
        dark: 'github-dark-high-contrast',
      },
      wrap: false,
    },
  });

  return processor;
}

export interface RenderResult {
  html: string;
  /** Component không nhận ra — tên bịa ra, hoặc thẻ mở thiếu thẻ đóng. */
  unknown: string[];
  /** Component nhận ra nhưng dùng sai: type lạ, thiếu thuộc tính bắt buộc. */
  invalid: string[];
}

/** Nguồn MDX của một bài → HTML thân bài. */
export async function renderContent(source: string): Promise<RenderResult> {
  const processor = await getProcessor();
  const invalid: string[] = [];
  const expanded = expandComponents(source, invalid);
  const { code } = await processor.render(expanded);

  return { html: code, unknown: unknownComponents(expanded), invalid };
}
