# Blog cá nhân

Blog tĩnh xây bằng Astro. Không dùng dịch vụ trả phí nào, chi phí vận hành 0đ/tháng
ngoài tiền tên miền.

- **Astro 7** — mặc định không gửi JavaScript nào xuống trình duyệt
- **TypeScript** chế độ `strict`
- **Tailwind CSS v4** — design token khai báo bằng CSS variable
- **MDX + Content Collections + Zod** — sai schema là build hỏng
- **Pagefind** — tìm kiếm chạy hoàn toàn trong trình duyệt
- **satori + sharp** — sinh ảnh xem trước (OG) cho từng bài lúc build
- **Ảnh bìa sinh bằng code** — mỗi bài một hình riêng, không cần đi tìm ảnh stock

Giao diện đi theo lối tạp chí: tiêu đề serif cỡ lớn, một bài chiếm trọn phần đầu
trang chủ, lưới thẻ có ảnh bìa, ảnh bìa mang nhãn chủ đề. Trang chủ đi theo ba
mật độ giảm dần (bài lớn → lưới thẻ → danh sách gọn) để trang có nhịp.

Trong bài viết có bộ thành phần **Callout / PullQuote / Steps / Figure** và hộp
**điểm chính** tự sinh từ frontmatter — xem [`CONTENT-GUIDE.md`](./CONTENT-GUIDE.md).

Hiệu ứng chuyển động (hiện dần khi cuộn, thanh tiến độ đọc) dùng CSS scroll-driven
animation nên **không tốn một dòng JavaScript nào**.

---

## Chạy ở máy

```bash
pnpm install
pnpm db:start       # Supabase cục bộ (cần Docker) — in ra URL + khoá
cp .env.example .env
#   → dán SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY vào .env
pnpm db:push        # CHẠY MỘT LẦN: nạp nội dung mẫu vào database
pnpm dev            # http://localhost:4321
```

