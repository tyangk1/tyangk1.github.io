-- Tìm kiếm toàn văn bằng Postgres, thay cho chỉ mục Pagefind sinh lúc build.
--
-- VÌ SAO
--
-- Pagefind đọc HTML đã build. Trang bài giờ chạy lúc có request nên không còn HTML để
-- đọc, và chỉ mục chỉ còn phủ được các trang danh sách. Bản vá tạm là sinh HTML vào thư
-- mục tạm lúc build (xem `scripts/build-search-index.mjs`), nhưng nó vẫn là chỉ mục lúc
-- build: bài vừa sửa chỉ tìm được sau lần build kế tiếp.
--
-- Tìm trong database thì không có khoảng lệch đó.
--
-- TIẾNG VIỆT KHÔNG CÓ TỪ ĐIỂN TRONG POSTGRES
--
-- Nên dùng cấu hình `simple` (tách theo khoảng trắng, không chia gốc từ) cộng `unaccent`.
-- Không chia gốc từ với tiếng Việt là ĐÚNG chứ không phải thoả hiệp: tiếng Việt không
-- biến hình, "đọc" và "đọc được" là hai từ khác nhau chứ không phải hai dạng của một từ.
--
-- `unaccent` cho phép gõ không dấu — "tieng viet" ra bài về "tiếng Việt". Với người Việt
-- gõ nhanh thì đây là tính năng quan trọng nhất, không phải phần thêm.
--
-- Migration này chạy được nhiều lần.

create extension if not exists unaccent;

-- Bọc `unaccent` thành IMMUTABLE để dùng được trong cột sinh và trong index.
--
-- `unaccent(text)` một tham số là STABLE, không phải IMMUTABLE, vì nó đọc từ điển mặc
-- định lúc chạy. Postgres từ chối STABLE trong `generated always as`. Dạng hai tham số
-- chỉ rõ từ điển nên khai IMMUTABLE được.
--
-- Đánh đổi phải biết: nếu ai đó SỬA từ điển `unaccent` thì các giá trị đã lưu trong cột
-- sinh sẽ lệch với hàm, và phải `reindex`. Từ điển đó không bao giờ đổi trong thực tế,
-- nhưng nói ra vẫn hơn để người sau tự phát hiện.
create or replace function public.search_normalize(txt text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select lower(public.unaccent('public.unaccent', txt))
$$;

comment on function public.search_normalize(text) is
  'Bỏ dấu và hạ chữ thường, để tìm kiếm không phân biệt dấu. IMMUTABLE nên dùng được trong cột sinh.';

-- Nối mảng tag thành một chuỗi. Lại một lần bọc để lấy IMMUTABLE.
--
-- `array_to_string` được khai STABLE vì với mảng kiểu bất kỳ nó phải gọi hàm xuất của
-- kiểu phần tử, mà hàm đó có thể phụ thuộc cấu hình. Với `text[]` thì không có gì phụ
-- thuộc: nối chuỗi bằng dấu cách là thao tác tất định. Nên bọc lại và khai IMMUTABLE là
-- đúng chứ không phải lách luật.
--
-- Đã trả giá để biết chỗ này: cả biểu thức cột sinh bị từ chối với "generation expression
-- is not immutable", và phải thử từng thành phần một mới ra được thủ phạm là hàm này chứ
-- không phải `to_tsvector` hay `unaccent` như tôi đoán ban đầu.
create or replace function public.search_tags_text(t text[])
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(array_to_string(t, ' '), '')
$$;

-- Cột sinh, không phải cột thường có trigger.
--
-- Cột sinh thì KHÔNG THỂ lệch với nội dung: Postgres tự tính lại mỗi lần `title`,
-- `description`, `tags` hay `content` đổi. Trigger thì lệch được — quên gọi trong một
-- đường ghi là bài đó lặng lẽ biến mất khỏi kết quả tìm kiếm, và không có gì báo.
--
-- Trọng số: tiêu đề (A) > mô tả và tag (B) > thân bài (D). Một bài có từ khoá trong tiêu
-- đề gần như luôn đúng ý người tìm hơn một bài chỉ nhắc từ đó giữa thân bài.
--
-- `'simple'::regconfig` chứ không phải `'simple'`. Dạng `to_tsvector(text, text)` là
-- STABLE — tên cấu hình được tra lúc chạy — nên Postgres từ chối cả biểu thức với
-- "generation expression is not immutable". Ép sang `regconfig` thì cấu hình được chốt
-- lúc tạo cột và hàm trở thành IMMUTABLE. Đã trả giá để biết.
alter table public.posts
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple'::regconfig, public.search_normalize(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple'::regconfig, public.search_normalize(coalesce(description, ''))), 'B') ||
    setweight(
      to_tsvector('simple'::regconfig, public.search_normalize(public.search_tags_text(tags))),
      'B'
    ) ||
    setweight(to_tsvector('simple'::regconfig, public.search_normalize(coalesce(content, ''))), 'D')
  ) stored;

create index if not exists posts_search_vector_idx
  on public.posts using gin (search_vector);

-- Hàm tìm kiếm cho người đọc.
--
-- `security invoker` là CÓ CHỦ Ý, không phải quên. Hàm chạy bằng quyền người gọi nên RLS
-- của bảng `posts` vẫn áp dụng — người lạ không thể lấy bài nháp qua đường tìm kiếm.
-- `security definer` ở đây sẽ mở đúng cái lỗ đó.
--
-- Điều kiện `draft` và `published_at` vẫn viết lại ở đây dù RLS đã lọc. Hai lớp cho hai
-- lý do khác nhau: RLS chặn khi có người gọi API trực tiếp, còn điều kiện dưới đây nói rõ
-- ý định tại chỗ đọc và vẫn đúng nếu policy bị sửa sai.
create or replace function public.search_posts(q text, max_results int default 20)
returns table (
  slug text,
  title text,
  description text,
  published_at date,
  tags text[],
  rank real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.slug,
    p.title,
    p.description,
    p.published_at,
    p.tags,
    ts_rank(p.search_vector, tsq) as rank
  from public.posts p,
       -- `websearch_to_tsquery` chứ không phải `to_tsquery`: nó nhận thứ người ta thật sự
       -- gõ vào hộp tìm kiếm ("cache cdn", trích dẫn, dấu trừ) và KHÔNG ném lỗi cú pháp.
       -- `to_tsquery` thì một dấu `&` lạc tay là lỗi 500 trên trang tìm kiếm.
       websearch_to_tsquery('simple', public.search_normalize(coalesce(q, ''))) tsq
  where p.draft = false
    and p.published_at <= (current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date
    and p.search_vector @@ tsq
  order by rank desc, p.published_at desc
  -- Chặn trên cứng: `max_results` đến từ query string của người lạ, nên không được để nó
  -- yêu cầu cả bảng. `least` giữ mức tối đa 50 kể cả khi có người gọi với 100000.
  limit least(greatest(coalesce(max_results, 20), 1), 50)
$$;

comment on function public.search_posts(text, int) is
  'Tìm bài đã đăng theo từ khoá, không phân biệt dấu. Chạy bằng quyền người gọi nên RLS vẫn áp dụng.';

grant execute on function public.search_posts(text, int) to anon, authenticated;
