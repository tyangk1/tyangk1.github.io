# Hướng dẫn viết bài

Tài liệu này nói về **nội dung**, không nói về kỹ thuật. Phần kỹ thuật xem
[`README.md`](./README.md).

---

## 1. Trước khi viết: chọn đúng bài để viết

Đừng bắt đầu bằng "hôm nay viết gì". Bắt đầu bằng một trong ba nguồn sau:

1. **Thứ bạn vừa phải tự mò ra.** Nếu bạn mất hai tiếng để tìm câu trả lời, sẽ có
   người khác cũng mất hai tiếng. Đây là nguồn bài tốt nhất.
2. **Câu bạn giải thích nhiều lần cho đồng nghiệp.** Giải thích lần thứ ba là dấu
   hiệu nên viết ra.
3. **Thứ bạn từng tin là đúng và hoá ra sai.** Loại bài này được đọc nhiều nhất,
   vì rất ít người viết.

Không viết loại bài: tổng hợp lại tài liệu chính thức, dịch một bài tiếng Anh mà
không thêm gì, hoặc "10 mẹo..." mà bạn chưa dùng cái nào.

### Kiểm tra nhanh trước khi bỏ công

- Gõ chủ đề đó vào Google bằng tiếng Việt. Nếu 10 kết quả đầu đều hời hợt, bạn có
  cơ hội thật.
- Nếu đã có bài rất tốt rồi, chỉ viết khi bạn có **góc nhìn khác** hoặc **dữ liệu
  của riêng bạn**.

---

## 2. Tiêu đề

Tiêu đề quyết định bài có được bấm vào hay không. Quy tắc cho blog này:

- **Tối đa 70 ký tự.** Dài hơn thì Google cắt. Schema sẽ chặn build nếu bạn vượt.
- **Đặt từ khoá chính về đầu.** Người ta quét mắt chứ không đọc hết.
- **Cụ thể hơn là kêu to.**

| Không tốt                  | Tốt hơn                                              |
| -------------------------- | ---------------------------------------------------- |
| Những điều cần biết về CSS | Viết CSS cho tiếng Việt: dấu thanh và chiều cao dòng |
| Tối ưu website             | Giảm thời gian tải trang từ 4,2s xuống 0,9s          |
| Kinh nghiệm làm việc nhóm  | Bốn thói quen giúp tôi đọc code nhanh hơn            |

Ba dạng tiêu đề chạy tốt: **số cụ thể** ("Bốn thói quen…"), **kết quả đo được**
("…từ 4,2s xuống 0,9s"), **câu hỏi người ta thật sự gõ vào Google**.

---

## 3. Mô tả (`description`)

Đây **chính là** thẻ meta description hiện trên Google và trên ô xem trước khi
chia sẻ link. Không phải phần tóm tắt cho vui.

- **120–160 ký tự.** Build sẽ hỏng nếu sai — cố ý như vậy.
- Chứa từ khoá chính, đặt tự nhiên trong câu.
- Nói **bài này cho bạn cái gì**, không nói bài này _nói về_ cái gì.

```
✗ Bài viết này nói về cách tối ưu hình ảnh trên web.
✓ Ảnh chiếm 60% dung lượng trang trung bình. Đây là bốn bước tôi dùng để giảm
  nó xuống còn 90KB mà mắt thường không thấy khác biệt.
```

Đếm nhanh trước khi build: `pnpm check:content` liệt kê mọi bài sai độ dài cùng lúc.

---

## 4. Cấu trúc bài

```
Mở bài        3–5 câu. Nêu vấn đề cụ thể. KHÔNG chào hỏi, KHÔNG "trong thời đại 4.0".
Bối cảnh      Vì sao vấn đề này xảy ra (nếu cần).
Thân bài      Mỗi h2 là một ý trọn vẹn. Đọc riêng cũng hiểu.
Cạm bẫy       Thứ bạn làm sai lúc đầu. Phần này giá trị nhất, đừng bỏ.
Kết           Một hành động cụ thể người đọc làm được ngay hôm nay.
```

