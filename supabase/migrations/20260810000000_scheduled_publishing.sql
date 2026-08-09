-- Đặt lịch đăng bài: bài có ngày ở tương lai thì chưa ai được thấy.
--
-- VẤN ĐỀ ĐANG SỬA
--
-- Policy cũ chỉ có `draft = false`. Nghĩa là một bài viết xong, bỏ tick nháp, để
-- ngày 01/12 thì lên site NGAY hôm nay với cái ngày tháng ở tương lai in trên
-- đầu. Ô "Ngày đăng" trong admin trước giờ chỉ là chữ để hiển thị, không phải
-- một cái hẹn.
--
-- Sửa ở tầng policy chứ không chỉ ở lúc build, vì `draft = false` là thứ mở cho
-- khoá công khai đọc. Bài đặt lịch mà chỉ chặn lúc build thì HTML không có nó
-- nhưng bất kỳ ai lấy khoá công khai trong bundle cũng gọi thẳng REST API đọc
-- được toàn văn — với bài viết về thứ chưa công bố thì đó là rò rỉ thật.
--
-- VÌ SAO ĐỔI MÚI GIỜ TRƯỚC KHI SO
--
-- Postgres của Supabase chạy UTC. Dùng `current_date` thì bài để ngày 10/8 chỉ
-- hiện lúc 00:00 UTC ngày 10/8 — tức 7 giờ sáng giờ Việt Nam. Người viết hẹn
-- "sáng ngày 10" mà bài nằm im tới lúc đi làm.
--
-- Chuỗi 'Asia/Ho_Chi_Minh' dưới đây PHẢI khớp `SITE.timeZone` trong
-- `src/site.config.ts` và `TIME_ZONE` trong `scripts/lib/post.mjs`. SQL không
-- import được từ TypeScript nên đây là bản chép tay; `pnpm check:content` so cả
-- ba và fail nếu lệch.
--
-- Chạy hai lần vô hại — `drop policy if exists` trước mỗi `create`.

drop policy if exists "ai cung doc duoc bai da dang" on public.posts;

create policy "ai cung doc duoc bai da dang"
  on public.posts
  for select
  using (
    draft = false
    and published_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
  );

-- Index cho đúng câu điều kiện trên. Bảng đang 8 dòng nên chưa cần, nhưng cột
-- `published_at` cũng là cột sắp xếp của mọi truy vấn danh sách bài, nên index
-- này trả nợ ngay cả khi phần lọc còn rẻ.
create index if not exists posts_draft_published_at_idx
  on public.posts (draft, published_at desc);

comment on column public.posts.published_at is
  'Ngày đăng. Ở tương lai nghĩa là ĐẶT LỊCH: bài bị RLS ẩn cho tới ngày này theo '
  'giờ Việt Nam, rồi workflow "Tự động publish" đưa lên site trong vòng ~20 phút.';
