/**
 * 行動予定管理アプリ - Business Edition
 * カレンダー日付選択、24時間対応、予定反映機能
 */

(function () {
  'use strict';

  // === Constants ===
  const MEMBERS = ['鈴木', '谷地', '南雲', '中沢', '大高', '田中', '福田'];

  const TIME_OPTIONS = (() => {
    const opts = [''];
    for (let h = 0; h < 24; h++) {
      opts.push(`${h}:00`);
    }
    return opts;
  })();
  const DEFAULT_TIME = '9:00';

  const POLL_INTERVAL = 30000;

  // === State ===
  let currentDate = getTodayString();
  let currentMember = null;
  let currentPhotos = [];
  let cachedData = {};
  let pollTimer = null;
  let calViewYear = new Date().getFullYear();
  let calViewMonth = new Date().getMonth();

  // === DOM ===
  const $ = (id) => document.getElementById(id);
  const dateDisplay = $('dateDisplay');
  const dateDisplayBtn = $('dateDisplayBtn');
  const memberList = $('memberList');
  const modalOverlay = $('modalOverlay');
  const modalTitle = $('modalTitle');
  const scheduleEntries = $('scheduleEntries');
  const addEntryBtn = $('addEntryBtn');
  const saveBtn = $('saveBtn');
  const clearBtn = $('clearBtn');
  const modalCloseBtn = $('modalCloseBtn');
  const photoInput = $('photoInput');
  const photoPreviewContainer = $('photoPreviewContainer');
  const toast = $('toast');
  const prevDateBtn = $('prevDate');
  const nextDateBtn = $('nextDate');
  const clearAllBtn = $('clearAllBtn');
  const imageModal = $('imageModal');
  const imageModalImg = $('imageModalImg');
  const calendarOverlay = $('calendarOverlay');
  const calTitle = $('calTitle');
  const calDays = $('calDays');
  const calPrevMonth = $('calPrevMonth');
  const calNextMonth = $('calNextMonth');
  const calTodayBtn = $('calTodayBtn');
  const copyTargetSelect = $('copyTargetSelect');
  const copyBtn = $('copyBtn');

  // === Utility ===

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
  }

  function shiftDate(dateStr, offset) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    return dateToString(d);
  }

  function dateToString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === API ===

  async function fetchSchedules(date) {
    try {
      const res = await fetch(`/api/schedules/${date}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('データ取得エラー:', err);
      return {};
    }
  }

  async function saveMemberSchedule(member, date, entries, photos) {
    try {
      const res = await fetch(`/api/schedules/${date}/${encodeURIComponent(member)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, photos })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('保存エラー:', err);
      alert('保存エラーが発生しました:\n' + err.message + '\n\n※URLが「http://...」になっているか確認してください。');
      showToast('保存に失敗しました');
      return null;
    }
  }

  async function deleteMemberSchedule(member, date) {
    try {
      const res = await fetch(`/api/schedules/${date}/${encodeURIComponent(member)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) { console.error('削除エラー:', err); return null; }
  }

  async function deleteAllSchedules(date) {
    try {
      const res = await fetch(`/api/schedules/${date}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) { console.error('一括削除エラー:', err); return null; }
  }

  // === Refresh ===

  async function refreshData() {
    cachedData = await fetchSchedules(currentDate);
    renderMemberList();
  }

  // === Polling ===

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!modalOverlay.classList.contains('active')) await refreshData();
    }, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // === Calendar ===

  function openCalendar() {
    const d = new Date(currentDate + 'T00:00:00');
    calViewYear = d.getFullYear();
    calViewMonth = d.getMonth();
    renderCalendar();
    calendarOverlay.classList.add('active');
  }

  function closeCalendar() { calendarOverlay.classList.remove('active'); }

  function renderCalendar() {
    calTitle.textContent = `${calViewYear}年${calViewMonth + 1}月`;
    calDays.innerHTML = '';

    const today = getTodayString();
    const firstDay = new Date(calViewYear, calViewMonth, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calViewYear, calViewMonth, 0).getDate();

    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(calViewYear, calViewMonth - 1, daysInPrevMonth - i);
      calDays.appendChild(createDayButton(d, daysInPrevMonth - i, true));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(calViewYear, calViewMonth, day);
      const btn = createDayButton(d, day, false);
      const ds = dateToString(d);
      if (ds === today) btn.classList.add('today');
      if (ds === currentDate) btn.classList.add('selected');
      calDays.appendChild(btn);
    }

    const totalCells = calDays.children.length;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(calViewYear, calViewMonth + 1, day);
      calDays.appendChild(createDayButton(d, day, true));
    }
  }

  function createDayButton(date, dayNum, isOtherMonth) {
    const btn = document.createElement('button');
    btn.className = 'calendar-day';
    btn.textContent = dayNum;
    if (isOtherMonth) btn.classList.add('other-month');
    const dow = date.getDay();
    if (dow === 0) btn.classList.add('sunday');
    if (dow === 6) btn.classList.add('saturday');

    btn.addEventListener('click', async () => {
      currentDate = dateToString(date);
      renderDate();
      closeCalendar();
      await refreshData();
    });
    return btn;
  }

  calPrevMonth.addEventListener('click', () => {
    calViewMonth--;
    if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCalendar();
  });

  calNextMonth.addEventListener('click', () => {
    calViewMonth++;
    if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendar();
  });

  calTodayBtn.addEventListener('click', async () => {
    currentDate = getTodayString();
    renderDate();
    closeCalendar();
    await refreshData();
  });

  dateDisplayBtn.addEventListener('click', openCalendar);
  calendarOverlay.addEventListener('click', (e) => { if (e.target === calendarOverlay) closeCalendar(); });

  // === Member Cards ===

  function renderMemberList() {
    memberList.innerHTML = '';
    MEMBERS.forEach((name, idx) => {
      const data = cachedData[name] || null;
      const hasData = data && (
        data.entries.some(e => e.time || e.no || e.customer || e.content) ||
        (data.photos && data.photos.length > 0)
      );

      const card = document.createElement('div');
      card.className = `member-card${hasData ? ' has-data' : ''}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-member', idx);
      card.id = `member-card-${idx}`;

      let bodyHTML = '';
      if (hasData) {
        const validEntries = data.entries.filter(e => e.time || e.customer || e.content);
        if (validEntries.length > 0) {
          bodyHTML += '<div class="card-body">';
          validEntries.forEach(e => {
            bodyHTML += `
              <div class="schedule-row">
                ${e.time ? `<span class="time-badge">${escapeHtml(e.time)}</span>` : ''}
                ${e.no ? `<span class="customer-no">No.${escapeHtml(e.no)}</span>` : ''}
                <span class="customer">${escapeHtml(e.customer || '')}</span>
                <span class="content">${escapeHtml(e.content || '')}</span>
              </div>`;
          });
          if (data.photos && data.photos.length > 0) {
            bodyHTML += `<div class="photo-indicator">写真 ${data.photos.length}枚</div>`;
          }
          bodyHTML += '</div>';
        } else if (data.photos && data.photos.length > 0) {
          bodyHTML += `<div class="card-body"><div class="photo-indicator">写真 ${data.photos.length}枚</div></div>`;
        }
      }

      card.innerHTML = `
        <div class="card-header">
          <span class="member-name">${escapeHtml(name)}</span>
          <span class="card-status ${hasData ? 'entered' : ''}">
            <span class="status-dot"></span>
            ${hasData ? '入力済' : '未入力'}
          </span>
        </div>
        ${bodyHTML}
      `;

      card.addEventListener('click', () => openModal(name));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(name); }
      });

      memberList.appendChild(card);
    });
  }

  // === Date ===

  function renderDate() {
    dateDisplay.textContent = formatDateDisplay(currentDate);
  }

  // === Modal ===

  function openModal(member) {
    currentMember = member;
    modalTitle.textContent = `${member} の行動予定`;

    const data = cachedData[member] || null;
    currentPhotos = data && data.photos ? [...data.photos] : [];

    scheduleEntries.innerHTML = '';
    if (data && data.entries && data.entries.length > 0) {
      data.entries.forEach((entry) => addEntryRow(entry));
    } else {
      addEntryRow({ time: DEFAULT_TIME });
    }

    // Build copy target dropdown (exclude current member)
    copyTargetSelect.innerHTML = '<option value="">-- 反映先を選択 --</option>';
    MEMBERS.forEach(m => {
      if (m !== member) {
        copyTargetSelect.innerHTML += `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`;
      }
    });

    renderPhotoPreview();
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    currentMember = null;
    currentPhotos = [];
  }

  // === Entry Rows ===

  function addEntryRow(data = {}) {
    const idx = scheduleEntries.children.length + 1;
    const entry = document.createElement('div');
    entry.className = 'schedule-entry';

    let timeOptionsHTML = '';
    TIME_OPTIONS.forEach(t => {
      const selected = (data.time === t) ? ' selected' : '';
      const label = t === '' ? '-- 時間 --' : t;
      timeOptionsHTML += `<option value="${t}"${selected}>${label}</option>`;
    });

    entry.innerHTML = `
      <button class="entry-remove-btn" aria-label="削除" title="削除">✕</button>
      <div class="entry-row">
        <div class="entry-field">
          <div class="entry-label">時間</div>
          <select class="form-select entry-time">${timeOptionsHTML}</select>
        </div>
        <div class="entry-field">
          <div class="entry-label">No</div>
          <input type="text" inputmode="numeric" class="form-input entry-no" value="${escapeHtml(data.no || '')}" placeholder="No" autocomplete="off" enterkeyhint="next">
        </div>
        <div class="entry-field">
          <div class="entry-label">顧客名</div>
          <input type="text" class="form-input entry-customer" value="${escapeHtml(data.customer || '')}" placeholder="顧客名" autocomplete="off" enterkeyhint="next">
        </div>
        <div class="entry-field">
          <div class="entry-label">内容</div>
          <input type="text" class="form-input entry-content" value="${escapeHtml(data.content || '')}" placeholder="内容" autocomplete="off" enterkeyhint="done">
        </div>
      </div>
    `;

    const removeBtn = entry.querySelector('.entry-remove-btn');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (scheduleEntries.children.length > 1) {
        entry.style.opacity = '0';
        entry.style.transform = 'translateY(-6px)';
        entry.style.transition = 'all 0.2s ease';
        setTimeout(() => { entry.remove(); }, 200);
      }
    });

    scheduleEntries.appendChild(entry);
  }

  function collectEntries() {
    const entries = [];
    scheduleEntries.querySelectorAll('.schedule-entry').forEach(row => {
      entries.push({
        time: row.querySelector('.entry-time').value,
        no: row.querySelector('.entry-no').value.trim(),
        customer: row.querySelector('.entry-customer').value.trim(),
        content: row.querySelector('.entry-content').value.trim()
      });
    });
    return entries;
  }

  // === Copy / Reflect to Other Member ===

  copyBtn.addEventListener('click', async () => {
    const targetMember = copyTargetSelect.value;
    if (!targetMember) {
      showToast('反映先を選択してください');
      return;
    }

    const entries = collectEntries();
    const hasContent = entries.some(e => e.time || e.no || e.customer || e.content);
    if (!hasContent) {
      showToast('反映する予定がありません');
      return;
    }

    if (!confirm(`現在の予定を ${targetMember} に反映しますか？\n※ ${targetMember} の既存の予定は上書きされます`)) {
      return;
    }

    copyBtn.disabled = true;
    copyBtn.textContent = '反映中...';

    // 写真は反映しない（予定内容のみ）
    const result = await saveMemberSchedule(targetMember, currentDate, entries, []);

    copyBtn.disabled = false;
    copyBtn.textContent = '反映';

    if (result && result.success) {
      showToast(`${targetMember} に予定を反映しました`);
      // キャッシュ更新
      cachedData = await fetchSchedules(currentDate);
    }
  });

  // === Photo ===

  function handlePhotoUpload(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        compressImage(e.target.result, 800, 0.7, (compressed) => {
          currentPhotos.push(compressed);
          renderPhotoPreview();
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function compressImage(dataUrl, maxSize, quality, callback) {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
        else { w = Math.round((w * maxSize) / h); h = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  }

  function renderPhotoPreview() {
    photoPreviewContainer.innerHTML = '';
    currentPhotos.forEach((src, i) => {
      const div = document.createElement('div');
      div.className = 'photo-preview';
      div.innerHTML = `
        <img src="${src}" alt="添付写真${i + 1}">
        <button class="photo-remove-btn" aria-label="削除">✕</button>
      `;
      div.querySelector('img').addEventListener('click', (e) => { e.stopPropagation(); showImageModal(src); });
      div.querySelector('.photo-remove-btn').addEventListener('click', (e) => { e.stopPropagation(); currentPhotos.splice(i, 1); renderPhotoPreview(); });
      photoPreviewContainer.appendChild(div);
    });
  }

  function showImageModal(src) { imageModalImg.src = src; imageModal.classList.add('active'); }
  function hideImageModal() { imageModal.classList.remove('active'); imageModalImg.src = ''; }

  // === Toast ===

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 2200);
  }

  // === Events ===

  prevDateBtn.addEventListener('click', async () => {
    currentDate = shiftDate(currentDate, -1);
    renderDate();
    await refreshData();
  });

  nextDateBtn.addEventListener('click', async () => {
    currentDate = shiftDate(currentDate, 1);
    renderDate();
    await refreshData();
  });

  addEntryBtn.addEventListener('click', () => {
    let nextTime = DEFAULT_TIME;
    const entries = collectEntries();
    if (entries.length > 0) {
      const lastTime = entries[entries.length - 1].time;
      if (lastTime && lastTime !== '') {
        const [h, m] = lastTime.split(':');
        let nextH = parseInt(h, 10) + 1;
        if (nextH > 23) nextH = 0; // 24時を超えたら0時に戻る
        nextTime = `${nextH}:00`;
      }
    }

    addEntryRow({ time: nextTime });
    const last = scheduleEntries.lastElementChild;
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  saveBtn.addEventListener('click', async () => {
    if (!currentMember) return;
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    const entries = collectEntries();
    const result = await saveMemberSchedule(currentMember, currentDate, entries, currentPhotos);

    saveBtn.disabled = false;
    saveBtn.textContent = '保存';

    if (result && result.success) {
      showToast(`${currentMember} の予定を保存しました`);
      closeModal();
      await refreshData();
    }
  });

  clearBtn.addEventListener('click', async () => {
    if (!currentMember) return;
    if (confirm(`${currentMember} の予定をクリアしますか？`)) {
      await deleteMemberSchedule(currentMember, currentDate);
      closeModal();
      await refreshData();
      showToast(`${currentMember} の予定をクリアしました`);
    }
  });

  modalCloseBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  photoInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) { handlePhotoUpload(e.target.files); e.target.value = ''; }
  });

  clearAllBtn.addEventListener('click', async () => {
    if (confirm(`${formatDateDisplay(currentDate)} の全員のデータをクリアしますか？`)) {
      await deleteAllSchedules(currentDate);
      await refreshData();
      showToast('全員のデータをクリアしました');
    }
  });

  imageModal.addEventListener('click', hideImageModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (imageModal.classList.contains('active')) hideImageModal();
      else if (calendarOverlay.classList.contains('active')) closeCalendar();
      else if (modalOverlay.classList.contains('active')) closeModal();
    }
  });

  // === Init ===
  async function init() {
    if (window.location.protocol === 'file:') {
      alert('【重要】\nファイルを直接開いているため保存できません。\n必ずブラウザで「http://localhost:3000」を開いてご利用ください。');
    }
    renderDate();
    await refreshData();
    startPolling();
  }

  init();
})();
