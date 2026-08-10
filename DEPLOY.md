# Deploy lên Vercel

Site không còn tĩnh: trang bài, trang chủ, tag, RSS, sitemap và ảnh OG đều đọc database
lúc có request. Vì vậy nó cần một host chạy được Node — GitHub Pages không chạy được.

---

## 1. Nối repo

Vercel → **Add New** → **Project** → chọn repo này → **Deploy**.

Không cần điền gì trong phần Build & Output Settings. `vercel.json` đã khai:

| Khai gì                    | Vì sao                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildCommand: pnpm build:ci` | KHÔNG phải `pnpm build`. `pnpm build` chạy `db-sync` trước, và việc đó cần `SUPABASE_SERVICE_ROLE_KEY` — khoá đó không được có mặt trên Vercel. |
| không có `outputDirectory` | Có adapter thì Astro ghi ra `.vercel/output`, và adapter tự nói cho Vercel biết. Khai `dist` như bản tĩnh sẽ làm Vercel không tìm thấy gì.   |
| không có luật header `/og/` | Bản tĩnh đặt `immutable` cho ảnh OG. Giờ nội dung ảnh phụ thuộc tiêu đề trong database, nên `immutable` là lời hứa sai — và luật trong `vercel.json` sẽ ĐÈ header mà route tự đặt. |

---

## 2. Biến môi trường

### Bắt buộc — thiếu là trang bài trả 500

```
PUBLIC_SUPABASE_URL        = https://aglhmdrxpiwvnafctbxy.supabase.co
PUBLIC_SUPABASE_ANON_KEY   = <khoá anon>
```

Hai biến này lấy đúng từ `.env` ở máy. Chúng công khai — anon key được in thẳng vào HTML,
và RLS là thứ chặn bài nháp, không phải sự bí mật của khoá.

### Tuỳ chọn — thiếu thì tính năng tương ứng tự tắt, không lỗi

```
PUBLIC_SITE_URL            = https://ten-mien-cua-anh      (xem mục 3)
PUBLIC_GISCUS_REPO         PUBLIC_GISCUS_REPO_ID
PUBLIC_GISCUS_CATEGORY     PUBLIC_GISCUS_CATEGORY_ID
PUBLIC_UMAMI_SRC           PUBLIC_UMAMI_WEBSITE_ID
PUBLIC_NEWSLETTER_ACTION
```

### TUYỆT ĐỐI KHÔNG đặt lên Vercel

```
SUPABASE_SERVICE_ROLE_KEY    RESEND_API_KEY       AI_API_KEY
SUPABASE_BOT_PASSWORD        NEWSLETTER_BOT_PASSWORD
ADMIN_EMAIL                  ADMIN_PASSWORD
```

Không phải vì Vercel không giữ được bí mật, mà vì **không có gì trên Vercel cần chúng**.
Service key đi xuyên RLS; đặt nó ở một tiến trình phục vụ người lạ thì mọi lỗi truy vấn
đều có thể thành đường rò cả bảng. Cùng lý do đã áp cho GitHub Actions.

---

## 3. Tên miền

Chưa có tên miền riêng thì **không cần làm gì**: Vercel tự đặt
`VERCEL_PROJECT_PRODUCTION_URL`, và `SITE.url` đọc biến đó, nên bản deploy đầu tiên đã có
canonical / sitemap / RSS / `og:image` đúng.

Có tên miền riêng thì thêm nó trong Vercel → Domains, **và** đặt
`PUBLIC_SITE_URL=https://ten-mien` — nó thắng biến của Vercel. Thiếu bước thứ hai thì mọi
trang tự khai canonical trỏ về `*.vercel.app`, và Google sẽ index URL đó thay vì tên miền
của anh. Lỗi này không có triệu chứng nào nhìn thấy được.

### Tên miền cũ

`tyangk1.github.io` sẽ vẫn phục vụ bản deploy tốt cuối cùng. Đã đo mức độ ràng buộc:
**1 người đăng ký bản tin**, nên link đã phát ra ngoài thực chất tới đúng một người. Đây là
lúc rẻ nhất để đổi.

Nếu vẫn muốn link cũ không chết: giữ repo Pages và thay `index.html` bằng một trang
chuyển hướng giữ nguyên path và query — link xác nhận newsletter đã gửi có dạng
`/newsletter/xac-nhan?token=...`, nên phải giữ cả query string.

---

## 4. Xác minh sau khi deploy — đừng tin, hãy đo

```bash
node scripts/check-ssr.mjs --url=https://<site-cua-anh>
```

Cùng bộ luật đang chạy trong CI, gọi thẳng vào site thật: từng route bài, từng trang tag,
trang chủ, `/blog`, `/tags`, `/search`, sitemap có đủ URL bài, RSS có đủ item, tìm kiếm
không dấu ra kết quả, ảnh OG sinh được và đủ byte, và những đường phải trả 404.

Rồi thử vòng live: sửa một bài trong admin → tải lại trang bài. Chậm nhất 60 giây (cache
CDN), thường là ngay.

---

## 5. MỘT CHỖ TÔI KHÔNG XÁC MINH ĐƯỢC TẠI MÁY

Build bằng adapter Vercel **thất bại trên Windows này**:

```
EPERM: operation not permitted, symlink '.pnpm\sharp@0.35.3\...\sharp'
  -> '.vercel\output\functions\_render.func\node_modules\sharp'
```

Windows cần Developer Mode hoặc quyền admin để tạo symlink; Linux của Vercel không có rào
đó. Build đi được tới bước cuối (đã sinh `functions/`, `static/`, `server/`) rồi mới chết ở
bước liên kết `node_modules`, nên phần cấu hình gần như chắc là đúng — nhưng "gần như chắc"
không phải "đã đo", và tôi không muốn ghi nó như thể đã đo.

`sharp` là chỗ đáng nghi nhất ở lần deploy đầu: nó là binary native, dùng cho ảnh OG. Nếu
lần deploy đầu đỏ, hãy đọc log ở bước đó trước.

Muốn build thử tại máy: bật **Settings → Privacy & security → For developers → Developer
Mode** rồi chạy lại `npx astro build`.

---

## 6. Những thứ giờ đã thừa

Nội dung live nghĩa là **không còn cần deploy để đăng bài**. Nên các thứ sau chỉ còn là
việc của người phát triển, không phải đường đăng bài:

- `auto-publish.yml` — cron đã tắt, còn chạy tay được để đồng bộ `src/content/blog/*.mdx`
  cho hai bộ kiểm.
- `build-and-deploy.yml` / `deploy.yml` — dừng có chủ ý, vì đẩy bản build có adapter lên
  Pages sẽ làm sập cả site.
- Nút "Đăng ngay", `rpc/request_deploy`, token deploy trong Supabase Vault, bảng
  `deploy_requests` — toàn bộ đường gọi deploy từ database.

**Chưa xoá gì cả**, có chủ ý: đợi Vercel chạy ổn đã, để còn đường lùi. Xoá được thì repo
gọn đi đáng kể.
