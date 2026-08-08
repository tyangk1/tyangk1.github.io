-- ============================================================================
--  Danh sách đăng ký nhận bài mới.
--
--  Thiết kế xoay quanh một mối lo duy nhất: bảng này chứa email của người thật.
--  Vì vậy khoá công khai (anon) KHÔNG được đọc bảng — chỉ được gọi một hàm để
--  thêm vào. Không có đường nào để ai đó tải về danh sách email của bạn.
-- ============================================================================

create table public.newsletter_subscribers (
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

create index newsletter_da_xac_nhan on public.newsletter_subscribers (created_at desc)
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
