-- ===========================================================================
--  GỘP CẢ BA MIGRATION THÀNH MỘT FILE — DÁN VÀO SQL EDITOR RỒI BẤM RUN
-- ===========================================================================
--
--  Cách chạy:
--    1. Mở SQL Editor của project trên supabase.com/dashboard
--    2. Dán TOÀN BỘ file này vào
--    3. Bấm Run (hoặc Ctrl+Enter)
--
--  Chạy lại nhiều lần được, không mất dữ liệu. `create table` và
--  `create index` đã thành `if not exists`; `create trigger` và
--  `create policy` được chèn `drop ... if exists` ngay trước, vì Postgres
--  không có `or replace` cho hai loại đó.
--
--  SINH TỰ ĐỘNG bởi scripts/gop-migration.mjs — đừng sửa file này.
--  Sửa migration gốc trong supabase/migrations/ rồi chạy lại: pnpm db:gop
-- ===========================================================================

-- ===========================================================================
-- Nguồn: supabase/migrations/20260808000000_khoi_tao_noi_dung.sql
-- ===========================================================================

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
create table if not exists public.posts (
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
create index if not exists posts_da_dang_moi_nhat on public.posts (published_at desc)
  where draft = false;

-- Lọc theo tag.
create index if not exists posts_tags on public.posts using gin (tags);

-- Gom các phần của một series.
create index if not exists posts_series on public.posts (series_name, series_part)
  where series_name is not null;

-- ---------------------------------------------------------------------------
-- Dự án
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
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

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.tu_dong_cap_nhat_updated_at();

drop trigger if exists projects_updated_at on public.projects;
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

drop policy if exists "ai cung doc duoc bai da dang" on public.posts;
create policy "ai cung doc duoc bai da dang"
  on public.posts for select
  to anon, authenticated
  using (draft = false);

drop policy if exists "ai cung doc duoc du an" on public.projects;
create policy "ai cung doc duoc du an"
  on public.projects for select
  to anon, authenticated
  using (true);

-- Ghi thì chỉ cho người đã đăng nhập (dùng Supabase Studio hoặc service_role).
drop policy if exists "nguoi dang nhap duoc ghi bai" on public.posts;
create policy "nguoi dang nhap duoc ghi bai"
  on public.posts for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "nguoi dang nhap duoc ghi du an" on public.projects;
create policy "nguoi dang nhap duoc ghi du an"
  on public.projects for all
  to authenticated
  using (true)
  with check (true);


-- ===========================================================================
-- Nguồn: supabase/migrations/20260808010000_luot_xem.sql
-- ===========================================================================

-- ============================================================================
--  Đếm lượt xem bài viết.
--
--  Vì sao tách bảng riêng thay vì thêm cột `views` vào `posts`:
--    - `posts` là nội dung, sửa thưa. `post_views` là số đếm, ghi liên tục.
--      Trộn vào nhau thì mỗi lượt xem lại UPDATE một dòng chứa cả thân bài.
--    - Quyền khác nhau: khách vô danh được cộng lượt xem, nhưng KHÔNG được
--      chạm vào nội dung.
-- ============================================================================

create table if not exists public.post_views (
  slug text primary key,
  views bigint not null default 0,
  updated_at timestamptz not null default now(),

  constraint post_views_khong_am check (views >= 0)
);

comment on table public.post_views is
  'Số lượt xem mỗi bài. Khách vô danh cộng qua hàm tang_luot_xem(), không ghi trực tiếp.';

-- Truy vấn thường gặp: lấy bài đọc nhiều nhất.
create index if not exists post_views_nhieu_nhat on public.post_views (views desc);

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
drop policy if exists "ai cung doc duoc luot xem" on public.post_views;
create policy "ai cung doc duoc luot xem"
  on public.post_views for select
  to anon, authenticated
  using (true);

grant select on public.post_views to anon, authenticated;
grant all privileges on public.post_views to service_role;

-- KHÔNG cấp insert/update trực tiếp cho anon. Đường duy nhất để cộng số là gọi
-- hàm ở trên, và hàm đó đã tự kiểm slug.
grant execute on function public.tang_luot_xem(text) to anon, authenticated;


-- ===========================================================================
-- Nguồn: supabase/migrations/20260808020000_newsletter.sql
-- ===========================================================================

-- ============================================================================
--  Danh sách đăng ký nhận bài mới.
--
--  Thiết kế xoay quanh một mối lo duy nhất: bảng này chứa email của người thật.
--  Vì vậy khoá công khai (anon) KHÔNG được đọc bảng — chỉ được gọi một hàm để
--  thêm vào. Không có đường nào để ai đó tải về danh sách email của bạn.
-- ============================================================================

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,

  -- Xác nhận hai bước. Chỉ gửi bản tin cho người `confirmed = true`.
  -- Nhờ vậy nếu ai đó bơm hàng nghìn email bịa vào bảng, họ vẫn KHÔNG làm bạn
  -- gửi thư rác cho ai — các dòng đó mãi ở trạng thái chưa xác nhận.
  confirmed boolean not null default false,
  confirmed_at timestamptz,

  -- Token dùng cho link trong email. Không bao giờ trả về phía trình duyệt.
  confirm_token uuid not null default gen_random_uuid(),
  unsubscribe_token uuid not null default gen_random_uuid(),

  -- Đăng ký từ trang nào — biết khối newsletter ở đâu hiệu quả.
  source text,

  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,

  -- Kiểm hình dạng email ngay ở tầng lưu trữ. Không thay thế được việc gửi thư
  -- xác nhận, nhưng chặn được rác rõ ràng như "abc" hay "a@b".
  constraint email_dinh_dang check (email ~* '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]+$'),
  constraint email_do_dai check (char_length(email) between 6 and 254)
);

