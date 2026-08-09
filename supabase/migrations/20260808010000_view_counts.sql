-- ============================================================================
--  Đếm lượt xem bài viết.
--
--  Vì sao tách bảng riêng thay vì thêm cột `views` vào `posts`:
--    - `posts` là nội dung, sửa thưa. `post_views` là số đếm, ghi liên tục.
--      Trộn vào nhau thì mỗi lượt xem lại UPDATE một dòng chứa cả thân bài.
--    - Quyền khác nhau: khách vô danh được cộng lượt xem, nhưng KHÔNG được
--      chạm vào nội dung.
-- ============================================================================

create table public.post_views (
  slug text primary key,
  views bigint not null default 0,
  updated_at timestamptz not null default now(),

  constraint post_views_khong_am check (views >= 0)
);

comment on table public.post_views is
  'Số lượt xem mỗi bài. Khách vô danh cộng qua hàm tang_luot_xem(), không ghi trực tiếp.';

-- Truy vấn thường gặp: lấy bài đọc nhiều nhất.
create index post_views_nhieu_nhat on public.post_views (views desc);

-- ---------------------------------------------------------------------------
-- Hàm cộng lượt xem
--
-- `security definer` để khách vô danh cộng được số mà KHÔNG cần quyền ghi trực
-- tiếp lên bảng. Nhờ vậy họ chỉ làm được đúng một việc: cộng thêm 1 cho một
-- slug có thật.
--
-- Kiểm tra slug tồn tại và đã đăng là để chặn việc bơm số cho slug bịa ra —
-- không có nó thì bảng sẽ đầy rác chỉ sau một lần ai đó chạy vòng lặp.
-- ---------------------------------------------------------------------------
create or replace function public.tang_luot_xem(bai_slug text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  ket_qua bigint;
begin
  if not exists (
    select 1 from public.posts where slug = bai_slug and draft = false
  ) then
    return 0;
  end if;

  insert into public.post_views as pv (slug, views)
  values (bai_slug, 1)
  on conflict (slug) do update
    set views = pv.views + 1,
        updated_at = now()
  returning pv.views into ket_qua;

  return ket_qua;
end;
$$;

comment on function public.tang_luot_xem(text) is
  'Cộng 1 lượt xem cho một bài đã đăng, trả về tổng mới. Slug không tồn tại thì trả 0.';

-- ---------------------------------------------------------------------------
-- Quyền và RLS
-- ---------------------------------------------------------------------------
alter table public.post_views enable row level security;

-- Ai cũng đọc được số lượt xem — nó vốn là thông tin công khai trên trang.
create policy "ai cung doc duoc luot xem"
  on public.post_views for select
  to anon, authenticated
  using (true);

grant select on public.post_views to anon, authenticated;
grant all privileges on public.post_views to service_role;

-- KHÔNG cấp insert/update trực tiếp cho anon. Đường duy nhất để cộng số là gọi
-- hàm ở trên, và hàm đó đã tự kiểm slug.
grant execute on function public.tang_luot_xem(text) to anon, authenticated;
