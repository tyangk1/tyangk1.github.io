/**
 * supabase/migrations/*.sql  →  supabase/migrate-mot-lan.sql
 *
 * Gộp mọi migration thành MỘT file dán được vào SQL Editor của Supabase.
 *
 * Vì sao cần: tạo bảng là lệnh DDL, và DDL không đi qua REST API được. Nó cần mật
 * khẩu database (cho `supabase db push`) hoặc personal access token `sbp_...` (cho
 * Management API) — cả hai đều là thứ chỉ chủ project có. File gộp cho phép chạy
 * migration mà không phải cấp thêm khoá cho ai.
 *
 * Script KHÔNG chỉ nối file. Nó viết lại bốn loại lệnh cho chạy lại được nhiều
 * lần, vì `supabase db push` có bảng theo dõi migration còn SQL Editor thì không:
 * dán lần hai là hàng loạt lỗi "already exists".
 *
 * Chạy: pnpm db:gop
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const THU_MUC = 'supabase/migrations';
const FILE_RA = 'supabase/migrate-mot-lan.sql';

/**
 * Bốn phép biến đổi để SQL chạy lại được.
 *
 * `create table` và `create index` có sẵn dạng `if not exists`. `create trigger`
 * và `create policy` thì KHÔNG có (Postgres 15 chưa hỗ trợ `or replace` cho
 * chúng), nên phải chèn `drop ... if exists` ngay trước.
 */
function chayLaiDuoc(sql) {
  let out = sql;
  const daSua = { table: 0, index: 0, trigger: 0, policy: 0 };

  out = out.replace(/\bcreate table (?!if not exists)/g, () => {
    daSua.table += 1;
    return 'create table if not exists ';
  });

  out = out.replace(/\bcreate index (?!if not exists)/g, () => {
    daSua.index += 1;
    return 'create index if not exists ';
  });

  // create trigger TÊN\n  before|after ... on public.BẢNG
  out = out.replace(
    /create trigger (\w+)\s*\n(\s*)(before|after)([\s\S]*?)on (public\.\w+)/g,
    (khop, ten, thut, khi, giua, bang) => {
      daSua.trigger += 1;
      return `drop trigger if exists ${ten} on ${bang};\ncreate trigger ${ten}\n${thut}${khi}${giua}on ${bang}`;
    },
  );

  // create policy "TÊN"\n  on public.BẢNG ...
  out = out.replace(
    /create policy ("(?:[^"]+)")\s*\n(\s*)on (public\.\w+)/g,
    (khop, ten, thut, bang) => {
      daSua.policy += 1;
      return `drop policy if exists ${ten} on ${bang};\ncreate policy ${ten}\n${thut}on ${bang}`;
    },
  );

  return { out, daSua };
}

const files = (await readdir(THU_MUC)).filter((f) => f.endsWith('.sql')).sort();

if (files.length === 0) {
  console.error(`✗ Không có file .sql nào trong ${THU_MUC}/`);
  process.exitCode = 1;
} else {
  const phan = [];
  const tong = { table: 0, index: 0, trigger: 0, policy: 0 };

  for (const f of files) {
    const raw = await readFile(join(THU_MUC, f), 'utf8');
    const { out, daSua } = chayLaiDuoc(raw);
    for (const k of Object.keys(tong)) tong[k] += daSua[k];

    phan.push(
      [
        '',
        '-- ===========================================================================',
        `-- Nguồn: ${THU_MUC}/${f}`,
        '-- ===========================================================================',
        '',
        out.trimEnd(),
        '',
      ].join('\n'),
    );
  }

  const header = [
    '-- ===========================================================================',
    '--  GỘP CẢ BA MIGRATION THÀNH MỘT FILE — DÁN VÀO SQL EDITOR RỒI BẤM RUN',
    '-- ===========================================================================',
    '--',
    '--  Cách chạy:',
    '--    1. Mở SQL Editor của project trên supabase.com/dashboard',
    '--    2. Dán TOÀN BỘ file này vào',
    '--    3. Bấm Run (hoặc Ctrl+Enter)',
    '--',
    '--  Chạy lại nhiều lần được, không mất dữ liệu. `create table` và',
    '--  `create index` đã thành `if not exists`; `create trigger` và',
    '--  `create policy` được chèn `drop ... if exists` ngay trước, vì Postgres',
    '--  không có `or replace` cho hai loại đó.',
    '--',
    '--  SINH TỰ ĐỘNG bởi scripts/gop-migration.mjs — đừng sửa file này.',
    `--  Sửa migration gốc trong ${THU_MUC}/ rồi chạy lại: pnpm db:gop`,
    '-- ===========================================================================',
  ].join('\n');

  await writeFile(FILE_RA, `${header}\n${phan.join('\n')}`, 'utf8');

  console.log(`✓ ${FILE_RA} — gộp từ ${files.length} migration.`);
  console.log(
    `  Đã sửa cho chạy lại được: ${tong.table} table, ${tong.index} index, ` +
      `${tong.trigger} trigger, ${tong.policy} policy.`,
  );
}
