-- Đổi mọi định danh trong database sang tiếng Anh: hàm, tham số, giá trị trả về,
-- và tên policy.
--
-- Tên bảng và tên cột vốn đã đúng chuẩn từ đầu (posts, published_at, cover_image…),
-- nên phần đó không có gì phải làm.
--
-- HAI THỨ CỐ Ý KHÔNG ĐỔI
--
--   bucket `anh-blog` — URL ảnh đã nằm trong nội dung các bài ĐÃ ĐĂNG. Đổi tên
--     bucket là làm gãy ảnh thật trên site, không phải chuyện thẩm mỹ tên gọi.
--   route /newsletter/xac-nhan và /newsletter/huy — hai URL này đã được gửi trong
--     thư cho người đăng ký. Thư đã gửi thì không sửa lại được.
--
-- Cả hai là ranh giới ĐỐI NGOẠI. Tên trong code thì đổi được vì chỉ mình mình đọc;
-- thứ đã phát ra ngoài thì không.
--
-- Chạy hai lần vô hại: `create or replace`, `drop ... if exists`.

-- 1. is_admin() thay cho la_admin() -----------------------------------------
--
-- Phải tạo hàm mới TRƯỚC khi dựng lại policy, và chỉ xoá hàm cũ SAU KHI không còn
-- policy nào tham chiếu tới nó — nếu không Postgres từ chối xoá.

create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- 2. Dựng lại policy với tên tiếng Anh ---------------------------------------

drop policy if exists "ai cung doc duoc bai da dang" on public.posts;
drop policy if exists "admin doc duoc moi bai" on public.posts;
drop policy if exists "admin ghi duoc bai" on public.posts;
drop policy if exists "public reads published posts" on public.posts;
drop policy if exists "admins read all posts" on public.posts;
drop policy if exists "admins write posts" on public.posts;

-- Điều kiện giữ nguyên y nguyên bản cũ: chưa nháp VÀ đã tới ngày theo giờ Việt Nam.
-- Chuỗi múi giờ phải khớp `SITE.timeZone` và `TIME_ZONE` — `pnpm check:content` canh.
create policy "public reads published posts"
  on public.posts for select
  using (
    draft = false
    and published_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
  );

create policy "admins read all posts"
  on public.posts for select to authenticated
  using (public.is_admin());

create policy "admins write posts"
  on public.posts for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ai cung doc duoc du an" on public.projects;
drop policy if exists "admin ghi duoc du an" on public.projects;
drop policy if exists "public reads projects" on public.projects;
drop policy if exists "admins write projects" on public.projects;

create policy "public reads projects"
  on public.projects for select to anon, authenticated
  using (true);

create policy "admins write projects"
  on public.projects for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ai cung doc duoc luot xem" on public.post_views;
drop policy if exists "public reads view counts" on public.post_views;

create policy "public reads view counts"
  on public.post_views for select to anon, authenticated
  using (true);

drop policy if exists "admin doc duoc nguoi dang ky" on public.newsletter_subscribers;
drop policy if exists "admins read subscribers" on public.newsletter_subscribers;

create policy "admins read subscribers"
  on public.newsletter_subscribers for select to authenticated
  using (public.is_admin());

drop policy if exists "admin tai anh len" on storage.objects;
drop policy if exists "admin sua anh" on storage.objects;
drop policy if exists "admin xoa anh" on storage.objects;
drop policy if exists "admins upload images" on storage.objects;
drop policy if exists "admins update images" on storage.objects;
drop policy if exists "admins delete images" on storage.objects;

create policy "admins upload images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'anh-blog' and public.is_admin());

create policy "admins update images"
  on storage.objects for update to authenticated
  using (bucket_id = 'anh-blog' and public.is_admin());

create policy "admins delete images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'anh-blog' and public.is_admin());

-- Giờ mới xoá được hàm cũ: không còn policy nào tham chiếu.
drop function if exists public.la_admin();