### Mở bài

Ba câu đầu quyết định người đọc ở lại hay đóng tab. Vào thẳng:

```
✗ Trong thời đại công nghệ phát triển như vũ bão hiện nay, việc tối ưu hoá
  website đóng vai trò vô cùng quan trọng...

✓ Tháng trước tôi nhận việc trong một codebase hơn hai trăm nghìn dòng và không
  ai còn ở lại từ nhóm viết ra nó. Tuần đầu tôi làm sai cách.
```

### Heading

- Chỉ dùng `##` và `###` trong nội dung. `#` dành cho tiêu đề bài, hệ thống tự sinh.
- Heading là câu **có nghĩa**, không phải nhãn: "Vì sao là Astro" tốt hơn "Astro".
- Có từ ba heading trở lên thì mục lục tự hiện. Dưới ba thì mục lục tự ẩn.

### Độ dài

Không có con số vàng. Nhưng theo kinh nghiệm với blog kỹ thuật tiếng Việt:

- **Dưới 800 từ** — thường là chưa đủ sâu để ai đó lưu lại.
- **1.200–2.000 từ** — khoảng dễ chịu cho một chủ đề trọn vẹn.
- **Trên 3.000 từ** — cân nhắc tách thành series (`seriesName` + `seriesPart`).

Viết đủ ý rồi dừng. Đừng kéo dài cho đủ số.

---

## 5. Giọng văn

- **Ngôi thứ nhất.** "Tôi đã thử" đáng tin hơn "người ta thường".
- **Câu ngắn.** Câu dài quá hai dòng thì tách.
- **Chủ động.** "Tôi bỏ Next.js" chứ không "Next.js đã bị bỏ".
- **Số cụ thể.** "Giảm 78%" chứ không "giảm đáng kể".
- **Thừa nhận cái không biết.** "Tôi chưa thử với tải lớn hơn" làm tăng độ tin cậy,
  không giảm.

Tránh: "vô cùng quan trọng", "không thể phủ nhận", "trong thời đại 4.0",
"hãy cùng tìm hiểu nhé", và mọi câu mở đầu bằng "Như chúng ta đã biết".

### Trộn tiếng Anh

Thuật ngữ kỹ thuật cứ để nguyên tiếng Anh — "commit", "deploy", "cache" dịch ra
còn khó hiểu hơn. Nhưng đừng trộn tiếng Anh vào câu văn thường: viết "tôi sẽ giải
thích" chứ không "tôi sẽ explain".

---

## 6. Code, bảng và ảnh

### Code

Luôn ghi tên ngôn ngữ, và ghi tên file nếu đoạn code thuộc về một file cụ thể:

````
```ts title="src/utils/format.ts"
export function slugify(input: string): string { … }
```
````

- Mỗi đoạn code nên **chạy được**, không phải mảnh vụn.
- Dài quá 25 dòng thì cắt, giữ phần cốt lõi.
- Comment trong code giải thích **vì sao**, không giải thích _cái gì_.

### Bảng

Bảng hợp nhất khi so sánh 2–4 phương án theo 3–5 tiêu chí. Nhiều hơn thì bảng
thành khó đọc trên điện thoại. Bảng đã được tự bọc trong khung cuộn ngang.

### Ảnh

- Đặt ảnh trong `src/assets/` rồi tham chiếu từ frontmatter — Astro tự nén và tự
  sinh AVIF/WebP.
- **Alt là bắt buộc.** Có `coverImage` mà thiếu `coverAlt` là build hỏng.
- Alt mô tả _nội dung_ ảnh, không mô tả _loại_ ảnh: "Biểu đồ cho thấy thời gian
  tải giảm từ 4,2s xuống 0,9s" chứ không "Ảnh chụp màn hình".
- Ảnh chụp màn hình code thì **luôn kèm code dạng chữ** ở gần đó — người dùng
  screen reader không đọc được ảnh, và Google cũng vậy.

