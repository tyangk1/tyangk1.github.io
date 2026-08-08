/**
 * Ước lượng thời gian đọc từ nội dung Markdown thô.
 *
 * 220 "từ"/phút: tiếng Việt tách theo âm tiết nên số token cao hơn tiếng Anh,
 * con số này cho kết quả sát thực tế hơn mốc 200 thường dùng cho tiếng Anh.
 */
const WORDS_PER_MINUTE = 220;

export function readingTime(markdown: string): { minutes: number; words: number } {
  const text = markdown
    // Bỏ code block — người đọc lướt code chứ không đọc từng chữ.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    // Bỏ frontmatter còn sót và thẻ HTML/JSX trong MDX.
    .replace(/^---[\s\S]*?---/, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Giữ lại chữ trong link, bỏ phần URL.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Bỏ ký tự cú pháp Markdown còn lại.
    .replace(/[#>*_`~|-]/g, ' ');

  const words = text.split(/\s+/).filter(Boolean).length;

  return { words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}
