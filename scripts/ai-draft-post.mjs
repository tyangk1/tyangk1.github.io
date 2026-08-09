/**
 * content_queue  →  AI soạn bài  →  bảng `posts`
 *
 * Chạy:
 *   pnpm ai:draft                  Soạn một bài tới hạn.
 *   pnpm ai:draft --all            Soạn tới khi hết việc tới hạn.
 *   pnpm ai:draft --mock=<file>    Không gọi API, đọc bài mẫu từ file JSON.
 *   pnpm ai:draft --dry            Soạn nhưng KHÔNG ghi vào database.
 *
 * KHÔNG VIẾT CỨNG NHÀ CUNG CẤP NÀO
 *
 * Đọc ba biến: AI_BASE_URL, AI_MODEL, AI_API_KEY. Mọi nơi dưới đây đều nói chuẩn
 * OpenAI `chat/completions`, nên đổi nhà cung cấp là đổi biến, không sửa code:
 *
 *   Google AI Studio  https://generativelanguage.googleapis.com/v1beta/openai
 *   Groq              https://api.groq.com/openai/v1
 *   Mistral           https://api.mistral.ai/v1
 *   OpenRouter        https://openrouter.ai/api/v1
 *   Ollama ở máy      http://localhost:11434/v1
 *   OpenAI            https://api.openai.com/v1
 *
 * Lý do quan trọng hơn sự tiện: chất lượng văn tiếng Việt giữa các model chênh rất
 * nhiều, và blog này đứng tên thật. Đổi được nhà cung cấp bằng một biến nghĩa là thử
 * và đổi ý không tốn gì.
 *
 * VÌ SAO SOẠN XONG MẶC ĐỊNH LÀ NHÁP
 *
 * `mode` của brief quyết định: 'draft' (mặc định) ghi bài dưới dạng nháp để người
 * duyệt, 'auto' ghi thẳng theo `publish_on`. Bài nháp và bài chưa tới ngày đều bị RLS
 * ẩn khỏi khoá công khai, nên không có gì rò ra site trước khi được duyệt.
 */
import { readFile } from 'node:fs/promises';
import { loadEnv, env } from './lib/env.mjs';
import { LIMITS, validatePost, normalizePost, slugify, today } from './lib/post.mjs';
import { systemPrompt, userPrompt, fixPrompt } from './lib/draft-prompt.mjs';

// Phải nạp TRƯỚC khi đọc biến bên dưới — `node` thuần không tự đọc `.env`.
await loadEnv();

// --- Cấu hình ---------------------------------------------------------------

const AI_BASE_URL = env('AI_BASE_URL').replace(/\/+$/, '');
const AI_MODEL = env('AI_MODEL');
const AI_API_KEY = env('AI_API_KEY');

const SUPABASE_URL = env('SUPABASE_URL') || env('PUBLIC_SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const PUBLIC_KEY = env('PUBLIC_SUPABASE_ANON_KEY');
const BOT_EMAIL = env('SUPABASE_BOT_EMAIL');
const BOT_PASSWORD = env('SUPABASE_BOT_PASSWORD');

/** Soạn trước ngày đăng bao nhiêu ngày, để còn thời gian duyệt. */
const LEAD_DAYS = Number(env('AI_LEAD_DAYS', '3'));
/** Bao nhiêu lần thất bại thì bỏ một chủ đề. */
const MAX_ATTEMPTS = Number(env('AI_MAX_ATTEMPTS', '3'));
/** Số lần đưa lỗi validate lại cho model tự sửa, trong CÙNG một lượt soạn. */
const MAX_FIXES = Number(env('AI_MAX_FIXES', '2'));

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) =>
  argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');

const MOCK_FILE = value('mock');
const DRY_RUN = flag('dry');
const DO_ALL = flag('all');

function exitWithError(message) {
  console.error(message);
  process.exitCode = 1;
}

// --- Truy cập database ------------------------------------------------------

