/**
 * Trang admin để viết và quản lý bài — CHẠY CỤC BỘ, không bao giờ deploy.
 *
 * Chạy: pnpm admin   →   http://127.0.0.1:4322
 *
 * VÌ SAO LÀ SERVER CỤC BỘ, KHÔNG PHẢI MỘT TRANG TRÊN SITE
 *
 * Site là tĩnh trên GitHub Pages. Một trang `/admin` ở đó sẽ là HTML công khai,
 * nên muốn an toàn thì phải dựng Supabase Auth và siết RLS xuống đúng một user id
 * — vì `authenticated` trong Supabase nghĩa là BẤT KỲ ai đăng ký được, không phải
 * "chủ blog". Bỏ qua chi tiết đó là mở cửa cho người lạ sửa bài.
 *
 * Server cục bộ thì không có bề mặt tấn công nào để siết: nó chỉ nghe trên
 * 127.0.0.1, và khoá `service_role` không bao giờ ra khỏi máy. Không cần Auth,
 * không cần policy mới, không có gì để cấu hình sai.
 *
 * Đánh đổi: không viết bài từ điện thoại được. Với blog một tác giả thì đó là cái
 * giá đúng để trả.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseClient, isConfigured, SUPABASE_URL } from '../lib/supabase.mjs';
import { MIME, uploadImage } from '../lib/images.mjs';
import { validatePost, normalizePost, LIMITS } from '../lib/post.mjs';
import { validateQueueItem, normalizeQueueItem } from '../lib/queue-ui.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env['ADMIN_PORT'] ?? 4322);

/**
 * CHỈ nghe trên loopback.
 *
 * Mặc định của Node là nghe mọi giao diện mạng, tức là ai cùng Wi-Fi cũng mở được
 * trang này và sửa bài của bạn — mà server thì dùng khoá service_role bỏ qua toàn
 * bộ RLS. Ràng vào 127.0.0.1 là dòng quan trọng nhất trong file.
 */
const HOST = '127.0.0.1';

if (!isConfigured) {
  console.error('✗ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.');
  process.exit(1);
}

const supabase = createSupabaseClient();

const FIELDS =
  'slug, title, description, content, published_at, content_updated_at, tags, takeaways, series_name, series_part, cover_image, cover_alt, draft, featured, updated_at';

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // Trang admin không bao giờ được cache, kể cả bởi trình duyệt.
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readBody(req, limits = 12 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > limits) throw new Error('Nội dung gửi lên quá lớn.');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

// --- API -------------------------------------------------------------------

async function listPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select(FIELDS)
    .order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * `originalSlug` là slug bài đang mở, gửi kèm từ trang admin. Nó khác `post.slug` khi
 * người viết vừa đổi slug.
 *
 * Có nó thì UPDATE theo slug gốc — đổi slug là đổi TÊN. Không có nó thì INSERT.
 *
 * Bản trước dùng `upsert(post, { onConflict: 'slug' })` cho cả hai trường hợp. Nó
 * không lỗi 409 (SDK gắn đúng header `resolution=merge-duplicates`), nhưng đổi slug
 * của một bài cũ thì tạo ra bài MỚI và để bài cũ nằm lại — hai bài trùng nội dung,
 * không có gì báo. Trang admin đã deploy từng có bản lỗi nặng hơn của cùng chỗ này.
 */
async function savePost(rawPost, originalSlug) {
  const post = normalizePost(rawPost);
  const errors = validatePost(post);
  if (errors.length > 0) return { errors };

  // Postgres vẫn là lớp chặn cuối. Nếu nó từ chối thì nghĩa là `validatePost` bỏ sót một
  // ràng buộc — trả nguyên văn để còn lần ra được.
  const failure = (error) => ({
    errors: [
      {
        field: '',
        message: error.message.includes('posts_slug_key')
          ? `Slug "${post.slug}" đã có bài khác dùng.`
          : `Database từ chối: ${error.message}`,
      },
    ],
  });

  if (originalSlug) {
    const { data, error } = await supabase
      .from('posts')
      .update(post)
      .eq('slug', originalSlug)
      .select('slug');
    if (error) return failure(error);
    if (!data || data.length === 0) {
      return {
        errors: [
          { field: '', message: `Không thấy bài "${originalSlug}" để sửa — có thể đã bị xoá.` },
        ],
      };
    }
  } else {
    const { error } = await supabase.from('posts').insert(post);
    if (error) return failure(error);
  }

  return { ok: true, slug: post.slug };
}

async function deletePost(slug) {
  const { error } = await supabase.from('posts').delete().eq('slug', slug);
  if (error) throw new Error(error.message);
}

