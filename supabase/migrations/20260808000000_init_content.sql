-- ============================================================================
--  Schema nội dung blog.
--
--  Điểm đáng giá nhất của việc chuyển từ file sang database: các ràng buộc về
--  độ dài tiêu đề, độ dài mô tả, số tag... nằm ngay ở tầng LƯU TRỮ. Trước đây
--  chúng chỉ tồn tại trong Zod, nghĩa là ai ghi thẳng vào file (hoặc một script
--  nào đó) vẫn lọt được và chỉ vỡ ở bước build. Bây giờ Postgres từ chối ngay.
--
--  Zod ở `src/content.config.ts` vẫn giữ nguyên — nó là lớp kiểm thứ hai, bảo vệ
--  bước build khỏi dữ liệu lạ. Hai lớp không thừa: một lớp chặn lúc ghi, một lớp
--  chặn lúc đọc.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Bài viết
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),

  -- Chính là tên file .mdx và cũng là URL. Không đổi sau khi đã đăng.
  slug text not null unique,

  title text not null,
  description text not null,

  -- Thân bài, định dạng MDX (dùng được Callout, PullQuote, Steps, Figure).
  content text not null,

  published_at date not null,

  -- Ngày cập nhật NỘI DUNG do người viết chủ động đặt — khác với `updated_at`
  -- bên dưới là dấu thời gian kỹ thuật do trigger tự ghi.
  content_updated_at date,

  tags text[] not null default '{}',
  takeaways text[] not null default '{}',

  series_name text,
  series_part integer,

  -- Bỏ trống thì site tự sinh ảnh bìa từ chủ đề.
  cover_image text,
  cover_alt text,

  draft boolean not null default true,
  featured boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- --- Ràng buộc, đối chiếu 1-1 với schema Zod ---

  -- Slug phải là dạng không dấu, viết thường, nối bằng gạch ngang.
  constraint posts_slug_dinh_dang check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- 70 ký tự là chỗ Google cắt tiêu đề trên trang kết quả.
  constraint posts_title_do_dai check (char_length(title) between 1 and 70),

  -- 120–160 là khoảng meta description hiển thị đủ, không bị cụt.
  constraint posts_description_do_dai check (char_length(description) between 120 and 160),

  constraint posts_content_khong_rong check (char_length(btrim(content)) > 0),

  -- 1–5 tag. Ít tag mà dùng nhất quán tốt hơn nhiều tag dùng một lần.
  constraint posts_tags_so_luong check (
    array_length(tags, 1) between 1 and 5
  ),

  -- Điểm chính: hoặc bỏ trống hẳn, hoặc 2–4 dòng. Một dòng thì vô nghĩa,
  -- quá bốn dòng thì nó thành mục lục thứ hai.
  constraint posts_takeaways_so_luong check (
    coalesce(array_length(takeaways, 1), 0) = 0
    or array_length(takeaways, 1) between 2 and 4
  ),

  -- Hai trường series phải đi cùng nhau, nếu không điều hướng series sẽ hỏng.
  constraint posts_series_di_cung_nhau check (
    (series_name is null and series_part is null)
    or (series_name is not null and series_part is not null and series_part >= 1)
  ),

  -- Có ảnh bìa thì bắt buộc có alt — thiếu là lỗi accessibility.
  constraint posts_cover_can_alt check (
    cover_image is null or (cover_alt is not null and char_length(btrim(cover_alt)) > 0)
  )
);

comment on table public.posts is 'Bài viết blog. Nguồn sự thật của nội dung.';
comment on column public.posts.content is 'Thân bài định dạng MDX.';
comment on column public.posts.content_updated_at is
  'Ngày cập nhật nội dung do người viết đặt. Hiện "Cập nhật ..." trên bài.';

-- Truy vấn thường gặp: lấy bài đã đăng, mới nhất trước.
create index posts_da_dang_moi_nhat on public.posts (published_at desc)
  where draft = false;

-- Lọc theo tag.
create index posts_tags on public.posts using gin (tags);

-- Gom các phần của một series.
create index posts_series on public.posts (series_name, series_part)
  where series_name is not null;

-- ---------------------------------------------------------------------------
-- Dự án
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  year integer not null,
  status text not null,
  tech text[] not null default '{}',
  url text,
  repo text,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_slug_dinh_dang check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint projects_name_khong_rong check (char_length(btrim(name)) > 0),
  constraint projects_year_hop_ly check (year between 2000 and 2100),
  constraint projects_status_hop_le check (status in ('đang làm', 'hoàn thành', 'tạm dừng'))
);

comment on table public.projects is 'Dự án hiện ở trang /projects.';

-- ---------------------------------------------------------------------------
-- Tự ghi updated_at
-- ---------------------------------------------------------------------------
create or replace function public.tu_dong_cap_nhat_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.tu_dong_cap_nhat_updated_at();

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.tu_dong_cap_nhat_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Bật RLS trên cả hai bảng. Khoá công khai (anon) chỉ đọc được bài ĐÃ ĐĂNG —
-- kể cả khi khoá đó lộ ra ngoài thì bài nháp vẫn không xem được.
-- Script build dùng khoá service_role, vốn bỏ qua RLS, nên ở chế độ dev nó vẫn
-- đọc được bài nháp để xem trước.
-- ---------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.projects enable row level security;

-- Cấp quyền ở tầng Postgres. Bảng tạo qua dashboard được Supabase tự cấp, nhưng
-- bảng tạo bằng migration SQL thuần thì KHÔNG — thiếu phần này thì mọi truy vấn
-- trả về "permission denied for table posts", kể cả với khoá service_role.
--
-- Hai tầng khác nhau, đừng lẫn: GRANT quyết định role có được CHẠM vào bảng hay
-- không; RLS quyết định role đó thấy được DÒNG nào.
grant usage on schema public to anon, authenticated, service_role;

grant select on public.posts, public.projects to anon, authenticated;
grant insert, update, delete on public.posts, public.projects to authenticated;
grant all privileges on public.posts, public.projects to service_role;

create policy "ai cung doc duoc bai da dang"
  on public.posts for select
  to anon, authenticated
  using (draft = false);

create policy "ai cung doc duoc du an"
  on public.projects for select
  to anon, authenticated
  using (true);

-- Ghi thì chỉ cho người đã đăng nhập (dùng Supabase Studio hoặc service_role).
create policy "nguoi dang nhap duoc ghi bai"
  on public.posts for all
  to authenticated
  using (true)
  with check (true);

create policy "nguoi dang nhap duoc ghi du an"
  on public.projects for all
  to authenticated
  using (true)
  with check (true);
