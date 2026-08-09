/**
 * Gửi email newsletter. Chạy Ở MÁY, không phải trên CI.
 *
 * Vì sao ở máy: gửi thư cần đọc danh sách email, tức cần
 * `SUPABASE_SERVICE_ROLE_KEY`. Đặt khoá đó vào GitHub Actions là mở rộng chỗ nó
 * có thể rò rỉ, mà chẳng được gì — bản tin gửi tay mỗi khi có bài mới, không phải
 * việc cần tự động theo mỗi commit.
 *
 * Hai loại thư:
 *
 *   pnpm newsletter:xac-nhan            Thư xác nhận cho người mới đăng ký.
 *                                       Phải gửi, nếu không họ mãi ở trạng thái
 *                                       chưa xác nhận và không bao giờ nhận bản tin.
 *
 *   pnpm newsletter:gui --bai=<slug>    Thông báo bài mới cho người ĐÃ xác nhận.
 *
 * MẶC ĐỊNH LÀ CHẠY THỬ. Phải thêm `--that` mới gửi thật. Gửi thư là việc không
 * thu hồi được — không có Ctrl+Z cho một nghìn hộp thư.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { taoClient, daCauHinh } from './lib/supabase.mjs';

const THU_MUC_BLOG = 'src/content/blog';

/** Đọc từ .env: `lib/supabase.mjs` đã nạp file vào process.env khi import. */
const RESEND_API_KEY = process.env['RESEND_API_KEY'] ?? '';
const NEWSLETTER_FROM = process.env['NEWSLETTER_FROM'] ?? '';
const SITE_URL = (process.env['PUBLIC_SITE_URL'] ?? 'https://tyangk1.github.io').replace(/\/$/, '');

const guiThat = process.argv.includes('--that');
const cheDoXacNhan = process.argv.includes('--xac-nhan');

function docCo(ten) {
  const found = process.argv.find((a) => a.startsWith(`--${ten}=`));
  return found ? found.slice(ten.length + 3) : '';
}

function thoatLoi(...dong) {
  for (const d of dong) console.error(d);
  process.exitCode = 1;
}

/** Escape để chèn giá trị vào HTML của email. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Đọc frontmatter của một bài. Chỉ cần title + description nên tự tách, không
 * kéo thêm thư viện YAML vào chỉ để lấy hai dòng.
 */
