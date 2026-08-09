/**
 * Gửi email newsletter.
 *
 * Ba chế độ:
 *
 *   pnpm newsletter:confirm              Thư xác nhận cho người mới đăng ký. Phải gửi,
 *                                        nếu không họ mãi ở trạng thái chưa xác nhận và
 *                                        không bao giờ nhận bản tin.
 *
 *   pnpm newsletter:send --post=<slug>   Thông báo một bài cụ thể, cho người ĐÃ xác nhận.
 *
 *   pnpm newsletter:auto                 Tìm MỌI bài đã lên site mà chưa gửi bản tin,
 *                                        gửi lần lượt, rồi đánh dấu. Đây là chế độ
 *                                        workflow dùng.
 *
 * MẶC ĐỊNH LÀ CHẠY THỬ ở cả ba. Phải thêm `--that` mới gửi thật.
 *
 * VÌ SAO MẶC ĐỊNH LÀ THỬ, VÀ VÌ SAO CHẠY TỰ ĐỘNG PHẢI BẬT RIÊNG
 *
 * Gửi thư là việc không thu hồi được — không có Ctrl+Z cho một nghìn hộp thư. Mọi thứ
 * khác trong dự án này đều sửa lại được: bài sai thì sửa rồi deploy lại, slug sai thì
 * đổi tên. Thư đã bay thì không.
 *
 * Nên `--that` là một hành động tường minh, và workflow chỉ gửi khi biến
 * `NEWSLETTER_AUTO_SEND` được đặt thành `true`. Tự động hoàn toàn NHƯNG mặc định tắt.
 *
 * XÁC THỰC
 *
 * Ở máy dùng service key trong `.env`. Trên CI dùng tài khoản bot riêng cho việc gửi —
 * bot đó là admin duy nhất có `can_read_subscribers = true` ngoài chủ blog, vì gửi thư
 * thì buộc phải biết địa chỉ. Bot soạn bài KHÔNG có quyền đó.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveAuth, makeClient } from './lib/db-auth.mjs';

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
const confirmMode = process.argv.includes('--xac-nhan');
const autoMode = process.argv.includes('--auto');

/*
  Giải quyết xác thực MỘT LẦN ở đầu file.

  Ở máy: service key. Trên CI: tài khoản bot RIÊNG cho việc gửi — bot đó là admin duy
  nhất ngoài chủ blog có `can_read_subscribers = true`, vì gửi thư thì buộc phải biết
  địa chỉ. Bot soạn bài dùng biến khác và KHÔNG có quyền đó.
*/
const auth = await resolveAuth({
  emailVar: 'NEWSLETTER_BOT_EMAIL',
  passwordVar: 'NEWSLETTER_BOT_PASSWORD',
});
const supabase = await makeClient(auth);

function readEnv(name) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : '';
}

