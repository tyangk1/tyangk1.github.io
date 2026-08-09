-- Hàng đợi chủ đề: đặt trước "viết bài gì, đăng ngày nào", để việc soạn bài chạy
-- theo lịch mà không cần ai ngồi đó.
--
-- Bảng này chứa BẢN BRIEF, không chứa bài. Bài viết ra vẫn nằm ở `posts` và vẫn đi
-- qua đúng bộ ràng buộc cũ (tiêu đề ≤70, mô tả 120–160, 1–5 tag…). Nhờ vậy bài do
-- máy soạn không có đường nào lọt qua chỗ mà bài viết tay bị chặn.
--
-- `source_material` LÀ CỘT QUAN TRỌNG NHẤT, và nó tồn tại vì một lý do cụ thể:
--
--   Blog này đứng tên thật, viết ở ngôi thứ nhất, và các bài hiện có đều có số đo
--   thật ("giảm từ 4,2s xuống 0,9s"). Một mô hình ngôn ngữ không có trải nghiệm nào
--   để kể, nên nếu để nó tự do viết "tôi đã thử" thì đó là kinh nghiệm bịa — rủi ro
--   uy tín thật, không phải chuyện văn phong.
--
--   Nên: prompt chỉ được dùng ngôi thứ nhất DỰA TRÊN nội dung cột này. Cột rỗng thì
--   prompt chuyển sang giọng khách quan, không có "tôi". Đây là ràng buộc mềm ở tầng
--   prompt, không phải CHECK constraint — database không đọc được văn.
--
-- Chạy hai lần vô hại.

create table if not exists public.content_queue (
  id uuid primary key default gen_random_uuid(),

  -- Chủ đề, viết như một câu ngắn: "Vì sao tôi bỏ Redis khỏi hệ thống".
  topic text not null,

  -- Góc nhìn riêng: thứ làm bài này khác những bài đã có trên mạng. Để rỗng thì
  -- bài ra sẽ chung chung — chính là loại bài CONTENT-GUIDE nói đừng viết.
  angle text,

  -- Số liệu, trải nghiệm, lỗi đã gặp — của CHÍNH chủ blog. Xem chú thích ở đầu file.
  source_material text,

  -- Để rỗng thì để máy tự chọn tag; điền thì máy phải dùng đúng bộ này.
  tags text[] not null default '{}',

  -- Ngày muốn bài lên site. Đây cũng là `published_at` của bài sinh ra, nên cơ chế
  -- đặt lịch có sẵn lo phần còn lại.
  publish_on date not null,

  -- draft — soạn xong để nháp, chờ người duyệt. MẶC ĐỊNH.
  -- auto  — soạn xong đăng thẳng theo `publish_on`, không ai xem trước.
  mode text not null default 'draft',

  -- queued → drafting → done | failed
  status text not null default 'queued',

  -- Bài đã sinh ra. Xoá bài thì cột này về null, nhưng status vẫn 'done' — cố ý:
  -- xoá một bài rồi mà hàng đợi tự viết lại thì không ai muốn.
  created_slug text references public.posts (slug) on delete set null,

  -- Nguyên văn lỗi lần gần nhất, để lần ra được chứ không chỉ biết "thất bại".
  last_error text,

  -- Chặn một chủ đề lỗi vĩnh viễn ngốn lượt gọi API mỗi ngày.
  attempts integer not null default 0,

  drafted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint content_queue_topic_length check (char_length(btrim(topic)) between 3 and 200),
  constraint content_queue_mode_valid check (mode in ('draft', 'auto')),
  constraint content_queue_status_valid check (status in ('queued', 'drafting', 'done', 'failed')),
  constraint content_queue_tags_count check (coalesce(array_length(tags, 1), 0) <= 5),
  constraint content_queue_attempts_sane check (attempts between 0 and 100)
);

comment on table public.content_queue is
  'Hàng đợi chủ đề cho việc soạn bài tự động. Chứa brief, không chứa bài.';

comment on column public.content_queue.source_material is
  'Số liệu và trải nghiệm THẬT của chủ blog. Prompt chỉ dùng ngôi thứ nhất dựa trên '
  'cột này; rỗng thì viết giọng khách quan. Không có nó, "tôi đã thử" là bịa.';

-- Câu truy vấn duy nhất của script: lấy việc tới hạn, cũ nhất trước.
create index if not exists content_queue_due_idx
  on public.content_queue (status, publish_on);

drop trigger if exists content_queue_updated_at on public.content_queue;
create trigger content_queue_updated_at
  before update on public.content_queue
  for each row execute function public.set_updated_at();

-- Bảo mật: chỉ admin thấy được -------------------------------------------------
--
-- Hàng đợi tiết lộ kế hoạch nội dung chưa công bố. Đối thủ không quan trọng với blog
-- cá nhân, nhưng "bài sắp đăng nói về việc tôi rời công ty X" thì có.

alter table public.content_queue enable row level security;

-- Thu hồi trước, cấp lại đúng thứ cần. Supabase `alter default privileges` cấp sẵn
-- toàn quyền cho anon và authenticated trên bảng mới — đã trả giá một lần để biết:
-- RLS chặn được dữ liệu nhưng DELETE vẫn trả 204 làm người gọi tưởng đã xoá.
revoke all on table public.content_queue from anon, authenticated;
grant select, insert, update, delete on table public.content_queue to authenticated;

drop policy if exists "admins manage content queue" on public.content_queue;
create policy "admins manage content queue"
  on public.content_queue for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Lấy một việc để soạn, an toàn khi có hai tiến trình cùng chạy -----------------
--
-- `for update skip locked` để hai lần chạy chồng nhau không cùng nhận một chủ đề và
-- tạo hai bài trùng. Cron hiện tại chỉ một job, nhưng bấm "Run workflow" giữa lúc
-- cron đang chạy là chuyện có thật.
--
-- `stale_minutes` nhận lại việc bị treo: job bị kill giữa lúc soạn để lại một dòng
-- 'drafting' mãi mãi, và nếu không nhận lại thì chủ đề đó chết luôn.
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
  if not public.is_admin() then
    raise exception 'Chỉ admin được lấy việc từ hàng đợi.';
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

grant execute on function public.claim_content_queue_item(integer, integer, integer) to authenticated;
