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
 *   pnpm newsletter:xac-recipient            Thư xác nhận cho người mới đăng ký.
 *                                       Phải gửi, nếu không họ mãi ở trạng thái
 *                                       chưa xác nhận và không bao giờ nhận bản tin.
 *
 *   pnpm newsletter:send --post=<slug>    Thông báo bài mới cho người ĐÃ xác nhận.
 *
 * MẶC ĐỊNH LÀ CHẠY THỬ. Phải thêm `--that` mới gửi thật. Gửi thư là việc không
 * email hồi được — không có Ctrl+Z cho một nghìn hộp thư.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createSupabaseClient, isConfigured } from './lib/supabase.mjs';

const BLOG_DIR = 'src/content/blog';

/** Đọc từ .env: `lib/supabase.mjs` đã nạp file vào process.env khi import. */
const RESEND_API_KEY = process.env['RESEND_API_KEY'] ?? '';
const NEWSLETTER_FROM = process.env['NEWSLETTER_FROM'] ?? '';

/**
 * URL site đọc từ `src/site.config.ts` — nguồn sự thật duy nhất.
 *
 * Viết cứng ở đây thì ngày đổi sang tên miền riêng, mọi link xác nhận và huỷ đăng
 * ký trong thư vẫn trỏ về github.io. Thư đã gửi thì không sửa được, nên đây là
 * loại lỗi chỉ phát hiện khi có người phàn nàn.
 *
 * Đọc bằng regex thay vì import vì file kia là TypeScript, còn script này chạy
 * bằng `node` thuần.
 */
