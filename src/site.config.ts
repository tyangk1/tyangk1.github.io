/**
 * ===========================================================================
 *  TOÀN BỘ THÔNG TIN CÁ NHÂN CỦA BLOG NẰM TRONG FILE NÀY.
 *  Sửa ở đây là đổi cả site — không cần đụng vào bất kỳ file nào khác.
 * ===========================================================================
 */

export const SITE = {
  /** URL production. BẮT BUỘC đổi trước khi deploy — dùng cho canonical, sitemap, RSS, ảnh OG. */
  url: 'https://tenban.com',

  /** Tên hiển thị trên header và thẻ title. */
  title: 'Tên Của Bạn',

  /** Câu định vị ngắn, hiện ở hero trang chủ và thẻ meta mặc định. */
  tagline: 'Kỹ sư phần mềm. Viết về code, hệ thống và cách làm việc hiệu quả.',

  /** Meta description mặc định (120–160 ký tự) cho các trang không có description riêng. */
  description:
    'Blog cá nhân về lập trình web, kiến trúc hệ thống và năng suất làm việc. Ghi lại những gì tôi học được sau mỗi dự án, viết bằng tiếng Việt.',

  /** Ngôn ngữ chính, dùng cho thẻ <html lang> và RSS. */
  lang: 'vi',

  /** Múi giờ dùng khi hiển thị ngày tháng. */
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
  name: 'Tên Của Bạn',
  /** 1–2 câu, hiện ở cuối mỗi bài viết. */
  bio: 'Tôi là kỹ sư phần mềm ở TP.HCM, làm việc chủ yếu với TypeScript và hạ tầng web. Ở đây tôi viết lại những thứ mình phải tự mò ra.',
  /** Ảnh đại diện đặt trong `src/assets/`, hoặc để null nếu chưa có. */
  avatar: null as string | null,
  email: 'xinchao@tenban.com',
  /** Dùng cho thẻ Twitter Card, bỏ trống nếu không có. */
  twitterHandle: '',
} as const;

/** Liên kết mạng xã hội. Xoá dòng nào không dùng — footer tự ẩn. */
export const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/tenban', icon: 'github' },
  { label: 'X', href: 'https://x.com/tenban', icon: 'x' },
  { label: 'LinkedIn', href: 'https://linkedin.com/in/tenban', icon: 'linkedin' },
  { label: 'Email', href: 'mailto:xinchao@tenban.com', icon: 'mail' },
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
