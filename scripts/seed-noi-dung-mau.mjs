/**
 * Nạp thêm bài viết mẫu vào database.
 *
 * Dùng để có đủ bài mà nhìn thấy toàn bộ bố cục hoạt động: bài đầu trang chiếm
 * trọn, lưới sáu thẻ, danh sách gọn phía dưới, và trang thứ hai của /blog.
 * Với bốn bài thì ba khối cuối không bao giờ hiện ra.
 *
 * Chạy: node scripts/seed-noi-dung-mau.mjs
 * Chạy lại nhiều lần không tạo bản trùng (upsert theo slug).
 */
import { taoClient } from './lib/supabase.mjs';

const baiViet = [
  {
    slug: 'cache-http-ba-tang',
    title: 'Cache HTTP ba tầng: trình duyệt, CDN, và máy chủ',
    description:
      'Ba tầng cache độc lập nhau, và mỗi tầng nghe một header khác. Đây là cách tôi phân biệt chúng sau lần xoá cache CDN mà người dùng vẫn thấy bản cũ.',
    published_at: '2026-08-02',
    tags: ['Hiệu năng', 'Web'],
    takeaways: [
      'Vì sao xoá cache CDN xong người dùng vẫn thấy bản cũ',
      'Khác biệt giữa max-age, s-maxage và stale-while-revalidate',
      'Khi nào dùng immutable và khi nào tuyệt đối đừng',
    ],
    featured: false,
    content: `Tôi từng mất một buổi chiều vì tin rằng "xoá cache CDN" là xong. Xoá rồi, mở trang, vẫn bản cũ. Nguyên nhân: có ba tầng cache, và tôi chỉ vừa xoá một tầng.

## Ba tầng, ba chủ

<Steps>
1. **Cache trình duyệt** — nằm trên máy người đọc. Bạn KHÔNG xoá được từ xa. Đây là tầng nguy hiểm nhất.
2. **Cache CDN** — nằm ở máy chủ biên. Xoá được, và xoá có hiệu lực ngay.
3. **Cache máy chủ** — Redis, cache của framework, cache truy vấn database.
</Steps>

Xoá tầng 2 không đụng gì tới tầng 1. Người dùng đã tải trang một lần thì trình duyệt của họ vẫn giữ bản cũ cho tới khi \`max-age\` hết hạn.

<Callout type="warning" title="Đây là chỗ không sửa lại được">
  Đặt \`max-age=31536000\` cho một file không có hash trong tên là tự khoá mình một
  năm. Không có cách nào bảo trình duyệt của người khác bỏ bản đã lưu — chỉ còn
  cách đổi URL.
</Callout>

## Ba header cần phân biệt

| Header | Ai nghe | Ý nghĩa |
| --- | --- | --- |
| \`max-age\` | Trình duyệt **và** CDN | Giữ bản này bao lâu |
| \`s-maxage\` | Chỉ CDN | Ghi đè \`max-age\` ở tầng CDN |
| \`stale-while-revalidate\` | Cả hai | Cứ trả bản cũ, đồng thời lấy bản mới ở phía sau |

Cặp tôi dùng cho HTML của một trang tĩnh:

\`\`\`
Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400
\`\`\`

Đọc ra tiếng người: *trình duyệt đừng giữ gì cả; CDN giữ 5 phút; sau 5 phút vẫn cứ trả bản cũ cho nhanh, đồng thời đi lấy bản mới.* Kết quả là người đọc luôn nhận phản hồi tức thì, còn nội dung mới lên trong vòng vài phút mà không cần xoá cache tay.

## \`immutable\` — chỉ khi tên file có hash

\`\`\`
# ĐÚNG: tên file có hash, nội dung không bao giờ đổi
/_astro/style.C7Ai3vqH.css   →  max-age=31536000, immutable

# SAI: tên file cố định, nội dung sẽ đổi
/logo.svg                    →  max-age=31536000, immutable
\`\`\`

<PullQuote>
  Chỉ đặt immutable cho URL mà bạn cam kết nội dung sau nó không bao giờ đổi. Nếu
  không cam kết được, đừng đặt.
</PullQuote>

## Cách tôi kiểm

Mở DevTools → Network → xem cột Size. \`(disk cache)\` là tầng 1. Header \`cf-cache-status: HIT\` (Cloudflare) hay \`x-vercel-cache: HIT\` là tầng 2. Không thấy gì trong hai cái đó thì request đã đi tới máy chủ.

Muốn bỏ tầng 1 khi đang thử: tick "Disable cache" trong DevTools. Nhưng nhớ rằng người đọc thật không có cái tick đó.`,
  },

  {
    slug: 'viet-commit-message-cho-nguoi-doc-sau',
    title: 'Viết commit message cho người đọc nó sáu tháng sau',
    description:
      'Commit message tệ chỉ tốn kém khi bạn cần nó, mà lúc đó thì đã muộn. Một khuôn ba dòng tôi dùng, và ba loại thông tin không bao giờ nên bỏ ra ngoài.',
    published_at: '2026-07-05',
    tags: ['Nghề nghiệp', 'Git'],
    takeaways: [
      'Vì sao "fix bug" tốn kém hơn ta tưởng',
      'Khuôn ba dòng: làm gì, vì sao, và điều gì đã cân nhắc rồi bỏ',
      'Cái gì thuộc commit message, cái gì thuộc comment trong code',
    ],
    featured: false,
    content: `Có một lúc duy nhất commit message trở nên quan trọng: khi bạn đang \`git log -L\` một dòng code trông vô lý và cần biết vì sao nó tồn tại. Đúng lúc đó, \`fix bug\` là một cú tát.

## Khuôn ba dòng

\`\`\`
Chặn double-submit ở form đăng ký

Người dùng bấm nhanh hai lần tạo hai tài khoản trùng email; ràng buộc
unique ở DB ném lỗi 500 chứ không phải lỗi hợp lệ.

Đã cân nhắc debounce ở client nhưng bỏ: request đầu vẫn đi, chỉ chậm hơn.
Khoá ở tầng service là chỗ duy nhất chắc chắn.
\`\`\`

Ba phần, mỗi phần trả lời một câu hỏi khác nhau:

<Steps>
1. **Dòng đầu — làm gì.** Câu ngắn, thể chủ động, không dấu chấm. Đây là dòng hiện trong \`git log --oneline\`, nên nó phải đứng một mình được.
2. **Đoạn giữa — vì sao.** Triệu chứng thật, không phải mô tả code. Code đã tự nói nó làm gì rồi.
3. **Đoạn cuối — đã bỏ gì.** Phần này ít ai viết và là phần giá trị nhất.
</Steps>

<Callout type="tip" title="Đoạn cuối cứu bạn khỏi việc làm lại vòng cũ">
  Người tiếp theo (hoặc chính bạn) nhìn đoạn code sẽ nghĩ "sao không debounce cho
  gọn". Nếu lý do bỏ debounce không được ghi lại, họ sẽ thử, sẽ mất một buổi, và
  sẽ tới đúng kết luận cũ.
</Callout>

## Cái gì thuộc commit, cái gì thuộc comment

Ranh giới tôi dùng:

| Loại thông tin | Đặt ở đâu |
| --- | --- |
| Vì sao thay đổi này tồn tại | Commit message |
| Vì sao dòng code này viết kiểu lạ | Comment trong code |
| Cách dùng module | README hoặc JSDoc |

Lý do: commit message gắn với **một thời điểm**, comment gắn với **một dòng code**. Nhét lý do lịch sử vào comment thì sáu tháng sau nó thành rác; nhét lý do kỹ thuật vào commit thì không ai tìm thấy.

<PullQuote>
  Commit message không viết cho reviewer hôm nay. Nó viết cho người mở git blame
  sáu tháng sau, và người đó rất có thể là bạn.
</PullQuote>

## Hai thứ tôi đã bỏ

**Conventional Commits** (\`feat:\`, \`fix:\`, \`chore:\`). Với dự án một người thì tiền tố không mua được gì, còn tốn công tranh luận cái nào là \`chore\`. Với dự án có tự sinh changelog thì nó đáng.

**Commit nhỏ cực đoan.** Tôi từng tách mọi thứ thành commit một dòng. Kết quả là \`git log\` đầy nhiễu và không commit nào đứng riêng có nghĩa. Giờ tôi dùng một mốc: **một commit là một thay đổi mà tôi có thể revert độc lập.**`,
  },

  {
    slug: 'do-luong-truoc-khi-toi-uu',
    title: 'Đo trước khi tối ưu: ba lần tôi đoán sai chỗ chậm',
    description:
      'Cả ba lần tôi đều tin mình biết chỗ nào chậm, và cả ba lần đều sai. Đây là những con số thật và công cụ đã chỉ ra thủ phạm mà tôi không ngờ tới.',
    published_at: '2026-06-01',
    tags: ['Hiệu năng', 'Nghề nghiệp'],
    takeaways: [
      'Ba lần đoán sai chỗ chậm, kèm con số thật',
      'Vì sao trực giác về hiệu năng gần như luôn sai',
      'Thứ tự đo: từ ngoài vào trong, không phải từ code ra',
    ],
    featured: false,
    content: `Tôi có thành tích rất tệ trong việc đoán chỗ chậm. Ba ví dụ, đều là code của chính tôi.

## Lần một: tưởng do vòng lặp, thật ra do font

Trang danh sách 200 dòng, cuộn giật. Tôi đi tối ưu hàm render, thay \`map\` bằng vòng \`for\`, gộp bớt phép tính. Không đổi gì.

Mở Performance panel: **Style & Layout 890ms**, Script 40ms. Thủ phạm là chín file font, mỗi lần một file tải xong lại kéo theo một lần tính lại bố cục toàn trang.

Sửa: bớt một trọng lượng font và preload phần cần cho khung hình đầu. Từ 890ms xuống 350ms. Không sửa một dòng JavaScript nào.

## Lần hai: tưởng do database, thật ra do N+1 ở tầng trên

API trả trong 2,3 giây. Tôi thêm index, viết lại truy vấn, bật cache. Xuống 2,1 giây.

Bật log SQL: **147 truy vấn** cho một request. Truy vấn chính nhanh 8ms; 146 cái còn lại là vòng lặp gọi \`getAuthor()\` cho từng bài.

<PullQuote>
  Một truy vấn chậm dễ thấy và dễ sửa. Một trăm truy vấn nhanh thì không ai để ý,
  và cộng lại còn tệ hơn nhiều.
</PullQuote>

## Lần ba: tưởng do ảnh, thật ra do một script bên thứ ba

LCP 4,1 giây. Tôi nén lại toàn bộ ảnh, chuyển sang AVIF, thêm \`fetchpriority\`. LCP 3,9 giây.

Xem waterfall: một script chat widget chặn 1,8 giây trước khi ảnh bắt đầu tải. Bỏ nó ra, LCP về 1,4 giây.

<Callout type="warning" title="Script bên thứ ba là chỗ nên soi trước, không phải sau">
  Chúng không nằm trong code của bạn nên rất dễ bị bỏ qua khi đi tìm. Mở tab
  Network, sắp theo thời gian, và xem cái gì chạy trước ảnh LCP.
</Callout>

## Thứ tự tôi dùng bây giờ

<Steps>
1. **Đo ở ngoài trước.** Lighthouse trên bản production, không phải bản dev. Lấy con số tổng.
2. **Xem waterfall.** Cái gì tải, theo thứ tự nào, cái nào chặn cái nào.
3. **Xem main thread.** Style & Layout / Script / Rendering — cái nào lớn nhất.
4. **Chỉ tới bước này mới mở code.** Và mở đúng chỗ mà ba bước trên đã chỉ.
</Steps>

Cái giá của việc bỏ ba bước đầu: cả ba lần trên tôi đều tối ưu đúng kỹ thuật, đúng cách, vào **sai chỗ**. Công sức không sai, mục tiêu sai.

## Một mốc để tự kiểm

Trước khi sửa, viết ra một câu: *"Tôi tin chỗ chậm là X, và nếu đúng thì sau khi sửa con số Y sẽ giảm khoảng Z."*

Nếu không viết nổi câu đó thì bạn đang đoán, chưa đo.`,
  },

  {
    slug: 'lam-viec-mot-minh-khong-co-nghia-la-tu-do',
    title: 'Làm việc một mình không có nghĩa là tuỳ ý',
    description:
      'Dự án một người thiếu mọi thứ mà nhóm có sẵn: review, CI đỏ trước mặt người khác, và ai đó hỏi vì sao. Bốn quy tắc tôi tự đặt để bù lại.',
    published_at: '2026-04-14',
    tags: ['Nghề nghiệp', 'Năng suất'],
    takeaways: [
      'Ba thứ nhóm cho bạn miễn phí mà làm một mình thì mất',
      'Cách tự review khi không có ai review giúp',
      'Vì sao viết lý do ra giấy hiệu quả hơn nhớ trong đầu',
    ],
    featured: false,
    content: `Làm một mình nhanh hơn. Đó cũng chính là vấn đề: không có ai bắt bạn dừng lại.

## Ba thứ nhóm cho miễn phí

| Trong nhóm | Làm một mình |
| --- | --- |
| Reviewer hỏi "vì sao làm thế này" | Không ai hỏi |
| CI đỏ trước mặt cả nhóm | CI đỏ, bạn bỏ qua |
| Người khác đọc code của bạn | Chỉ bạn đọc, và bạn đã biết nó làm gì |

Cả ba đều là **ma sát có ích**. Bỏ hết thì bạn đi nhanh hơn về một hướng có thể sai.

## Bốn quy tắc tôi tự đặt

<Steps>
1. **Ngưỡng phải là số, không phải cảm giác.** "Trang này nhanh" không kiểm được. "Lighthouse ≥ 95, JS < 50KB" thì kiểm được, và kiểm được nghĩa là không tự lừa được.
2. **Viết lý do ra trước khi làm.** Một đoạn ngắn: đang giải quyết gì, đã cân nhắc cách nào, vì sao chọn cách này. Viết ra thì những chỗ chưa nghĩ tới tự lộ.
3. **Để CI chặn thật.** Nếu bạn cho phép mình bỏ qua CI đỏ thì CI không còn là cổng, chỉ là tiếng ồn.
4. **Đọc lại code của mình sau hai ngày.** Không sửa gì trong hai ngày đó. Khoảng nghỉ làm bạn đọc nó như người lạ.
</Steps>

<Callout type="tip" title="Quy tắc số 2 là quy tắc rẻ nhất và hiệu quả nhất">
  Không cần công cụ gì, không mất quá năm phút. Nhưng nó bắt bạn chuyển từ "tôi
  cảm thấy nên làm thế này" sang "đây là lý do", và hai thứ đó khác nhau rất xa.
</Callout>

<PullQuote>
  Kỷ luật trong nhóm đến từ người khác. Làm một mình thì phải tự dựng, và nó chỉ
  hoạt động khi bạn viết nó ra thành thứ kiểm được.
</PullQuote>

## Thứ tôi đã thử rồi bỏ

**Tự review qua pull request.** Tôi từng mở PR cho chính mình rồi tự approve. Vô nghĩa: tôi đọc lại ngay sau khi viết, tức là vẫn nhìn bằng con mắt vừa viết ra nó. Quy tắc "đọc lại sau hai ngày" thay thế nó và hiệu quả hơn nhiều.

**Checklist dài.** Danh sách hai mươi mục thì đến mục thứ tám tôi bắt đầu tick mà không đọc. Bốn mục thì tôi thực sự làm.

## Cách kiểm xem có đang tự lừa hay không

Một câu hỏi: *nếu có người khác trong nhóm, thay đổi này có qua được review không?*

Nếu câu trả lời là "chắc họ sẽ hỏi vì sao chỗ này làm vậy" — thì hãy tự trả lời câu đó trước khi commit.`,
  },
];

const supabase = taoClient();

const { error } = await supabase.from('posts').upsert(
  baiViet.map((b) => ({ ...b, draft: false })),
  { onConflict: 'slug' },
);

if (error) {
  console.error('✗ Nạp bài mẫu thất bại:', error.message);
  if (error.details) console.error('  ', error.details);
  process.exit(1);
}

console.log(`✓ Đã nạp ${baiViet.length} bài mẫu vào database.`);
