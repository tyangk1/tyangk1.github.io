/**
 * ===========================================================================
 *  TOÀN BỘ THÔNG TIN CÁ NHÂN CỦA BLOG NẰM TRONG FILE NÀY.
 *  Sửa ở đây là đổi cả site — không cần đụng vào bất kỳ file nào khác.
 * ===========================================================================
 */

/**
 * URL production, đọc từ biến môi trường.
 *
 * Vì sao là biến chứ không phải chữ viết cứng: giá trị này đi vào canonical, sitemap, RSS
 * và `og:image` — tức là vào những thứ Google index và mạng xã hội cache. Deploy lên một
 * host mới mà quên sửa nó thì mọi trang tự khai canonical trỏ về tên miền CŨ, và Google
 * sẽ không index site mới. Đó là loại lỗi không có triệu chứng nào nhìn thấy được.
 *
 * Vercel tự đặt `VERCEL_PROJECT_PRODUCTION_URL` (dạng `abc.vercel.app`, không có scheme),
 * nên bản deploy đầu tiên tự đúng mà chưa cần làm gì. Có tên miền riêng thì đặt
 * `PUBLIC_SITE_URL=https://ten-mien-cua-anh` và nó thắng.
 *
 * Thứ tự ưu tiên có chủ đích: `PUBLIC_SITE_URL` trước, vì tên miền riêng luôn là câu trả
 * lời đúng khi cả hai cùng có — hai URL cùng phục vụ một nội dung là nội dung trùng lặp,
 * và canonical phải chỉ về đúng một cái.
 */
function resolveSiteUrl(): string {
  const explicit = readEnv('PUBLIC_SITE_URL');
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercelHost = readEnv('VERCEL_PROJECT_PRODUCTION_URL');
  if (vercelHost) return `https://${vercelHost.replace(/\/+$/, '')}`;

  // Cuối cùng mới tới GitHub Pages: nó là chỗ site đang chạy lúc viết dòng này, nhưng nó
  // không chạy được máy chủ nên không phải đích lâu dài.
  return 'https://tyangk1.github.io';
}

/**
 * Đọc biến ở cả hai phía: `import.meta.env` (được thay lúc build) và `process.env`
 * (đọc được lúc chạy trên máy chủ). File này được nạp từ cả hai chỗ.
 */
function readEnv(name: string): string {
  /*
    `import.meta.env?.` — dấu `?` là BẮT BUỘC, không phải cẩn thận thừa.

    `astro.config.ts` nạp file này bằng Node thuần (nó cần `SITE.url` cho khoá `site`), và
    Node KHÔNG định nghĩa `import.meta.env`. Viết `import.meta.env[name]` thì cả file config
    ném TypeError và build chết ngay từ dòng đầu, trước khi có thông báo nào hữu ích.
  */
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const value = env?.[name] ?? process.env[name] ?? '';
  return value.trim();
}

export const SITE = {
  /** URL production. Dùng cho canonical, sitemap, RSS và ảnh OG. Xem `resolveSiteUrl`. */
  url: resolveSiteUrl(),

  /** Tên hiển thị trên header và thẻ title. */
  title: 'Thân Trọng Trường Giang',

  /** Câu định vị ngắn, hiện ở hero trang chủ và thẻ meta mặc định. */
  tagline: 'Kỹ sư phần mềm. Viết về code, hệ thống và cách làm việc hiệu quả.',

  /** Meta description mặc định (120–160 ký tự) cho các trang không có description riêng. */
  description:
    'Blog cá nhân về lập trình web, kiến trúc hệ thống và năng suất làm việc. Ghi lại những gì tôi học được sau mỗi dự án, viết bằng tiếng Việt.',

  /** Ngôn ngữ chính, dùng cho thẻ <html lang> và RSS. */
  lang: 'vi',

  /**
   * Múi giờ dùng khi hiển thị ngày tháng — và khi quyết định bài đặt lịch đã tới
   * hạn chưa.
   *
   * Điều thứ hai mới là điều quan trọng. Supabase chạy UTC, nên nếu so ngày bằng
   * `current_date` thì bài đặt ngày 10/8 chỉ lên lúc 7 giờ sáng ngày 10 giờ Việt
   * Nam. Mọi tầng lọc đều đổi sang múi giờ này trước khi so.
   *
   * Giá trị này bị lặp lại ở hai chỗ KHÔNG import được từ đây — `TIME_ZONE` trong
   * `scripts/lib/post.mjs` (module này chạy cả trong trình duyệt nên không
   * đọc được file TypeScript) và câu policy trong migration `scheduled_publishing`
   * (SQL không import gì cả). `pnpm check:content` so ba chỗ đó với dòng này và
   * fail nếu lệch — chép tay thì phải có người canh.
   */
  timeZone: 'Asia/Ho_Chi_Minh',

  /**
   * Số bài mỗi trang ở /blog.
   * 6 vì lưới là 3 cột — sáu thẻ lấp đúng hai hàng, không để hàng cuối lẻ loi.
   */
  postsPerPage: 6,

  /** Số bài mới nhất hiện ở trang chủ. */
  latestPostsOnHome: 5,
} as const;

