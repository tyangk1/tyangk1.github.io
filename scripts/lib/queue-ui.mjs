/**
 * Màn hình quản lý hàng đợi chủ đề — VIẾT MỘT LẦN, dùng ở CẢ HAI trang admin.
 *
 * VÌ SAO LÀ MODULE CHỨ KHÔNG PHẢI CHÉP HAI BẢN
 *
 * Hai trang admin đã trùng nhau khá nhiều (form bài, danh sách, thanh công cụ). Thêm
 * hẳn một màn hình thứ hai vào cả hai file là nhân đôi bề mặt bảo trì, và kinh nghiệm
 * trong dự án này đã cho thấy hai bản copy sẽ trôi lệch: bộ tô màu MDX từng suýt lệch,
 * và `slugify` đã từng có BA bản.
 *
 * Module này chỉ dựng DOM và xử lý sự kiện. Cách nói chuyện với database được TIÊM VÀO
 * (`db`), vì hai host khác nhau ở đúng chỗ đó:
 *
 *   /admin trên site  — gọi thẳng REST của Supabase bằng JWT.
 *   pnpm admin ở máy  — gọi `/api/queue` của server cục bộ, server dùng service key.
 *
 * KHÔNG CÓ CSS RIÊNG
 *
 * Chỉ dùng các class mà cả hai host đã có: .bar .list .item .badge .col .label
 * .counter .row .note .primary .danger. Đó là lợi ích thật của việc đổi tên class cho
 * khớp nhau ở lượt trước — nếu tên còn lệch thì module này không dùng được.
 */

/** Ràng buộc, đối chiếu 1-1 với CHECK constraint của bảng `content_queue`. */
export const QUEUE_LIMITS = {
  topicMin: 3,
  topicMax: 200,
  tagsMax: 5,
};

export const QUEUE_STATUS_LABELS = {
  queued: 'đang chờ',
  drafting: 'đang soạn',
  done: 'đã soạn',
  failed: 'thất bại',
};

/** Nhãn cho `mode`. Nói bằng hệ quả, không bằng tên cột. */
export const QUEUE_MODE_LABELS = {
  draft: 'soạn ra nháp',
  auto: 'tự đăng',
};

/**
 * Kiểm một chủ đề trước khi ghi.
 *
 * Trả mảng lỗi tiếng Việt, rỗng nghĩa là hợp lệ. Cùng lý do với `validatePost`:
 * Postgres sẽ chặn, nhưng thông báo của nó là `violates check constraint
 * "content_queue_topic_length"` — thứ không nói cho người dùng biết đang thiếu gì.
 */
export function validateQueueItem(item) {
  const errors = [];
  const topic = String(item.topic ?? '').trim();

  if (topic.length < QUEUE_LIMITS.topicMin || topic.length > QUEUE_LIMITS.topicMax) {
    errors.push({
      field: 'topic',
      message: `Chủ đề ${topic.length} ký tự, cần ${QUEUE_LIMITS.topicMin}–${QUEUE_LIMITS.topicMax}.`,
    });
  }

  if (!item.publish_on) {
    errors.push({ field: 'publish_on', message: 'Chưa chọn ngày đăng.' });
  }

  const tags = (item.tags ?? []).filter((t) => String(t).trim());
  if (tags.length > QUEUE_LIMITS.tagsMax) {
    errors.push({
      field: 'tags',
      message: `Đang có ${tags.length} tag, tối đa ${QUEUE_LIMITS.tagsMax}. Bỏ trống thì để máy tự chọn.`,
    });
  }

  if (!['draft', 'auto'].includes(item.mode)) {
    errors.push({ field: 'mode', message: 'Chế độ phải là "soạn ra nháp" hoặc "tự đăng".' });
  }

  return errors;
}