/**
 * Hai đường xác thực, chọn theo thứ có sẵn:
 *
 *   Ở MÁY  — service key trong `.env`. Tiện, và khoá không rời khỏi máy.
 *   TRÊN CI — tài khoản bot có tên trong bảng `admins`, đăng nhập lấy JWT.
 *
 * Vì sao CI KHÔNG dùng service key: service key đi xuyên toàn bộ RLS, tức là đọc
 * được cả bảng email người đăng ký. Tài khoản bot thì vẫn bị RLS ràng, và thu hồi
 * bằng cách xoá một dòng trong `admins`.
 */
async function getAuth() {
  if (SERVICE_KEY) {
    return { apikey: SERVICE_KEY, bearer: SERVICE_KEY, how: 'service key (ở máy)' };
  }

  if (!PUBLIC_KEY || !BOT_EMAIL || !BOT_PASSWORD) {
    throw new Error(
      'Thiếu cách xác thực. Cần SUPABASE_SERVICE_ROLE_KEY (ở máy), hoặc\n' +
        'PUBLIC_SUPABASE_ANON_KEY + SUPABASE_BOT_EMAIL + SUPABASE_BOT_PASSWORD (trên CI).',
    );
  }

  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) {
    throw new Error(`Đăng nhập tài khoản bot thất bại: ${JSON.stringify(j).slice(0, 200)}`);
  }
  return { apikey: PUBLIC_KEY, bearer: j.access_token, how: `tài khoản bot ${BOT_EMAIL}` };
}

function makeDb(auth) {
  const base = {
    apikey: auth.apikey,
    Authorization: `Bearer ${auth.bearer}`,
    'Content-Type': 'application/json',
  };

  return async function db(path, { method = 'GET', body, prefer } = {}) {
    const headers = prefer ? { ...base, Prefer: prefer } : base;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!r.ok) {
      throw new Error(`${method} ${path} → ${r.status}: ${String(text).slice(0, 300)}`);
    }
    return json;
  };
}

// --- Gọi model -------------------------------------------------------------

/**
 * Một lượt gọi `chat/completions`.
 *
 * Không dùng `response_format: json_schema`: chuẩn đó chỉ một phần nhà cung cấp hỗ
 * trợ, và nơi không hỗ trợ thì trả 400 chứ không bỏ qua. Thay vào đó yêu cầu JSON
 * trong prompt rồi tự bóc — kèm bóc cả trường hợp model bọc trong khối ```json.
 */
async function callModel(messages) {
  const r = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.7, max_tokens: 8000 }),
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`AI trả ${r.status}: ${text.slice(0, 300)}`);

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`AI trả về thứ không phải JSON: ${text.slice(0, 200)}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`AI trả về rỗng: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return content;
}

/** Bóc JSON ra khỏi câu trả lời, chịu được cả khi model bọc trong ```json. */
function parseDraft(raw) {
  let s = raw.trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();

  // Vài model thêm một câu dẫn trước JSON. Cắt từ dấu { đầu tới } cuối.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first > 0 || last < s.length - 1) {
    if (first === -1 || last === -1) throw new Error('Không tìm thấy object JSON nào.');
    s = s.slice(first, last + 1);
  }

  const obj = JSON.parse(s);
  for (const key of ['title', 'description', 'content']) {
    if (typeof obj[key] !== 'string' || !obj[key].trim()) {
      throw new Error(`Thiếu hoặc rỗng khoá "${key}".`);
    }
  }
  return obj;
}

/**
 * Soạn một bài, có vòng sửa lỗi.
 *
 * Đưa lỗi validate lại cho model thay vì bỏ cả bài: phần lớn lỗi là mô tả lệch vài
 * ký tự — sửa được, và soạn lại từ đầu thì vừa tốn vừa cho ra bài khác.
 */
