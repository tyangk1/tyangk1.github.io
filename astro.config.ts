import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { unified, rehypeHeadingIds } from '@astrojs/markdown-remark';

import { SITE } from './src/site.config';
import { rehypeContent } from './src/lib/rehype-content';

/**
 * Đọc một biến môi trường ở giai đoạn CONFIG.
 *
 * File này được Node đánh giá TRƯỚC khi Vite nạp `.env`, nên `process.env` chưa
 * có giá trị nào từ `.env` — đã trả giá để biết: build ném `RemoteImageNotAllowed`
 * dù `.env` có đúng giá trị.
 *
 * Không dùng `loadEnv` của Vite vì `vite` không phải dependency trực tiếp; pnpm
 * dựng node_modules chặt nên `import { loadEnv } from 'vite'` ném "Cannot find
 * module". Thêm `vite` vào package.json chỉ để đọc một biến là không đáng, và còn
 * tạo nguy cơ lệch phiên bản với bản Astro đang dùng.
 *
 * Ưu tiên `process.env` để CI vẫn đúng: ở đó biến đến từ Actions variables, không
 * có file `.env` nào.
 */
function readEnvVar(name: string): string {
  const fromProcessEnv = process.env[name];
  if (fromProcessEnv) return fromProcessEnv;

  for (const file of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m && m[1] === name) return (m[2] ?? '').trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      // Không có file thì thử file kế tiếp.
    }
  }

  return '';
}

/**
 * Host của Supabase Storage, suy ra từ `PUBLIC_SUPABASE_URL` chứ không viết cứng.
 *
 * Viết cứng thì đổi project Supabase là ảnh bìa lặng lẽ hết được tối ưu — Astro
 * chỉ bỏ qua ảnh ngoài danh sách chứ không báo lỗi. Suy ra từ biến môi trường thì
 * hai thứ không thể lệch nhau.
 */
const supabaseHost = (() => {
  const raw = readEnvVar('PUBLIC_SUPABASE_URL');
  if (!raw) return [];
  try {
    return [new URL(raw).hostname];
  } catch {
    return [];
  }
})();

export default defineConfig({
  site: SITE.url,

  /*
    KHÔNG đặt `output: 'server'`.

    Mặc định là `static`, và có adapter thì từng trang tự chọn ra khỏi đó bằng
    `export const prerender = false`. Nhờ vậy đúng MỘT route chạy lúc có request —
    trang bài — còn trang chủ, trang tag, RSS, sitemap, ảnh OG vẫn là file tĩnh sinh
    lúc build. Đặt `output: 'server'` là đảo mặc định: mọi trang thành động, và mỗi
    người đọc trả tiền cho một lần chạy hàm để nhận về thứ vốn không đổi.

    Adapter Node ở đây là để CHỨNG MINH tại máy: nó cho chạy `node dist/server/entry.mjs`
    và thấy sửa database là trang đổi, không cần build lại. Đổi sang Vercel là đổi đúng
    dòng `adapter` này — phần còn lại của repo không biết nó đang chạy trên gì.
  */
  adapter: node({ mode: 'standalone' }),

  /*
    KHÔNG dùng `@astrojs/sitemap` nữa. Sitemap do `src/pages/sitemap.xml.ts` sinh.

    Integration đó chỉ liệt kê route SINH RA FILE lúc build. Trang bài và các trang danh
    sách giờ chạy lúc có request nên không sinh file — đã đo: sitemap tụt còn 22 URL và 0
    URL bài, tức Google mất đường phát hiện mọi bài viết. Nó vỡ im lặng: file vẫn tồn
    tại, vẫn hợp lệ XML, chỉ là rỗng phần quan trọng nhất.

    Giữ cả hai thì tệ hơn cả hai: `robots.txt` chỉ trỏ được vào một sitemap, và hai
    sitemap không khớp nhau là tín hiệu mâu thuẫn gửi cho máy tìm kiếm.
  */
  integrations: [mdx()],

  markdown: {
    // Astro 7 nhận plugin remark/rehype qua `processor: unified({...})`.
    // Neo cạnh heading, nút copy cho code block, khung cuộn cho bảng —
    // tất cả xử lý lúc build nên không tốn JS phía trình duyệt.
    processor: unified({
      // `rehypeHeadingIds` phải chạy TRƯỚC: mặc định Astro gắn id cho heading ở
      // cuối pipeline, nên nếu không gọi sớm thì lúc `rehypeContent` chạy các
      // heading còn chưa có id và không gắn neo vào đâu được.
      // Gọi hai lần vô hại — lần sau bỏ qua heading đã có id.
      rehypePlugins: [rehypeHeadingIds, rehypeContent],
    }),

    // Shiki là engine highlight của VS Code. Dùng 2 theme, đổi bằng CSS variable
    // để code block khớp light/dark mà không cần JS.
    shikiConfig: {
      // Dùng bản high-contrast chứ không phải `github-light`/`github-dark` thường.
      // Bản thường có token màu cam #E36209 chỉ đạt 3,48:1 trên nền trắng —
      // dưới ngưỡng WCAG AA 4,5:1 và bị Lighthouse chấm rớt accessibility.
      themes: {
        light: 'github-light-high-contrast',
        dark: 'github-dark-high-contrast',
      },
      wrap: false,
    },
  },

  image: {
    /*
      Chỉ cho phép đúng host Supabase Storage của project này. Danh sách trắng,
      không phải `remotePatterns` mở — ảnh từ domain lạ thì không tối ưu.

      Ảnh được TẢI VỀ và tối ưu lúc build, rồi phục vụ từ GitHub Pages. Nghĩa là:
      site vẫn tĩnh 100%, có srcset + AVIF/WebP, và không tốn băng thông Supabase
      mỗi lần có người đọc. Supabase Storage chỉ là chỗ chứa ảnh gốc.
    */
    domains: supabaseHost,
  },

  build: {
    // Nhúng thẳng CSS vào HTML thay vì để nó là một file riêng.
    //
    // Đánh đổi: mỗi trang gánh thêm ~9KB (đã nén) và CSS không được cache dùng
    // chung giữa các trang. Đổi lại, trình duyệt không phải đi thêm một vòng
    // request chặn render trước khi vẽ được chữ đầu tiên. Với site nhỏ và CSS
    // dưới 10KB nén, đổi như vậy là có lợi — xem README phần đo Lighthouse.
    inlineStylesheets: 'always',
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