function exitWithError(...lines) {
  for (const l of lines) console.error(l);
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

      const field = (key) => {
        const m = fm[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
        if (!m) return '';
        return m[1].trim().replace(/^["']|["']$/g, '');
      };

      const isDraft = /^draft:\s*true\s*$/m.test(fm[1]);
      return { slug, title: field('title'), description: field('description'), isDraft };
    } catch {
      // thử đuôi kế tiếp
    }
  }
  return null;
}

/**
 * Email thư xác nhận. Text + HTML, vì nhiều hộp thư vẫn chặn HTML.
 *
 * `/newsletter/xac-nhan` là URL THẬT và không được đổi: nó đã nằm trong những thư đã
 * gửi cho người đăng ký, và thư đã gửi thì không sửa lại được. Lượt đổi tên định danh
 * sang tiếng Anh từng biến nó thành `/newsletter/xac-recipient` — một route không tồn
 * tại — nên mọi link xác nhận sẽ 404. Đó là loại lỗi không ai báo: người nhận chỉ im
 * lặng bỏ qua.
 */
function confirmEmail(recipient, siteUrl) {
  const link = `${siteUrl}/newsletter/xac-nhan?token=${recipient.confirm_token}`;

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

/** Email thông báo bài mới. `/newsletter/huy` cũng là URL thật, xem chú thích trên. */
function newPostEmail(recipient, post, siteUrl) {
  const postUrl = `${siteUrl}/blog/${post.slug}`;
  const linkHuy = `${siteUrl}/newsletter/huy?token=${recipient.unsubscribe_token}`;

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

async function sendViaResend(to, email) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: NEWSLETTER_FROM,
      to: [to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.headers ? { headers: email.headers } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend trả ${res.status}: ${detail.slice(0, 200)}`);
  }
}

async function main(slugTuAuto) {
  const slug = slugTuAuto ?? readEnv('post');

  if (!confirmMode && !slug) {
    return exitWithError(
      'Cách dùng:',
      '  pnpm newsletter:confirm            gửi thư xác nhận cho người mới đăng ký',
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
      const slugsCoSan = (await readdir(BLOG_DIR).catch(() => []))
        .filter((f) => /\.mdx?$/.test(f))
        .map((f) => f.replace(/\.mdx?$/, ''));
      return exitWithError(
        `✗ Không thấy bài "${slug}".`,
        '',
        'Các slug đang có:',
        ...slugsCoSan.map((c) => `  ${c}`),
      );
    }
    if (post.isDraft) {
      return exitWithError(
        `✗ Bài "${slug}" đang là draft — nó chưa có trên site.`,
        '  Gửi thư dẫn tới một trang 404 thì tệ hơn là không gửi.',
      );
    }
  }

  const kindOfEmail = confirmMode ? 'thư xác nhận' : `thông báo bài "${post.title}"`;

  if (recipients.length === 0) {
    console.log(`Không có ai cần nhận ${kindOfEmail}. Không gửi gì.`);
    return;
  }

  console.log(
    `${reallySend ? 'GỬI THẬT' : 'CHẠY THỬ'} — ${recipients.length} người nhận ${kindOfEmail}.\n`,
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

  /*
    Đánh dấu ĐÃ GỬI, và chỉ khi có ít nhất một thư đi được.

    Đánh dấu là thứ chặn gửi trùng, nên nó phải xảy ra sau khi gửi — nhưng cũng KHÔNG
    được bỏ qua chỉ vì vài người nhận lỗi. Nếu gửi được 8/10 mà không đánh dấu thì lần
    chạy sau gửi lại cho cả 10, tức 8 người nhận thư hai lần. Thà thiếu hai người còn
    hơn trùng tám người: người thiếu không biết mình thiếu, người nhận trùng thì biết.
  */
  if (!confirmMode && post && sent > 0) {
    const { error: markError } = await supabase
      .from('posts')
      .update({ newsletter_sent_at: new Date().toISOString() })
      .eq('slug', post.slug);

    if (markError) {
      console.error(
        `\n⚠ Đã gửi nhưng KHÔNG đánh dấu được: ${markError.message}`,
        '\n  Lần chạy tự động sau sẽ gửi lại bài này. Đánh dấu tay:',
        `\n  update posts set newsletter_sent_at = now() where slug = '${post.slug}';`,
      );
      process.exitCode = 1;
    } else {
      console.log(`Đã đánh dấu "${post.slug}" là đã gửi bản tin.`);
    }
  }
}

/**
 * Chế độ `--auto`: tìm mọi bài đã lên site mà CHƯA gửi bản tin, rồi gửi lần lượt.
 *
 * Đây là chế độ workflow dùng. Nó không nhận slug từ đâu cả — danh sách đến từ chính
 * database, nên chạy lại bao nhiêu lần cũng không gửi trùng: bài nào gửi rồi thì có
 * `newsletter_sent_at` và không còn được chọn.
 *
 * Vì sao KHÔNG suy ra từ git diff: chạy lại workflow cho cùng một commit, sửa chính tả
 * một bài cũ, hay revert rồi commit lại — cả ba đều làm diff nói sai. Xem chú thích ở
 * migration `newsletter_sent_marker`.
 */
async function auto() {
  const todayVn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );

  const { data, error } = await supabase
    .from('posts')
    .select('slug, title, published_at')
    .eq('draft', false)
    .lte('published_at', todayVn)
    .is('newsletter_sent_at', null)
    .order('published_at', { ascending: true });

  if (error) return exitWithError(`✗ Không đọc được danh sách bài: ${error.message}`);

  if (!data.length) {
    console.log('Không có bài nào đã lên mà chưa gửi bản tin. Không làm gì.');
    return;
  }

  console.log(`${data.length} bài chưa gửi bản tin:`);
  for (const p of data) console.log(`  ${p.published_at}  ${p.slug}`);
  console.log('');

  for (const p of data) {
    console.log(`\n─── ${p.slug} ─────────────────────────────`);
    // Đi qua đúng `main()` để không có đường gửi thứ hai: mọi lớp kiểm (bài còn nháp,
    // thiếu khoá Resend, chưa xác nhận) chỉ tồn tại ở một chỗ.
    await main(p.slug);
  }
}

if (autoMode) {
  await auto();
} else {
  await main();
}
