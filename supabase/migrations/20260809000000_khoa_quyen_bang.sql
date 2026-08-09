-- Thu hồi quyền bảng mà `anon` không cần đến.
--
-- VÌ SAO CẦN: Supabase tự chạy `alter default privileges` cấp toàn quyền cho
-- `anon` và `authenticated` trên mọi bảng mới trong schema `public`. Đo trên
-- project hosted sau khi migrate:
--
--   newsletter_subscribers | anon | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--
-- Hiện tại dữ liệu vẫn an toàn vì bảng đó bật RLS mà KHÔNG có policy nào, nên
-- mọi câu lệnh khớp 0 dòng. Đã kiểm bằng cách chèn một email thật rồi thử đọc,
-- xoá và sửa bằng khoá công khai: đọc ra 0 dòng, xoá và sửa trả về HTTP 204 mà
-- dòng vẫn còn nguyên.
--
-- Nhưng đó là chốt DUY NHẤT, và nó là loại chốt dễ mất: ngày nào có người thêm
-- một policy cho mục đích khác — ví dụ làm trang admin — thì toàn bộ danh sách
-- email lộ ngay, mà không ai nghĩ mình vừa mở nó. Cái 204 giả-thành-công còn làm
-- lỗi khó phát hiện hơn.
--
-- Nên khôi phục tầng thứ hai: không có QUYỀN thì policy có sai cũng không tới
-- được dữ liệu. Hai tầng độc lập, mất một tầng vẫn còn một tầng.
--
-- Các hàm RPC không bị ảnh hưởng: chúng khai báo `security definer` nên chạy với
-- quyền của chủ hàm, không phải quyền người gọi. Đó cũng chính là lý do thiết kế
-- ban đầu bắt mọi thao tác ghi phải đi qua RPC.

-- --- newsletter_subscribers: khách không được chạm vào bảng này, kể cả đọc ---
--
-- Đăng ký / xác nhận / huỷ đều đi qua RPC. `revoke all` là đúng nhu cầu.
revoke all on table public.newsletter_subscribers from anon, authenticated;

-- --- post_views: được ĐỌC, không được ghi ---
--
-- Giữ `select` vì có policy "ai cung doc duoc luot xem" và trang chủ cần con số
-- đó. Cộng lượt xem đi qua `tang_luot_xem()`.
revoke insert, update, delete, truncate on table public.post_views from anon, authenticated;

-- --- posts / projects: `anon` chỉ được đọc ---
--
-- KHÔNG thu hồi của `authenticated`: hai bảng này có policy
-- "nguoi dang nhap duoc ghi bai" / "nguoi dang nhap duoc ghi du an", tức là người
-- đăng nhập được phép ghi một cách có chủ đích. Thu hồi ở đây sẽ làm hỏng đúng
-- tính năng đó.
revoke insert, update, delete, truncate on table public.posts from anon;
revoke insert, update, delete, truncate on table public.projects from anon;

-- Chặn cả các bảng THÊM VÀO SAU NÀY.
--
-- Nếu không có dòng này thì mỗi lần thêm bảng mới là quyền mặc định của Supabase
-- lại cấp toàn quyền cho `anon`, và phải nhớ thu hồi bằng tay — thứ sẽ bị quên.
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon;