async function runCommand(cmd, args) {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: join(DIR, '..', '..'),
      shell: process.platform === 'win32',
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out: out.trim() }));
  });
}

// --- Định tuyến ------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const path = url.pathname;

  try {
    // Trang và tài nguyên tĩnh
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      const html = await readFile(join(DIR, 'index.html'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(html);
    }

    /**
     * Phục vụ các module dùng chung trong `scripts/lib/`.
     *
     * Nhờ vậy `index.html` `import` được đúng bộ tô màu mà admin đã deploy dùng,
     * thay vì giữ một bản copy — hai bản sẽ trôi lệch, và lúc đó người viết thấy
     * `<Callout>` được tô ở chỗ này mà không tô ở chỗ kia rồi tưởng mình gõ sai.
     *
     * Chỉ nhận đúng tên file dạng `[a-z-]+.mjs`, không cho đi lên thư mục cha.
     */
    if (req.method === 'GET' && path.startsWith('/lib/')) {
      const name = path.slice('/lib/'.length);
      if (!/^[a-z0-9-]+\.mjs$/.test(name)) {
        res.writeHead(400).end('Tên file không hợp lệ');
        return;
      }
      const js = await readFile(join(DIR, '..', 'lib', name), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(js);
    }

    if (req.method === 'GET' && path === '/api/config') {
      return json(res, 200, {
        limits: LIMITS,
        imageExts: Object.keys(MIME),
        supabaseHost: (() => {
          try {
            return new URL(SUPABASE_URL).host;
          } catch {
            return SUPABASE_URL;
          }
        })(),
      });
    }

    if (req.method === 'GET' && path === '/api/posts') {
      return json(res, 200, await listPosts());
    }

    if (req.method === 'PUT' && path === '/api/posts') {
      const raw = JSON.parse((await readBody(req)).toString('utf8'));
      // `slug_goc` đi kèm trong body chứ không phải query, để route khỏi phụ thuộc
      // vào việc `path` có giữ query string hay không. `normalizePost` dựng object
      // theo danh sách trường cố định nên khoá lạ này không lọt xuống database.
      const result = await savePost(raw, raw.slug_goc || null);
      return json(res, result.errors ? 422 : 200, result);
    }

    if (req.method === 'DELETE' && path.startsWith('/api/posts/')) {
      await deletePost(decodeURIComponent(path.slice('/api/posts/'.length)));
      return json(res, 200, { ok: true });
    }

    /*
      Hàng đợi chủ đề. Giao diện do `lib/queue-ui.mjs` dựng, dùng chung với `/admin`
      trên site; ba route dưới đây chỉ là cách nói chuyện với database của bản cục bộ.

      Validate ở ĐÂY nữa dù giao diện đã validate: giao diện là thứ dễ bỏ qua nhất —
      gọi `curl` vào cổng này là đi thẳng qua nó. Cùng lý do với `/api/posts`.
    */
    /*
      "Đăng ngay": gọi 
pc/request_deploy để database bắn repository_dispatch tới GitHub.

      Đi qua server chứ không để trang gọi thẳng: trang cục bộ không có JWT nào, còn server
      thì có service key — và RPC nhận service_role.
    */
    if (req.method === 'POST' && path === '/api/publish-now') {
      const { data, error } = await supabase.rpc('request_deploy', {
        reason: 'bấm Đăng ngay (admin cục bộ)',
      });
      if (error) return json(res, 422, { errors: error.message });
      return json(res, 200, { result: data });
    }

    if (req.method === 'GET' && path === '/api/queue') {
      const { data, error } = await supabase
        .from('content_queue')
        .select('*')
        .order('publish_on', { ascending: true });
      if (error) throw new Error(error.message);
      return json(res, 200, data);
    }

    if (req.method === 'PUT' && path === '/api/queue') {
      const raw = JSON.parse((await readBody(req)).toString('utf8'));
      const id = raw.id ?? null;

      // `raw: true` là đường của nút "Thử lại": chỉ gửi status/attempts/last_error,
      // không phải cả form. Không cho nó đi qua `normalizeQueueItem` vì object đó
      // KHÔNG có `topic` và sẽ bị validate chặn oan.
      if (raw.__raw) {
        if (!id) return json(res, 422, { errors: 'Thiếu id.' });
        const patch = {
          status: raw.status,
          attempts: raw.attempts,
          last_error: raw.last_error ?? null,
        };
        const { data, error } = await supabase
          .from('content_queue')
          .update(patch)
          .eq('id', id)
          .select('*');
        if (error) return json(res, 422, { errors: error.message });
        if (!data?.length) return json(res, 422, { errors: 'Không thấy chủ đề để sửa.' });
        return json(res, 200, data[0]);
      }

      const item = normalizeQueueItem(raw);
      const errors = validateQueueItem(item);
      if (errors.length > 0) return json(res, 422, { errors });

      const query = id
        ? supabase.from('content_queue').update(item).eq('id', id).select('*')
        : supabase.from('content_queue').insert(item).select('*');

      const { data, error } = await query;
      if (error) return json(res, 422, { errors: error.message });
      if (id && !data?.length) return json(res, 422, { errors: 'Không thấy chủ đề để sửa.' });
      return json(res, 200, data[0]);
    }

    if (req.method === 'DELETE' && path.startsWith('/api/queue/')) {
      const id = decodeURIComponent(path.slice('/api/queue/'.length));
      const { error } = await supabase.from('content_queue').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && path === '/api/images') {
      const name = url.searchParams.get('name') ?? 'anh';
      const ext = extname(name).toLowerCase();
      const dir = url.searchParams.get('thu-muc') || String(new Date().getFullYear());

      try {
        const r = await uploadImage(supabase, {
          name: name.slice(0, name.length - ext.length),
          buffer: await readBody(req),
          ext,
          dir,
          rongToiDa: Number(url.searchParams.get('rong') ?? 1600),
          ghiDe: url.searchParams.get('ghi-de') === '1',
        });
        return json(res, 200, r);
      } catch (e) {
        return json(res, 422, { errors: e instanceof Error ? e.message : String(e) });
      }
    }

    if (req.method === 'POST' && path === '/api/sync') {
      // `?drafts=1` cho phần xem trước: bài đang viết gần như luôn là nháp, mà
      // `pnpm sync` thường thì loại hẳn bài nháp — xem trước sẽ ra 404.
      const withDrafts = url.searchParams.get('drafts') === '1';
      return json(res, 200, await runCommand('pnpm', [withDrafts ? 'sync:drafts' : 'sync']));
    }

    /**
     * Cổng 4321 có phải DEV SERVER không — không chỉ "có gì đang chạy".
     *
     * Phân biệt này là bắt buộc, và đã trả giá để biết: `astro preview` cũng nghe
     * cổng 4321 và cũng trả 200, nhưng nó phục vụ bản build TĨNH trong `dist/`.
     * Xem trước trỏ vào đó thì bài mới sửa không bao giờ hiện, và bài mới tạo trả
     * 404 — mà không có dấu hiệu nào cho biết mình đang xem bản cũ.
     *
     * Dấu hiệu chắc chắn: dev server của Astro chèn `/@vite/client` vào HTML để
     * chạy HMR. Bản build tĩnh thì không bao giờ có chuỗi đó.
     */
    if (req.method === 'GET' && path === '/api/dev-alive') {
      try {
        const r = await fetch('http://localhost:4321/', { signal: AbortSignal.timeout(3000) });
        if (!r.ok) return json(res, 200, { alive: false, reason: `HTTP ${r.status}` });

        const html = await r.text();
        const isDev = html.includes('/@vite/client');

        return json(res, 200, {
          alive: isDev,
          reason: isDev
            ? ''
            : 'Cổng 4321 đang là `astro preview` (bản build tĩnh), không phải dev server.',
        });
      } catch {
        return json(res, 200, { alive: false, reason: 'Không có gì nghe ở cổng 4321.' });
      }
    }

    /**
     * Một trang bài đã tồn tại trên dev server chưa.
     *
     * Cần vì Astro phải sinh route cho file MDX mới, và việc đó mất một nhịp.
     * Gán `src` cho iframe trước lúc đó là nhận 404 và mắc ở đấy.
     */
    if (req.method === 'GET' && path === '/api/dev-page') {
      const slug = url.searchParams.get('slug') ?? '';
      try {
        const r = await fetch(`http://localhost:4321/blog/${encodeURIComponent(slug)}`, {
          signal: AbortSignal.timeout(4000),
        });
        return json(res, 200, { exists: r.ok });
      } catch {
        return json(res, 200, { exists: false });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Không có đường dẫn này');
  } catch (e) {
    json(res, 500, { errors: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Admin đang chạy:  http://${HOST}:${PORT}`);
  console.log(`  Database:         ${SUPABASE_URL}`);
  console.log('\n  Chỉ nghe trên 127.0.0.1 — máy khác trong mạng không mở được.');
  console.log('  Ctrl+C để dừng.\n');
});
