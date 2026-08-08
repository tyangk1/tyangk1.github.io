import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { unified, rehypeHeadingIds } from '@astrojs/markdown-remark';

import { SITE } from './src/site.config';
import { rehypeContent } from './src/lib/rehype-content';

export default defineConfig({
  site: SITE.url,

  integrations: [
    mdx(),
    sitemap({
      // Ảnh OG là endpoint sinh ảnh, không phải trang — không đưa vào sitemap.
      filter: (page) => !page.includes('/og/'),
    }),
  ],

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
    // Chặn tối ưu ảnh từ domain lạ; thêm domain vào đây nếu cần dùng ảnh ngoài.
    domains: [],
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
