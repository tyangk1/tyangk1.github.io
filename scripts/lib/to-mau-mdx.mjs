/**
 * Tô màu cú pháp MDX cho ô soạn — dùng chung cho admin cục bộ và admin đã deploy.
 *
 * Trả về HTML để đặt vào một `<pre>` nằm DƯỚI `<textarea>` chữ trong suốt. Xem
 * chú thích trong `scripts/admin/trang.html` để biết vì sao chọn cách phủ lớp thay
 * vì CodeMirror (ngắn gọn: IME tiếng Việt chỉ đáng tin trên `<textarea>` gốc).
 *
 * Tách ra đây vì hai admin phải tô GIỐNG NHAU. Mỗi bên một bản thì sớm muộn một
 * bên nhận ra `<Callout>` còn bên kia không, và người viết sẽ tưởng mình gõ sai.
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Các quy tắc trong dòng, áp trên chuỗi ĐÃ escape. */
function toTrongDong(s) {
  return (
    s
      // Thẻ component: <Callout ...>, </Steps>, <Figure … />
      .replace(/&lt;\/?[A-Z][\w]*[^&]*?\/?&gt;/g, (m) => `<span class="t-tag">${m}</span>`)
      // `code` — làm trước đậm/nghiêng để dấu * bên trong code không bị hiểu sai
      .replace(/`[^`\n]+`/g, (m) => `<span class="t-code">${m}</span>`)
      .replace(/\*\*[^*\n]+\*\*/g, (m) => `<span class="t-manh">${m}</span>`)
      .replace(/(^|[\s(])_[^_\n]+_/g, (m) => `<span class="t-nghieng">${m}</span>`)
      .replace(/\[[^\]\n]*\]\([^)\n]*\)/g, (m) => `<span class="t-link">${m}</span>`)
  );
}

export function toMauMdx(vanBan) {
  const dong = String(vanBan ?? '').split('\n');
  let trongFence = false;
  const ra = [];

  for (const d of dong) {
    const e = esc(d);

    if (/^\s*```/.test(d)) {
      trongFence = !trongFence;
      ra.push(`<span class="t-fence">${e}</span>`);
      continue;
    }
    if (trongFence) {
      ra.push(`<span class="t-code">${e}</span>`);
      continue;
    }
    if (/^#{1,6}\s/.test(d)) {
      ra.push(`<span class="t-heading">${e}</span>`);
      continue;
    }
    if (/^\s*&gt;/.test(e)) {
      ra.push(`<span class="t-trich">${toTrongDong(e)}</span>`);
      continue;
    }

    const ds = e.match(/^(\s*(?:[-*+]|\d+[.)])\s)/);
    if (ds) {
      ra.push(`<span class="t-ds">${ds[1]}</span>${toTrongDong(e.slice(ds[1].length))}`);
      continue;
    }

    ra.push(toTrongDong(e));
  }

  // Thêm một dòng trắng ở cuối: nếu không, khi văn bản kết thúc bằng \n thì lớp
  // <pre> thấp hơn <textarea> một dòng và con trỏ lệch khỏi chữ.
  return ra.join('\n') + '\n';
}

/** Mẫu chèn nhanh cho thanh công cụ. Dùng chung để hai admin chèn giống nhau. */
export const MAU_MDX = {
  callout:
    '\n<Callout type="info" title="Tiêu đề hộp">\nNội dung. type nhận: info | warning | success | tip\n</Callout>\n',
  steps: '\n<Steps>\n1. Bước một.\n2. Bước hai.\n3. Bước ba.\n</Steps>\n',
  figure:
    '\n<Figure\n  src=""\n  alt="Mô tả ảnh cho người dùng screen reader"\n  caption="Chú thích hiện dưới ảnh"\n/>\n',
  pullquote: '\n<PullQuote>\nCâu đáng nhớ nhất của bài.\n</PullQuote>\n',
  fence: '\n```ts\n\n```\n',
};