comment on table public.newsletter_subscribers is
  'Người đăng ký nhận bài mới. Chỉ gửi cho confirmed = true.';
comment on column public.newsletter_subscribers.confirm_token is
  'Dùng trong link xác nhận gửi qua email. KHÔNG trả ra client.';

create index if not exists newsletter_da_xac_nhan on public.newsletter_subscribers (created_at desc)
  where confirmed = true and unsubscribed_at is null;

-- ---------------------------------------------------------------------------
-- Đăng ký
--
-- Trả về một MÃ TRẠNG THÁI, không trả dữ liệu. Kể cả `da_co` cũng không tiết lộ
-- gì thêm — nó chỉ nói "email này đã nằm trong danh sách", điều mà chính người
-- gõ email vào cũng đã biết.
-- ---------------------------------------------------------------------------
create or replace function public.dang_ky_newsletter(dia_chi text, tu_trang text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_sach text;
begin
  email_sach := lower(btrim(coalesce(dia_chi, '')));

  if email_sach !~* '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]+$'
     or char_length(email_sach) not between 6 and 254 then
    return 'email_sai';
  end if;

  insert into public.newsletter_subscribers (email, source)
  values (email_sach, nullif(btrim(coalesce(tu_trang, '')), ''))
  on conflict (email) do nothing;

  if not found then
    -- Đã có sẵn. Nếu trước đó họ đã huỷ thì mở lại đăng ký.
    update public.newsletter_subscribers
      set unsubscribed_at = null
      where email = email_sach and unsubscribed_at is not null;
    return 'da_co';
  end if;

  return 'moi';
end;
$$;

comment on function public.dang_ky_newsletter(text, text) is
  'Thêm một email vào danh sách. Trả về moi | da_co | email_sai. Không trả dữ liệu.';

-- ---------------------------------------------------------------------------
-- Xác nhận và huỷ đăng ký — dùng token từ link trong email
-- ---------------------------------------------------------------------------
create or replace function public.xac_nhan_newsletter(token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.newsletter_subscribers
    set confirmed = true, confirmed_at = now(), unsubscribed_at = null
    where confirm_token = token;

  return case when found then 'xong' else 'khong_thay' end;
end;
$$;

create or replace function public.huy_newsletter(token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.newsletter_subscribers
    set unsubscribed_at = now()
    where unsubscribe_token = token;

  return case when found then 'xong' else 'khong_thay' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quyền: đây là phần quan trọng nhất của file này
-- ---------------------------------------------------------------------------
alter table public.newsletter_subscribers enable row level security;

-- KHÔNG có policy select nào cho anon/authenticated. RLS bật mà không có policy
-- nghĩa là không ai đọc được dòng nào — chỉ `service_role` (bỏ qua RLS) đọc được.
-- Đây là thứ ngăn việc thu hoạch email.
grant all privileges on public.newsletter_subscribers to service_role;

-- Khách chỉ gọi được ba hàm, không chạm được bảng.
grant execute on function public.dang_ky_newsletter(text, text) to anon, authenticated;
grant execute on function public.xac_nhan_newsletter(uuid) to anon, authenticated;
grant execute on function public.huy_newsletter(uuid) to anon, authenticated;


-- ===========================================================================
-- Nguồn: supabase/migrations/20260809000000_khoa_quyen_bang.sql
-- ===========================================================================

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
