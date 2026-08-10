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
  {
    loadRows,
    loadOne,
    onPick,
    statusOf,
    labels,
    layout = 'compact',
    /*
      Chú thích kiểu là BẮT BUỘC, không phải cho đẹp.

      Viết `onExit = null` thì TypeScript suy ra kiểu của tham số là `null`, nên chỗ gọi
      truyền một hàm vào bị `astro check` báo ts(2322). Trình duyệt không quan tâm — chỉ
      bộ kiểm kiểu bắt được, và đó chính là việc của nó. Đúng loại lỗi đã gặp ở `onError`.
    */
    onExit = /** @type {null | (() => void)} */ (null),

    /*
      Có `hrefFor` thì mỗi dòng là một LINK THẬT, không phải `<button>`.

      Đây là cái `onclick` không bao giờ làm được: Ctrl+click, chuột giữa, chuột phải →
      "Mở trong tab mới", kéo vào bookmark, và nút Back của trình duyệt. Muốn "chọn một bài
      thì mở tab ra soạn" thì trình soạn phải có URL — không có cách nào khác.

      Dùng cho chế độ bảng. Chế độ gọn cạnh trình soạn vẫn dùng `onPick` và sửa ngay tại
      chỗ, vì ở đó mở tab mới cho mỗi lần nhảy bài là ngược ý muốn.
    */
    hrefFor = /** @type {null | ((slug: string) => string)} */ (null),
    onError = (_message) => {},
  },
) {
  /*
    HAI LAYOUT, cùng một logic.

    'table'   — màn hình riêng, rộng cả trang: Tiêu đề | Trạng thái | Ngày | Tag. Đây là chỗ
                DUYỆT và QUẢN LÝ: so sánh được giữa các bài, đọc được theo cột.
    'compact' — cột hẹp cạnh trình soạn. Đây là chỗ NHẢY nhanh giữa các bài mà không rời khỏi
                bài đang viết.

    Hai chỗ dùng khác nhau nên hình dạng khác nhau, nhưng phần tìm/lọc/phân trang là một —
    và đó chính là phần dễ lệch nhất nếu viết hai lần.
  */
  const isTable = layout === 'table';
  let rows = [];
  let term = '';
  let status = 'all';
  let page = 1;
  let currentSlug = null;

  injectCss();

  /*
    Chuyển việc cuộn từ `#ds` vào bên trong.

    `#ds` mang class `.list` có `overflow-y: auto` — nếu để nguyên thì có HAI vùng cuộn lồng
    nhau, và ô tìm cùng thanh phân trang sẽ cuộn mất theo danh sách. Cho `#ds` thành khung
    không cuộn, rồi chỉ `.pl-list` bên trong cuộn: hai thứ kia luôn nhìn thấy được.
  */
  root.style.overflow = 'hidden';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.minHeight = '0';

  root.innerHTML = `
    <div class="pl-ui${isTable ? ' pl-ui--table' : ''}">
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
      ${
        /*
          Đường quay lại, CHỈ ở chế độ bảng.

          Không có nó thì màn hình danh sách là một cái bẫy: vào rồi chỉ ra được bằng cách
          chọn một bài. Người vào để xem cho biết rồi muốn quay lại bài đang viết thì không
          có lối. Chế độ gọn không cần vì nó nằm cạnh trình soạn.
        */
        isTable && onExit
          ? `<button type="button" class="pl-exit" id="pl-exit">← Trình soạn</button>`
          : ''
      }
    </div>
    ${
      isTable
        ? `<div class="pl-scroll">
             <table class="pl-table">
               <thead><tr>
                 <th scope="col">Tiêu đề</th>
                 <th scope="col">Trạng thái</th>
                 <th scope="col">Ngày đăng</th>
                 <th scope="col">Tag</th>
               </tr></thead>
               <tbody id="pl-body"></tbody>
             </table>
           </div>`
        : `<ul class="pl-list" id="pl-body"></ul>`
    }
    <div class="pl-foot">
      <span id="pl-count" aria-live="polite"></span>
      <span class="pl-pager">
        <button type="button" id="pl-prev" aria-label="Trang trước">‹</button>
        <span id="pl-page"></span>
        <button type="button" id="pl-next" aria-label="Trang sau">›</button>
      </span>
    </div>
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
            const current = row.slug === currentSlug ? ' aria-current="true"' : '';

            /*
              `target="_blank"` kèm `rel="noopener"` — `noopener` là bắt buộc, không phải
              cho gọn: thiếu nó thì trang mở ra giữ được `window.opener` và với tới tab
              admin đang mở. Ở đây cả hai tab là cùng origin nên rủi ro thấp, nhưng đây là
              thói quen không nên có ngoại lệ.
            */
            const pick = hrefFor
              ? `<a class="pl-pick" href="${escapeHtml(hrefFor(row.slug))}" target="_blank" rel="noopener" data-slug="${escapeHtml(row.slug)}">`
              : `<button type="button" class="pl-pick" data-slug="${escapeHtml(row.slug)}">`;
            const unpick = hrefFor ? '</a>' : '</button>';

            if (isTable) {
              return `<tr${current}>
                <td>${pick}<span class="pl-title">${escapeHtml(row.title || row.slug)}</span>${unpick}
                    <div class="pl-slug">${escapeHtml(row.slug)}</div></td>
                <td><span class="badge ${s}">${escapeHtml(labels[s])}</span></td>
                <td class="pl-date">${escapeHtml(row.published_at ?? '')}</td>
                <td class="pl-tags">${escapeHtml((row.tags ?? []).join(', '))}</td>
              </tr>`;
            }

            return `<li${current}>
              ${pick}
                <span class="pl-title">${escapeHtml(row.title || row.slug)}</span>
                <span class="pl-meta">
                  <span class="badge ${s}">${escapeHtml(labels[s])}</span>
                  <span class="pl-date">${escapeHtml(row.published_at ?? '')}</span>
                </span>
              ${unpick}
            </li>`;
          })
          .join('')
      : isTable
        ? `<tr><td colspan="4" class="pl-empty">Không có bài nào khớp.</td></tr>`
        : `<li class="pl-empty">Không có bài nào khớp.</li>`;

    el('pl-count').textContent = `${matched.length} bài${
      matched.length !== rows.length ? ` / ${rows.length}` : ''
    }`;
    el('pl-page').textContent = `${page}/${pageCount}`;
    el('pl-prev').disabled = page <= 1;
    el('pl-next').disabled = page >= pageCount;

    /*
      Là link thì KHÔNG gắn handler — để trình duyệt điều hướng.

      Gắn `onclick` lên một `<a target="_blank">` là vừa mở tab mới vừa chạy handler ở tab
      cũ: hai việc cùng lúc, và tab cũ đổi trạng thái sau lưng người dùng.
    */
    if (hrefFor) return;

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

  if (isTable && onExit) el('pl-exit').onclick = () => onExit();

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
 *
 * VỪA MỘT CỘT HẸP — sidebar rộng 260px. Bản đầu tôi vẽ bảng ba cột và nó VỠ TOÀN BỘ: `#ds`
 * nằm trong `aside` của `.shell { grid-template-columns: 260px 1fr }`, nên một bảng có ô
 * tìm, bộ lọc, ba cột và thanh phân trang không có chỗ nào để nằm. Không phải lỗi CSS lẻ —
 * đặt bảng vào một cột hẹp là sai ngay từ lựa chọn thiết kế.
 *
 * KHÔNG VIẾT DẤU NHÁY NGƯỢC TRONG CHUỖI CSS DƯỚI ĐÂY. Nó là template literal, nên một dấu
 * nháy ngược trong comment CSS sẽ KẾT THÚC chuỗi và cả file thành lỗi cú pháp — lúc đó admin
 * trắng trang, không phải lệch một chút. Đã trả giá đúng như vậy: mọi giải thích cần dấu
 * nháy ngược thì viết ở đây, ngoài chuỗi.
 */
const POST_LIST_CSS = `
  /* Module tự định nghĩa .sr-only, KHÔNG dựa vào trang chủ nhà có nó.
     Admin cục bộ không định nghĩa class này, nên hai nhãn hiện ra thành chữ và ăn mất nửa
     chiều rộng cột — đã thấy trên ảnh chụp màn hình thật. Một module dùng chung mà cần
     class của người gọi thì nó vỡ ở đúng chỗ người gọi không biết là mình phải cung cấp. */
  .pl-ui .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  .pl-ui { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  /* Xếp DỌC, không phải hai cột: cột sidebar chỉ 260px, chia đôi thì cả ô tìm lẫn ô lọc
     đều hẹp tới mức không đọc được giá trị đang chọn. */
  .pl-tools { display: grid; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); flex: none; }
  .pl-tools input, .pl-tools select { width: 100%; min-width: 0; box-sizing: border-box; font-size: 12px; padding: 5px 7px; }
  .pl-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; overflow-x: hidden; flex: 1; min-height: 0; }
  .pl-list > li { border-bottom: 1px solid var(--border); }
  .pl-list > li[aria-current='true'] { background: var(--panel); box-shadow: inset 3px 0 0 var(--blue); }
  .pl-pick { all: unset; display: grid; gap: 3px; width: 100%; box-sizing: border-box; padding: 9px 11px; cursor: pointer; }
  .pl-pick:hover { background: var(--panel); }
  .pl-pick:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
  .pl-title { font-size: 13px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
  .pl-meta { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--muted); }
  .pl-date { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pl-empty { color: var(--muted); padding: 18px 11px; font-size: 12px; }
  .pl-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 7px 10px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); flex: none; }
  .pl-pager { display: flex; align-items: center; gap: 4px; }
  .pl-pager button { min-width: 26px; min-height: 26px; padding: 2px 6px; font-size: 13px; line-height: 1; }
  .pl-pager button:disabled { opacity: .4; cursor: default; }

  /* --- Chế độ bảng: màn hình riêng, rộng cả trang --------------------------- */
  .pl-ui--table { padding: 0; }
  /* Ba cột với nút thoát ở cột cuối: ô tìm và ô lọc vừa đúng nội dung, khoảng trống dồn vào
     giữa. Bản trước để select rộng 100% nên nó giãn gần hết chiều ngang bảng — một ô chọn
     bốn giá trị mà rộng 900px thì vừa xấu vừa khó bấm. */
  .pl-ui--table .pl-tools { grid-template-columns: minmax(0, 420px) auto 1fr; align-items: center; padding: 12px 18px; }
  .pl-ui--table .pl-tools input { font-size: 14px; padding: 8px 10px; }
  .pl-ui--table .pl-tools select { width: auto; min-width: 170px; font-size: 14px; padding: 8px 10px; }
  .pl-exit { justify-self: end; }
  .pl-scroll { overflow: auto; flex: 1; min-height: 0; }
  .pl-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .pl-table th, .pl-table td { text-align: left; padding: 10px 18px; border-bottom: 1px solid var(--border); vertical-align: top; }
  /* Ghim hàng tiêu đề: cuộn 200 bài mà mất tên cột thì bảng không còn là bảng. */
  .pl-table th { position: sticky; top: 0; z-index: 1; background: var(--panel); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .pl-table tbody tr:hover { background: var(--panel); }
  .pl-table tbody tr[aria-current='true'] { background: var(--panel); box-shadow: inset 3px 0 0 var(--blue); }
  /* Cột tiêu đề co giãn, ba cột còn lại vừa đúng nội dung — không để ngày tháng
     chiếm một phần tư bảng trên màn rộng. */
  .pl-table th:first-child, .pl-table td:first-child { width: 100%; }
  .pl-table td:not(:first-child) { white-space: nowrap; }
  .pl-ui--table .pl-title { font-size: 14px; }
  .pl-slug { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-top: 2px; }
  .pl-tags { color: var(--muted); font-size: 12px; }
  .pl-ui--table .pl-foot { padding: 10px 18px; font-size: 12px; }

  /* Dưới 720px bảng không còn đủ chỗ cho bốn cột: bỏ Tag và Ngày, giữ Tiêu đề và
     Trạng thái. Cuộn ngang một cái bảng trên điện thoại thì không ai đọc được. */
  @media (max-width: 720px) {
    .pl-table th:nth-child(3), .pl-table td:nth-child(3),
    .pl-table th:nth-child(4), .pl-table td:nth-child(4) { display: none; }
    .pl-ui--table .pl-tools { grid-template-columns: 1fr; }
  }
`;
