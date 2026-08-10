/**
 * Tô màu cú pháp MDX cho ô soạn — dùng chung cho admin cục bộ và admin đã deploy.
 *
 * Trả về HTML để đặt vào một `<pre>` nằm DƯỚI `<textarea>` chữ trong suốt. Xem
 * chú thích trong `scripts/admin/index.html` để biết vì sao chọn cách phủ lớp thay
 * vì CodeMirror (ngắn gọn: IME tiếng Việt chỉ đáng tin trên `<textarea>` gốc).
 *
 * Tách ra đây vì hai admin phải tô GIỐNG NHAU. Mỗi bên một bản thì sớm muộn một
 * bên nhận ra `<Callout>` còn bên kia không, và người viết sẽ tưởng mình gõ sai.
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Các quy tắc trong dòng, áp trên chuỗi ĐÃ escape. */
function highlightInline(s) {
  return (
    s
      // Thẻ component: <Callout ...>, </Steps>, <Figure … />
      .replace(/&lt;\/?[A-Z][\w]*[^&]*?\/?&gt;/g, (m) => `<span class="tok-tag">${m}</span>`)
      // `code` — làm trước đậm/nghiêng để dấu * bên trong code không bị hiểu sai
      .replace(/`[^`\n]+`/g, (m) => `<span class="tok-code">${m}</span>`)
      .replace(/\*\*[^*\n]+\*\*/g, (m) => `<span class="tok-bold">${m}</span>`)
      .replace(/(^|[\s(])_[^_\n]+_/g, (m) => `<span class="tok-italic">${m}</span>`)
      .replace(/\[[^\]\n]*\]\([^)\n]*\)/g, (m) => `<span class="tok-link">${m}</span>`)
  );
}

export function highlightMdx(vanBan) {
  const line = String(vanBan ?? '').split('\n');
  let trongFence = false;
  const out = [];

  for (const d of line) {
    const e = esc(d);

    if (/^\s*```/.test(d)) {
      trongFence = !trongFence;
      out.push(`<span class="tok-fence">${e}</span>`);
      continue;
    }
    if (trongFence) {
      out.push(`<span class="tok-code">${e}</span>`);
      continue;
    }
    if (/^#{1,6}\s/.test(d)) {
      out.push(`<span class="tok-heading">${e}</span>`);
      continue;
    }
    if (/^\s*&gt;/.test(e)) {
      out.push(`<span class="tok-quote">${highlightInline(e)}</span>`);
      continue;
    }

    const ds = e.match(/^(\s*(?:[-*+]|\d+[.)])\s)/);
    if (ds) {
      out.push(`<span class="tok-list">${ds[1]}</span>${highlightInline(e.slice(ds[1].length))}`);
      continue;
    }

    out.push(highlightInline(e));
  }

  // Thêm một dòng trắng ở cuối: nếu không, khi văn bản kết thúc bằng \n thì lớp
  // <pre> thấp hơn <textarea> một dòng và con trỏ lệch khỏi chữ.
  return out.join('\n') + '\n';
}

/** Mẫu chèn nhanh cho thanh công cụ. Dùng chung để hai admin chèn giống nhau. */
export const MDX_SNIPPETS = {
  callout:
    '\n<Callout type="info" title="Tiêu đề hộp">\nNội dung. type nhận: note | tip | warning | danger\n</Callout>\n',
  steps: '\n<Steps>\n1. Bước một.\n2. Bước hai.\n3. Bước ba.\n</Steps>\n',
  figure:
    '\n<Figure\n  src=""\n  alt="Mô tả ảnh cho người dùng screen reader"\n  caption="Chú thích hiện dưới ảnh"\n/>\n',
  pullquote: '\n<PullQuote>\nCâu đáng nhớ nhất của bài.\n</PullQuote>\n',
  fence: '\n```ts\n\n```\n',
};
