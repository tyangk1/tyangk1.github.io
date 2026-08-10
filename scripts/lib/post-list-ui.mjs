/**
 * Danh sách bài trong trang admin: bảng, có tìm, có lọc, có phân trang.
 *
 * VIẾT MỘT LẦN, HAI ADMIN CÙNG DÙNG — `src/pages/admin.astro` và `scripts/admin/index.html`.
 * Cùng lý do như `queue-ui.mjs`: hai bản sao của cùng một màn hình thì sớm muộn lệch nhau,
 * và lệch ở admin nghĩa là người viết thấy hai thứ khác nhau tuỳ chỗ họ đang mở.
 *
 * BA VẤN ĐỀ CỦA BẢN CŨ
 *
 *  1. Nó tải `select=*` — nghĩa là TOÀN BỘ nội dung của mọi bài, chỉ để vẽ tiêu đề. Với 10
 *     bài không ai thấy; với 200 bài mỗi bài 10KB thì đó là 2MB mỗi lần mở admin, và phần
 *     lớn số đó không bao giờ được hiển thị. Đây là vấn đề thật, nặng hơn chuyện cuộn dài.
 *  2. Một cột cuộn phẳng: không tìm được bài, không lọc được theo trạng thái, và càng nhiều
 *     bài thì càng phải cuộn — không có cách nào tới bài thứ 150 ngoài cuộn tay.
 *  3. Không đọc được theo cột. Trạng thái và ngày đăng bị nhồi vào một dòng `<small>`, nên
 *     không so sánh được giữa các bài.
 *
 * CÁCH LÀM
 *
 * Tải một lần các cột NHẸ (không có `content`), rồi tìm và phân trang ở trình duyệt. Với
 * blog cá nhân thì mỗi dòng nhẹ khoảng 100 byte, nên 500 bài vẫn dưới 50KB và lọc tức thì.
 * Nội dung đầy đủ chỉ tải khi bấm vào một bài.
 *
 * NGƯỠNG PHẢI ĐỔI CÁCH: khoảng vài nghìn bài. Lúc đó phải chuyển tìm và phân trang sang
 * phía database (`limit`/`offset` cộng full-text search — hàm `search_posts` đã có sẵn).
 * Nói ra ngưỡng để người sau không phải đoán xem cách này còn đúng không.
 */

const PAGE_SIZE = 20;

/** Nhúng CSS đúng một lần, kể cả khi hàm mount được gọi lại. */
function injectCss() {
  if (document.getElementById('post-list-ui-css')) return;

  const style = document.createElement('style');
  style.id = 'post-list-ui-css';
  style.textContent = POST_LIST_CSS;
  document.head.append(style);
}

