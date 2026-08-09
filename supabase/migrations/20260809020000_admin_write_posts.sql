-- Siết quyền ghi xuống ĐÚNG những người trong bảng `admins`.
--
-- VÌ SAO CẦN: trang admin sắp được deploy, nên nó là HTML công khai. Bảo mật lúc
-- đó nằm hoàn toàn ở tầng database.
--
-- Policy cũ là `to authenticated` — và `authenticated` trong Supabase nghĩa là
-- BẤT KỲ AI ĐĂNG KÝ ĐƯỢC, không phải "chủ blog". Supabase mặc định mở đăng ký, nên
-- policy đó tương đương: ai cũng sửa được bài. Với admin chỉ chạy cục bộ thì
-- không ai chạm tới được nên nó vô hại; deploy lên thì nó là lỗ hổng thật.
--
-- Dùng BẢNG thay vì nhét UUID cứng vào migration: thêm hoặc bớt người quản trị
-- chỉ là một dòng INSERT/DELETE, không phải viết migration mới rồi chạy lại.
--
-- Hệ quả có lợi: mở đăng ký cũng không sao nữa. Người lạ đăng ký được một tài
-- khoản, nhưng không có tên trong `admins` thì không ghi được gì.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ghi_chu text,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Ai được ghi nội dung. Không có tên ở đây thì chỉ đọc được như khách.';

-- RLS bật, KHÔNG policy nào: không ai đọc được bảng này qua API. Danh sách người
-- quản trị không phải thứ để lộ ra.
alter table public.admins enable row level security;
revoke all on table public.admins from anon, authenticated;

/**
 * Người gọi hiện tại có phải admin không.
 *
 * `security definer` là bắt buộc: policy trên `posts` cần đọc `admins`, mà `admins`
 * bật RLS và không có policy nào — hàm thường sẽ luôn trả false. `definer` chạy
 * với quyền chủ hàm nên đọc được.
 *
 * `set search_path = ''` để tên bảng không bị chiếm bởi schema khác trong
 * search_path của người gọi.
 */
create or replace function public.la_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

grant execute on function public.la_admin() to anon, authenticated;

-- --- posts ----------------------------------------------------------------
--
-- Bỏ policy cũ mở cho mọi người đăng nhập.
drop policy if exists "nguoi dang nhap duoc ghi bai" on public.posts;

-- Admin đọc được MỌI bài, kể cả nháp. Policy công khai cũ chỉ cho `draft = false`,
-- nên thiếu policy này thì trang admin không thấy bài nháp của chính mình.
drop policy if exists "admin doc duoc moi bai" on public.posts;
create policy "admin doc duoc moi bai"
  on public.posts for select
  to authenticated
  using (public.la_admin());

drop policy if exists "admin ghi duoc bai" on public.posts;
create policy "admin ghi duoc bai"
  on public.posts for all
  to authenticated
  using (public.la_admin())
  with check (public.la_admin());

-- --- projects -------------------------------------------------------------
drop policy if exists "nguoi dang nhap duoc ghi du an" on public.projects;

drop policy if exists "admin ghi duoc du an" on public.projects;
create policy "admin ghi duoc du an"
  on public.projects for all
  to authenticated
  using (public.la_admin())
  with check (public.la_admin());

-- --- newsletter -----------------------------------------------------------
--
-- Admin xem được danh sách người đăng ký từ trang admin. Khách vẫn không đọc được
-- dòng nào: `20260809000000` đã thu hồi hẳn quyền bảng của anon/authenticated, nên
-- phải cấp lại quyền cho `authenticated` — RLS mới là thứ lọc dòng.
grant select on table public.newsletter_subscribers to authenticated;

drop policy if exists "admin doc duoc nguoi dang ky" on public.newsletter_subscribers;
create policy "admin doc duoc nguoi dang ky"
  on public.newsletter_subscribers for select
  to authenticated
  using (public.la_admin());

-- --- Storage: admin tải ảnh lên được -------------------------------------
--
-- Bucket `anh-blog` là public để ĐỌC. Ghi thì phải là admin.
drop policy if exists "admin tai anh len" on storage.objects;
create policy "admin tai anh len"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'anh-blog' and public.la_admin());

drop policy if exists "admin sua anh" on storage.objects;
create policy "admin sua anh"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'anh-blog' and public.la_admin());

drop policy if exists "admin xoa anh" on storage.objects;
create policy "admin xoa anh"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'anh-blog' and public.la_admin());
