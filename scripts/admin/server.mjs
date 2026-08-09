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
import { taoClient, daCauHinh, SUPABASE_URL } from '../lib/supabase.mjs';
import { MIME, taiAnhLen } from '../lib/anh.mjs';
import { kiemBai, chuanHoaBai, GIOI_HAN } from '../lib/kiem-bai.mjs';

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const CONG = Number(process.env['ADMIN_PORT'] ?? 4322);

/**
 * CHỈ nghe trên loopback.
 *
 * Mặc định của Node là nghe mọi giao diện mạng, tức là ai cùng Wi-Fi cũng mở được
 * trang này và sửa bài của bạn — mà server thì dùng khoá service_role bỏ qua toàn
 * bộ RLS. Ràng vào 127.0.0.1 là dòng quan trọng nhất trong file.
 */
const HOST = '127.0.0.1';

if (!daCauHinh) {
  console.error('✗ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.');
  process.exit(1);
}

const supabase = taoClient();

const CAC_TRUONG =
  'slug, title, description, content, published_at, content_updated_at, tags, takeaways, series_name, series_part, cover_image, cover_alt, draft, featured, updated_at';

function json(res, ma, dulieu) {
  const body = JSON.stringify(dulieu);
  res.writeHead(ma, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // Trang admin không bao giờ được cache, kể cả bởi trình duyệt.
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function docBody(req, gioiHan = 12 * 1024 * 1024) {
  const phan = [];
  let tong = 0;
  for await (const c of req) {
    tong += c.length;
    if (tong > gioiHan) throw new Error('Nội dung gửi lên quá lớn.');
    phan.push(c);
  }
  return Buffer.concat(phan);
}

// --- API -------------------------------------------------------------------

async function danhSachBai() {
  const { data, error } = await supabase
    .from('posts')
    .select(CAC_TRUONG)
    .order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

async function luuBai(thoBai) {
  const bai = chuanHoaBai(thoBai);
  const loi = kiemBai(bai);
  if (loi.length > 0) return { loi };

  const { error } = await supabase.from('posts').upsert(bai, { onConflict: 'slug' });

  if (error) {
    // Postgres vẫn là lớp chặn cuối. Nếu nó từ chối thì nghĩa là `kiemBai` bỏ sót
    // một ràng buộc — trả nguyên văn để còn lần ra được.
    return { loi: [{ truong: '', thongDiep: `Database từ chối: ${error.message}` }] };
  }

  return { ok: true, slug: bai.slug };
}

async function xoaBai(slug) {
  const { error } = await supabase.from('posts').delete().eq('slug', slug);
  if (error) throw new Error(error.message);
}

async function chayLenh(lenh, doiSo) {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const p = spawn(lenh, doiSo, {
      cwd: join(THU_MUC, '..', '..'),
      shell: process.platform === 'win32',
    });
    let ra = '';
    p.stdout.on('data', (d) => (ra += d));
    p.stderr.on('data', (d) => (ra += d));
    p.on('close', (ma) => resolve({ ma, ra: ra.trim() }));
  });
}

// --- Định tuyến ------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${CONG}`);
  const duong = url.pathname;

  try {
    // Trang và tài nguyên tĩnh
    if (req.method === 'GET' && (duong === '/' || duong === '/index.html')) {
      const html = await readFile(join(THU_MUC, 'trang.html'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(html);
    }

    if (req.method === 'GET' && duong === '/api/cau-hinh') {
      return json(res, 200, {
        gioiHan: GIOI_HAN,
        duoiAnh: Object.keys(MIME),
        supabaseHost: (() => {
          try {
            return new URL(SUPABASE_URL).host;
          } catch {
            return SUPABASE_URL;
          }
        })(),
      });
    }

    if (req.method === 'GET' && duong === '/api/bai') {
      return json(res, 200, await danhSachBai());
    }

    if (req.method === 'PUT' && duong === '/api/bai') {
      const ketQua = await luuBai(JSON.parse((await docBody(req)).toString('utf8')));
      return json(res, ketQua.loi ? 422 : 200, ketQua);
    }

    if (req.method === 'DELETE' && duong.startsWith('/api/bai/')) {
      await xoaBai(decodeURIComponent(duong.slice('/api/bai/'.length)));
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && duong === '/api/anh') {
      const ten = url.searchParams.get('ten') ?? 'anh';
      const duoi = extname(ten).toLowerCase();
      const thuMuc = url.searchParams.get('thu-muc') || String(new Date().getFullYear());

      try {
        const r = await taiAnhLen(supabase, {
          ten: ten.slice(0, ten.length - duoi.length),
          buffer: await docBody(req),
          duoi,
          thuMuc,
          rongToiDa: Number(url.searchParams.get('rong') ?? 1600),
          ghiDe: url.searchParams.get('ghi-de') === '1',
        });
        return json(res, 200, r);
      } catch (e) {
        return json(res, 422, { loi: e instanceof Error ? e.message : String(e) });
      }
    }

    if (req.method === 'POST' && duong === '/api/sync') {
      // `?drafts=1` cho phần xem trước: bài đang viết gần như luôn là nháp, mà
      // `pnpm sync` thường thì loại hẳn bài nháp — xem trước sẽ ra 404.
      const caNhap = url.searchParams.get('drafts') === '1';
      return json(res, 200, await chayLenh('pnpm', [caNhap ? 'sync:drafts' : 'sync']));
    }

    /**
     * Dev server của Astro có đang chạy không.
     *
     * Phần xem trước nhúng chính site vào iframe thay vì tự dựng một bộ render
     * xấp xỉ. Đánh đổi: phải có `pnpm dev` chạy song song. Kiểm ở đây để nói rõ
     * "chưa chạy pnpm dev" thay vì để người dùng nhìn một iframe trắng.
     */
    if (req.method === 'GET' && duong === '/api/dev-song') {
      try {
        const r = await fetch('http://localhost:4321/', {
          signal: AbortSignal.timeout(2500),
        });
        return json(res, 200, { song: r.ok });
      } catch {
        return json(res, 200, { song: false });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Không có đường dẫn này');
  } catch (e) {
    json(res, 500, { loi: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(CONG, HOST, () => {
  console.log(`\n  Admin đang chạy:  http://${HOST}:${CONG}`);
  console.log(`  Database:         ${SUPABASE_URL}`);
  console.log('\n  Chỉ nghe trên 127.0.0.1 — máy khác trong mạng không mở được.');
  console.log('  Ctrl+C để dừng.\n');
});