async function draftPost(item, log) {
  const messages = [
    { role: 'system', content: systemPrompt(LIMITS) },
    { role: 'user', content: userPrompt(item) },
  ];

  for (let attempt = 0; attempt <= MAX_FIXES; attempt += 1) {
    const raw = MOCK_FILE ? await readFile(MOCK_FILE, 'utf8') : await callModel(messages);

    let draft;
    try {
      draft = parseDraft(raw);
    } catch (e) {
      if (attempt === MAX_FIXES) throw new Error(`Không bóc được JSON: ${e.message}`);
      log(`  lượt ${attempt + 1}: JSON không bóc được (${e.message}) — hỏi lại`);
      messages.push({ role: 'assistant', content: raw.slice(0, 4000) });
      messages.push({ role: 'user', content: 'Trả về DUY NHẤT object JSON, không kèm gì khác.' });
      continue;
    }

    const post = normalizePost({
      slug: slugify(draft.title),
      title: draft.title,
      description: draft.description,
      content: draft.content,
      published_at: item.publish_on,
      tags: draft.tags ?? item.tags ?? [],
      takeaways: draft.takeaways ?? [],
      draft: item.mode !== 'auto',
      featured: false,
    });

    const errors = validatePost(post);
    if (errors.length === 0) return post;

    if (attempt === MAX_FIXES) {
      throw new Error(
        `Vẫn sai sau ${MAX_FIXES + 1} lượt: ${errors.map((e) => e.message).join(' | ')}`,
      );
    }

    log(`  lượt ${attempt + 1}: ${errors.length} lỗi — đưa lại cho model sửa`);
    for (const e of errors) log(`     ${e.message}`);

    // Trong chế độ mock không có model nào để sửa, nên dừng luôn cho khỏi lặp vô ích.
    if (MOCK_FILE) {
      throw new Error(`(mock) ${errors.map((e) => e.message).join(' | ')}`);
    }

    messages.push({ role: 'assistant', content: JSON.stringify(draft) });
    messages.push({ role: 'user', content: fixPrompt(errors) });
  }

  throw new Error('Hết lượt sửa.');
}

// --- Chạy -------------------------------------------------------------------