export const AUTHOR = {
  name: 'Thân Trọng Trường Giang',
  /** 1–2 câu, hiện ở cuối mỗi bài viết. CÒN LÀ CHỮ MẪU — sửa lại cho đúng. */
  bio: 'Tôi là kỹ sư phần mềm ở TP.HCM, làm việc chủ yếu với TypeScript và hạ tầng web. Ở đây tôi viết lại những thứ mình phải tự mò ra.',
  /** Ảnh đại diện đặt trong `src/assets/`, hoặc để null nếu chưa có. */
  avatar: null as string | null,
  /**
   * Để rỗng thì email bị bỏ khỏi RSS và khỏi khối dữ liệu Person — site vẫn hợp
   * lệ. Cố tình không điền sẵn: site này public, đăng địa chỉ email lên đó là
   * mời spam bot, nên đây phải là quyết định của chủ blog chứ không phải mặc định.
   */
  email: '',
  /** Dùng cho thẻ Twitter Card, bỏ trống nếu không có. */
  twitterHandle: '',
} as const;

/**
 * Liên kết mạng xã hội. Xoá dòng nào không dùng — footer tự ẩn.
 *
 * Chỉ còn GitHub vì đó là link duy nhất xác minh được. Ba dòng mẫu trước đây
 * (x.com/tenban, linkedin.com/in/tenban, mailto:xinchao@tenban.com) đều trỏ vào
 * hư không — trên một site đã công khai thì đó là ba link gãy thật, không phải
 * chỗ trống chờ điền. Có tài khoản thật thì thêm lại theo đúng mẫu dưới.
 */
export const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/tyangk1', icon: 'github' },
] as const;

/** Menu điều hướng chính. */
export const NAV = [
  { label: 'Bài viết', href: '/blog' },
  { label: 'Dự án', href: '/projects' },
  { label: 'Giới thiệu', href: '/about' },
  { label: 'Now', href: '/now' },
] as const;

/**
 * Nội dung trang /now — "hiện tại tôi đang làm gì" (chuẩn nownownow.com).
 * Nhớ cập nhật `updatedAt` mỗi lần sửa, trang sẽ tự hiện ngày.
 */
export const NOW = {
  updatedAt: new Date('2026-08-01'),
  sections: [
    {
      heading: 'Đang làm',
      items: [
        'Xây dựng hạ tầng dữ liệu cho một sản phẩm SaaS nội địa.',
        'Viết lại blog này từ đầu bằng Astro để nó tải dưới 1 giây trên 3G.',
      ],
    },
    {
      heading: 'Đang học',
      items: [
        'Thiết kế hệ thống phân tán — đọc "Designing Data-Intensive Applications" lần hai.',
        'Typography cho tiếng Việt: dấu thanh, chiều cao dòng, và chọn font.',
      ],
    },
    {
      heading: 'Đang đọc',
      items: ['The Pragmatic Programmer (tái bản 20 năm)', 'Shape Up — Basecamp'],
    },
  ],
} as const;