/** Chuẩn hoá dữ liệu form thành đúng hình dạng bảng `content_queue`. */
export function normalizeQueueItem(form) {
  const blankToNull = (v) => {
    const s = typeof v === 'string' ? v.trim() : v;
    return s === '' || s === undefined ? null : s;
  };

  return {
    topic: String(form.topic ?? '').trim(),
    angle: blankToNull(form.angle),
    source_material: blankToNull(form.source_material),
    tags: (form.tags ?? []).map((t) => String(t).trim()).filter(Boolean),
    publish_on: blankToNull(form.publish_on),
    mode: form.mode === 'auto' ? 'auto' : 'draft',
  };
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Gắn màn hình hàng đợi vào `root`.
 *
 * @param root  phần tử rỗng để dựng vào.
 * @param opts.db     { list, save, remove } — cách nói chuyện với database.
 * @param opts.toast  hàm hiện thông báo của host, để hai màn hình nói cùng một chỗ.
 * @param opts.today  hôm nay dạng YYYY-MM-DD, dùng làm mặc định và để tính "còn N ngày".
 * @param opts.onExit gọi khi bấm "← Bài viết".
 */
export function mountQueueUi(root, { db, toast, today, onExit }) {
  root.innerHTML = `
    <aside>
      <div class="bar">
        <button class="primary" data-q="new">+ Chủ đề</button>
        <button data-q="back">← Bài viết</button>
      </div>
      <div class="list" data-q="list"></div>
    </aside>
    <main>
      <div class="bar">
        <b data-q="heading">Chủ đề mới</b>
        <button class="primary" data-q="save">Lưu</button>
        <button data-q="retry" hidden>Thử lại</button>
        <button class="danger" data-q="del" disabled>Xoá</button>
      </div>
      <div class="col">
        <div data-q="errors" class="errbox"></div>
        <div data-q="info" class="note"></div>

        <label>
          <span class="label"><span>Chủ đề</span><span class="counter" data-q="c-topic"></span></span>
          <input type="text" data-q="topic" placeholder="Vì sao tôi bỏ Redis khỏi hệ thống" />
        </label>

        <label>
          <span class="label"><span>Góc nhìn riêng</span></span>
          <textarea data-q="angle" rows="2" placeholder="Thứ làm bài này khác những bài đã có trên mạng"></textarea>
          <div class="note">Bỏ trống thì bài ra sẽ chung chung — đúng loại bài CONTENT-GUIDE nói đừng viết.</div>
        </label>

        <label>
          <span class="label"><span>Tư liệu thật</span><span class="counter" data-q="c-src"></span></span>
          <textarea data-q="source_material" rows="6" placeholder="p95 trước 84ms, sau 81ms. CPU database 4%. Truy vấn chậm nhất 12ms."></textarea>
          <div class="note" data-q="src-note"></div>
        </label>

        <div class="row">
          <label>
            <span class="label"><span>Ngày đăng</span></span>
            <input type="date" data-q="publish_on" />
          </label>
          <label>
            <span class="label"><span>Chế độ</span></span>
            <select data-q="mode">
              <option value="draft">Soạn ra nháp — mình duyệt rồi mới đăng</option>
              <option value="auto">Tự đăng đúng ngày, không ai xem trước</option>
            </select>
          </label>
        </div>

        <label>
          <span class="label"><span>Tag, cách nhau bằng phẩy</span><span class="counter" data-q="c-tags"></span></span>
          <input type="text" data-q="tags" placeholder="để trống thì máy tự chọn" />
        </label>
      </div>
    </main>
  `;

  const q = (name) => root.querySelector(`[data-q="${name}"]`);
  const val = (name) => q(name).value;
  let items = [];
  let editingId = null;

  // --- Vẽ danh sách ---------------------------------------------------------

  function statusBadge(item) {
    const label = QUEUE_STATUS_LABELS[item.status] ?? item.status;
    return `<span class="badge q-${item.status}">${label}</span>`;
  }

  function dueText(item) {
    if (!item.publish_on || !today) return item.publish_on ?? '';
    const days = Math.round(
      (Date.parse(`${item.publish_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
    );
    if (days === 0) return `${item.publish_on} · hôm nay`;
    if (days > 0) return `${item.publish_on} · còn ${days} ngày`;
    return `${item.publish_on} · quá ${-days} ngày`;
  }

  function renderList() {
    q('list').innerHTML = items.length
      ? items
          .map(
            (item) => `
            <div class="item" data-id="${item.id}" ${item.id === editingId ? 'aria-current="true"' : ''}>
              <b>${esc(item.topic)}</b>
              <small>
                ${statusBadge(item)}
                <span>${esc(dueText(item))}</span>
              </small>
              <small>
                <span class="badge">${QUEUE_MODE_LABELS[item.mode] ?? item.mode}</span>
                ${item.attempts > 0 ? `<span>đã thử ${item.attempts} lần</span>` : ''}
              </small>
            </div>`,
          )
          .join('')
      : `<div class="item" style="cursor:default"><small>Chưa có chủ đề nào. Bấm “+ Chủ đề”.</small></div>`;

    for (const el of q('list').querySelectorAll('.item[data-id]')) {
      el.onclick = () => fill(items.find((i) => i.id === el.dataset.id) ?? null);
    }
  }

  // --- Form ----------------------------------------------------------------

  function counters() {
    const topic = val('topic').trim();
    const okTopic = topic.length >= QUEUE_LIMITS.topicMin && topic.length <= QUEUE_LIMITS.topicMax;
    q('c-topic').textContent =
      `${topic.length} / ${QUEUE_LIMITS.topicMin}–${QUEUE_LIMITS.topicMax}`;
    q('c-topic').className = `counter ${topic ? (okTopic ? 'ok' : 'bad') : ''}`;

    const tags = val('tags')
      .split(',')
      .filter((t) => t.trim());
    q('c-tags').textContent = `${tags.length} / tối đa ${QUEUE_LIMITS.tagsMax}`;
    q('c-tags').className = `counter ${tags.length > QUEUE_LIMITS.tagsMax ? 'bad' : ''}`;

    /*
      Lời nhắc về tư liệu thật, đổi theo việc ô đó có gì hay không.

      Đây là chỗ duy nhất trong toàn bộ giao diện nói ra luật quan trọng nhất của việc
      soạn bài bằng máy. Không nói ở đây thì người dùng chỉ thấy một ô textarea trống
      và không có cách nào biết bỏ trống nó thì bài ra khác hẳn.
    */
    const src = val('source_material').trim();
    q('c-src').textContent = src ? `${src.length} ký tự` : 'đang trống';
    q('c-src').className = `counter ${src ? 'ok' : ''}`;
    q('src-note').textContent = src
      ? 'Có tư liệu → bài được viết ở ngôi thứ nhất, và mọi con số phải lấy từ đây.'
      : 'Trống → bài viết giọng khách quan, KHÔNG có “tôi đã thử”. Bịa trải nghiệm dưới tên thật là thứ không sửa được sau khi đăng.';
  }

  function fill(item) {
    editingId = item?.id ?? null;
    q('topic').value = item?.topic ?? '';
    q('angle').value = item?.angle ?? '';
    q('source_material').value = item?.source_material ?? '';
    q('tags').value = (item?.tags ?? []).join(', ');
    q('publish_on').value = item?.publish_on ?? today ?? '';
    q('mode').value = item?.mode ?? 'draft';

    q('heading').textContent = item ? item.topic.slice(0, 60) : 'Chủ đề mới';
    q('del').disabled = !item;
    q('errors').innerHTML = '';

    // "Thử lại" chỉ hiện cho việc đã thất bại — nút không dùng được thì đừng bày ra.
    q('retry').hidden = !item || item.status !== 'failed';

    const bits = [];
    if (item?.status) bits.push(`Trạng thái: ${QUEUE_STATUS_LABELS[item.status] ?? item.status}`);
    if (item?.created_slug) bits.push(`Đã sinh bài: ${item.created_slug}`);
    if (item?.attempts) bits.push(`Đã thử ${item.attempts} lần`);
    q('info').textContent = bits.join(' · ');

    if (item?.last_error) {
      q('errors').innerHTML =
        `<b>Lần soạn gần nhất thất bại:</b><ul><li>${esc(item.last_error)}</li></ul>`;
    }

    counters();
    renderList();
  }

  function readForm() {
    return normalizeQueueItem({
      topic: val('topic'),
      angle: val('angle'),
      source_material: val('source_material'),
      tags: val('tags').split(','),
      publish_on: val('publish_on'),
      mode: val('mode'),
    });
  }

  // --- Hành động ------------------------------------------------------------

  async function refresh() {
    items = await db.list();
    renderList();
  }

  async function save() {
    const item = readForm();
    const errors = validateQueueItem(item);
    if (errors.length) {
      q('errors').innerHTML =
        `<b>Chưa lưu được:</b><ul>${errors.map((e) => `<li>${esc(e.message)}</li>`).join('')}</ul>`;
      toast('Có lỗi cần sửa', 'bad');
      return;
    }

    toast('Đang lưu…');
    try {
      const saved = await db.save(item, editingId);
      await refresh();
      fill(items.find((i) => i.id === (saved?.id ?? editingId)) ?? null);
      toast('Đã lưu chủ đề', 'ok');
    } catch (e) {
      q('errors').innerHTML = `<b>Database từ chối:</b><ul><li>${esc(e.message)}</li></ul>`;
      toast('Lưu thất bại', 'bad');
    }
  }

  async function remove() {
    if (!editingId) return;
    const item = items.find((i) => i.id === editingId);
    if (!confirm(`Xoá chủ đề "${item?.topic ?? ''}"?\n\nBài đã sinh ra thì KHÔNG bị xoá.`)) return;

    try {
      await db.remove(editingId);
      await refresh();
      fill(null);
      toast('Đã xoá chủ đề', 'ok');
    } catch (e) {
      toast(`Không xoá được: ${e.message}`, 'bad');
    }
  }

  /**
   * Đưa một việc thất bại về hàng đợi.
   *
   * Phải đặt lại `attempts` về 0, không chỉ đổi status: `claim_content_queue_item` bỏ
   * qua việc có `attempts >= max_attempts`, nên đổi status mà giữ attempts thì nó vẫn
   * không bao giờ được lấy lại — bấm nút mà không có gì xảy ra.
   */
  async function retry() {
    if (!editingId) return;
    try {
      await db.save({ status: 'queued', attempts: 0, last_error: null }, editingId, { raw: true });
      await refresh();
      fill(items.find((i) => i.id === editingId) ?? null);
      toast('Đã đưa về hàng đợi, sẽ soạn lại ở lần chạy tới', 'ok');
    } catch (e) {
      toast(`Không đặt lại được: ${e.message}`, 'bad');
    }
  }

  q('new').onclick = () => fill(null);
  q('save').onclick = save;
  q('del').onclick = remove;
  q('retry').onclick = retry;
  q('back').onclick = () => onExit?.();

  for (const name of ['topic', 'tags', 'source_material']) {
    q(name).addEventListener('input', counters);
  }

  fill(null);
  return { refresh, fill };
}