Nội dung nằm trong **database**, không phải trong git — xem phần
[Database](#database--nơi-nội-dung-thật-sự-nằm). Chưa cấu hình database thì
`pnpm dev` vẫn chạy, chỉ in cảnh báo và dùng nội dung đang có trong `src/content/`.

Ở chế độ dev bạn sẽ thấy cả bài `draft: true` — ở production chúng bị loại hoàn toàn.

Tìm kiếm **không chạy** ở `pnpm dev`, vì chỉ mục Pagefind chỉ được dựng sau khi build.
Muốn thử tìm kiếm:

```bash
pnpm build && pnpm preview
```

---

## Lệnh

| Lệnh                  | Việc                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `pnpm db:start`       | Bật Supabase cục bộ (cần Docker). In ra URL và khoá để dán vào `.env`   |
| `pnpm db:stop`        | Tắt Supabase cục bộ                                                     |
| `pnpm db:push`        | **Một lần**: đẩy nội dung dạng file hiện có vào database                |
| `pnpm db:reset`       | Dựng lại database từ migration (xoá sạch dữ liệu)                       |
| `pnpm db:subscribers` | Xem danh sách đăng ký newsletter (`--csv` để xuất file)                 |
| `pnpm giscus:setup`   | Lấy tự động 4 giá trị cấu hình giscus: `pnpm giscus:setup owner/repo`   |
| `pnpm sync`           | Database → file, chỉ bài đã đăng                                        |
| `pnpm sync:drafts`    | Database → file, kể cả bài nháp                                         |
| `pnpm dev`            | `sync:drafts` rồi chạy máy chủ dev                                      |
| `pnpm build`          | `sync` → `astro build` → dựng chỉ mục Pagefind                          |
| `pnpm preview`        | Phục vụ `dist/` — **luôn đo hiệu năng trên bản này**, không đo trên dev |
| `pnpm typecheck`      | `astro check` — phải sạch 0 lỗi, 0 cảnh báo                             |
| `pnpm check:content`  | Kiểm độ dài `title`/`description` của mọi bài cùng lúc                  |
| `pnpm check:html`     | Quét `dist/`: id trùng, ảnh thiếu alt, link gãy, thẻ meta thiếu         |
| `pnpm check:all`      | Chạy tuần tự cả bốn lệnh trên — dùng trước khi deploy                   |
| `pnpm lighthouse`     | Sinh `lighthouse-report.html` (cần `pnpm preview` chạy ở cửa sổ khác)   |
| `pnpm format`         | Prettier                                                                |
| `pnpm icons`          | Sinh lại PNG icon từ `public/favicon.svg`                               |

---

## Đổi thành blog của bạn

Gần như mọi thứ nằm trong **một file**: `src/site.config.ts`.

```ts
export const SITE = {
  url: 'https://tenban.com',   // ĐỔI TRƯỚC KHI DEPLOY — dùng cho canonical, sitemap, RSS, ảnh OG
  title: 'Tên Của Bạn',
  tagline: '...',
  description: '...',          // 120–160 ký tự
};

export const AUTHOR = { name, bio, email, twitterHandle };
export const SOCIALS = [...];  // xoá dòng nào không dùng, footer tự ẩn
export const NAV = [...];
export const NOW = {...};      // nội dung trang /now
```

Ngoài file đó, chỉ còn ba chỗ cần sửa khi đổi chủ:

| Sửa gì                    | Ở đâu                                       |
| ------------------------- | ------------------------------------------- |
| Nội dung trang giới thiệu | `src/pages/about.astro`                     |
| Bài viết và dự án         | **Database** (Supabase) — xem phần bên dưới |
| Tên trong PWA manifest    | `public/site.webmanifest`                   |

### Đổi màu

Toàn bộ màu khai báo đúng một lần, ở đầu `src/styles/global.css`. Đổi màu nhấn
là sửa bốn dòng:

```css
:root {
  --accent: oklch(48% 0.17 258); /* màu nhấn, chế độ sáng */
  --accent-hover: oklch(40% 0.17 258);
  --on-accent: oklch(99% 0 0); /* chữ đặt TRÊN nền màu nhấn */
}
.dark {
  --accent: oklch(78% 0.13 250); /* chế độ tối cần sáng hơn */
  --on-accent: oklch(17% 0.02 255); /* nên chữ trên nó phải tối lại */
}
```

Dùng OKLCH vì độ sáng cảm nhận đồng đều: đổi số đầu là đổi độ sáng thật, không
bị lệch màu như HSL. Đổi xong nhớ kiểm tương phản — xem phần _Tự kiểm_ bên dưới.

### Ảnh bìa bài viết

Mỗi bài tự có một ảnh bìa sinh bằng code (`src/lib/cover-image.ts`), xuất ra
`/covers/<slug>.svg` — khoảng 2KB mỗi ảnh.

- **Màu** lấy từ tag đầu tiên. Các bài cùng chủ đề sẽ cùng họ màu.
- **Bố cục** lấy từ slug. Cùng một bài luôn ra đúng một hình, không tự đổi giữa
  hai lần build.
- Muốn dùng ảnh thật thay cho bìa sinh tự động: thêm `coverImage` và `coverAlt`
  vào frontmatter, bài đó sẽ dùng ảnh của bạn.

Đổi phong cách bìa thì sửa `coverSvg()` — nó chỉ là một hàm trả về chuỗi SVG.

### Đổi font

Font tự host qua Fontsource, khai báo ở đầu `global.css`:

```css
@import '@fontsource/be-vietnam-pro/400.css'; /* thân bài + giao diện */
@import '@fontsource/be-vietnam-pro/700.css'; /* nhấn mạnh, tiêu đề nhỏ */
@import '@fontsource/playfair-display/vietnamese-700.css'; /* tiêu đề lớn */
@import '@fontsource/playfair-display/latin-ext-700.css';
@import '@fontsource/playfair-display/latin-700.css';
```

Code block dùng font mono của hệ điều hành, **không nạp font mono riêng** — xem
phần đo Lighthouse bên dưới để biết vì sao.

Đổi font khác thì `pnpm add @fontsource/<tên-font>`, sửa dòng `@import` và sửa
`--font-sans` / `--font-display` trong khối `@theme inline`.

**Đừng thêm trọng lượng font nếu không thật sự cần.** Mỗi trọng lượng là ba file
phải tải (ba subset) và ba lần trình duyệt tính lại bố cục — đây là thứ tốn điểm
Performance nhiều nhất trên site này.

> **Quan trọng với tiếng Việt:** nhiều font trên Google Fonts không có subset
> tiếng Việt. Kiểm bằng cách viết "Ha Noi va Hà Nội" rồi phóng to 400% — nếu hai
> nửa trông khác nhau thì font đó thiếu dấu.

Nếu đổi font, nhớ chép file `.woff` tương ứng vào `src/assets/fonts/` và sửa
`FONT_FILES` trong `src/lib/og-image.ts`, nếu không ảnh OG sẽ mất dấu.

---

## Database — nơi nội dung thật sự nằm

Bài viết và dự án nằm trong **Supabase (Postgres)**. Đó là nguồn sự thật duy nhất.
Các file trong `src/content/` là bản sao tạm do `pnpm sync` sinh ra và đã bị
gitignore — sửa chúng là vô nghĩa, lần sync sau sẽ ghi đè.

### Luồng hoạt động

```
Supabase (Postgres)          ← sửa nội dung ở đây
      │  pnpm sync
      ▼
src/content/*.mdx | *.json   ← sinh ra rồi bỏ, không commit
      │  astro build
      ▼
dist/                        ← tĩnh 100%, Lighthouse không đổi
      │  pagefind
      ▼
CDN
```

### Vì sao đi qua file thay vì để Astro đọc thẳng database?

Bộ thành phần trong bài (Callout, PullQuote, Steps, Figure) là **MDX**, và trình
biên dịch MDX của Astro cần **file thật**. Content Layer của Astro có
`renderMarkdown()` nhưng nó chỉ dựng Markdown thuần — dùng nó là mất cả bộ
thành phần đó.

Đi qua file giữ được nguyên vẹn: MDX components, Zod validate, ảnh OG, ảnh bìa
sinh bằng code, chỉ mục Pagefind, và bản build vẫn tĩnh 100%.

### Chạy database

**Cục bộ** (cần Docker):

```bash
pnpm db:start      # in ra API_URL và SERVICE_ROLE_KEY, dán vào .env
pnpm db:push       # CHẠY MỘT LẦN: đẩy nội dung dạng file hiện có vào DB
pnpm dev           # tự sync (kể cả bài nháp) rồi chạy dev server
```

Cổng cục bộ đặt ở dải **55321–55329** chứ không phải 54321 mặc định, để không
đụng stack Supabase của project khác trên cùng máy. Xem `supabase/config.toml`.

**Hosted** (app.supabase.com, free tier 500MB):

```bash
# Project Settings → API: lấy URL và service_role key, điền vào .env
npx supabase link --project-ref <ref>
npx supabase db push          # áp dụng migration lên project thật
pnpm db:push                  # đẩy nội dung lên
```

### Sửa nội dung ở đâu

| Cách                                                                        | Khi nào                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Supabase Studio** — cục bộ ở `localhost:55323`, hosted ở app.supabase.com | Mặc định. Có table editor, sửa được mọi trường, viết MDX trong ô textarea |
| `pnpm db:push`                                                              | Bạn thích viết bằng editor: sửa file `.mdx` rồi đẩy lên DB                |
| SQL trực tiếp                                                               | Sửa hàng loạt, ví dụ đổi tên một tag ở tất cả bài                         |

> **Chưa có admin riêng.** Supabase Studio dùng được nhưng ô textarea không phải
> chỗ dễ chịu để viết bài dài. Nếu cần, bước tiếp theo là dựng một trang admin
> riêng nói chuyện với Supabase — công việc riêng, chưa làm trong bản này.

### Đăng bài = build lại

Site tĩnh nên sửa DB xong phải build lại mới thấy. Tự động hoá: Supabase
→ Database Webhooks → gọi Deploy Hook của Cloudflare Pages mỗi khi bảng `posts`
thay đổi. Build mất khoảng 10 giây.

### Ràng buộc nằm ở HAI tầng

Đây là thứ đáng giá nhất khi chuyển sang database:

| Tầng                                  | Chặn gì                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres** (`supabase/migrations/`) | Từ chối ngay lúc GHI. Tiêu đề quá 70 ký tự, mô tả ngoài khoảng 120–160, quá 5 tag, series thiếu một nửa, ảnh bìa thiếu alt → `CHECK constraint violation` |
| **Zod** (`src/content.config.ts`)     | Chặn lúc ĐỌC, bảo vệ bước build khỏi dữ liệu lạ                                                                                                           |

Hai tầng không thừa: một chặn lúc ghi, một chặn lúc đọc. Trước đây chỉ có Zod,
nghĩa là dữ liệu sai vẫn lọt vào và chỉ vỡ ở bước build.

Sửa ràng buộc thì phải sửa **cả hai chỗ** cho khớp.

### Đếm lượt xem và khối "Đọc nhiều nhất"

Đây là tín hiệu social proof mạnh nhất một blog có thể có, và nó dùng đúng
database ở trên.

| Chỗ hiện                          | Nguồn số                                                           | Vì sao                                                                     |
| --------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Dòng meta trên trang bài          | **Trực tiếp** — trình duyệt gọi database sau khi trang đã vẽ       | Số lúc build là số của lần deploy trước, có thể cũ hàng tuần               |
| Khối "Đọc nhiều nhất" ở trang chủ | **Lúc build** — từ `src/data/luot-xem.json` do `pnpm sync` sinh ra | Khối này để chỉ đường cho người mới tới, không cần chính xác tới từng lượt |

Cách hoạt động, và vì sao site vẫn tĩnh 100%:

- Trình duyệt gọi hàm Postgres `tang_luot_xem(slug)` bằng **khoá công khai**
  (`PUBLIC_SUPABASE_ANON_KEY`). Không có máy chủ nào ở giữa, không cần adapter.
- Hàm đó là `security definer` và **tự kiểm slug có thật + đã đăng** trước khi
  cộng. Slug bịa ra trả về 0 và không tạo dòng rác nào.
- Khoá công khai **không** có quyền ghi trực tiếp lên bảng — đã kiểm bằng cách
  thử `POST /rest/v1/post_views`: trả về lỗi `42501 insufficient_privilege`.
- `fetch` chạy **sau** khi trang vẽ xong nên không ảnh hưởng LCP.

Hai ngưỡng cố ý đặt ra:

- Bài **dưới 5 lượt** thì không hiện số. "1 lượt đọc" nói với người đọc rằng
  chưa ai đọc — tệ hơn là không hiện gì.
- Khối "Đọc nhiều nhất" chỉ hiện khi có **ít nhất 3 bài đạt từ 20 lượt**. Sửa
  ngưỡng ở `baiDocNhieuNhat()` trong `src/utils/views.ts`.

**Giới hạn đã biết:** chống trùng chỉ dựa vào `sessionStorage`, tức là chặn được
việc F5 nhiều lần (kể cả chính bạn khi đang viết), nhưng **không** chặn được bot
gọi thẳng API. Với blog cá nhân thì đủ; cần chắc hơn thì thêm rate limit ở
Supabase Edge Function hoặc dùng Umami làm con số chính thức.

### Bình luận (giscus)

Chạy một lệnh, nó in ra đúng bốn dòng để dán vào `.env`:

```bash
pnpm giscus:setup tenban/blog
```

Repo phải đủ ba điều kiện: **public**, đã bật **Discussions**
(Settings → Features), và đã cài app [giscus](https://github.com/apps/giscus).
Thiếu cái nào script cũng nói rõ và chỉ đúng chỗ bật.

Script tự chọn category **Announcements** nếu có — chỉ chủ repo mở được thread
mới ở đó, nên khách không tạo được discussion rác.

Đã kiểm: iframe tải đúng, dùng locale tiếng Việt (`giscus.app/vi/widget`), và tự
đổi sáng/tối theo nút trên site. Iframe dùng `data-loading="lazy"` nên chỉ tải
khi người đọc cuộn xuống tới — không ảnh hưởng điểm hiệu năng.

### Newsletter

Khối đăng ký chạy ở một trong hai chế độ, tự chọn theo cấu hình có sẵn:

| Chế độ         | Khi nào                                        | Ưu                                                                                                | Nhược                                                |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **`provider`** | có `PUBLIC_NEWSLETTER_ACTION`                  | Nhà cung cấp lo gửi thư, xác nhận, huỷ đăng ký, và khả năng vào inbox. Chạy cả khi tắt JavaScript | Phụ thuộc bên thứ ba                                 |
| **`supabase`** | bỏ trống biến trên, có khoá công khai Supabase | Chạy ngay, không cần tài khoản ngoài, email nằm trong database của bạn                            | **Chưa gửi được thư** — xem bên dưới. Cần JavaScript |

**Nên dùng `provider`.** Buttondown free tier 100 người đăng ký, mất 2 phút để
có URL. Gửi thư đúng cách (SPF, DKIM, xử lý bounce, link huỷ đăng ký) là việc
khó hơn nó trông, và không đáng tự làm cho một blog cá nhân.

Chế độ `supabase` là để khối đăng ký **không bao giờ là một cái form chết**.
Đã kiểm bằng thao tác thật trên trình duyệt:

| Trường hợp                                 | Kết quả                                 |
| ------------------------------------------ | --------------------------------------- |
| Email mới                                  | "Đã ghi nhận" · lưu vào database        |
| Email trùng                                | "Địa chỉ này đã có trong danh sách rồi" |
| Chữ HOA + khoảng trắng                     | Chuẩn hoá thành cùng một địa chỉ        |
| `a@b` (trình duyệt cho qua, database chặn) | "Địa chỉ email không đúng"              |
| Bẫy bot có chữ                             | Báo thành công nhưng **không** lưu      |
| Khoá công khai đọc danh sách email         | **Bị chặn** (lỗi `42501`)               |

Bảo mật ở đây là phần quan trọng nhất: bảng `newsletter_subscribers` bật RLS mà
**không có policy select nào**, nên không ai đọc được dòng nào bằng khoá công
khai. Khách chỉ gọi được ba hàm (`dang_ky_newsletter`, `xac_nhan_newsletter`,
`huy_newsletter`) và cả ba đều chỉ trả về mã trạng thái, không trả dữ liệu.

Xem danh sách đã thu (chỉ chạy được ở máy có `service_role`):

```bash
pnpm db:subscribers              # xem trên màn hình
pnpm db:subscribers --csv        # xuất CSV để nạp vào nhà cung cấp mail
```

#### ⚠ Phần chưa làm: gửi thư

Chế độ `supabase` **thu** được email nhưng **chưa gửi** được. Bảng đã có sẵn
`confirm_token` và `unsubscribe_token`, hai hàm xác nhận/huỷ cũng đã có — chỉ
thiếu phần gửi.

Tôi cố ý không tự dựng phần gửi: nó cần một nhà cung cấp (Resend free 3.000
mail/tháng), template email, cấu hình DNS cho SPF/DKIM, và xử lý bounce. Làm nửa
vời thì thư vào thẳng thư mục spam, và một danh sách email không gửi được còn tệ
hơn là không có.

Thiết kế hai bước bảo vệ bạn trong lúc chờ: chỉ gửi cho người `confirmed = true`,
nên nếu ai đó bơm hàng nghìn email bịa vào bảng thì họ vẫn **không** làm bạn gửi
thư rác cho ai — các dòng đó mãi ở trạng thái chưa xác nhận.

Hai đường đi tiếp, chọn một:

1. **Chuyển sang `provider`** — điền `PUBLIC_NEWSLETTER_ACTION`, xuất danh sách
   cũ bằng `pnpm db:subscribers --csv` rồi nạp vào đó. Nhanh nhất.
2. **Tự gửi** — thêm một Supabase Edge Function gọi Resend, gửi thư xác nhận
   chứa link tới `xac_nhan_newsletter(token)`, và thêm trang `/newsletter/huy`
   gọi `huy_newsletter(token)`.

### Row Level Security

RLS bật trên cả hai bảng. Khoá công khai (`anon`) chỉ đọc được bài đã đăng — kể
cả khi khoá đó lộ thì bài nháp vẫn không xem được. Script build dùng khoá
`service_role` (bỏ qua RLS) nên ở dev vẫn xem trước được bài nháp.

⚠️ `SUPABASE_SERVICE_ROLE_KEY` không bao giờ được lọt vào code phía trình duyệt.
Tên biến cố tình **không** có tiền tố `PUBLIC_` — Astro chỉ đưa biến `PUBLIC_*`
vào bundle client, nên cách đặt tên này tự bảo vệ.

---

## Các trường của một bài viết

| Trường trong DB      | Frontmatter   | Bắt buộc | Ghi chú                                                  |
| -------------------- | ------------- | -------- | -------------------------------------------------------- |
| `slug`               | (tên file)    | ✓        | Chính là URL. **Không đổi sau khi đã đăng**              |
| `title`              | `title`       | ✓        | ≤ 70 ký tự                                               |
| `description`        | `description` | ✓        | 120–160 ký tự                                            |
| `content`            | (thân bài)    | ✓        | MDX                                                      |
| `published_at`       | `publishedAt` | ✓        | `YYYY-MM-DD`                                             |
| `tags`               | `tags`        | ✓        | 1–5 tag, viết có dấu; URL tự bỏ dấu                      |
| `takeaways`          | `takeaways`   |          | Bỏ trống hoặc 2–4 dòng                                   |
| `content_updated_at` | `updatedAt`   |          | Chỉ điền khi sửa nội dung đáng kể                        |
| `series_name`        | `seriesName`  |          | Điền cùng `seriesPart` hoặc bỏ trống cả hai              |
| `series_part`        | `seriesPart`  |          | Số phần, từ 1                                            |
| `cover_image`        | `coverImage`  |          | Bỏ trống thì tự sinh bìa. Có ảnh thì **bắt buộc** có alt |
| `cover_alt`          | `coverAlt`    |          |                                                          |
| `draft`              | `draft`       |          | `true` = không lên production                            |
| `featured`           | `featured`    |          | Bài featured mới nhất chiếm phần đầu trang chủ           |

Hướng dẫn viết nội dung chuẩn SEO: xem [`CONTENT-GUIDE.md`](./CONTENT-GUIDE.md).

---

## Bật các tính năng tuỳ chọn

Chép `.env.example` thành `.env`. Thiếu biến nào thì tính năng đó tự tắt, site vẫn chạy.

| Tính năng              | Cần gì                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Bình luận** (giscus) | `pnpm giscus:setup <owner>/<repo>` → in ra 4 giá trị để dán vào `.env`                                                             |
| **Lượt xem**           | `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY` — đã có nếu bạn dùng database                                                   |
| **Newsletter**         | Chạy sẵn bằng database. Muốn gửi được thư thì điền `PUBLIC_NEWSLETTER_ACTION`                                                      |
| **Thống kê** (Umami)   | Tạo site ở [cloud.umami.is](https://cloud.umami.is) (free 100k lượt/tháng) → điền `PUBLIC_UMAMI_WEBSITE_ID`. Chỉ chạy ở production |

---

## Deploy

### Cloudflare Pages (khuyến nghị — băng thông không giới hạn)

1. Push code lên GitHub.
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → kết nối repo.
3. Build command: `pnpm build` · Output directory: `dist`
4. Thêm biến môi trường (nếu dùng) trong Settings → Environment variables.
5. Custom domain → trỏ về tên miền của bạn.

File `public/_headers` đã cấu hình sẵn cache và header bảo mật.

### Vercel

Import repo, Vercel tự nhận Astro. `vercel.json` đã có sẵn cấu hình cache.

### Sau khi deploy — làm ngay

1. Sửa `SITE.url` trong `src/site.config.ts` thành domain thật rồi build lại.
2. Thêm site vào [Google Search Console](https://search.google.com/search-console),
   nộp `https://tenban.com/sitemap-index.xml`.
3. Thêm vào [Bing Webmaster Tools](https://www.bing.com/webmasters).
4. Dán một link bài viết vào [opengraph.xyz](https://www.opengraph.xyz) xem ảnh OG
   có hiện đúng không.
5. Kiểm JSON-LD bằng [Rich Results Test](https://search.google.com/test/rich-results).

---

## Tự kiểm trước khi deploy

```bash
pnpm check:all       # typecheck + frontmatter + build + quét HTML
pnpm preview         # ở một cửa sổ khác
pnpm lighthouse      # sinh lighthouse-report.html
```

### Kết quả đo được

Lighthouse 12.8, **chế độ mobile mặc định** (mạng 4G chậm, CPU chậm 4×) — bản
chấm khắt khe hơn desktop nhiều. Chạy 5 lần mỗi trang trên bản `pnpm preview`,
lấy trung vị:

| Trang          | Performance      | Accessibility | Best Practices | SEO     |
| -------------- | ---------------- | ------------- | -------------- | ------- |
| Trang chủ      | **100** (99–100) | **100**       | **100**        | **100** |
| Trang bài viết | **99** (99)      | **100**       | **100**        | **100** |
| Danh sách bài  | **100** (99–100) | **100**       | **100**        | **100** |

Core Web Vitals (mobile): LCP 1,9–2,1s · TBT 0–8ms · **CLS 0** ở cả ba trang.

### Responsive — đã đo, không phải đoán

Quét bằng script Playwright: **452 phép đo** trên 11 trang.

| Hạng mục                        | Phạm vi                              | Kết quả                    |
| ------------------------------- | ------------------------------------ | -------------------------- |
| Tràn ngang                      | 22 bề rộng (320 → 2560px) × 11 trang | **0 lỗi**                  |
| Điện thoại nằm ngang            | 568×320, 740×360, 844×390, 932×430   | **0 lỗi**                  |
| Vùng bấm (WCAG 2.5.8, ≥24×24px) | 6 bề rộng × 11 trang                 | **0 lỗi**                  |
| Phóng chữ 150%                  | 6 bề rộng × 11 trang                 | **0 lỗi**                  |
| Phóng chữ 200%                  | 6 bề rộng × 11 trang                 | còn sót ở 320px (xem dưới) |

Cách chạy lại: xem `scripts/` — hoặc mở DevTools, kéo cửa sổ và xem
`document.documentElement.scrollWidth` có lớn hơn `clientWidth` không.

**Giới hạn đã biết:** ở bề rộng **320px** kết hợp **phóng chỉ-chữ 200%**, trang
còn tràn 1–7px (trang `/projects` là 50px). Đây là tổ hợp của màn hình nhỏ nhất
còn dùng và một chế độ chỉ Firefox có (“Zoom text only”, mặc định tắt). Phóng
to bình thường bằng Ctrl+ + không bị — vì nó phóng cả khung nhìn, và ở 320px
không phóng thì trang sạch hoàn toàn. Nếu cần chữa hẳn thì phải chuyển các cỡ
cố định (nút icon, khoảng đệm thẻ) từ `rem` sang `px`, đổi lại là chúng không
lớn lên theo cỡ chữ người dùng chọn — một đánh đổi ngược về mặt accessibility.

### Bốn thứ đã phải sửa để responsive sạch

1. **Câu trích phá khổ sai ngưỡng.** `min-width: 60rem` làm nó tràn ra ngoài mép
   trái 36px trong khoảng 960–1279px, vì từ 1024px trang bài đã sang lưới hai cột
   và cột chữ nằm sát mép. Đã nâng lên `80rem`.
2. **Hơn 30 vùng bấm chỉ cao 17–20px** (nhãn chủ đề trên bìa, link chân trang,
   "Xem trang", breadcrumb…). Đã thêm class `.tap` nới vùng chạm lên 24px bằng
   padding dọc — không đổi cỡ chữ.
3. **Header không xuống dòng được.** Ba nút icon `size-9` khi phóng chữ 200%
   thành 72px mỗi cái và tràn ra. Đã đổi `h-16` cố định thành `min-h-16` +
   `flex-wrap`.
4. **Chân trang hai cột và thẻ trạng thái ở /projects** cũng không xuống dòng.
   Đã thêm `flex-wrap`, cộng `overflow-wrap: break-word` trên `body` làm lưới an
   toàn cho từ dài.

### Ngưỡng đặt ra cho dự án

| Chỉ số                    | Ngưỡng               | Hiện tại                          |
| ------------------------- | -------------------- | --------------------------------- |
| Lighthouse Performance    | ≥ 95                 | 99–100                            |
| Lighthouse Accessibility  | 100                  | 100                               |
| Lighthouse Best Practices | ≥ 95                 | 100                               |
| Lighthouse SEO            | 100                  | 100                               |
| JavaScript mỗi trang      | < 50KB gzip          | 1,4KB trang chủ · 3,1KB trang bài |
| Cumulative Layout Shift   | < 0,1                | 0                                 |
| Tương phản màu            | WCAG AA sáng lẫn tối | đạt                               |

### Bốn thứ đã phải sửa để đạt các con số trên

Tất cả đều liên quan tới font hoặc màu. Ghi lại vì nếu bạn đổi cấu hình thì rất
dễ vô tình làm hỏng lại:

1. **Theme code block phải là bản high-contrast.** `github-light` có token màu cam
   `#E36209` chỉ đạt 3,48:1 trên nền trắng — Lighthouse chấm rớt accessibility
   xuống 96. Đổi sang `github-light-high-contrast` / `github-dark-high-contrast`.

2. **Chỉ nạp hai trọng lượng font sans.** Tiếng Việt cần cả ba subset (`latin`,
   `latin-ext` cho ơ/ư, `vietnamese`), nên mỗi trọng lượng thêm vào là ba file
   phải tải và ba lần trình duyệt tính lại bố cục toàn trang. Lúc còn nạp cả
   trọng lượng 600, Style & Layout lên tới ~890ms và TBT vọt hơn 300ms.

3. **Không nạp font mono riêng.** Code block là vùng DOM lớn nhất trên trang bài
   viết, nên đó là chỗ font swap gây tính lại bố cục đắt nhất. Dùng font mono của
   hệ điều hành: bớt 3 request và giảm Style & Layout khoảng một nửa.

4. **Preload font — nhưng CHỈ font của khung hình đầu.** Đây là chỗ ngược trực
   giác nhất:

   | Cách làm                             | Perf trang bài viết | TBT     | CLS   |
   | ------------------------------------ | ------------------- | ------- | ----- |
   | Không preload                        | 89–92               | ~450ms  | 0,035 |
   | Preload cả 9 file                    | 93                  | ~240ms  | 0     |
   | **Preload 6 file cần cho khung đầu** | **99**              | **8ms** | **0** |

   Preload cả 9 file thì 150KB font tranh băng thông với ảnh LCP. Bỏ ba file
   trọng lượng 700 ra khỏi danh sách preload (chúng chỉ dùng cho chữ đậm và tiêu
   đề mục dưới màn hình đầu) là vừa hết reflow vừa không chặn ảnh.

Kiểm tương phản khi đổi màu: mở DevTools → chọn phần tử → hover vào ô màu, Chrome
hiện sẵn tỷ lệ tương phản. Chữ thường cần ≥ 4,5:1, chữ lớn ≥ 3:1.

---

## Cấu trúc thư mục

```
supabase/
  config.toml         ← cấu hình Supabase cục bộ (cổng 55321+)
  migrations/*.sql    ← schema database + ràng buộc + RLS
scripts/
  db-push.mjs         ← file → database (chạy một lần)
  db-sync.mjs         ← database → file (bước đầu của build)
src/
  site.config.ts      ← MỌI thông tin cá nhân nằm ở đây
  env.ts              ← đọc biến môi trường, gom một chỗ
  content.config.ts   ← schema Zod cho bài viết và dự án
  content/
    blog/*.mdx        ← bài viết
    projects/*.json   ← mỗi dự án một file
  styles/global.css   ← design token + typography bài viết
  lib/
    icons.ts          ← dữ liệu SVG icon nội tuyến
    routes.ts         ← cấu trúc URL, gom một chỗ
    og-image.ts       ← ảnh xem trước khi chia sẻ (PNG, satori + sharp)
    cover-image.ts    ← ảnh bìa bài viết (SVG sinh bằng code)
    rehype-content.ts ← neo heading, nút copy, khung cuộn bảng (chạy lúc build)
  utils/
    posts.ts          ← nguồn duy nhất để lấy bài viết
    format.ts         ← ngày tháng, slug bỏ dấu tiếng Việt, URL tuyệt đối
    readingTime.ts
  components/         ← thành phần giao diện
  layouts/            ← khung trang
  pages/              ← route
scripts/              ← script tự kiểm, chạy bằng node thuần
```

### Vài quyết định cần biết

- **`getPublishedPosts()` là cửa duy nhất để lấy bài.** Quy tắc "draft không lên
  production" chỉ tồn tại ở đó. Gọi thẳng `getCollection('blog')` ở nơi khác sẽ
  làm rò rỉ bài nháp.
- **Nút copy và neo heading được chèn lúc build** (`src/lib/rehype-content.ts`),
  không phải sửa DOM lúc chạy. Nhờ vậy không nhảy layout và trang vẫn đủ khi JS
  bị chặn.
- **Script chống nháy dark mode phải là `is:inline`** và nằm trong `<head>`.
  Bỏ `is:inline` thì Astro gom nó vào bundle `type="module"`, mà module luôn bị
  hoãn — đúng thứ cần tránh.
- **Pagefind nạp bằng script `is:inline`** trong `search.astro`. Nếu để Vite xử
  lý lệnh `import()` đó, nó chèn placeholder `__VITE_PRELOAD__` không được thay
  thế và trang tìm kiếm sẽ hỏng.

---

## Chưa làm (P2)

Có chủ đích để lại, thêm khi thật sự cần:

- Song ngữ Việt–Anh (i18n)
- Trang `/uses` liệt kê công cụ
- RSS riêng theo từng tag
- Trang chỉ mục cho series
- Sinh ảnh OG cho cả trang tag và trang dự án

---

## Giấy phép

Mã nguồn: MIT. Nội dung bài viết trong `src/content/`: thuộc về tác giả.
