-- Link xác nhận không được hồi sinh người đã huỷ đăng ký.
--
-- LỖI: bản trước của `xac_nhan_newsletter` có `unsubscribed_at = null` trong câu
-- UPDATE. Nghĩa là bất kỳ ai phát lại link xác nhận CŨ đều bật lại đăng ký của
-- người đã huỷ. Mà link đó nằm trong hộp thư của họ vĩnh viễn, và các công cụ
-- quét thư vẫn mở lại link cũ.
--
-- Đã dựng lại lỗi trên site thật để chắc chắn, không suy đoán:
--   1. Xác nhận đăng ký      -> confirmed = true
--   2. Bấm nút huỷ           -> unsubscribed_at được đặt
--   3. Mở lại link xác nhận cũ -> "Xong. Từ giờ mỗi khi có bài mới..."
--      và trong database: unsubscribed_at về lại NULL.
--
-- Người đã chủ động huỷ lại nhận được thư. Đó chính là thứ khiến người ta bấm
-- "Báo cáo spam" thay vì bấm huỷ lần nữa — và mất uy tín tên miền gửi.
--
-- SỬA: chỉ xác nhận những dòng CHƯA huỷ. Muốn quay lại thì họ tự đăng ký lại ở
-- form trên site — `dang_ky_newsletter` đã xử lý đúng việc đó, và đó là hành động
-- do chính họ làm bây giờ, không phải một cú bấm từ quá khứ.
--
-- Trả thêm mã `da_huy` để trang xác nhận nói rõ chuyện gì đã xảy ra, thay vì gộp
-- vào `khong_thay` khiến người đọc tưởng link bị lỗi.

create or replace function public.xac_nhan_newsletter(token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  da_huy boolean;
begin
  -- Chỉ xác nhận dòng chưa huỷ. KHÔNG chạm tới `unsubscribed_at`.
  update public.newsletter_subscribers
    set confirmed = true, confirmed_at = now()
    where confirm_token = token and unsubscribed_at is null;

  if found then
    return 'xong';
  end if;

  -- Không cập nhật được: token sai, hoặc đúng token nhưng người đó đã huỷ.
  -- Phân biệt hai trường hợp để thông báo cho đúng.
  select unsubscribed_at is not null
    into da_huy
    from public.newsletter_subscribers
    where confirm_token = token;

  return case
    when da_huy is null then 'khong_thay'
    when da_huy then 'da_huy'
    else 'khong_thay'
  end;
end;
$$;

comment on function public.xac_nhan_newsletter(uuid) is
  'Xác nhận email bằng token từ link trong thư. Trả về xong | da_huy | khong_thay. '
  'KHÔNG hồi sinh người đã huỷ đăng ký — họ phải tự đăng ký lại.';

grant execute on function public.xac_nhan_newsletter(uuid) to anon, authenticated;