---

## 6b. Bộ thành phần làm bài dễ đọc

Một bài 1.500 từ toàn chữ đọc rất nặng. Năm thành phần dưới đây dùng được trong
mọi file `.mdx` **không cần import gì** — chúng đã được khai báo sẵn ở
`src/pages/blog/[slug].astro`.

Đừng dùng quá tay. Một bài 1.500 từ hợp lý là **một hộp điểm chính + hai tới ba
callout + tối đa một câu trích lớn**. Nhiều hơn thì chúng mất tác dụng nhấn mạnh.

### Hộp điểm chính — đặt trong frontmatter, không phải trong bài

```yaml
takeaways:
  - 'Vì sao line-height 1.5 luôn chật với tiếng Việt'
  - 'Cách phát hiện font thiếu subset tiếng Việt trong ba mươi giây'
  - 'Ba dòng CSS giúp dấu thanh không lẫn vào gạch chân'
```

Hộp này tự hiện ở **đầu** bài, trước cả đoạn mở. Người đọc trên mạng quyết định
ở lại hay đóng tab trong khoảng mười giây đầu — cho họ thấy trước bài trả lời
được gì thì tỷ lệ đọc tiếp cao hơn hẳn. Giới hạn 2–4 dòng; quá bốn thì nó thành
mục lục thứ hai và mất tác dụng.

### Callout

```mdx
<Callout type="tip" title="Tiêu đề tuỳ chọn">
  Nội dung. Viết Markdown bình thường ở đây, **in đậm** và [link](/blog) đều chạy.
</Callout>
```

| `type`            | Dùng khi                                    | Màu           |
| ----------------- | ------------------------------------------- | ------------- |
| `note` (mặc định) | Bổ sung một chi tiết không thuộc mạch chính | xanh dương    |
| `tip`             | Mách một cách làm tốt hơn                   | xanh lá       |
| `warning`         | Cảnh báo một cái bẫy                        | vàng hổ phách |
| `danger`          | Việc gây hỏng hoặc mất dữ liệu              | đỏ            |

### Câu trích cỡ lớn

```mdx
<PullQuote cite="Tên người nói">Một câu duy nhất, đủ mạnh để đứng riêng.</PullQuote>
```

Nó tràn ra ngoài cột chữ trên màn hình rộng — đó chính là thứ tạo nhịp cho bài
dài. Dùng cho **một câu**, không dùng cho một đoạn. Bỏ `cite` nếu là ý của bạn.

> Nhấn mạnh trong câu trích hiện ra bằng **màu**, không phải chữ nghiêng — site
> chỉ nạp Playfair kiểu đứng.

### Các bước

```mdx
<Steps>1. **Bước đầu.** Mô tả. 2. **Bước hai.** Mô tả.</Steps>
```

Bên trong vẫn là danh sách Markdown thường. Chỉ dùng khi thứ tự **thật sự quan
trọng** — làm bước 2 trước bước 1 thì sai. Danh sách các thứ ngang hàng thì cứ
dùng gạch đầu dòng.

### Ảnh kèm chú thích

```mdx
<Figure
  src="/anh/bieu-do.png"
  alt="Biểu đồ cho thấy thời gian tải giảm từ 4,2s xuống 0,9s"
  caption="Đo trên bản production, mạng 4G chậm."
/>
```

`alt` và `caption` phải khác nhau: `caption` là thứ mọi người đọc, `alt` là thứ
dành riêng cho người dùng screen reader.

### Chèn bằng trang admin

Bốn thành phần này là **cú pháp MDX gõ trực tiếp** vào phần nội dung — không cần
import gì, đã khai báo sẵn ở `src/pages/blog/[slug].astro`.

Nội dung nằm trong database, nên chỗ gõ là ô `content` của bài trong Supabase
Studio (cục bộ: `localhost:55323`). Cứ dán đúng đoạn MDX như ví dụ ở trên.

