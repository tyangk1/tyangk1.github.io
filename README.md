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

Nội dung được **soạn trong database** rồi `pnpm sync` ra file MDX, và **file đó
được commit** — xem phần [Database](#database--nơi-nội-dung-thật-sự-nằm). Chưa
cấu hình database thì `pnpm dev` vẫn chạy, chỉ in cảnh báo và dùng nội dung đang
có trong `src/content/`.

Ở chế độ dev bạn sẽ thấy cả bài `draft: true` — ở production chúng bị loại hoàn toàn.

Tìm kiếm **không chạy** ở `pnpm dev`, vì chỉ mục Pagefind chỉ được dựng sau khi build.
Muốn thử tìm kiếm:

```bash
pnpm build && pnpm preview
```

---

## Lệnh

| Lệnh                       | Việc                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `pnpm db:start`            | Bật Supabase cục bộ (cần Docker). In ra URL và khoá để dán vào `.env`   |
| `pnpm db:stop`             | Tắt Supabase cục bộ                                                     |
| `pnpm db:push`             | **Một lần**: đẩy nội dung dạng file hiện có vào database                |
| `pnpm db:reset`            | Dựng lại database từ migration (xoá sạch dữ liệu)                       |
| `pnpm db:gop`              | Gộp migration thành 1 file dán được vào SQL Editor, chạy lại được       |
| `pnpm admin`               | **Trang viết và quản lý bài**, chạy cục bộ ở `127.0.0.1:4322`           |
| `pnpm db:subscribers`      | Xem danh sách đăng ký newsletter (`--csv` để xuất file)                 |
| `pnpm newsletter:xac-nhan` | Gửi thư xác nhận cho người mới đăng ký. **Mặc định chạy thử**           |
| `pnpm newsletter:gui`      | Gửi thông báo bài mới: `--bai=<slug>`. **Mặc định chạy thử**            |
| `pnpm giscus:setup`        | Lấy tự động 4 giá trị cấu hình giscus: `pnpm giscus:setup owner/repo`   |
| `pnpm giscus:bat`          | Bật bình luận trên bản deploy: đặt Actions variables + chạy Deploy      |
| `pnpm anh:upload`          | Ảnh ở máy → Supabase Storage, in ra URL để dán vào bài                  |
| `pnpm format:check`        | Prettier ở chế độ chỉ kiểm — CI chạy lệnh này, đỏ là chặn merge         |
| `pnpm sync`                | Database → file, chỉ bài đã đăng                                        |
| `pnpm sync:drafts`         | Database → file, kể cả bài nháp                                         |
| `pnpm dev`                 | `sync:drafts` rồi chạy máy chủ dev                                      |
| `pnpm build`               | `sync` → `astro build` → Pagefind. **Vỡ nếu không nối được database**   |
| `pnpm build:ci`            | Như trên nhưng **bỏ** bước `sync` — dùng trong CI, build thẳng từ file  |
| `pnpm preview`             | Phục vụ `dist/` — **luôn đo hiệu năng trên bản này**, không đo trên dev |
| `pnpm typecheck`           | `astro check` — phải sạch 0 lỗi, 0 cảnh báo                             |
| `pnpm check:content`       | Kiểm độ dài `title`/`description` của mọi bài cùng lúc                  |
| `pnpm check:html`          | Quét `dist/`: id trùng, ảnh thiếu alt, link gãy, thẻ meta thiếu         |
| `pnpm check:all`           | Chạy tuần tự cả bốn lệnh trên — dùng trước khi deploy                   |
| `pnpm lighthouse`          | Sinh `lighthouse-report.html` (cần `pnpm preview` chạy ở cửa sổ khác)   |
| `pnpm format`              | Prettier                                                                |
| `pnpm icons`               | Sinh lại PNG icon từ `public/favicon.svg`                               |

---

## Đổi thành blog của bạn

Gần như mọi thứ nằm trong **một file**: `src/site.config.ts`.

```ts
export const SITE = {
  url: 'https://tyangk1.github.io', // dùng cho canonical, sitemap, RSS, ảnh OG
  title: 'Thân Trọng Trường Giang',
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

### Ảnh trong bài — Supabase Storage

Ảnh nằm trong bucket **`anh-blog`** (public, giới hạn 5MB, chỉ nhận png/jpeg/webp/avif/gif/svg).

```bash
pnpm anh:upload ./anh/so-do.png
pnpm anh:upload ./anh/*.jpg --thu-muc=cache-http --rong=1600
```

Script làm bốn việc trước khi tải lên:

| Việc                                | Vì sao                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Bỏ dấu tên file                     | `Sơ đồ Cache.png` → `so-do-cache.webp`. Tên có dấu và khoảng trắng thành URL khó đọc, dễ lỗi |
| Thu nhỏ về `--rong` (mặc định 1600) | Ảnh điện thoại 4000px là vô nghĩa khi cột chữ chỉ 704px                                      |
| Chuyển WebP q82                     | Chỉ nhận nếu **nhỏ hơn** bản gốc — ảnh đã tối ưu sẵn thì WebP đôi khi phình ra               |
| `cacheControl: 31536000`            | Supabase mặc định trả `cache-control: no-cache`, tức mỗi người đọc tải lại ảnh từ đầu. Đã đo |

Nó in ra URL công khai kèm dòng để dán thẳng vào bài:

```yaml
coverImage: https://<ref>.supabase.co/storage/v1/object/public/anh-blog/2026/so-do.webp
coverAlt: mô tả ảnh bằng một câu
```

```mdx
<Figure src="https://<ref>.supabase.co/..." alt="..." caption="..." />
```

**Ảnh được tải về và tối ưu lúc BUILD, không phải lúc chạy.** `astro.config.ts`
suy ra host Supabase từ `PUBLIC_SUPABASE_URL` và đưa vào `image.domains`, nên
Astro tải ảnh gốc về, sinh AVIF/WebP nhiều kích thước kèm `srcset`, rồi phục vụ
từ chính GitHub Pages. Đã kiểm: một ảnh 35KB ra bốn biến thể 8,8–17KB và thẻ
`srcset` đủ 640w/960w/1280w.

Nghĩa là Supabase Storage chỉ là **chỗ chứa ảnh gốc**. Site vẫn tĩnh 100%, không
tốn băng thông Supabase mỗi lần có người đọc, và Storage sập cũng không ảnh hưởng
người đang đọc.

Vì vậy `Figure` phân nhánh theo kiểu `src`: URL tuyệt đối đi qua `<Image inferSize>`,
đường dẫn trong `public/` giữ `<img>` thường. Bản trước dùng `<img>` cho mọi thứ
với `width`/`height` **tuỳ chọn** — quên điền là ảnh đẩy chữ xuống khi tải xong,
và người viết sẽ quên.

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

Bài viết và dự án được **soạn** trong **Supabase (Postgres)**. Đó là nguồn sự thật
lúc soạn: sửa file trong `src/content/` bằng tay là vô nghĩa, lần `pnpm sync` sau
sẽ ghi đè.

Nhưng những file đó **được commit**, không gitignore. Lý do: database chạy cục bộ
nên CI và máy build không với tới được; checkout mới mà không có file nội dung thì
`db-sync.mjs` thoát mã 1 và build vỡ mọi lần. Quan hệ giống `pnpm-lock.yaml` —
sinh bằng máy nhưng vẫn commit để build ở đâu cũng ra một kết quả. Xem mục
[Deploy](#deploy).

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

**Hosted** (supabase.com/dashboard, free tier 500MB):

```bash
# Project Settings → API keys: lấy URL + secret key + publishable key, điền .env
npx supabase link --project-ref <ref>
npx supabase db push          # áp dụng migration lên project thật
pnpm db:push                  # đẩy nội dung lên
```

#### Trạng thái hiện tại — còn một bước phải chạy bằng tay

`.env` đã trỏ sang project hosted **`aglhmdrxpiwvnafctbxy`**. Đã làm xong:

| Việc                                                            | Trạng thái                                    |
| --------------------------------------------------------------- | --------------------------------------------- |
| Bucket `anh-blog` + script `pnpm anh:upload`                    | ✅ chạy được, đã kiểm upload/đọc/cache/tối ưu |
| `astro.config.ts` cho phép host Storage                         | ✅                                            |
| **Bảng** posts / projects / post_views / newsletter_subscribers | ❌ **chưa có**                                |

Bốn bảng đó trả 404 — project trắng, chưa chạy migration lần nào. Tạo bảng là
lệnh **DDL**, và DDL không đi qua REST API được. Nó cần một trong hai thứ mà chỉ
chủ project có:

| Đường                    | Cần gì                                 |
| ------------------------ | -------------------------------------- |
| `supabase db push`       | Đăng nhập CLI **và** mật khẩu database |
| Management API           | Personal access token `sbp_...`        |
| **SQL Editor** (dễ nhất) | Không cần gì thêm — chỉ dán và bấm Run |

**Cách 1 — SQL Editor, khuyên dùng.** Không phải cấp thêm khoá cho ai:

1. Mở SQL Editor của project trên `supabase.com/dashboard`
2. Dán toàn bộ [`supabase/migrate-mot-lan.sql`](./supabase/migrate-mot-lan.sql)
3. Bấm **Run**

File đó do `pnpm db:gop` sinh từ `supabase/migrations/`. Nó không chỉ nối file —
`create table`/`create index` được đổi thành `if not exists`, còn
`create trigger`/`create policy` được chèn `drop ... if exists` ngay trước, vì
Postgres không có `or replace` cho hai loại đó. **Đã kiểm bằng cách chạy thật**
trên một database trắng với `ON_ERROR_STOP=1`: hai lần liên tiếp đều exit 0, và
kết quả có đúng 4 bảng (RLS bật cả 4), 5 hàm, 5 policy.

**Cách 2 — CLI.** Cần đăng nhập CLI trước, đây là chỗ hay bị vướng:

```bash
npx supabase login                 # mở trình duyệt để lấy access token
npx supabase link --project-ref aglhmdrxpiwvnafctbxy
npx supabase db push               # hỏi mật khẩu database
```

Mật khẩu database ở **Project Settings → Database → Database password** (quên thì
Reset tại đó). Thiếu bước `login` thì `link` báo lỗi xác thực, không phải lỗi mật
khẩu — dễ đi sai hướng.

**Sau khi bảng đã có** (bước này chạy được với khoá API, không cần mật khẩu):

```bash
pnpm db:push        # nạp 8 bài + 4 dự án lên project mới
pnpm sync           # kéo về lại thành file, rồi commit
```

Cho tới khi chạy xong, `pnpm sync` / `pnpm dev` / `pnpm build` đều dừng với
thông báo chỉ đúng hai lệnh trên — `db-sync.mjs` phân biệt được "database không
kết nối được" và "kết nối được nhưng chưa có bảng", nên nó không dẫn bạn đi sai.
`pnpm build:ci` thì vẫn chạy vì nó không cần database.

Xong bước đó thì bật hai tính năng đang tắt trên site thật:

```bash
gh variable set PUBLIC_SUPABASE_URL      -b https://aglhmdrxpiwvnafctbxy.supabase.co
gh variable set PUBLIC_SUPABASE_ANON_KEY -b sb_publishable_pp4Q9Aip0P6G01lCkoQjLg_AW5LAqTu
gh workflow run Deploy
```

Đặt hai biến này **trước** khi có bảng thì tệ hơn là không đặt: đếm lượt xem và
form newsletter sẽ gọi API rồi lỗi ngay trước mặt người đọc. Để trống thì chúng
tự ẩn sạch sẽ.

> **Không bao giờ** đặt `SUPABASE_SERVICE_ROLE_KEY` vào GitHub Actions. CI dùng
> `build:ci` nên không cần database — bí mật không tồn tại ở đó là bí mật không
> thể rò rỉ ở đó.

### Sửa nội dung ở đâu

| Cách                                                                        | Khi nào                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Supabase Studio** — cục bộ ở `localhost:55323`, hosted ở app.supabase.com | Mặc định. Có table editor, sửa được mọi trường, viết MDX trong ô textarea |
| `pnpm db:push`                                                              | Bạn thích viết bằng editor: sửa file `.mdx` rồi đẩy lên DB                |
| SQL trực tiếp                                                               | Sửa hàng loạt, ví dụ đổi tên một tag ở tất cả bài                         |

### Trang admin — `pnpm admin`

```bash
pnpm admin      # http://127.0.0.1:4322
```

Danh sách bài bên trái, trình soạn bên phải. Làm được: tạo · sửa · xoá bài, tải
ảnh lên (chọn file hoặc **kéo thả**), và bấm **Đồng bộ** để chạy `pnpm sync` ngay
trong trang.

#### Ô soạn thân bài

Có tô màu cú pháp MDX (heading, thẻ component, `code`, đậm/nghiêng, link, danh
sách, khối code), thanh công cụ, và phím tắt `Ctrl+B` / `Ctrl+I` / `Ctrl+K`.
`Tab` chèn hai dấu cách thay vì nhảy focus.

Thanh công cụ có nút chèn sẵn **Callout · Steps · Figure · PullQuote** — đỡ phải
nhớ cú pháp và đỡ gõ sai tên thuộc tính.

Cách tô màu: một `<pre>` màu nằm **dưới**, một `<textarea>` chữ trong suốt nằm
**trên**, hai lớp dùng đúng cùng font, padding và line-height. Đã đo: lệch chiều
cao nội dung giữa hai lớp là **0px**, nên con trỏ nằm khít trên chữ.

Vì sao không dùng CodeMirror hay `contenteditable`: gõ tiếng Việt bằng Telex/VNI
đi qua **IME** của hệ điều hành, và IME chỉ hoạt động đáng tin trên `<textarea>`
gốc. Một trình soạn "xịn" hơn mà ăn mất dấu là đánh đổi tệ nhất có thể cho blog
tiếng Việt. Cách này còn giữ nguyên undo, chọn chữ và kiểm chính tả của trình duyệt.

#### Xem trước — dùng chính site, không phải bản xấp xỉ

Bấm **Xem trước** để chia đôi màn hình: soạn bên trái, trang thật bên phải.

Nó không tự dựng bộ render riêng. Nó lưu bài → chạy `pnpm sync:drafts` → nhúng
`localhost:4321/blog/<slug>` vào iframe. Nghĩa là xem trước dùng **đúng**
component, đúng CSS, đúng font của bài thật — không có chuyện xem trước một kiểu
mà site ra một kiểu.

Đánh đổi: cần `pnpm dev` chạy song song. Admin tự kiểm và nói rõ nếu chưa có, thay
vì để bạn nhìn một iframe trắng. Dùng `sync:drafts` vì bài đang viết gần như luôn
là nháp — `pnpm sync` thường thì loại nháp và xem trước sẽ ra 404.

Những chi tiết đáng nói:

| Chi tiết                                               | Vì sao                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Đếm ký tự sống cho tiêu đề và mô tả                    | Ràng buộc 70 và 120–160 nằm ở tầng database. Biết mình đang ở 118 ký tự tốt hơn là bị Postgres từ chối |
| Gõ tiêu đề tự sinh slug, bỏ dấu                        | Cùng công thức `slugify()` của site. **Chỉ cho bài mới** — đổi slug bài đã đăng là làm gãy mọi link cũ |
| Bài mới mặc định là **nháp**                           | Không ai muốn lỡ tay đăng một bài viết nửa vời                                                         |
| Ảnh đầu tiên tự thành ảnh bìa, ảnh sau chèn `<Figure>` | Đỡ một bước dán tay, và nhắc điền `alt` ngay                                                           |
| `Ctrl+S` để lưu                                        | Đây là trình soạn thảo, phản xạ đó là tự nhiên                                                         |

#### Vì sao server cục bộ nghe trên `127.0.0.1`

Đó là dòng quan trọng nhất trong `scripts/admin/server.mjs`. Mặc định của Node là
nghe **mọi** giao diện mạng, tức ai cùng Wi-Fi cũng mở được trang admin của bạn.
Ràng buộc về đúng localhost là thứ cho phép server này giữ khoá `service_role`:
khoá đó không bao giờ ra khỏi máy.

### Trang admin thứ hai — `/admin` trên site

Có **hai** trang admin, mỗi trang một việc. Chúng không trùng nhau:

|                | `pnpm admin` (cục bộ)             | `/admin` (trên site)                            |
| -------------- | --------------------------------- | ----------------------------------------------- |
| Dùng khi       | Viết bài dài                      | Sửa nhanh từ điện thoại hoặc máy khác           |
| Xem trước sống | **Có**                            | Không — trình duyệt không chạy được `pnpm sync` |
| Nút Đồng bộ    | Có                                | Không — cron làm việc đó                        |
| Khoá dùng      | `service_role`, không ra khỏi máy | Khoá công khai + Supabase Auth                  |

Dùng chung [`to-mau-mdx.mjs`](scripts/lib/to-mau-mdx.mjs) (tô màu, mẫu chèn) và
[`kiem-bai.mjs`](scripts/lib/kiem-bai.mjs) (validate, trạng thái bài). Hai admin
mà kiểm khác nhau thì cùng một bài sẽ được nơi này nhận nơi kia từ chối.

#### Trang công khai thì bảo mật nằm ở đâu

`/admin` là HTML công khai, và điều đó **không sao** — mọi thứ quan trọng ở tầng
database. Nhưng chỉ đúng nếu RLS được siết, vì `authenticated` trong Supabase nghĩa
là _bất kỳ ai đăng ký được_, không phải "chủ blog".

Nên quyền ghi không dựa vào `authenticated` mà dựa vào **bảng `admins`**: policy
gọi `la_admin()`, hàm này kiểm `auth.uid()` có nằm trong bảng đó không. Thêm hoặc
bớt người quản trị là một dòng `INSERT`/`DELETE`, không phải sửa policy. Hệ quả có
lợi: mở đăng ký cũng không sao — người lạ tạo được tài khoản nhưng không có tên
trong `admins` thì không ghi được gì.

Bảng `admins` bật RLS và **không có policy nào**, đồng thời bị thu hồi hết quyền ở
tầng GRANT. Nghĩa là không ai đọc được danh sách admin qua API; chỉ `la_admin()`
(hàm `security definer`) đọc được.

Đã kiểm **bằng cách tấn công**, không phải bằng đọc policy. Tạo một tài khoản thứ
hai không có trong `admins`, đăng nhập, rồi thử:

| Thao tác             | Kết quả                                               |
| -------------------- | ----------------------------------------------------- |
| Đọc bài đã đăng      | 200 — thấy 8 bài                                      |
| Đọc bài nháp         | **không thấy** (admin thấy 9)                         |
| Ghi bài mới          | **403**                                               |
| Sửa bài có sẵn       | 204 nhưng **0 dòng đổi** — đã xác minh trong database |
| Xoá bài              | 204 nhưng **bài còn nguyên** — đã xác minh            |
| Đọc email newsletter | **0 dòng**                                            |

Hai dòng 204 đáng chú ý: REST API trả về "thành công" khi RLS lọc hết dòng cần
sửa. Đọc mã trả về mà tin là xong thì sẽ kết luận sai — phải vào database đếm lại.

Ba lỗi tìm được lúc dựng trang này:

1. **Tải ảnh trả HTTP 400, body rỗng.** Đo từng header mới ra thủ phạm: `x-upsert`
   — endpoint POST của Storage từ chối header đó. Giả thuyết đầu (sai định dạng
   `Cache-Control`) là **sai**: cả `31536000` lẫn `max-age=31536000` đều được nhận.
2. **`/admin` lọt vào sitemap.** Vừa `noindex` vừa nằm trong sitemap là tự mâu
   thuẫn. Đã loại, và thêm `Disallow` vào robots.txt kèm ghi chú rằng robots.txt
   **không phải** bảo mật.
3. **`check:html` đỏ** vì `/admin` thiếu `description` và `canonical`. Sửa
   **checker** chứ không thêm thẻ giả: trang `noindex` được miễn hai thẻ đó vì
   chúng tồn tại để máy tìm kiếm hiển thị. `<title>` thì vẫn bắt buộc.

Access token của Supabase sống 1 giờ, nên viết bài dài là chắc chắn hết hạn giữa
lúc viết và mọi lần lưu sẽ trả 401 — mất bài. Hàm gọi API tự làm mới bằng refresh
token khi gặp 401 rồi thử lại.

Đã kiểm bằng thao tác thật trên trình duyệt:

| Phép thử                               | Kết quả                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Bấm Lưu khi form rỗng                  | 5 lỗi tiếng Việt, **không** ghi gì vào database                             |
| Gõ "Vì sao tôi bỏ Redis khỏi hệ thống" | slug → `vi-sao-toi-bo-redis-khoi-he-thong`                                  |
| Mô tả 8 ký tự → 125 ký tự              | bộ đếm đổi từ đỏ sang xanh đúng ngưỡng 120                                  |
| Tải ảnh + lưu bài                      | ảnh `10.9KB → 1.3KB`, bài vào database, danh sách lên 9                     |
| Bấm Đồng bộ                            | chạy `pnpm sync` thật, in output, ra **8 bài** — loại đúng bài nháp vừa tạo |
| Bấm Xoá                                | hỏi xác nhận, xoá xong danh sách về 8                                       |
| Tô màu trên một bài MDX thật           | 4 heading · 6 thẻ component · 15 `code` · 4 đậm · 3 danh sách · 4 khối code |
| Lớp tô màu khớp `<textarea>`           | cùng font, padding, line-height · lệch chiều cao **0px**                    |
| Chọn chữ rồi bấm **B**                 | `Tôi từng` → `**Tôi từng**`                                                 |
| Bấm Callout                            | chèn khối 102 ký tự đúng vị trí con trỏ                                     |
| Bấm Xem trước                          | chia đôi màn hình, iframe render đúng bài — có `.callout` và `.steps`       |

### Đăng bài = build lại, và việc đó đã tự động

Site tĩnh nên sửa DB xong phải build lại mới thấy. Việc đó do workflow
[`tu-dong-publish.yml`](.github/workflows/tu-dong-publish.yml) làm, **mỗi 20 phút**:

```
sync từ DB  →  có gì đổi thì commit  →  CI  →  Deploy
```

Không đổi gì thì nó thoát sớm, không tốn phút CI. Muốn lên ngay thì vào tab
Actions bấm "Run workflow".

Nó dùng **khoá công khai**, không phải `service_role`: đồng bộ chỉ cần đọc bài đã
đăng, dự án và lượt xem — khoá công khai đọc được cả ba. Đặt `service_role` vào
Actions là mở thêm chỗ cho nó rò rỉ mà không được gì.

#### Đặt lịch đăng

Để `published_at` ở **tương lai** là một cái hẹn: bài nằm im tới 00:00 ngày đó
theo giờ Việt Nam rồi tự lên. Không cần bấm gì, không cần mở máy.

Chặn ở **ba tầng**, mỗi tầng gác một đường khác nhau — không phải một tầng lặp ba
lần:

| Tầng                                                                                     | Gác đường nào                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| RLS policy ([`dat_lich_dang.sql`](supabase/migrations/20260810000000_dat_lich_dang.sql)) | Cron ở trên, chạy bằng khoá công khai                               |
| `.lte()` trong [`db-sync.mjs`](scripts/db-sync.mjs)                                      | `pnpm sync` / `pnpm build` ở máy — service key **đi xuyên RLS**     |
| `getPublishedPosts()` trong [`posts.ts`](src/utils/posts.ts)                             | `build:ci` đọc file đã commit (kể cả file do `pnpm dev` ghi ra đĩa) |

Tầng RLS là tầng quan trọng nhất, vì nó chặn cả việc **đọc trước**: không có nó,
ai lấy khoá công khai trong bundle cũng gọi REST API đọc được toàn văn bài chưa
tới hạn. Chỉ chặn lúc build thì HTML sạch nhưng dữ liệu vẫn hở.

Tầng thứ ba nghe như thừa nhưng không phải: `pnpm dev` chạy `sync --drafts`, ghi
**cả** bài nháp và bài đặt lịch ra `src/content/blog/`. Ai commit sau khi dev mà
không có tầng này thì CI đăng luôn cả hai loại.

**Độ trễ**: bằng nhịp cron. Bài hẹn 00:00 thường lên trong khoảng 00:00–00:20, và
có thể muộn hơn — cron của GitHub hay trễ khi máy bận. Cần đúng phút thì cách này
không làm được.

**Múi giờ**: `Asia/Ho_Chi_Minh`, không phải UTC. Dùng `current_date` của Postgres
thì bài hẹn ngày 10 chỉ lên lúc 7 giờ sáng ngày 10. Chuỗi múi giờ bị chép ở ba
chỗ không import được từ nhau (TypeScript, module chạy cả trong trình duyệt, và
SQL) — `pnpm check:content` so cả ba và fail nếu lệch.

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
pnpm giscus:setup tyangk1/tyangk1.github.io
```

Repo phải đủ ba điều kiện: **public**, đã bật **Discussions**
(Settings → Features), và đã cài app [giscus](https://github.com/apps/giscus).
Thiếu cái nào script cũng nói rõ và chỉ đúng chỗ bật.

#### Trạng thái hiện tại: còn thiếu đúng một bước

Repo `tyangk1/tyangk1.github.io` đã **public** ✓ và đã bật **Discussions** ✓.
Còn thiếu: **cài app giscus**.

Bước này **không thể tự động hoá**. Cài một GitHub App là hành động _cấp quyền_,
và GitHub cố tình không có API để làm thay — chỉ chủ tài khoản bấm đồng ý trên
trình duyệt. Đã thử: `/user/installations` trả **403** với personal access token
(endpoint đó chỉ nhận token user-to-server của OAuth app), và không có endpoint
`POST` nào để tạo installation. Đây là giới hạn theo thiết kế, không phải thiếu
quyền.

Bốn giá trị đã tra sẵn (lấy qua GraphQL của GitHub, không cần app):

```
PUBLIC_GISCUS_REPO=tyangk1/tyangk1.github.io
PUBLIC_GISCUS_REPO_ID=R_kgDOTyd65w
PUBLIC_GISCUS_CATEGORY=Announcements
PUBLIC_GISCUS_CATEGORY_ID=DIC_kwDOTyd6584DC80O
```

Chúng đang bị **comment trong `.env` có chủ ý**. Đã thử ở máy: bật bốn giá trị
này khi app chưa cài thì mỗi trang bài hiện một hộp lỗi
`giscus is not installed on this repository` — tệ hơn hẳn so với không có khối
bình luận, vì `commentsEnabled` để trống thì khối tự ẩn sạch sẽ.

**Bật bình luận — một lệnh.** Sau khi cài app tại
<https://github.com/apps/giscus> (chọn repo `tyangk1.github.io`):

```powershell
$env:GH_TOKEN="ghp_..."   # scope repo + workflow
pnpm giscus:bat
```

Script tự làm ba việc: kiểm app đã cài chưa, tra 4 giá trị rồi đặt thành Actions
variables, và kích hoạt Deploy. **App chưa cài thì nó dừng và không đặt biến nào**
— đã kiểm: chạy thử lúc chưa cài, nó báo lỗi và danh sách variables vẫn chỉ có hai
biến Supabase.

Vì sao phải kiểm trước: bật biến khi app chưa cài khiến mỗi trang bài hiện hộp lỗi
`giscus is not installed on this repository`, tệ hơn hẳn so với không có khối bình
luận.

<details>
<summary>Hoặc làm tay từng bước</summary>

Sau khi cài app tại <https://github.com/apps/giscus> (chọn
repo `tyangk1.github.io`), làm hai việc:

1. Bỏ dấu `#` ở bốn dòng giscus trong `.env` (cho bản chạy ở máy).
2. Đặt cùng bốn giá trị đó thành **Actions variables** cho bản deploy:

```bash
gh variable set PUBLIC_GISCUS_REPO        -b tyangk1/tyangk1.github.io
gh variable set PUBLIC_GISCUS_REPO_ID     -b R_kgDOTyd65w
gh variable set PUBLIC_GISCUS_CATEGORY    -b Announcements
gh variable set PUBLIC_GISCUS_CATEGORY_ID -b DIC_kwDOTyd6584DC80O
gh workflow run Deploy
```

Vì sao phải làm bước 2: `src/env.ts` đọc `import.meta.env` lúc **build**, và
`.env` nằm trong `.gitignore` — nên bản build trên CI không thấy `.env` của máy
bạn. Thiếu bước này thì bình luận chạy ở máy mà **im lặng tắt** trên site thật.
Dùng `variables` chứ không phải `secrets`: đây là giá trị công khai, giscus in
thẳng chúng vào HTML.

`gh` chưa cài trên máy này — dùng `pnpm giscus:bat` ở trên thì không cần nó.

</details>

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

#### Gửi thư

```bash
pnpm newsletter:xac-nhan                    # thư xác nhận cho người mới đăng ký
pnpm newsletter:gui --bai=<slug>            # thông báo bài mới
```

**Mặc định là CHẠY THỬ** — in đúng nội dung sẽ gửi rồi dừng. Thêm `--that` mới
gửi thật. Gửi thư không thu hồi được, nên mặc định phải là không gửi.

Chạy **ở máy**, không trên CI: gửi thư cần đọc danh sách email, tức cần
`SUPABASE_SERVICE_ROLE_KEY`. Đặt khoá đó vào GitHub Actions là mở rộng chỗ nó có
thể rò rỉ mà chẳng được gì — bản tin gửi tay khi có bài mới, không phải việc chạy
theo mỗi commit.

Cần `RESEND_API_KEY` + `NEWSLETTER_FROM` trong `.env` — xem `.env.example`. Thiếu
thì script báo ngay **trước khi** làm gì cả, kèm ba bước lấy khoá.

#### ⚠ Trạng thái hiện tại: gửi được, nhưng chỉ tới MỘT địa chỉ

Đã cấu hình Resend và **gửi thật thành công** cả hai loại thư. Nhưng **chưa có tên
miền nào được xác minh**, nên `NEWSLETTER_FROM` phải dùng địa chỉ thử
`onboarding@resend.dev` của Resend — và nó chỉ gửi được tới **email của chủ tài
khoản Resend**. Gửi cho bất kỳ ai khác trả về:

```
HTTP 403: You can only send testing emails to your own email address.
```

Nghĩa là luồng đã chạy đúng nhưng **chưa dùng được cho người đọc thật**. Để mở:

1. <https://resend.com/domains> → **Add Domain**
2. Thêm 3 bản ghi DNS mà Resend hiện ra: **SPF**, **DKIM**, và DMARC nếu muốn
3. Chờ trạng thái đổi thành `verified` (thường vài phút)
4. Sửa `.env`:
   ```
   NEWSLETTER_FROM=Thân Trọng Trường Giang <bai-moi@ten-mien-cua-ban.com>
   ```

Bước 2 quyết định thư vào inbox hay vào spam, và nó phụ thuộc tên miền bạn sở
hữu — không ai làm thay được.

Script tự chặn bốn cách gửi sai:

| Chặn gì                                 | Vì sao                                                |
| --------------------------------------- | ----------------------------------------------------- |
| Gửi bài `draft: true`                   | Thư dẫn tới trang 404 còn tệ hơn không gửi            |
| Slug không tồn tại                      | Liệt kê luôn các slug đang có                         |
| Gửi bản tin cho người **chưa** xác nhận | Họ chưa chứng minh hộp thư đó là của họ — gửi là spam |
| Gửi cho người đã huỷ                    | Lọc `unsubscribed_at is null` ở cả hai loại thư       |

URL trong thư đọc từ `SITE.url` trong `src/site.config.ts`, không viết cứng. Đổi
sang tên miền riêng là link trong thư đổi theo — thư đã gửi thì không sửa lại được.

Thư bài mới có header `List-Unsubscribe` + `List-Unsubscribe-Post`, để Gmail và
Outlook hiện nút **Huỷ đăng ký** ngay cạnh tên người gửi. Thiếu nó thì người muốn
thoát sẽ bấm "Báo cáo spam" — thứ phá uy tín tên miền gửi nhanh nhất. Giữa hai lần
gửi nghỉ 600ms vì bậc free của Resend giới hạn 2 thư/giây.

#### Hai trang xử lý link trong thư

| Trang                  | Hành vi                                              |
| ---------------------- | ---------------------------------------------------- |
| `/newsletter/xac-nhan` | **Tự chạy** khi tải — người đọc đã chủ động bấm link |
| `/newsletter/huy`      | **Bắt bấm nút**, không tự chạy                       |

Trang huỷ bắt bấm nút là có lý do cụ thể: hộp thư và công cụ bảo mật thường tự mở
trước mọi link trong email để quét. Nếu huỷ chạy ngay lúc tải thì một cú quét tự
động huỷ đăng ký của người ta mà họ không bấm gì — và họ chỉ phát hiện khi không
còn nhận được thư. Cùng lý do mà RFC 8058 dùng POST chứ không dùng GET.

Đã kiểm bằng thao tác thật trên site production:

| Trường hợp                               | Kết quả                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Token không phải UUID                    | Báo link không hợp lệ, **0** lần gọi API                                       |
| Token thật                               | Xác nhận xong, hiện nút "Đọc bài viết"                                         |
| Chỉ **mở** trang huỷ                     | **0** lần gọi API — không huỷ oan                                              |
| Bấm nút huỷ                              | `huy_newsletter` 200, hiện lời xác nhận                                        |
| Phát lại link xác nhận cũ sau khi đã huỷ | "Trước đó bạn đã huỷ đăng ký…" — **không** hồi sinh                            |
| Gửi thư xác nhận **thật** qua Resend     | Nhận **1/1**                                                                   |
| Gửi thư bài mới **thật** qua Resend      | Nhận **1/1**                                                                   |
| 2 người: 1 đã xác nhận + 1 chưa          | Thư bài mới chỉ tới người **đã** xác nhận; thư xác nhận chỉ tới người **chưa** |

Trường hợp cuối từng là **lỗi thật**, tìm ra bằng chính phép thử này:
`xac_nhan_newsletter` có `unsubscribed_at = null` trong câu UPDATE, nên phát lại
link xác nhận cũ là bật lại đăng ký của người đã huỷ — mà link đó nằm trong hộp
thư của họ vĩnh viễn. Sửa ở migration `20260809010000_khong_hoi_sinh_da_huy.sql`:
chỉ xác nhận dòng chưa huỷ, và trả thêm mã `da_huy` để trang nói rõ chuyện gì.

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

**Đang chạy: GitHub Pages** — <https://tyangk1.github.io>

Tự động, không cần bấm gì: push lên `main` → CI chạy → CI xanh thì Deploy chạy →
site cập nhật. Khoảng 1–2 phút.

### Hai workflow, và vì sao tách ra

| File                           | Khi nào chạy                        | Làm gì                                                                     |
| ------------------------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | mọi push và pull request lên `main` | `format:check` → `typecheck` → `build:ci` → `check:content` → `check:html` |
| `.github/workflows/deploy.yml` | sau khi CI **xanh** trên `main`     | build lại rồi publish lên Pages bằng OIDC                                  |

Tách ra chứ không gộp: gộp thì mỗi pull request cũng đi qua các bước deploy (dù
bị `if` chặn), còn tách thì quan hệ rõ ràng — CI xanh trên `main` mới có deploy.

`deploy.yml` **build lại từ đầu** thay vì tải artifact của CI. Tải artifact
nhanh hơn khoảng một phút, nhưng `workflow_run` chạy ở ngữ cảnh khác nên phải gọi
API tìm artifact của đúng lần chạy — thêm một chỗ sai âm thầm và đẩy lên bản build
của commit cũ. Build lại thì không bao giờ đẩy sai commit.

### `build:ci`, không phải `build`

`pnpm build` chạy `db-sync` trước và **cố tình vỡ** khi không nối được database.
Đúng cho máy người viết: deploy âm thầm bằng nội dung cũ là loại lỗi tệ nhất.

Nhưng database chạy cục bộ (`127.0.0.1:55321`) nên CI không bao giờ với tới. Đặt
`pnpm build` trong CI thì CI **đỏ vĩnh viễn**. Vì vậy nội dung sinh từ `pnpm sync`
được **commit** (xem `.gitignore`), và CI dùng `build:ci` — bỏ bước sync, build
thẳng từ file.

Quan hệ giống `pnpm-lock.yaml`: sinh bằng máy nhưng vẫn commit, để build ở đâu
cũng cho ra đúng một kết quả. Database vẫn là nguồn sự thật lúc **soạn**.

### Quy trình đăng bài

Ba đường, chọn theo việc đang làm.

**1. Viết bài mới (đường chính).**

```bash
pnpm admin                    # mở trang soạn ở 127.0.0.1:4322
# viết, kéo ảnh vào, bấm Xem trước, bấm Lưu
# bỏ tick "Bài nháp" khi xong
```

Rồi **không cần làm gì nữa**: cron đồng bộ và deploy trong vòng 20 phút. Muốn lên
ngay thì bấm Đồng bộ trong trang admin, hoặc:

```bash
pnpm sync && git add src/content src/data && git commit -m "Bài mới: ..." && git push
```

**2. Sửa nhanh, không ở máy chính.** Mở `/admin` trên site, đăng nhập, sửa, lưu.
Cron lo phần còn lại.

**3. Hẹn ngày.** Để `published_at` ở tương lai. Bài nằm im tới 00:00 ngày đó theo
giờ Việt Nam rồi tự lên. Trang admin hiện nhãn **đặt lịch** và ghi rõ còn mấy ngày.

Điều duy nhất cần nhớ: `src/content/` là file **sinh tự động** nhưng có commit. Nếu
bạn tự chạy `pnpm sync` rồi quên push thì site vẫn deploy bằng nội dung lần commit
trước. Kiểm nhanh: `git status --short src/content/`. Đi qua cron thì không gặp
chuyện này vì cron commit ngay sau khi sync.

Cẩn thận một chỗ: `pnpm dev` chạy `sync --drafts`, ghi **cả** bài nháp và bài đặt
lịch ra `src/content/blog/`. Đừng `git add -A` sau khi dev mà không xem lại — dù có
lọt vào commit thì `getPublishedPosts()` vẫn chặn không cho lên site, nhưng nội
dung bài nháp sẽ nằm công khai trong repo.

### Ba tính năng đang TẮT trên site thật

Không phải lỗi — chúng phụ thuộc thứ chưa có:

| Tính năng    | Vì sao tắt                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------ |
| Bình luận    | App giscus chưa cài. Xem mục [Bình luận (giscus)](#bình-luận-giscus) — còn đúng một bước   |
| Đếm lượt xem | Cần Supabase mà **trình duyệt khách** gọi được. `127.0.0.1:55321` chỉ tồn tại trên máy bạn |
| Newsletter   | Cũng vậy — và phần **gửi** thư vẫn cần một nhà cung cấp (Resend/Buttondown)                |

Hai cái sau cần một project Supabase **hosted** (bậc free đủ dùng). Có rồi thì
đặt `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY` thành Actions variables —
`ci.yml` và `deploy.yml` đã sẵn sàng đọc chúng.

### Đổi sang tên miền riêng

1. Sửa `SITE.url` trong `src/site.config.ts`.
2. Thêm file `public/CNAME` chứa đúng tên miền, một dòng.
3. Trỏ DNS theo [hướng dẫn của GitHub Pages](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site).

### Muốn đổi sang Cloudflare Pages hoặc Vercel

`public/_headers` (Cloudflare) và `vercel.json` đã có sẵn cấu hình cache. Import
repo, đặt build command là `pnpm build:ci`, output là `dist`. Cloudflare cho băng
thông không giới hạn, đáng đổi nếu site đông.

### Sau khi deploy — làm ngay

1. Nộp `https://tyangk1.github.io/sitemap-index.xml` vào
   [Google Search Console](https://search.google.com/search-console).
2. Thêm vào [Bing Webmaster Tools](https://www.bing.com/webmasters).
3. Dán một link bài viết vào [opengraph.xyz](https://www.opengraph.xyz) xem ảnh OG
   có hiện đúng không.
4. Kiểm JSON-LD bằng [Rich Results Test](https://search.google.com/test/rich-results).
5. Sửa `AUTHOR.bio` trong `src/site.config.ts` — vẫn đang là chữ mẫu.

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

#### Nếu Lighthouse báo CLS ≈ 0,30 trên site đã deploy — đó là artifact

Đo trên <https://tyangk1.github.io> cho ra hai kết quả trái ngược nhau, và đã
truy tới cùng:

| Cách đo                                                     | Perf  | CLS       |
| ----------------------------------------------------------- | ----- | --------- |
| Lighthouse mobile, **có** screen emulation (mặc định)       | 71–83 | **0,301** |
| Lighthouse mobile, **tắt** screen emulation                 | 100   | 0,034     |
| Lighthouse desktop preset                                   | 100   | 0,0045    |
| Chrome thật, đúng 412×823 DPR 1,75, 4G + CPU ×4, cache lạnh | —     | **0**     |

Thủ phạm là bước **resize viewport khi Lighthouse emulate mobile**, không phải
trang. Bằng chứng: `layout-shift-elements` trả selector **rỗng** (Lighthouse
không gán được cú dịch cho phần tử nào), giá trị lặp lại y hệt
`0.3010101055563954` ở hai trang khác nhau, và PerformanceObserver trong Chrome
thật không ghi nhận **một entry layout-shift nào** — kể cả khi cuộn hết trang,
kể cả với `Network.setCacheDisabled`.

Nguyên nhân gần nhất: `.reveal` và thanh tiến độ đọc dùng CSS scroll-driven
animation (`animation-timeline: view()` / `scroll(root)`). Resize viewport giữa
lúc tải làm các timeline đó được tính lại.

**Không sửa.** Người đọc thật đo được 0; hạ chất lượng site để làm đẹp một con số
tổng hợp là đi ngược hướng. Core Web Vitals của Chrome UX Report lấy từ người
dùng thật, nên nó sẽ khớp với cột cuối bảng trên.

Muốn đo lại cho đúng: `--preset=desktop`, hoặc `--screenEmulation.disabled` kèm
`--chrome-flags="--window-size=412,823"`.

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