async function readSiteUrl() {
  const raw = await readFile('src/site.config.ts', 'utf8');
  const m = raw.match(/url:\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('Không đọc được SITE.url trong src/site.config.ts');
  return m[1].replace(/\/$/, '');
}

const reallySend = process.argv.includes('--that');
const confirmMode = process.argv.includes('--xac-recipient');

function readEnv(ten) {
  const found = process.argv.find((a) => a.startsWith(`--${ten}=`));
  return found ? found.slice(ten.length + 3) : '';
}

function exitWithError(...dong) {
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
async function readPost(slug) {
  for (const ext of ['.mdx', '.md']) {
    try {
      const raw = await readFile(join(BLOG_DIR, slug + ext), 'utf8');
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) return null;

      const field = (khoa) => {
        const m = fm[1].match(new RegExp(`^${khoa}:\\s*(.*)$`, 'm'));
        if (!m) return '';
        return m[1].trim().replace(/^["']|["']$/g, '');
      };

      const nhap = /^draft:\s*true\s*$/m.test(fm[1]);
      return { slug, title: field('title'), description: field('description'), nhap };
    } catch {
      // thử đuôi kế tiếp
    }
  }
  return null;
}

/** Email thư xác nhận. Text + HTML, vì nhiều hộp thư vẫn chặn HTML. */
function confirmEmail(recipients, siteUrl) {
  const link = `${siteUrl}/newsletter/xac-recipient?token=${recipients.confirm_token}`;

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
function newPostEmail(recipients, post, siteUrl) {
  const postUrl = `${siteUrl}/blog/${post.slug}`;
  const linkHuy = `${siteUrl}/newsletter/huy?token=${recipients.unsubscribe_token}`;

  return {
    subject: post.title,
    // `List-Unsubscribe` để Gmail/Outlook hiện nút Huỷ đăng ký ngay cạnh tên người
    // gửi. Thiếu nó thì người muốn thoát sẽ bấm "Báo cáo spam" — và đó là thứ
    // phá uy tín tên miền gửi nhanh nhất.
    headers: {
      'List-Unsubscribe': `<${linkHuy}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: [
      post.title,
      '',
      post.description,
      '',
      `Đọc bài: ${postUrl}`,
      '',
      '---',
      `Huỷ đăng ký: ${linkHuy}`,
    ].join('\n'),
    html: [
      `<h1 style="font-size:20px"><a href="${esc(postUrl)}">${esc(post.title)}</a></h1>`,
      `<p>${esc(post.description)}</p>`,
      `<p><a href="${esc(postUrl)}">Đọc bài</a></p>`,
      '<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">',
      `<p style="color:#666;font-size:13px"><a href="${esc(linkHuy)}">Huỷ đăng ký</a></p>`,
    ].join('\n'),
  };
}

async function sendViaResend(den, email) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: NEWSLETTER_FROM,
      to: [den],
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.headers ? { headers: email.headers } : {}),
    }),
  });

  if (!res.ok) {
    const chiTiet = await res.text();
    throw new Error(`Resend trả ${res.status}: ${chiTiet.slice(0, 200)}`);
  }
}

async function main() {
  if (!isConfigured) {
    return exitWithError(
      '✗ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.',
      '  Không đọc được danh sách người đăng ký.',
    );
  }

  const slug = readEnv('post');

  if (!confirmMode && !slug) {
    return exitWithError(
      'Cách dùng:',
      '  pnpm newsletter:xac-recipient            gửi thư xác nhận cho người mới đăng ký',
      '  pnpm newsletter:send --post=<slug>    gửi thông báo bài mới',
      '',
      'Mặc định là CHẠY THỬ. Thêm --that để gửi thật.',
    );
  }

  // Kiểm khoá Resend TRƯỚC khi làm gì khác.
  //
  // Bản trước kiểm sau khi đã in "GỬI THẬT — N người nhận…", nên người dùng đọc
  // được dòng đó rồi mới thấy lỗi thiếu khoá — một giây tưởng thư đã bay đi.
  if (reallySend && (!RESEND_API_KEY || !NEWSLETTER_FROM)) {
    return exitWithError(
      '✗ Thiếu RESEND_API_KEY hoặc NEWSLETTER_FROM trong .env.',
      '  Chưa gửi gì cả.',
      '',
      '  1. Tạo tài khoản ở https://resend.com (bậc free: 3.000 thư/tháng)',
      '  2. Xác minh tên miền gửi, hoặc dùng onboarding@resend.dev để thử',
      '  3. API Keys → tạo khoá, dán vào .env:',
      '',
      '     RESEND_API_KEY=re_...',
      '     NEWSLETTER_FROM=Tên Của Bạn <post-moi@ten-mien-cua-ban.com>',
    );
  }

  const siteUrl = await readSiteUrl();
  const supabase = createSupabaseClient();

  // Chọn người nhận theo loại thư.
  //
  // Thư xác nhận  -> người CHƯA xác nhận và chưa huỷ.
  // Thư bài mới   -> người ĐÃ xác nhận và chưa huỷ. Gửi cho người chưa xác nhận
  //                  là gửi thư rác: họ chưa chứng minh hộp thư đó là của họ.
  let q = supabase
    .from('newsletter_subscribers')
    .select('email, confirmed, confirm_token, unsubscribe_token')
    .is('unsubscribed_at', null);

  q = confirmMode ? q.eq('confirmed', false) : q.eq('confirmed', true);

  const { data: recipients, error } = await q;
  if (error) return exitWithError(`✗ Không đọc được danh sách: ${error.message}`);

  let post = null;
  if (!confirmMode) {
    post = await readPost(slug);
    if (!post) {
      const co = (await readdir(BLOG_DIR).catch(() => []))
        .filter((f) => /\.mdx?$/.test(f))
        .map((f) => f.replace(/\.mdx?$/, ''));
      return exitWithError(
        `✗ Không thấy bài "${slug}".`,
        '',
        'Các slug đang có:',
        ...co.map((c) => `  ${c}`),
      );
    }
    if (post.nhap) {
      return exitWithError(
        `✗ Bài "${slug}" đang là draft — nó chưa có trên site.`,
        '  Gửi thư dẫn tới một trang 404 thì tệ hơn là không gửi.',
      );
    }
  }

  const recipient = confirmMode ? 'thư xác nhận' : `thông báo bài "${post.title}"`;

  if (recipients.length === 0) {
    console.log(`Không có ai cần nhận ${recipient}. Không gửi gì.`);
    return;
  }

  console.log(
    `${reallySend ? 'GỬI THẬT' : 'CHẠY THỬ'} — ${recipients.length} người nhận ${recipient}.\n`,
  );

  // Ở chế độ thử: in đúng nội dung sẽ gửi cho người đầu tiên, rồi liệt kê phần còn
  // lại. Đọc được nội dung thật trước khi gửi là thứ duy nhất chặn được lỗi kiểu
  // "link xác nhận trỏ về localhost".
  if (!reallySend) {
    const template = confirmMode
      ? confirmEmail(recipients[0], siteUrl)
      : newPostEmail(recipients[0], post, siteUrl);
    console.log(`  From:    ${NEWSLETTER_FROM || '(chưa đặt NEWSLETTER_FROM)'}`);
    console.log(`  To:      ${recipients[0].email}`);
    console.log(`  Subject: ${template.subject}`);
    if (template.headers) {
      for (const [k, v] of Object.entries(template.headers)) console.log(`  ${k}: ${v}`);
    }
    console.log('\n  --- bản text ---');
    console.log(
      template.text
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n'),
    );

    if (recipients.length > 1) {
      console.log(`\n  Còn ${recipients.length - 1} người nữa:`);
      for (const n of recipients.slice(1)) console.log(`    ${n.email}`);
    }

    console.log('\nThêm --that để gửi thật.');
    return;
  }

  let sent = 0;
  const failures = [];

  for (const n of recipients) {
    const email = confirmMode ? confirmEmail(n, siteUrl) : newPostEmail(n, post, siteUrl);
    try {
      await sendViaResend(n.email, email);
      sent += 1;
      console.log(`  ✓ ${n.email}`);
    } catch (e) {
      failures.push(`${n.email}: ${e instanceof Error ? e.message : String(e)}`);
      console.error(`  ✗ ${n.email}`);
    }

    // Bậc free của Resend giới hạn 2 thư/giây. Vượt là bị 429 và thư đó mất —
    // nghỉ 600ms giữa hai lần gửi thì không bao giờ chạm ngưỡng.
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\nĐã gửi ${sent}/${recipients.length}.`);

  if (failures.length > 0) {
    console.error('\nThất bại:');
    for (const l of failures) console.error(`  ${l}`);
    process.exitCode = 1;
  }
}

await main();
