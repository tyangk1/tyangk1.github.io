-- Đánh dấu bài nào đã gửi bản tin.
--
-- VÌ SAO CẦN MỘT CỘT, KHÔNG PHẢI GIT DIFF
--
-- Cách hiển nhiên để biết "bài nào mới lên" là so commit. Nhưng gửi email là việc KHÔNG
-- HOÀN LẠI ĐƯỢC, và git diff sai theo nhiều cách rất bình thường:
--
--   chạy lại workflow          -> cùng một diff, gửi lần hai
--   sửa chính tả một bài cũ    -> file đổi, bị coi là bài mới
--   revert rồi commit lại      -> bài xuất hiện lần nữa
--
-- Một cột trong database thì không có cách nào sai như vậy: gửi rồi là có mốc thời
-- gian, và câu `newsletter_sent_at is null` không bao giờ chọn lại bài đó. Chống gửi
-- trùng phải nằm ở tầng dữ liệu, không nằm ở tầng suy luận.
--
-- Cột này KHÔNG có nghĩa "đã đăng". Bài có thể lên site mà chưa gửi thư (bình thường,
-- vì gửi thư là hành động riêng), nhưng không thể gửi thư mà chưa lên site.
--
-- BACKFILL: CHỈ MỘT LẦN, ĐÚNG LÚC THÊM CỘT
--
-- Mọi bài đã có trước khi cột này tồn tại đều PHẢI được đánh dấu là đã gửi. Không làm
-- thì lần đầu bật gửi tự động sẽ email toàn bộ bài cũ cho người đăng ký — với database
-- này là 8 thư một lúc về những bài họ đã đọc từ lâu.
--
-- Và backfill phải nằm TRONG nhánh "vừa thêm cột", không phải một câu UPDATE trần. Một
-- câu UPDATE trần thì lần chạy lại migration sau này sẽ âm thầm đánh dấu những bài mới
-- chưa gửi, và bản tin của chúng không bao giờ đi. Đó là loại lỗi không ai báo.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'posts'
       and column_name = 'newsletter_sent_at'
  ) then
    alter table public.posts add column newsletter_sent_at timestamptz;

    update public.posts
       set newsletter_sent_at = now()
     where draft = false;

    raise notice 'Đã thêm cột và đánh dấu % bài cũ là đã gửi.',
      (select count(*) from public.posts where newsletter_sent_at is not null);
  end if;
end
$$;

comment on column public.posts.newsletter_sent_at is
  'Mốc thời gian đã gửi bản tin thông báo bài này. NULL nghĩa là chưa gửi. Đây là thứ '
  'chặn gửi trùng — đừng suy ra từ git diff, diff sai mỗi lần chạy lại workflow.';

-- Câu truy vấn duy nhất của trình gửi: bài đã đăng, tới ngày, chưa gửi thư.
-- Index một phần vì phần lớn bài rồi sẽ có mốc này — chỉ số nhỏ và luôn nóng.
create index if not exists posts_newsletter_pending_idx
  on public.posts (published_at desc)
  where draft = false and newsletter_sent_at is null;
