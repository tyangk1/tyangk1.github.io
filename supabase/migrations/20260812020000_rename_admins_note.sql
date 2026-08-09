-- `admins.ghi_chu` → `admins.note`
--
-- Cột duy nhất còn tên tiếng Việt sau lượt đổi tên ở migration
-- 20260811000000_english_identifiers.sql. Lượt đó soát hàm, policy, trigger và code —
-- nhưng bảng `admins` được tạo ở một migration khác và tôi chỉ kiểm các bảng nội dung,
-- nên cột này lọt.
--
-- Đã quét lại TOÀN BỘ cột trong schema `public` để chắc chắn chỉ còn đúng một chỗ.
--
-- Chạy hai lần vô hại: `if exists` trên cột cũ, và nếu cột mới đã có thì không làm gì.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'admins' and column_name = 'ghi_chu'
  ) then
    alter table public.admins rename column ghi_chu to note;
  end if;
end
$$;

comment on column public.admins.note is
  'Ghi chú ai là ai. Không có tác dụng gì với quyền — chỉ để sau này còn nhớ.';
