-- "Đăng ngay": cho database gọi GitHub để bắt đầu deploy, thay vì chờ cron 20 phút.
--
-- VÌ SAO 20 PHÚT, VÀ VÌ SAO KHÔNG THỂ VỀ 0
--
-- Site là TĨNH: HTML sinh ra lúc build. Sửa database không làm HTML đổi, nên publish
-- nghĩa là build lại. Đo trên chính repo này:
--
--   CI                     ~40s
--   Deploy                 ~35s
--   khoảng giữa hai cái     ~2s
--   đường auto-publish (không qua CI): sync+commit ~30s rồi build+deploy ~35s
--
-- Tức SÀN là khoảng 60–90 giây. 20 phút không phải giới hạn kỹ thuật — nó là nhịp cron,
-- tức là CI phải HỎI THĂM database vì không có gì GỌI nó. Đây là thứ bỏ cái hỏi thăm đó.
--
-- Muốn dưới 1 giây thì phải bỏ build tĩnh và render bài ở trình duyệt — mất luôn ảnh OG
-- sinh lúc build, chỉ mục tìm kiếm Pagefind, bộ thành phần MDX (cần biên dịch), và tốc
-- độ tải trang đầu. Với một blog thì đó là đổi cái quan trọng để lấy cái không quan trọng.
--
-- VÌ SAO VẪN GIỮ CRON
--
-- Cron 20 phút không chỉ là sự lười: nó GỘP. Sửa một bài là nhiều lần Lưu, và không ai
-- muốn 10 lần deploy cho 10 lần Lưu. Nên cron là lưới an toàn tự động, còn nút này là
-- lúc bạn nói "xong rồi, lên đi".
--
-- Chạy hai lần vô hại.

create extension if not exists pg_net;

/*
  Lịch sử yêu cầu deploy. Hai việc:

  1. CHỐNG BẤM DỒN. Một lần deploy mất ~60–90s; bấm mười lần trong một phút chỉ tạo mười
     lần build đè nhau. RPC từ chối nếu vừa có yêu cầu trong `min_gap_seconds`.
  2. Vết để lần lại. Deploy tự nhiên xảy ra mà không ai biết vì sao là thứ khó debug.
*/
create table if not exists public.deploy_requests (
  id bigserial primary key,
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users (id) on delete set null,
  reason text
);

create index if not exists deploy_requests_recent_idx
  on public.deploy_requests (requested_at desc);

alter table public.deploy_requests enable row level security;

-- Thu hồi trước, cấp lại đúng thứ cần. Supabase cấp sẵn toàn quyền cho anon và
-- authenticated trên bảng mới.
revoke all on table public.deploy_requests from anon, authenticated;
grant select on table public.deploy_requests to authenticated;

drop policy if exists "admins read deploy requests" on public.deploy_requests;
create policy "admins read deploy requests"
  on public.deploy_requests for select to authenticated
  using (public.is_admin());

/*
  Token GitHub cất trong Vault, KHÔNG trong file migration.

  Migration nằm trong repo công khai, nên token viết thẳng vào đây là công bố nó. Vault mã
  hoá và chỉ đọc được qua view `vault.decrypted_secrets`, mà view đó chỉ chủ database đọc
  được — hàm `security definer` bên dưới đọc hộ.

  Đặt/đổi token: `pnpm deploy:token`. Xoay token GitHub thì phải chạy lại lệnh đó, nếu
  không nút "Đăng ngay" sẽ trả 401 mà không có gì khác báo.
*/
create or replace function public.request_deploy(
  reason text default null,
  min_gap_seconds integer default 60
)
  returns text
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  github_token text;
  repo text;
  last_at timestamptz;
begin
  -- service_role cũng được: admin cục bộ (pnpm admin) dùng service key, và ai có khoá
  -- đó thì đã insert into deploy_requests rồi tự gọi GitHub được — chặn ở đây không
  -- thêm lớp an toàn nào, chỉ làm bản cục bộ thiếu một nút mà bản deploy có.
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Chỉ admin được yêu cầu deploy.';
  end if;

  -- Chống bấm dồn. Trả chuỗi thay vì raise: người bấm hai lần không làm gì sai, chỉ cần
  -- biết lần trước đang chạy.
  select max(d.requested_at) into last_at from public.deploy_requests d;
  if last_at is not null and last_at > now() - make_interval(secs => min_gap_seconds) then
    return 'qua_som';
  end if;

  select decrypted_secret into github_token
    from vault.decrypted_secrets where name = 'github_deploy_token';

  select decrypted_secret into repo
    from vault.decrypted_secrets where name = 'github_repo';

  if github_token is null or repo is null then
    return 'chua_cau_hinh';
  end if;

  /*
    `repository_dispatch` chứ không phải `workflow_dispatch`.

    Cả hai đều gọi được, nhưng repository_dispatch là sự kiện "có việc xảy ra ngoài
    GitHub", đúng nghĩa ở đây, và nó không cần biết tên file workflow — nên đổi tên file
    sau này không làm hàm này gãy.
  */
  perform net.http_post(
    url := 'https://api.github.com/repos/' || repo || '/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || github_token,
      'Accept', 'application/vnd.github+json',
      'User-Agent', 'supabase-request-deploy',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'event_type', 'publish-now',
      'client_payload', jsonb_build_object('reason', coalesce(reason, 'không nêu'))
    )
  );

  insert into public.deploy_requests (requested_by, reason)
  values (auth.uid(), reason);

  return 'da_gui';
end;
$$;

grant execute on function public.request_deploy(text, integer) to authenticated;

comment on function public.request_deploy is
  'Gọi GitHub repository_dispatch để bắt đầu deploy ngay, thay vì chờ cron 20 phút. '
  'Chỉ admin. Trả: da_gui | qua_som | chua_cau_hinh.';

/*
  Ghi bí mật vào Vault. CHỈ service_role.

  Cần một hàm trong schema `public` vì PostgREST không phơi schema `vault` ra ngoài — mà
  script `pnpm deploy:token` đi qua REST. Hàm này KHÔNG cho `authenticated` gọi: ghi được
  Vault là ghi được token mà `request_deploy()` sẽ dùng, tức là chiếm được đường deploy.

  `delete` trước `create_secret` vì `create_secret` không ghi đè theo tên — gọi hai lần sẽ
  có hai bí mật cùng tên, và câu `select ... where name = ...` trong `request_deploy` sẽ
  không xác định lấy cái nào.
*/
create or replace function public.set_deploy_secret(secret_name text, secret_value text)
  returns text
  language plpgsql
  security definer
  set search_path to ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Chỉ service_role được ghi Vault.';
  end if;

  delete from vault.secrets where name = secret_name;
  perform vault.create_secret(secret_value, secret_name, 'Dùng cho request_deploy()');

  return 'ok';
end;
$$;

revoke all on function public.set_deploy_secret(text, text) from public;
revoke all on function public.set_deploy_secret(text, text) from anon, authenticated;
grant execute on function public.set_deploy_secret(text, text) to service_role;