### Thêm thành phần mới

1. Tạo file trong `src/components/mdx/`
2. Thêm vào object `mdxComponents` trong `src/pages/blog/[slug].astro`

Xong. Mọi bài cũ dùng được ngay, không phải sửa gì.

---

## 7. Liên kết nội bộ

Đây là phần dễ làm nhất mà hầu hết blog cá nhân bỏ qua.

- Mỗi bài mới nên trỏ tới **2–3 bài cũ** liên quan.
- Sau khi đăng, quay lại **1–2 bài cũ** và thêm link tới bài mới.
- Chữ được gắn link phải mô tả đích đến: "xem
  [cách chuẩn hoá slug tiếng Việt](/blog/...)" chứ không "xem [tại đây](/blog/...)".

Bài liên quan ở cuối trang được sinh tự động theo tag trùng, nhưng nó **không thay
thế** được link đặt trong dòng văn.

---

## 8. Tag

- **1–5 tag mỗi bài.**
- **Ít tag mà dùng nhất quán** tốt hơn nhiều tag dùng một lần. Một tag chỉ có
  đúng một bài là một trang gần như trống — hại nhiều hơn lợi.
- Viết có dấu ("Kiến trúc"), URL tự bỏ dấu (`/tags/kien-truc`).
- Trước khi tạo tag mới, xem `/tags` đã có tag nào gần nghĩa chưa.

---

## 9. Trước khi đăng — danh sách kiểm

```
[ ] pnpm check:content chạy sạch
[ ] Đọc to lại bài. Chỗ nào vấp là chỗ đó cần viết lại.
[ ] Mở bài có nêu vấn đề cụ thể trong 5 câu đầu không?
[ ] Mỗi h2 đọc riêng có hiểu không?
[ ] Có ít nhất một chỗ nói về cái mình làm sai / chưa biết?
[ ] Mọi đoạn code chạy được?
[ ] Có 2–3 link tới bài cũ?
[ ] Alt của mọi ảnh mô tả đúng nội dung?
[ ] Kết bài có một hành động cụ thể?
[ ] Xem thử trên điện thoại thật
[ ] Đổi draft: true → xoá dòng đó
```

### Sau khi đăng

```
[ ] Dán link vào opengraph.xyz xem ảnh xem trước
[ ] Search Console → yêu cầu lập chỉ mục URL mới
[ ] Thêm link tới bài mới vào 1–2 bài cũ liên quan
```

---

## 10. Sửa bài đã đăng

- **Sửa nhỏ** (lỗi chính tả, câu chữ): sửa thẳng, không cần ghi gì.
- **Sửa đáng kể** (đổi kết luận, thêm mục mới): thêm `updatedAt` vào frontmatter.
  Trang sẽ tự hiện "Cập nhật …" và Google nhận được `dateModified` mới.
- **Bài sai hẳn**: đừng xoá âm thầm. Thêm một ghi chú ở đầu bài nói rõ sai chỗ nào
  và vì sao. Người đọc tin bạn hơn sau một lần đính chính công khai.
- **Không đổi tên file sau khi đã đăng.** Đổi URL là vứt bỏ toàn bộ backlink. Nếu
  buộc phải đổi, thêm redirect ở nhà cung cấp hosting.

---

## 11. Nhịp đăng bài

Đều đặn quan trọng hơn nhiều. Hai bài mỗi tháng trong một năm giá trị hơn mười
bài trong một tháng rồi im lặng.

Cách giữ nhịp mà tôi thấy hiệu quả:

1. Giữ một file ghi ý tưởng, thêm vào bất cứ lúc nào nghĩ ra.
2. Viết bản nháp xấu trước, `draft: true`, không sửa gì cả.
3. Để yên hai ngày.
4. Quay lại cắt gọt — thường cắt được 30% mà bài hay hơn.
5. Đăng.

Bước 3 là bước hay bị bỏ, và cũng là bước tạo khác biệt lớn nhất.