async function processOne(db, log) {
  const claimed = await db('rpc/claim_content_queue_item', {
    method: 'POST',
    body: { lead_days: LEAD_DAYS, max_attempts: MAX_ATTEMPTS },
  });

  // RPC trả null khi không còn việc tới hạn.
  if (!claimed || !claimed.id) return null;

  /*
    `--dry` phải KHÔNG để lại dấu vết.

    Việc lấy việc là một UPDATE thật: nó đặt status = 'drafting' và tăng `attempts`.
    Không hoàn lại thì chạy thử lần thứ hai phải chờ hết `stale_minutes` (30 phút) mới
    nhận lại được chủ đề đó — tức là không thể vừa sửa prompt vừa thử.

    Nên ở chế độ dry, trả dòng về đúng trạng thái trước khi lấy, ở CUỐI hàm, bất kể
    soạn được hay không.
  */
  const releaseIfDry = async () => {
    if (!DRY_RUN) return;
    // 'queued' viết thẳng, KHÔNG dùng `claimed.status`: RPC trả về dòng SAU khi update
    // nên `claimed.status` đã là 'drafting' — "phục hồi" bằng nó là không phục hồi gì.
    // Đã trả giá để biết: lần chạy dry thứ hai không nhận lại được chủ đề.
    //
    // 'queued' đúng cho cả hai trường hợp đầu vào: dòng vốn đang chờ, hoặc dòng
    // 'drafting' bị treo — dòng treo thì đằng nào cũng phải về hàng đợi.
    await db(`content_queue?id=eq.${claimed.id}`, {
      method: 'PATCH',
      body: { status: 'queued', attempts: Math.max(0, claimed.attempts - 1) },
    });
    log('  (--dry) đã trả chủ đề về hàng đợi, không đổi gì');
  };

  log(`\n▸ ${claimed.topic}`);
  log(`  ngày đăng ${claimed.publish_on} · chế độ ${claimed.mode} · lần thử ${claimed.attempts}`);
  if (!claimed.source_material?.trim()) {
    log('  KHÔNG có tư liệu thật → viết giọng khách quan, không dùng "tôi"');
  }

  let post;
  try {
    post = await draftPost(claimed, log);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`  ✗ thất bại: ${message}`);
    if (DRY_RUN) {
      await releaseIfDry();
    } else {
      await db(`content_queue?id=eq.${claimed.id}`, {
        method: 'PATCH',
        body: {
          status: claimed.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
          last_error: message,
        },
      });
    }
    return { ok: false, topic: claimed.topic, error: message };
  }

  const words = post.content.trim().split(/\s+/).length;
  log(`  ✓ "${post.title}"`);
  log(
    `     slug ${post.slug} · mô tả ${post.description.length} ký tự · ${words} từ · ${post.tags.length} tag`,
  );
  log(`     ghi dạng ${post.draft ? 'NHÁP (chờ duyệt)' : `đăng theo lịch ${post.published_at}`}`);

  if (DRY_RUN) {
    log('  (--dry) không ghi bài vào database');
    await releaseIfDry();
    return { ok: true, topic: claimed.topic, slug: post.slug, dry: true };
  }

  try {
    await db('posts', { method: 'POST', body: post, prefer: 'return=representation' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Trùng slug là lỗi hay gặp nhất: hai chủ đề gần nhau cho ra cùng tiêu đề.
    const friendly = message.includes('posts_slug_key')
      ? `Slug "${post.slug}" đã có bài khác dùng — sửa chủ đề cho khác đi.`
      : message;
    log(`  ✗ database từ chối: ${friendly}`);
    await db(`content_queue?id=eq.${claimed.id}`, {
      method: 'PATCH',
      body: {
        status: claimed.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
        last_error: friendly,
      },
    });
    return { ok: false, topic: claimed.topic, error: friendly };
  }

  await db(`content_queue?id=eq.${claimed.id}`, {
    method: 'PATCH',
    body: {
      status: 'done',
      created_slug: post.slug,
      drafted_at: new Date().toISOString(),
      last_error: null,
    },
  });

  return { ok: true, topic: claimed.topic, slug: post.slug };
}

async function main() {
  if (!SUPABASE_URL) return exitWithError('✗ Thiếu SUPABASE_URL trong môi trường.');

  if (!MOCK_FILE && (!AI_BASE_URL || !AI_MODEL || !AI_API_KEY)) {
    return exitWithError(
      [
        '✗ Chưa cấu hình model AI. Cần ba biến:',
        '',
        '    AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai',
        '    AI_MODEL=gemini-2.0-flash',
        '    AI_API_KEY=<khoá của bạn>',
        '',
        '  Chỗ nào cũng được, miễn nói chuẩn OpenAI chat/completions:',
        '    Google AI Studio · Groq · Mistral · OpenRouter · Ollama ở máy · OpenAI',
        '',
        '  Muốn thử luồng mà chưa có khoá: pnpm ai:draft --mock=<file.json> --dry',
      ].join('\n'),
    );
  }

  const auth = await getAuth();
  const db = makeDb(auth);
  const log = (s) => console.log(s);

  log(`Soạn bài tự động · ${MOCK_FILE ? `mock ${MOCK_FILE}` : `${AI_MODEL} @ ${AI_BASE_URL}`}`);
  log(`Xác thực: ${auth.how} · hôm nay ${today()} · soạn trước ${LEAD_DAYS} ngày`);

  const done = [];
  for (;;) {
    const result = await processOne(db, log);
    if (!result) break;
    done.push(result);
    if (!DO_ALL) break;
  }

  if (done.length === 0) {
    log('\nKhông có chủ đề nào tới hạn. Không làm gì.');
    return;
  }

  const ok = done.filter((d) => d.ok).length;
  log(`\nXong: ${ok}/${done.length} bài.`);
  if (ok < done.length) process.exitCode = 1;
}

await main();
