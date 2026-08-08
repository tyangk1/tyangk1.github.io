/**
 * Cấu trúc URL gom về một chỗ. Muốn đổi `/blog/page/2` thành `/blog/trang/2`
 * thì chỉ sửa ở đây, không phải đi tìm khắp nơi.
 */

export function blogPageHref(page: number): string {
  return page <= 1 ? '/blog' : `/blog/page/${page}`;
}

export function postHref(id: string): string {
  return `/blog/${id}`;
}

export function tagHref(slug: string): string {
  return `/tags/${slug}`;
}