/** Bỏ dấu để tìm không phân biệt dấu — cùng cách nghĩ với `unaccent` ở database. */
function foldAccents(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lọc theo từ khoá và theo trạng thái.
 *
 * Tìm trên tiêu đề, slug VÀ tag: ba thứ người viết thật sự nhớ về một bài. Bỏ dấu cả hai
 * phía nên gõ "tieng viet" ra bài "CSS cho tiếng Việt".
 */
export function filterPosts(rows, { term = '', status = 'all', statusOf }) {
  const needle = foldAccents(term).trim();

  return rows.filter((row) => {
    if (status !== 'all' && statusOf(row) !== status) return false;
    if (!needle) return true;

    const haystack = foldAccents(
      `${row.title ?? ''} ${row.slug ?? ''} ${(row.tags ?? []).join(' ')}`,
    );
    return needle.split(/\s+/).every((word) => haystack.includes(word));
  });
}

/**
 * Dựng màn hình danh sách vào `root`.
 *
 * @param root      phần tử chứa
 * @param loadRows  async () => mảng dòng NHẸ, mới nhất trước
 * @param loadOne   async (slug) => dòng ĐẦY ĐỦ, gồm `content`
 * @param onPick    (dòng đầy đủ) => void, gọi khi người dùng chọn một bài
 * @param statusOf  (dòng) => 'draft' | 'scheduled' | 'published'
 * @param labels    nhãn hiển thị cho từng trạng thái
 * @param onError   (thông điệp) => void
 */
export function mountPostListUi(
  root,
  // Mặc định của `onError` phải NHẬN tham số, dù nó không dùng: `() => {}` làm TypeScript
  // suy ra kiểu `() => void` cho cả tham số, nên chỗ gọi truyền `(message) => ...` bị báo
  // ts(2322). `astro check` bắt được điều đó ở `admin.astro`.
  { loadRows, loadOne, onPick, statusOf, labels, onError = (_message) => {} },
) {
  let rows = [];
  let term = '';
  let status = 'all';
  let page = 1;
  let currentSlug = null;

  injectCss();

  /*
    Bỏ cuộn của phần tử chứa.

    `#ds` mang class `.list` có `overflow-y: auto` và giới hạn chiều cao — đúng cho một cột
    cuộn phẳng, nhưng ở đây nó sẽ tạo HAI vùng cuộn lồng nhau: một của `.list`, một của
    `.pl-scroll`. Hai thanh cuộn lồng nhau là chỗ không ai bấm đúng được.
  */
  root.style.overflow = 'visible';
  root.style.maxHeight = 'none';

  root.innerHTML = `
    <div class="pl-tools">
      <label class="sr-only" for="pl-term">Tìm bài</label>
      <input id="pl-term" type="search" placeholder="Tìm theo tiêu đề, slug hoặc tag…" autocomplete="off" />
      <label class="sr-only" for="pl-status">Lọc theo trạng thái</label>
      <select id="pl-status">
        <option value="all">Tất cả</option>
        <option value="published">${escapeHtml(labels.published)}</option>
        <option value="scheduled">${escapeHtml(labels.scheduled)}</option>
        <option value="draft">${escapeHtml(labels.draft)}</option>
      </select>
    </div>
    <div class="pl-scroll">
      <table class="pl-table">
        <thead>
          <tr>
            <th scope="col">Tiêu đề</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Ngày đăng</th>
          </tr>
        </thead>
        <tbody id="pl-body"></tbody>
      </table>
    </div>
    <div class="pl-foot">
      <span id="pl-count" aria-live="polite"></span>
      <span class="pl-pager">
        <button type="button" id="pl-prev" aria-label="Trang trước">‹</button>
        <span id="pl-page"></span>
        <button type="button" id="pl-next" aria-label="Trang sau">›</button>
      </span>
    </div>
  `;

  const el = (id) => root.querySelector(`#${id}`);

  function render() {
    const matched = filterPosts(rows, { term, status, statusOf });
    const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
    page = Math.min(page, pageCount);

    const slice = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    el('pl-body').innerHTML = slice.length
      ? slice
          .map((row) => {
            const s = statusOf(row);
            /*
              Tiêu đề là `<button>`, không phải `onclick` trên `<tr>`.

              Một hàng bảng có `onclick` thì bàn phím không tới được: không Tab vào được,
              không Enter được. Người viết bài dùng bàn phím rất nhiều, nên chỗ này phải là
              một phần tử tương tác thật.
            */
            return `<tr${row.slug === currentSlug ? ' aria-current="true"' : ''}>
              <td><button type="button" class="pl-pick" data-slug="${escapeHtml(row.slug)}">${escapeHtml(row.title || row.slug)}</button></td>
              <td><span class="badge ${s}">${escapeHtml(labels[s])}</span></td>
              <td class="pl-date">${escapeHtml(row.published_at ?? '')}</td>
            </tr>`;
          })
          .join('')
      : `<tr><td colspan="3" class="pl-empty">Không có bài nào khớp.</td></tr>`;

    el('pl-count').textContent = `${matched.length} bài${
      matched.length !== rows.length ? ` / ${rows.length}` : ''
    }`;
    el('pl-page').textContent = `${page}/${pageCount}`;
    el('pl-prev').disabled = page <= 1;
    el('pl-next').disabled = page >= pageCount;

    for (const button of el('pl-body').querySelectorAll('.pl-pick')) {
      button.onclick = async () => {
        const slug = button.dataset.slug;
        button.disabled = true;
        try {
          /*
            Tải nội dung ĐẦY ĐỦ đúng lúc này, không tải sẵn từ đầu.

            Đây là chỗ đổi cách so với bản cũ: bản cũ tải `content` của mọi bài ngay khi mở
            admin, dù người viết chỉ mở một bài. Một request thêm khi bấm thì rẻ hơn nhiều
            so với hàng trăm bài nội dung không ai đọc.
          */
          const full = await loadOne(slug);
          if (!full) {
            onError('Không tải được bài này.');
            return;
          }
          currentSlug = slug;
          onPick(full);
          render();
        } finally {
          button.disabled = false;
        }
      };
    }
  }

  el('pl-term').oninput = (e) => {
    term = e.target.value;
    page = 1;
    render();
  };

  el('pl-status').onchange = (e) => {
    status = e.target.value;
    page = 1;
    render();
  };

  el('pl-prev').onclick = () => {
    page -= 1;
    render();
  };

  el('pl-next').onclick = () => {
    page += 1;
    render();
  };

  return {
    /** Tải lại danh sách từ nguồn. Gọi sau khi lưu hoặc xoá. */
    async refresh() {
      const next = await loadRows();
      if (next) rows = next;
      render();
    },

    /** Đánh dấu bài đang mở, không tải lại gì. */
    setCurrent(slug) {
      currentSlug = slug;
      render();
    },
  };
}

/**
 * CSS của màn hình này, do CHÍNH MODULE tự nhúng một lần.
 *
 * Không để hai admin tự dán CSS vào `<style>` của chúng: đó là hai bản sao, và bản sao thì
 * lệch. Module tự lo cả HTML lẫn CSS thì thêm một cột vào bảng chỉ phải sửa một chỗ.
 */
const POST_LIST_CSS = `
  .pl-tools { display: flex; gap: 8px; margin-bottom: 10px; }
  .pl-tools input { flex: 1; min-width: 0; }
  .pl-scroll { overflow: auto; max-height: 60vh; }
  .pl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .pl-table th, .pl-table td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .pl-table th { position: sticky; top: 0; background: var(--panel); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .pl-table tr[aria-current='true'] { background: var(--bg); }
  .pl-pick { all: unset; cursor: pointer; font-weight: 700; line-height: 1.35; }
  .pl-pick:hover { color: var(--blue); }
  .pl-pick:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .pl-date { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--muted); }
  .pl-empty { color: var(--muted); padding: 18px 8px; }
  .pl-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 12px; color: var(--muted); }
  .pl-pager { display: flex; align-items: center; gap: 6px; }
  .pl-pager button { min-width: 28px; }
  .pl-pager button:disabled { opacity: .4; cursor: default; }
`;
