/**
 * Bóc bài viết ra khỏi câu trả lời của model, và mô tả câu trả lời khi bóc thất bại.
 *
 * Tách khỏi `ai-draft-post.mjs` để KIỂM ĐƯỢC MÀ KHÔNG CẦN GỌI API. Bản trước nằm trong
 * script, nên cách duy nhất để thử là gọi model thật — và khi hết quota thì không còn
 * cách nào xác nhận bản sửa. Logic thuần thì phải kiểm được bằng dữ liệu tĩnh.
 */

/**
 * THỬ PARSE THẲNG TRƯỚC, HEURISTIC SAU. Thứ tự này quan trọng, không phải cho gọn.
 *
 * Bản trước làm ngược: nó gỡ khối ``` trước, bằng regex KHÔNG neo đầu cuối:
 *
 *     s.match(/```(?:json)?\s*([\s\S]*?)```/)
 *
 * Bài viết kỹ thuật gần như luôn có khối code ``` BÊN TRONG thân bài, và thân bài nằm
 * bên trong JSON. Nên regex bắt đúng cái fence nằm trong nội dung, cắt ra một mẩu giữa
 * bài — không có dấu ngoặc nào — rồi báo "không tìm thấy object JSON".
 *
 * Model không sai gì: nó trả `{ "title": …, "content": "… ```bash …" }` hợp lệ. Lỗi là
 * tôi phá JSON trước khi thử đọc nó. Và nó CHẬP CHỜN: bài chỉ dùng <Steps>/<Callout> thì
 * chạy, bài có code block thì vỡ.
 */
export function parseDraft(raw) {
  const s = String(raw).trim();

  const candidates = [s];

  // Cả câu trả lời được bọc trong một khối ``` — NEO `^` và `$` để không bắt fence nằm
  // giữa nội dung.
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) candidates.push(fenced[1].trim());

  // Model thêm một câu dẫn trước hoặc sau JSON.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(s.slice(first, last + 1));

  let lastError = null;
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      for (const key of ['title', 'description', 'content']) {
        if (typeof obj[key] !== 'string' || !obj[key].trim()) {
          throw new Error(`Thiếu hoặc rỗng khoá "${key}".`);
        }
      }
      return obj;
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(lastError?.message ?? 'Không tìm thấy object JSON nào.');
}

/**
 * Mô tả ngắn về thứ model thật sự trả về, để nhét vào thông báo lỗi.
 *
 * Bản trước chỉ nói "Không tìm thấy object JSON nào" — đúng nhưng vô dụng: nó không cho
 * biết model trả về CÁI GÌ. Đã mất một lượt chạy CI để đoán, nên giờ thông báo tự mang
 * theo bằng chứng.
 */
export function describeRaw(raw) {
  const s = String(raw ?? '');
  const head = s.slice(0, 220).replace(/\s+/g, ' ');
  const tail = s.length > 440 ? ' … ' + s.slice(-220).replace(/\s+/g, ' ') : '';
  return `[${s.length} ký tự, có { = ${s.includes('{')}, có } = ${s.includes('}')}] ${head}${tail}`;
}
