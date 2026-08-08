/**
 * Biến môi trường, gom về một chỗ.
 * Thiếu biến nào thì tính năng tương ứng tự tắt — site vẫn build và chạy bình thường.
 * Xem `.env.example` để biết lấy giá trị ở đâu.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const ENV = {
  /**
   * Khoá CÔNG KHAI của Supabase — khác hoàn toàn `SUPABASE_SERVICE_ROLE_KEY`.
   * Khoá này được thiết kế để lộ ra trình duyệt; Row Level Security là thứ bảo
   * vệ dữ liệu, không phải sự bí mật của khoá. Với khoá này khách chỉ đọc được
   * bài đã đăng và gọi được đúng một hàm: cộng lượt xem.
   */
  publicSupabaseUrl: env['PUBLIC_SUPABASE_URL'] ?? '',
  publicSupabaseAnonKey: env['PUBLIC_SUPABASE_ANON_KEY'] ?? '',

  umamiSrc: env['PUBLIC_UMAMI_SRC'] ?? '',
  umamiWebsiteId: env['PUBLIC_UMAMI_WEBSITE_ID'] ?? '',
  giscusRepo: env['PUBLIC_GISCUS_REPO'] ?? '',
  giscusRepoId: env['PUBLIC_GISCUS_REPO_ID'] ?? '',
  giscusCategory: env['PUBLIC_GISCUS_CATEGORY'] ?? 'Announcements',
  giscusCategoryId: env['PUBLIC_GISCUS_CATEGORY_ID'] ?? '',
  newsletterAction: env['PUBLIC_NEWSLETTER_ACTION'] ?? '',
} as const;

/** Đếm lượt xem cần cả URL lẫn khoá công khai. */
export const luotXemBat = Boolean(ENV.publicSupabaseUrl && ENV.publicSupabaseAnonKey);

/**
 * Newsletter chạy ở một trong hai chế độ, ưu tiên nhà cung cấp nếu có.
 *
 *  - `provider`: form POST thẳng tới Buttondown / MailerLite / Listmonk. Họ lo
 *    việc gửi thư, xác nhận, huỷ đăng ký, và cả khả năng vào được inbox.
 *  - `supabase`: lưu email vào database của chính bạn. Chạy được ngay, không cần
 *    tài khoản ngoài — nhưng phần GỬI thư vẫn cần một nhà cung cấp.
 *  - `tat`: chưa cấu hình gì; khối tự ẩn ở production.
 */
export const cheDoNewsletter: 'provider' | 'supabase' | 'tat' = ENV.newsletterAction
  ? 'provider'
  : ENV.publicSupabaseUrl && ENV.publicSupabaseAnonKey
    ? 'supabase'
    : 'tat';

/** Analytics chỉ bật khi có website id VÀ đang ở production build. */
export const analyticsEnabled = Boolean(ENV.umamiWebsiteId) && import.meta.env.PROD;

/** giscus cần đủ 4 giá trị mới render được. */
export const commentsEnabled = Boolean(
  ENV.giscusRepo && ENV.giscusRepoId && ENV.giscusCategory && ENV.giscusCategoryId,
);
