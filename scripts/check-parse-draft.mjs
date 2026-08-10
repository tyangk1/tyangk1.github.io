/**
 * Kiểm `parseDraft` bằng dữ liệu tĩnh — không gọi API.
 *
 * Chạy: pnpm check:parse
 *
 * Vì sao tồn tại: lỗi thật đã gặp là hàm bóc JSON tự phá JSON khi thân bài có khối code
 * ```. Nó CHẬP CHỜN theo nội dung bài, nên cách duy nhất để không tái diễn là có một ca
 * kiểm đúng hình dạng đó, chạy trong CI, không phụ thuộc quota API.
 */
import { parseDraft } from './lib/parse-draft.mjs';

const BAI = {
  title: 'Tiêu đề hợp lệ',
  description:
    'Một mô tả dài đủ để nằm trong khoảng bắt buộc, viết cho tự nhiên và không lặp lại tiêu đề, đủ để kiểm hàm bóc JSON chạy đúng.',
  tags: ['A', 'B'],
  takeaways: ['một', 'hai'],
};

const cases = [
  {
    name: 'JSON thuần',
    raw: JSON.stringify({ ...BAI, content: '## Mở\n\nMột đoạn.\n' }),
    expect: 'ok',
  },
  {
    name: 'THÂN BÀI CÓ KHỐI CODE ``` — đây là ca đã gây lỗi thật',
    raw: JSON.stringify({
      ...BAI,
      content:
        '## Cấu hình\n\n```bash\npnpm ai:draft --dry\n```\n\nRồi kiểm lại:\n\n```yaml\nname: CI\n```\n',
    }),
    expect: 'ok',
  },
  {
    name: 'Cả câu trả lời bọc trong ```json',
    raw: '```json\n' + JSON.stringify({ ...BAI, content: '## Mở\n\nĐoạn.\n' }) + '\n```',
    expect: 'ok',
  },
  {
    name: 'Bọc trong ```json VÀ thân bài cũng có ```',
    raw:
      '```json\n' +
      JSON.stringify({ ...BAI, content: '## Mở\n\n```ts\nconst a = 1;\n```\n' }) +
      '\n```',
    expect: 'ok',
  },
  {
    name: 'Có câu dẫn trước JSON',
    raw: 'Đây là bài viết:\n\n' + JSON.stringify({ ...BAI, content: '## Mở\n\nĐoạn.\n' }),
    expect: 'ok',
  },
  {
    name: 'Bị cắt giữa JSON — phải THẤT BẠI',
    raw: '{ "title": "Chưa xong", "description": "abc", "content": "## Mở',
    expect: 'fail',
  },
  {
    name: 'Không có JSON nào — phải THẤT BẠI',
    raw: 'Xin lỗi, tôi không thể giúp việc này.',
    expect: 'fail',
  },
  {
    name: 'Thiếu khoá content — phải THẤT BẠI',
    raw: JSON.stringify({ title: 'A', description: 'B' }),
    expect: 'fail',
  },
];

let failed = 0;

for (const c of cases) {
  let got;
  try {
    const obj = parseDraft(c.raw);
    got = obj.content.includes('```') || obj.content.length > 0 ? 'ok' : 'fail';
  } catch {
    got = 'fail';
  }

  const pass = got === c.expect;
  if (!pass) failed += 1;
  console.log(`  ${pass ? '✓' : '✗'} ${c.name}  (mong ${c.expect}, được ${got})`);
}

// Ca quan trọng nhất: khối code phải còn NGUYÊN trong thân bài, không bị cắt mất.
const withFence = parseDraft(
  JSON.stringify({ ...BAI, content: '## A\n\n```bash\nls -la\n```\n\n## B\n\nHết.\n' }),
);
const keptFence = withFence.content.includes('```bash') && withFence.content.includes('## B');
if (!keptFence) failed += 1;
console.log(`  ${keptFence ? '✓' : '✗'} khối code và phần sau nó còn nguyên trong thân bài`);

if (failed > 0) {
  console.error(`\n${failed} ca sai.`);
  process.exit(1);
}

console.log(`\n✓ ${cases.length + 1} ca bóc JSON đều đúng.`);