-- 3. RPC: tên hàm, tên tham số, và GIÁ TRỊ TRẢ VỀ -----------------------------
--
-- Giá trị trả về cũng là code: frontend so chuỗi với nó. Để 'xong' / 'da_co' thì
-- nửa giao thức vẫn là tiếng Việt.

create or replace function public.subscribe_newsletter(
  email_address text,
  from_page text default null
)
  returns text
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  clean_email text;
begin
  clean_email := lower(btrim(coalesce(email_address, '')));
  if clean_email !~* '^[^@[:space:]]+@[^@[:space:].]+\.[^@[:space:]]+$'
     or char_length(clean_email) not between 6 and 254 then
    return 'invalid_email';
  end if;

  insert into public.newsletter_subscribers (email, source)
  values (clean_email, nullif(btrim(coalesce(from_page, '')), ''))
  on conflict (email) do nothing;

  if not found then
    -- Đã có sẵn. Nếu trước đó họ đã huỷ thì mở lại đăng ký.
    update public.newsletter_subscribers
      set unsubscribed_at = null
      where email = clean_email and unsubscribed_at is not null;
    return 'already_subscribed';
  end if;

  return 'subscribed';
end;
$$;

create or replace function public.confirm_newsletter(token uuid)
  returns text
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  was_unsubscribed boolean;
begin
  -- Chỉ xác nhận dòng chưa huỷ. KHÔNG chạm tới `unsubscribed_at` — link xác nhận cũ
  -- từng làm sống lại người đã huỷ đăng ký, và đó là lỗi đã phải sửa riêng một lần.
  update public.newsletter_subscribers
    set confirmed = true, confirmed_at = now()
    where confirm_token = token and unsubscribed_at is null;

  if found then
    return 'confirmed';
  end if;

  -- Không cập nhật được: token sai, hoặc đúng token nhưng người đó đã huỷ.
  select unsubscribed_at is not null
    into was_unsubscribed
    from public.newsletter_subscribers
    where confirm_token = token;

  return case
    when was_unsubscribed is null then 'not_found'
    when was_unsubscribed then 'unsubscribed'
    else 'not_found'
  end;
end;
$$;

create or replace function public.unsubscribe_newsletter(token uuid)
  returns text
  language plpgsql
  security definer
  set search_path to ''
as $$
begin
  update public.newsletter_subscribers
    set unsubscribed_at = now()
    where unsubscribe_token = token;
  return case when found then 'unsubscribed' else 'not_found' end;
end;
$$;

create or replace function public.increment_view_count(post_slug text)
  returns bigint
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  new_count bigint;
begin
  -- Không đếm cho bài nháp hay bài chưa tồn tại: nếu không thì ai cũng tạo được
  -- dòng rác trong post_views bằng cách gọi RPC với slug tự nghĩ ra.
  if not exists (
    select 1 from public.posts where slug = post_slug and draft = false
  ) then
    return 0;
  end if;

  insert into public.post_views as pv (slug, views)
  values (post_slug, 1)
  on conflict (slug) do update
    set views = pv.views + 1,
        updated_at = now()
  returning pv.views into new_count;

  return new_count;
end;
$$;

-- Giữ đúng bộ quyền của bản cũ: trang công khai gọi được ba hàm đầu bằng khoá
-- công khai, nên `anon` phải có EXECUTE.
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;
grant execute on function public.confirm_newsletter(uuid) to anon, authenticated;
grant execute on function public.unsubscribe_newsletter(uuid) to anon, authenticated;
grant execute on function public.increment_view_count(text) to anon, authenticated;

drop function if exists public.dang_ky_newsletter(text, text);
drop function if exists public.xac_nhan_newsletter(uuid);
drop function if exists public.huy_newsletter(uuid);
drop function if exists public.tang_luot_xem(text);

-- 4. Hàm trigger ---------------------------------------------------------------
--
-- Phải dựng lại TRIGGER trước khi xoá hàm cũ: trigger giữ tham chiếu tới hàm, và
-- Postgres không cho xoá hàm còn trigger dùng.

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop function if exists public.tu_dong_cap_nhat_updated_at();