async function docBai(slug) {
  for (const duoi of ['.mdx', '.md']) {
    try {
      const raw = await readFile(join(THU_MUC_BLOG, slug + duoi), 'utf8');
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) return null;

      const lay = (khoa) => {
        const m = fm[1].match(new RegExp(`^${khoa}:\\s*(.*)$`, 'm'));
        if (!m) return '';
        return m[1].trim().replace(/^["']|["']$/g, '');
      };

      const nhap = /^draft:\s*true\s*$/m.test(fm[1]);
      return { slug, title: lay('title'), description: lay('description'), nhap };
    } catch {
      // thử đuôi kế tiếp
    }
  }
  return null;
}

/** Email thư xác nhận. Text + HTML, vì nhiều hộp thư vẫn chặn HTML. */
function thuXacNhan(nguoiNhan) {
  const link = `${SITE_URL}/newsletter/xac-nhan?token=${nguoiNhan.confirm_token}`;

  return {
    subject: 'Xác nhận đăng ký nhận bài mới',
    text: [
      'Chào bạn,',
      '',
      'Bạn vừa đăng ký nhận thông báo khi có bài mới trên blog của tôi.',
      'Bấm link dưới đây để xác nhận:',
      '',
      link,
      '',
      'Nếu không phải bạn đăng ký thì cứ bỏ qua email này — không có gì xảy ra',
      'khi bạn không bấm.',
    ].join('\n'),
    html: [
      '<p>Chào bạn,</p>',
      '<p>Bạn vừa đăng ký nhận thông báo khi có bài mới trên blog của tôi.</p>',
      `<p><a href="${esc(link)}">Bấm vào đây để xác nhận</a></p>`,
      '<p style="color:#666;font-size:14px">Nếu không phải bạn đăng ký thì cứ bỏ qua email này — không có gì xảy ra khi bạn không bấm.</p>',
    ].join('\n'),
  };
}

/** Email thông báo bài mới. */
function thuBaiMoi(nguoiNhan, bai) {
  const linkBai = `${SITE_URL}/blog/${bai.slug}`;
  const linkHuy = `${SITE_URL}/newsletter/huy?token=${nguoiNhan.unsubscribe_token}`;

  return {
    subject: bai.title,
    // `List-Unsubscribe` để Gmail/Outlook hiện nút Huỷ đăng ký ngay cạnh tên người
    // gửi. Thiếu nó thì người muốn thoát sẽ bấm "Báo cáo spam" — và đó là thứ
    // phá uy tín tên miền gửi nhanh nhất.
    headers: {
      'List-Unsubscribe': `<${linkHuy}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: [
      bai.title,
      '',
      bai.description,
      '',
      `Đọc bài: ${linkBai}`,
      '',
      '---',
      `Huỷ đăng ký: ${linkHuy}`,
    ].join('\n'),
    html: [
      `<h1 style="font-size:20px"><a href="${esc(linkBai)}">${esc(bai.title)}</a></h1>`,
      `<p>${esc(bai.description)}</p>`,
      `<p><a href="${esc(linkBai)}">Đọc bài</a></p>`,
      '<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">',
      `<p style="color:#666;font-size:13px"><a href="${esc(linkHuy)}">Huỷ đăng ký</a></p>`,
    ].join('\n'),
  };
}

async function guiQuaResend(den, thu) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: NEWSLETTER_FROM,
      to: [den],
      subject: thu.subject,
      text: thu.text,
      html: thu.html,
      ...(thu.headers ? { headers: thu.headers } : {}),
    }),
  });

  if (!res.ok) {
    const chiTiet = await res.text();
    throw new Error(`Resend trả ${res.status}: ${chiTiet.slice(0, 200)}`);
  }
}

async function main() {
  if (!daCauHinh) {
    return thoatLoi(
      '✗ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.',
      '  Không đọc được danh sách người đăng ký.',
    );
  }

  const slug = docCo('bai');

  if (!cheDoXacNhan && !slug) {
    return thoatLoi(
      'Cách dùng:',
      '  pnpm newsletter:xac-nhan            gửi thư xác nhận cho người mới đăng ký',
      '  pnpm newsletter:gui --bai=<slug>    gửi thông báo bài mới',
      '',
      'Mặc định là CHẠY THỬ. Thêm --that để gửi thật.',
    );
  }

  const supabase = taoClient();

  // Chọn người nhận theo loại thư.
  //
  // Thư xác nhận  -> người CHƯA xác nhận và chưa huỷ.
  // Thư bài mới   -> người ĐÃ xác nhận và chưa huỷ. Gửi cho người chưa xác nhận
  //                  là gửi thư rác: họ chưa chứng minh hộp thư đó là của họ.
  let q = supabase
    .from('newsletter_subscribers')
    .select('email, confirmed, confirm_token, unsubscribe_token')
    .is('unsubscribed_at', null);

  q = cheDoXacNhan ? q.eq('confirmed', false) : q.eq('confirmed', true);

  const { data: nguoiNhan, error } = await q;
  if (error) return thoatLoi(`✗ Không đọc được danh sách: ${error.message}`);

  let bai = null;
  if (!cheDoXacNhan) {
    bai = await docBai(slug);
    if (!bai) {
      const co = (await readdir(THU_MUC_BLOG).catch(() => []))
        .filter((f) => /\.mdx?$/.test(f))
        .map((f) => f.replace(/\.mdx?$/, ''));
      return thoatLoi(
        `✗ Không thấy bài "${slug}".`,
        '',
        'Các slug đang có:',
        ...co.map((c) => `  ${c}`),
      );
    }
    if (bai.nhap) {
      return thoatLoi(
        `✗ Bài "${slug}" đang là draft — nó chưa có trên site.`,
        '  Gửi thư dẫn tới một trang 404 thì tệ hơn là không gửi.',
      );
    }
  }

  const nhan = cheDoXacNhan ? 'thư xác nhận' : `thông báo bài "${bai.title}"`;

  if (nguoiNhan.length === 0) {
    console.log(`Không có ai cần nhận ${nhan}. Không gửi gì.`);
    return;
  }

  console.log(`${guiThat ? 'GỬI THẬT' : 'CHẠY THỬ'} — ${nguoiNhan.length} người nhận ${nhan}.\n`);

  // Ở chế độ thử: in đúng nội dung sẽ gửi cho người đầu tiên, rồi liệt kê phần còn
  // lại. Đọc được nội dung thật trước khi gửi là thứ duy nhất chặn được lỗi kiểu
  // "link xác nhận trỏ về localhost".
  if (!guiThat) {
    const mau = cheDoXacNhan ? thuXacNhan(nguoiNhan[0]) : thuBaiMoi(nguoiNhan[0], bai);
    console.log(`  From:    ${NEWSLETTER_FROM || '(chưa đặt NEWSLETTER_FROM)'}`);
    console.log(`  To:      ${nguoiNhan[0].email}`);
    console.log(`  Subject: ${mau.subject}`);
    if (mau.headers) {
      for (const [k, v] of Object.entries(mau.headers)) console.log(`  ${k}: ${v}`);
    }
    console.log('\n  --- bản text ---');
    console.log(
      mau.text
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n'),
    );

    if (nguoiNhan.length > 1) {
      console.log(`\n  Còn ${nguoiNhan.length - 1} người nữa:`);
      for (const n of nguoiNhan.slice(1)) console.log(`    ${n.email}`);
    }

    console.log('\nThêm --that để gửi thật.');
    return;
  }

  if (!RESEND_API_KEY || !NEWSLETTER_FROM) {
    return thoatLoi(
      '✗ Thiếu RESEND_API_KEY hoặc NEWSLETTER_FROM trong .env.',
      '',
      '  1. Tạo tài khoản ở https://resend.com (bậc free: 3.000 thư/tháng)',
      '  2. Xác minh tên miền gửi, hoặc dùng onboarding@resend.dev để thử',
      '  3. API Keys → tạo khoá, dán vào .env:',
      '',
      '     RESEND_API_KEY=re_...',
      '     NEWSLETTER_FROM=Tên Của Bạn <bai-moi@ten-mien-cua-ban.com>',
    );
  }

  let xong = 0;
  const loi = [];

  for (const n of nguoiNhan) {
    const thu = cheDoXacNhan ? thuXacNhan(n) : thuBaiMoi(n, bai);
    try {
      await guiQuaResend(n.email, thu);
      xong += 1;
      console.log(`  ✓ ${n.email}`);
    } catch (e) {
      loi.push(`${n.email}: ${e instanceof Error ? e.message : String(e)}`);
      console.error(`  ✗ ${n.email}`);
    }

    // Bậc free của Resend giới hạn 2 thư/giây. Vượt là bị 429 và thư đó mất —
    // nghỉ 600ms giữa hai lần gửi thì không bao giờ chạm ngưỡng.
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\nĐã gửi ${xong}/${nguoiNhan.length}.`);

  if (loi.length > 0) {
    console.error('\nThất bại:');
    for (const l of loi) console.error(`  ${l}`);
    process.exitCode = 1;
  }
}

await main();
