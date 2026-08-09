-- Tách quyền đọc email người đăng ký ra khỏi quyền "là admin".
--
-- VÌ SAO
--
-- Lý do dựng tài khoản bot cho CI là: KHÔNG đặt service key lên GitHub Actions, vì
-- service key đi xuyên toàn bộ RLS và đọc được cả bảng email người đăng ký.
--
-- Nhưng policy `admins read subscribers` cho MỌI admin đọc bảng đó — kể cả bot. Nên
-- lý lẽ ở trên tự mâu thuẫn: đổi service key thành tài khoản bot mà bot vẫn đọc được
-- email thì chỗ rò rỉ chỉ đổi tên, không nhỏ đi.
--
-- Bot cần đúng hai việc: lấy việc từ hàng đợi, và ghi bài. Không cần địa chỉ email
-- của ai.
--
-- Chạy hai lần vô hại.

alter table public.admins
  add column if not exists can_read_subscribers boolean not null default true;

comment on column public.admins.can_read_subscribers is
  'Người thật thì true. Tài khoản máy (CI) thì false — nó cần ghi bài, không cần '
  'địa chỉ email của người đọc. Cột này là ranh giới giữa "là admin" và "được xem '
  'dữ liệu cá nhân của người khác".';

/*
  Hàm riêng thay vì nhét điều kiện vào policy: policy chạy trên `newsletter_subscribers`
  và cần đọc `admins` để quyết định — nếu viết trực tiếp thì cần policy đọc `admins`,
  mà bảng đó cố tình KHÔNG có policy nào. `security definer` giải đúng chỗ đó.
*/
create or replace function public.can_read_subscribers()
  returns boolean
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select exists (
    select 1 from public.admins a
     where a.user_id = auth.uid() and a.can_read_subscribers
  );
$$;

grant execute on function public.can_read_subscribers() to authenticated;

drop policy if exists "admins read subscribers" on public.newsletter_subscribers;
create policy "admins read subscribers"
  on public.newsletter_subscribers for select to authenticated
  using (public.can_read_subscribers());
