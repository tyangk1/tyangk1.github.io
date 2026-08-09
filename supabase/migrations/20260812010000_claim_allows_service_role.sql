-- Cho `service_role` lấy việc từ hàng đợi.
--
-- Bản trước chỉ chấp nhận `is_admin()`, tức phải có JWT của một người có tên trong
-- bảng `admins`. Service key thì `auth.uid()` là null nên bị từ chối bằng P0001 —
-- và đó là lỗi thiết kế, không phải bảo mật:
--
--   Ai có service key thì đã `update content_queue set status = 'drafting'` thẳng vào
--   bảng được rồi. Chặn ở hàm không thêm một lớp an toàn nào, chỉ làm script chạy ở
--   máy (đọc `.env`) không dùng được đúng con đường an toàn về tranh chấp.
--
-- Trên CI thì KHÔNG dùng service key: workflow đăng nhập bằng một tài khoản bot có
-- tên trong `admins`, nên vẫn đi nhánh `is_admin()`. Xem chú thích ở workflow.
--
-- Chạy hai lần vô hại.

create or replace function public.claim_content_queue_item(
  lead_days integer default 3,
  max_attempts integer default 3,
  stale_minutes integer default 30
)
  returns public.content_queue
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  claimed public.content_queue;
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'Chỉ admin hoặc service_role được lấy việc từ hàng đợi.';
  end if;

  update public.content_queue q
     set status = 'drafting',
         attempts = q.attempts + 1
   where q.id = (
     select c.id
       from public.content_queue c
      where c.attempts < max_attempts
        and c.publish_on <= ((now() at time zone 'Asia/Ho_Chi_Minh')::date + lead_days)
        and (
          c.status = 'queued'
          or (c.status = 'drafting' and c.updated_at < now() - make_interval(mins => stale_minutes))
        )
      order by c.publish_on, c.created_at
        for update skip locked
      limit 1
   )
  returning q.* into claimed;

  return claimed;
end;
$$;

grant execute on function public.claim_content_queue_item(integer, integer, integer)
  to authenticated, service_role;
