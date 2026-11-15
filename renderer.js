const isElectron = Boolean(window.widgetAPI);
const api = isElectron
  ? window.widgetAPI
  : {
      loadData: async () => {
        try {
          const saved = localStorage.getItem('mydeskhub_preview');
          if (saved) return JSON.parse(saved);
        } catch {}
        return appData;
      },
      saveData: async (data) => {
        try { localStorage.setItem('mydeskhub_preview', JSON.stringify(data)); } catch {}
        return { ok: true };
      },
      listReports: async () => ({ ok: false, error: '브라우저 미리보기 모드입니다. MyDeskHub.vbs로 실행해 주세요.', files: [] }),
      openPath: async () => false,
      openExternal: async (url) => { window.open(url, '_blank'); return true; },
      fetchNotices: async () => ({ ok: false, error: 'MyDeskHub.vbs(Electron)로 실행하면 공지를 불러옵니다.', items: [] }),
      fetchMail: async () => ({ ok: false, error: 'MyDeskHub.vbs(Electron)로 실행하면 메일을 불러옵니다.', unreadCount: 0, messages: [] }),
      togglePin: async () => true,
      toggleLock: async () => false,
      setMini: async () => {},
      setOpacity: async () => {},
      minimize: async () => {},
      close: async () => {},
      getAutoStart: async () => false,
      setAutoStart: async () => false
    };

let appData = {
  items: [],
  settings: {
    opacity: 0.92,
    reportsDir: 'C:\\Users\\mouph\\Desktop\\Daily Reports\\reports',
    noticeUrl: 'https://sco.skku.edu/sco/community/notice.do',
    email: 'mouphero411@gmail.com',
    appPassword: '',
    seenNoticeIds: []
  }
};

let activeTag = 'all';
let activeStudyWeek = 'all';
let isMiniMode = false;
let isWeeklyMode = false;
let draggedTodoId = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = '';
let isCalWeeklyMode = false;

const $ = (id) => document.getElementById(id);

function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatToday() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${m}.${d} (${weekdays[now.getDay()]})`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const undoStack = [];
const redoStack = [];
let lastCommittedSnapshot = '';
let isRestoringHistory = false;

function showUndoToast(msg) {
  const existing = document.querySelector('.undo-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1200);
}

async function persistData() {
  const snap = JSON.stringify(appData);
  if (!isRestoringHistory && lastCommittedSnapshot && snap !== lastCommittedSnapshot) {
    undoStack.push(lastCommittedSnapshot);
    if (undoStack.length > 30) undoStack.shift();
    redoStack.length = 0;
  }
  lastCommittedSnapshot = snap;
  await api.saveData(appData);
}

function applyOpacity(val) {
  $('widgetShell').style.opacity = 1;
  const pctText = `${Math.round(val * 100)}%`;
  $('opacityVal').textContent = pctText;
  if ($('opacityRange')) $('opacityRange').value = val;
  if ($('footerOpacityVal')) $('footerOpacityVal').textContent = pctText;
  if ($('footerOpacityRange')) $('footerOpacityRange').value = val;
  try {
    api.setOpacity(val);
  } catch {}
}

function getCategories() {
  return Array.isArray(appData.settings.categories) && appData.settings.categories.length > 0
    ? appData.settings.categories
    : [
        { id: 'cat-study', name: '학업', color: '#34D399', keywords: ['과제', '시험', '수업', '강의', '미팅', '캡스톤', '연구', '발표', '논문', '공부'] },
        { id: 'cat-scaa', name: 'SCAA', color: '#4361EE', keywords: ['SCAA', '성균웹진', '웹진'] }
      ];
}

function getCategoryByName(name) {
  const found = getCategories().find((c) => c.name === name);
  if (found) return found;
  if (name === '일반') return { id: 'cat-general', name: '일반', color: '#8E94A0', keywords: [] };
  return null;
}

function detectCategory(text, explicitTag) {
  if (explicitTag) return explicitTag;
  const lower = text.toLowerCase();
  const cats = getCategories();
  for (const cat of cats) {
    if (lower.includes(cat.name.toLowerCase())) return cat.name;
    if (Array.isArray(cat.keywords)) {
      for (const kw of cat.keywords) {
        if (kw && lower.includes(kw.trim().toLowerCase())) {
          return cat.name;
        }
      }
    }
  }
  return '일반';
}

function renderTodoTagSelect() {
  const sel = $('todoTagSelect');
  if (!sel) return;
  const prev = sel.value;
  const cats = getCategories();
  sel.innerHTML = '<option value="">자동</option><option value="__none__">없음</option>';
  cats.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.name;
    opt.textContent = cat.name;
    sel.appendChild(opt);
  });
  if (!cats.some((c) => c.name === '일반')) {
    const opt = document.createElement('option');
    opt.value = '일반';
    opt.textContent = '일반';
    sel.appendChild(opt);
  }
  if (prev && Array.from(sel.options).some((o) => o.value === prev)) {
    sel.value = prev;
  }
}

function renderTagFilters() {
  const container = $('tagFilters');
  const cats = getCategories();
  container.innerHTML = '';
  renderTodoTagSelect();

  const allChip = document.createElement('button');
  allChip.className = `chip ${activeTag === 'all' ? 'active' : ''}`;
  allChip.textContent = '전체';
  allChip.onclick = () => {
    activeTag = 'all';
    renderTagFilters();
    renderTodos();
  };
  container.appendChild(allChip);

  cats.forEach((cat) => {
    const chip = document.createElement('button');
    chip.className = `chip ${activeTag === cat.name ? 'active' : ''}`;
    chip.innerHTML = `<span class="cat-dot" style="display:inline-block;margin-right:4px;background:${escapeHtml(cat.color)}"></span>${escapeHtml(cat.name)}`;
    chip.onclick = () => {
      activeTag = cat.name;
      renderTagFilters();
      renderTodos();
    };
    container.appendChild(chip);
  });
}

function renderCategorySettings() {
  const list = $('catSettingsList');
  const cats = getCategories();
  appData.settings.categories = cats;
  list.innerHTML = '';
  cats.forEach((cat, idx) => {
    const li = document.createElement('li');
    li.className = 'cat-setting-item';
    li.innerHTML = `
      <input type="color" class="cat-edit-color" value="${escapeHtml(cat.color)}" title="색상 변경" />
      <input type="text" class="cat-edit-name" value="${escapeHtml(cat.name)}" placeholder="이름" />
      <input type="text" class="cat-edit-kw" value="${escapeHtml((cat.keywords || []).join(', '))}" placeholder="키워드 (쉼표)" />
      <button type="button" class="cat-del-btn" title="삭제">×</button>
    `;

    const colorInput = li.querySelector('.cat-edit-color');
    const nameInput = li.querySelector('.cat-edit-name');
    const kwInput = li.querySelector('.cat-edit-kw');

    colorInput.addEventListener('input', (e) => {
      cat.color = e.target.value;
      renderTagFilters();
      renderTodos();
    });

    nameInput.addEventListener('input', (e) => {
      const oldName = cat.name;
      const newName = e.target.value.trim();
      if (!newName) return;
      cat.name = newName;
      appData.items.forEach((item) => {
        if (item.tag === oldName) item.tag = newName;
      });
      if (activeTag === oldName) activeTag = newName;
      renderTagFilters();
      renderTodos();
    });

    kwInput.addEventListener('input', (e) => {
      cat.keywords = e.target.value
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    });

    li.querySelector('.cat-del-btn').onclick = () => {
      appData.settings.categories.splice(idx, 1);
      renderCategorySettings();
      renderTagFilters();
      renderTodos();
    };
    list.appendChild(li);
  });
}

// --- Tab 1: To-Do & Schedule ---
function parseQuickInput(raw) {
  let text = raw.trim();
  let time = '';
  let explicitTag = '';

  const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);
  if (timeMatch) {
    time = timeMatch[1];
  }

  const tagMatch = text.match(/#([가-힣a-zA-Z0-9_]+)/);
  if (tagMatch) {
    explicitTag = tagMatch[1];
    text = text.replace(tagMatch[0], '').trim();
  }

  const cleanText = text || raw.trim();
  const tag = detectCategory(cleanText, explicitTag);
  return { text: cleanText, time, tag };
}

function addDaysToDateStr(dateStr, days) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  if (isNaN(base.getTime())) return getTodayDateString();
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDueInfo(dueDateStr) {
  if (!dueDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dueDateStr}T00:00:00`);
  if (isNaN(target.getTime())) return null;
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `D+${Math.abs(diffDays)} 지남`, cls: 'pill-priority-high', urgent: true, diffDays };
  if (diffDays === 0) return { label: 'D-Day', cls: 'pill-priority-high', urgent: true, diffDays };
  if (diffDays <= 2) return { label: `D-${diffDays}`, cls: 'pill-time', urgent: true, diffDays };
  return { label: `D-${diffDays}`, cls: 'pill-pinned', urgent: false, diffDays };
}

function createTodoListItem(item, rerender) {
  const isSummaryMode = Boolean(appData?.settings?.todoSummaryMode);
  const li = document.createElement('li');
  li.className = `card-item ${item.done ? 'done compact-row' : ''} ${(!item.dueDate || isSummaryMode) ? 'compact-row' : ''} ${item.priority === 'high' ? 'priority-high' : ''}`;
  li.draggable = true;
  li.dataset.todoId = item.id;
  li.addEventListener('dragstart', (e) => {
    draggedTodoId = item.id;
    li.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
    }
  });
  li.addEventListener('dragend', () => {
    draggedTodoId = null;
    li.classList.remove('dragging');
    $('todoList')?.classList.remove('drop-active');
    $('noDueDock')?.classList.remove('drop-active');
  });

  // External file/folder drop onto To-Do item
  li.addEventListener('dragover', (e) => {
    if (draggedTodoId) return;
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      li.classList.add('file-drop-target');
    }
  });
  li.addEventListener('dragleave', (e) => {
    if (!li.contains(e.relatedTarget)) {
      li.classList.remove('file-drop-target');
    }
  });
  li.addEventListener('drop', async (e) => {
    if (draggedTodoId) return;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    li.classList.remove('file-drop-target');
    if (!Array.isArray(item.attachments)) item.attachments = [];
    for (const file of Array.from(files)) {
      const filePath = api.getFilePath ? api.getFilePath(file) : (file.path || '');
      if (!filePath) continue;
      if (!item.attachments.some((a) => a.path === filePath)) {
        item.attachments.push({
          name: file.name || filePath.split(/[\\/]/).pop() || filePath,
          path: filePath
        });
      }
    }
    item._attOpen = true;
    rerender();
    await persistData();
  });
  const cat = getCategoryByName(item.tag);
  const catColor = cat ? cat.color : '#8E94A0';
  li.style.borderLeft = `2px solid ${catColor}`;
  li.style.paddingLeft = '8px';

  const checkBtn = document.createElement('button');
  checkBtn.className = `todo-check ${item.done ? 'checked' : ''}`;
  checkBtn.onclick = async () => {
    const completing = !item.done;
    if (completing) {
      checkBtn.classList.add('checked');
      li.classList.add('completing');
      const colors = [catColor, '#C79B85', '#34D399', '#FBBF24', '#60A5FA', '#F472B6'];
      const cx = checkBtn.offsetLeft + checkBtn.offsetWidth / 2;
      const cy = checkBtn.offsetTop + checkBtn.offsetHeight / 2;
      const ripple = document.createElement('span');
      ripple.className = 'todo-ripple';
      ripple.style.left = `${cx}px`;
      ripple.style.top = `${cy}px`;
      ripple.style.borderColor = catColor;
      li.appendChild(ripple);
      for (let i = 0; i < 8; i++) {
        const spark = document.createElement('span');
        spark.className = 'todo-spark';
        const angle = (Math.PI * 2 * i) / 8 + (Math.random() * 0.35 - 0.17);
        const dist = 14 + Math.random() * 14;
        spark.style.left = `${cx}px`;
        spark.style.top = `${cy}px`;
        spark.style.background = colors[i % colors.length];
        spark.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
        spark.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
        li.appendChild(spark);
      }
      await new Promise((r) => setTimeout(r, 260));
    }
    if (item.repeat === 'weekly' && !item.done) {
      item.dueDate = addDaysToDateStr(item.dueDate || getTodayDateString(), 7);
      item.done = false;
    } else {
      item.done = !item.done;
    }
    rerender();
    await persistData();
  };

  const content = document.createElement('div');
  content.className = 'card-content';
  const dueInfo = !item.done ? getDueInfo(item.dueDate) : null;
  if (item.done || isSummaryMode) {
    const priBadge = (!item.done && isSummaryMode && item.priority === 'high')
      ? '<span class="todo-summary-priority">중요</span>'
      : '';
    const dueBadge = (!item.done && isSummaryMode && dueInfo)
      ? `<span class="todo-summary-due${dueInfo.urgent ? ' urgent' : ''}">${escapeHtml(dueInfo.label)}</span>`
      : '';
    const rightBadges = (priBadge || dueBadge) ? `<span style="display:inline-flex;align-items:center;flex-shrink:0;">${priBadge}${dueBadge}</span>` : '';
    content.innerHTML = `<div class="card-title">${escapeHtml(item.text)}</div>${rightBadges}`;
  } else if (!item.dueDate) {
    content.innerHTML = `
      <div class="card-title">${escapeHtml(item.text)}</div>
      ${item.tag ? `<span class="compact-cat-label" style="color:${escapeHtml(catColor)}">${escapeHtml(item.tag)}</span>` : ''}
    `;
  } else {
    const metaParts = [];
    if (item.repeat === 'weekly') metaParts.push('<span style="color:var(--text-secondary)">매주</span>');
    if (dueInfo) {
      const dueColor = dueInfo.urgent ? 'var(--rose)' : 'var(--text-secondary)';
      metaParts.push(`<span style="color:var(--text-secondary)">${escapeHtml(formatShortDate(item.dueDate))}</span>`);
      metaParts.push(`<span style="color:${dueColor};font-weight:${dueInfo.diffDays === 0 ? '600' : '500'}">${escapeHtml(dueInfo.label)}</span>`);
    }
    if (item.time) metaParts.push(`<span style="color:var(--amber)">${escapeHtml(item.time)}</span>`);
    if (item.tag) metaParts.push(`<span style="color:${escapeHtml(catColor)}">${escapeHtml(item.tag)}</span>`);
    if (item.priority === 'high') metaParts.push('<span style="color:var(--rose)">중요</span>');

    content.innerHTML = `
      <div class="card-title">${escapeHtml(item.text)}</div>
      ${metaParts.length ? `<div class="card-meta">${metaParts.join(' · ')}</div>` : ''}
    `;
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'edit-btn';
  editBtn.title = '수정';
  editBtn.textContent = '✎';
  editBtn.onclick = () => {
    const existing = content.querySelector('.inline-edit');
    if (existing) {
      existing.remove();
      return;
    }
    const cats = getCategories();
    const tagList = cats.some((c) => c.name === '일반')
      ? cats
      : [...cats, { name: '일반' }];
    const tagOpts = ['<option value="">없음</option>']
      .concat(
        tagList.map(
          (c) =>
            `<option value="${escapeHtml(c.name)}" ${item.tag === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
        )
      )
      .join('');

    const box = document.createElement('div');
    box.className = 'inline-edit';
    box.innerHTML = `
      <input type="text" class="edit-text" value="${escapeHtml(item.text)}" placeholder="할 일 내용" />
      <div class="inline-edit-row">
        <input type="date" class="edit-date" value="${escapeHtml(item.dueDate || '')}" />
        <button type="button" class="clear-edit-date">기한없음</button>
        <select class="edit-tag">${tagOpts}</select>
        <select class="edit-priority">
          <option value="medium" ${item.priority === 'medium' ? 'selected' : ''}>보통</option>
          <option value="high" ${item.priority === 'high' ? 'selected' : ''}>중요</option>
          <option value="low" ${item.priority === 'low' ? 'selected' : ''}>여유</option>
        </select>
        <button type="button" class="toggle-edit-weekly ${item.repeat === 'weekly' ? 'active' : ''}" style="${item.repeat === 'weekly' ? 'border-color:var(--accent);color:var(--accent);' : ''}">매주</button>
      </div>
      <div class="inline-edit-row">
        <button type="button" class="save-edit">저장</button>
        <button type="button" class="cancel-edit">취소</button>
      </div>
    `;

    let editWeekly = item.repeat === 'weekly';
    const weeklyBtn = box.querySelector('.toggle-edit-weekly');
    weeklyBtn.onclick = () => {
      editWeekly = !editWeekly;
      weeklyBtn.classList.toggle('active', editWeekly);
      weeklyBtn.style.borderColor = editWeekly ? 'var(--accent)' : '';
      weeklyBtn.style.color = editWeekly ? 'var(--accent)' : '';
    };
    box.querySelector('.clear-edit-date').onclick = () => {
      box.querySelector('.edit-date').value = '';
    };
    box.querySelector('.cancel-edit').onclick = () => box.remove();
    box.querySelector('.save-edit').onclick = async () => {
      const nextText = box.querySelector('.edit-text').value.trim();
      if (!nextText) return;
      item.text = nextText;
      item.dueDate = box.querySelector('.edit-date').value || '';
      item.tag = box.querySelector('.edit-tag').value;
      item.priority = box.querySelector('.edit-priority').value;
      item.repeat = editWeekly ? 'weekly' : 'none';
      rerender();
      await persistData();
    };
    content.appendChild(box);
    box.querySelector('.edit-text').focus();
  };

  const delBtn = document.createElement('button');
  delBtn.className = 'del-btn';
  delBtn.textContent = '×';
  delBtn.onclick = async () => {
    if (item.done) {
      appData.items = appData.items.filter((t) => t.id !== item.id);
      rerender();
      await persistData();
      return;
    }
    if (content.querySelector('.inline-confirm')) return;
    const box = document.createElement('div');
    box.className = 'inline-confirm';
    box.innerHTML = `
      <span>아직 완료되지 않았습니다. 삭제할까요?</span>
      <button type="button" class="confirm-del">삭제</button>
      <button type="button" class="cancel-del">취소</button>
    `;
    box.querySelector('.confirm-del').onclick = async () => {
      appData.items = appData.items.filter((t) => t.id !== item.id);
      rerender();
      await persistData();
    };
    box.querySelector('.cancel-del').onclick = () => box.remove();
    content.appendChild(box);
  };

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  if (!item.done) {
    actions.append(editBtn, delBtn);
  } else {
    actions.append(delBtn);
  }

  li.append(checkBtn, content, actions);

  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  if (attachments.length > 0) {
    li.classList.add('has-attachments');
    const titleEl = content.querySelector('.card-title');
    if (titleEl) {
      const attBadge = document.createElement('span');
      attBadge.className = 'todo-att-pill';
      attBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><span>${attachments.length}</span>`;
      titleEl.appendChild(attBadge);
    }

    const attDrawer = document.createElement('div');
    attDrawer.className = `todo-attachments${item._attOpen ? '' : ' hidden'}`;
    attachments.forEach((att) => {
      const chip = document.createElement('div');
      chip.className = 'todo-att-chip';
      chip.title = att.path;
      chip.innerHTML = `<span class="todo-att-name">${escapeHtml(att.name)}</span><button type="button" class="todo-att-del" title="연결 해제">×</button>`;
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.todo-att-del')) return;
        e.stopPropagation();
        api.openPath(att.path);
      });
      chip.querySelector('.todo-att-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        item.attachments = item.attachments.filter((a) => a.path !== att.path);
        rerender();
        await persistData();
      });
      attDrawer.appendChild(chip);
    });
    li.appendChild(attDrawer);

    content.style.cursor = 'pointer';
    content.addEventListener('click', (e) => {
      if (e.target.closest('.inline-edit, .delete-confirm, button, input, select')) return;
      item._attOpen = !item._attOpen;
      attDrawer.classList.toggle('hidden', !item._attOpen);
    });
  }

  return li;
}

let was100Pct = false;
let celebrationBorderTimer = null;

function launchCelebrationBurst() {
  const w = window.innerWidth || 376;
  const h = window.innerHeight || 720;
  const colors = ['#ff6b6b', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#ffffff'];
  const rockets = [];
  for (let i = 0; i < 16; i++) {
    const sx = w * (0.1 + Math.random() * 0.8);
    const tx = sx + (Math.random() * 70 - 35);
    const ty = h * (0.12 + Math.random() * 0.44);
    const dur = 300 + Math.round(Math.random() * 90);
    const delay = i * 50 + Math.round(Math.random() * 25);
    rockets.push({ delay, sx, tx, ty, dur });
  }
  // Dense finale salvo around ~0.95s
  [0.18, 0.34, 0.5, 0.66, 0.82, 0.26, 0.74].forEach((xFrac, idx) => {
    rockets.push({
      delay: 950 + idx * 35,
      sx: w * xFrac,
      tx: w * xFrac,
      ty: h * (0.15 + (idx % 2) * 0.12),
      dur: 340
    });
  });

  rockets.forEach((r, rIdx) => {
    setTimeout(() => {
      const rocket = document.createElement('span');
      rocket.className = 'firework-rocket';
      const color = colors[rIdx % colors.length];
      rocket.style.left = `${r.sx}px`;
      rocket.style.top = `${h + 10}px`;
      rocket.style.color = color;
      rocket.style.background = color;
      rocket.style.setProperty('--dur', `${r.dur}ms`);
      rocket.style.setProperty('--rx', `${r.tx - r.sx}px`);
      rocket.style.setProperty('--ry', `${r.ty - (h + 10)}px`);
      document.body.appendChild(rocket);
      setTimeout(() => rocket.remove(), r.dur + 40);

      setTimeout(() => {
        for (let i = 0; i < 48; i++) {
          const p = document.createElement('span');
          p.className = 'celebration-confetti';
          const angle = (Math.PI * 2 * i) / 48 + (Math.random() * 0.25 - 0.12);
          const dist = 55 + Math.random() * 195;
          const size = 4 + Math.random() * 5.5;
          p.style.left = `${r.tx}px`;
          p.style.top = `${r.ty}px`;
          p.style.width = `${size}px`;
          p.style.height = `${Math.random() > 0.5 ? size * 0.6 : size}px`;
          p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
          p.style.background = colors[(i + rIdx) % colors.length];
          p.style.animationDuration = `${0.8 + Math.random() * 0.5}s`;
          p.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
          p.style.setProperty('--ty', `${Math.sin(angle) * dist + 75}px`);
          p.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
          document.body.appendChild(p);
          setTimeout(() => p.remove(), 1400);
        }
      }, r.dur);
    }, r.delay);
  });
}

function getEndOfThisWeekDateStr() {
  const now = new Date();
  const dow = now.getDay(); // 0 = Sunday, 1 = Monday ... 6 = Saturday
  const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
  return addDaysToDateStr(getTodayDateString(), daysUntilSunday);
}

function renderTodos() {
  const list = $('todoList');
  const noDueDock = $('noDueDock');
  const noDueList = $('noDueList');

  // Auto-remove past-due items (keep through D-Day; remove starting next day)
  const beforeLen = appData.items.length;
  appData.items = appData.items.filter((i) => {
    if (!i.dueDate) return true;
    const info = getDueInfo(i.dueDate);
    return !info || info.diffDays >= 0;
  });
  if (appData.items.length !== beforeLen) {
    persistData();
  }

  const weekEndStr = getEndOfThisWeekDateStr();
  const isThisWeekTodo = (i) => Boolean(i.dueDate) && !i.later && i.dueDate <= weekEndStr;
  const isFutureDatedTodo = (i) => Boolean(i.dueDate) && !i.later && i.dueDate > weekEndStr;

  const scheduledItems = appData.items.filter(isThisWeekTodo);
  const total = scheduledItems.length;
  const doneCount = scheduledItems.filter((i) => i.done).length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  $('progressLabel').textContent = `이번 주 할 일 (${doneCount}/${total})`;
  $('progressPct').textContent = `${pct}%`;
  $('progressFill').style.width = `${pct}%`;

  const is100 = total > 0 && pct === 100;
  $('progressFill').classList.toggle('complete-100', is100);
  $('progressPct').classList.toggle('complete-100', is100);
  if (is100 && !was100Pct) {
    launchCelebrationBurst($('progressPct'));
    const shell = $('widgetShell');
    if (shell) {
      shell.classList.add('celebrating');
      if (celebrationBorderTimer) clearTimeout(celebrationBorderTimer);
      celebrationBorderTimer = setTimeout(() => {
        shell.classList.remove('celebrating');
      }, 3800);
    }
  } else if (!is100) {
    if (celebrationBorderTimer) clearTimeout(celebrationBorderTimer);
    $('widgetShell')?.classList.remove('celebrating');
  }
  was100Pct = is100;

  const urgentItems = appData.items.filter((i) => !i.done && isThisWeekTodo(i) && getDueInfo(i.dueDate)?.urgent);
  if (urgentItems.length > 0) {
    $('progressLabel').textContent = `이번 주 할 일 (${doneCount}/${total}) · 임박 ${urgentItems.length}`;
  }

  const filtered = appData.items
    .filter((item) => (activeTag === 'all' ? true : item.tag === activeTag))
    .slice()
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const da = getDueInfo(a.dueDate)?.diffDays ?? 9999;
      const db = getDueInfo(b.dueDate)?.diffDays ?? 9999;
      if (da !== db) return da - db;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  const dueItems = filtered.filter(isThisWeekTodo);
  const futureDatedItems = filtered.filter(isFutureDatedTodo);
  const noDueItems = filtered.filter((item) => !item.dueDate || Boolean(item.later));

  list.innerHTML = '';
  if (dueItems.length === 0 && futureDatedItems.length === 0) {
    list.innerHTML = '<li class="empty-state">등록된 할 일이 없습니다.<br/>아래 + 버튼으로 할 일을 추가해 보세요.</li>';
  } else {
    dueItems.forEach((item) => list.appendChild(createTodoListItem(item, renderTodos)));
    if (futureDatedItems.length > 0) {
      const sep = document.createElement('li');
      sep.className = 'todo-week-divider';
      list.appendChild(sep);
      futureDatedItems.forEach((item) => list.appendChild(createTodoListItem(item, renderTodos)));
    }
  }

  noDueDock.classList.remove('hidden');
  noDueList.innerHTML = '';
  noDueItems.forEach((item) => noDueList.appendChild(createTodoListItem(item, renderTodos)));

  renderCalendar();
}

function matchesCalendarEventDate(ev, dateStr, dow) {
  if (!ev || !ev.date) return false;
  if (Array.isArray(ev.excludedDates) && ev.excludedDates.includes(dateStr)) return false;
  if (ev.date === dateStr) return true;
  if (ev.repeat === 'weekly' && dateStr >= ev.date) {
    if (ev.repeatUntil && dateStr > ev.repeatUntil) return false;
    const evDow = new Date(`${ev.date}T00:00:00`).getDay();
    return evDow === dow;
  }
  return false;
}

// --- Tab 2: Independent Calendar ---
function renderCalendar() {
  const grid = $('calGrid');
  const label = $('calMonthLabel');
  if (!grid || !label) return;

  if (!calSelectedDate) calSelectedDate = getTodayDateString();
  const todayStr = getTodayDateString();
  label.textContent = `${calYear}년 ${calMonth + 1}월`;

  const events = Array.isArray(appData.calendarEvents) ? appData.calendarEvents : [];
  const exams = Array.isArray(appData.studyExams) ? appData.studyExams : [];

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = (firstDay + d - 1) % 7;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell';
    if (dow === 0) cell.classList.add('sun');
    if (dow === 6) cell.classList.add('sat');
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === calSelectedDate) cell.classList.add('selected');

    const dayEvents = events.filter((ev) => matchesCalendarEventDate(ev, dateStr, dow));
    const dayExams = exams.filter((ex) => ex.date === dateStr);
    const dayTodos = appData.items.filter((t) => t.dueDate === dateStr);
    const combined = [
      ...dayEvents.map((ev) => ({ kind: 'event', text: ev.title, done: false, color: '' })),
      ...dayExams.map((ex) => ({ kind: 'exam', text: ex.title, done: false, color: '' })),
      ...dayTodos.map((t) => ({
        kind: 'todo',
        text: t.text,
        done: Boolean(t.done),
        color: getCategoryByName(t.tag)?.color || '#C79B85'
      }))
    ];

    const top = document.createElement('div');
    top.className = 'cal-cell-top';
    const num = document.createElement('span');
    num.className = 'cal-day-num';
    num.textContent = String(d);
    top.appendChild(num);
    if (combined.length > 2) {
      const more = document.createElement('span');
      more.className = 'cal-more-count';
      more.textContent = `+${combined.length - 2}`;
      top.appendChild(more);
    }
    cell.appendChild(top);

    if (combined.length > 0) {
      cell.title = combined.map((c) => c.text).join('\n');
      const miniList = document.createElement('div');
      miniList.className = 'cal-mini-list';
      combined.slice(0, 2).forEach((entry) => {
        const chip = document.createElement('div');
        chip.className = `cal-mini-chip ${entry.kind}${entry.done ? ' done' : ''}`;
        if (entry.color) {
          chip.style.color = entry.color;
          chip.style.background = `color-mix(in srgb, ${entry.color} 18%, transparent)`;
        }
        chip.textContent = entry.text;
        miniList.appendChild(chip);
      });
      cell.appendChild(miniList);
    }

    cell.addEventListener('click', () => {
      calSelectedDate = dateStr;
      renderCalendar();
    });
    grid.appendChild(cell);
  }

  renderCalendarAgenda();
  renderHomeOverview();
}

function renderHomeOverview() {
  const strip = $('homeWeekStrip');
  const examStrip = $('homeExamStrip');
  const list = $('homeAgendaList');
  if (!strip || !list) return;

  const todayStr = getTodayDateString();
  const endStr = addDaysToDateStr(todayStr, 7);
  const events = Array.isArray(appData.calendarEvents) ? appData.calendarEvents : [];
  const exams = Array.isArray(appData.studyExams) ? appData.studyExams : [];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  strip.innerHTML = '';
  let totalCount = 0;
  const grouped = [];

  for (let offset = 0; offset <= 7; offset++) {
    const dateStr = addDaysToDateStr(todayStr, offset);
    const dObj = new Date(`${dateStr}T00:00:00`);
    const dow = dObj.getDay();
    const dayTodos = appData.items.filter((t) => !t.done && t.dueDate === dateStr);
    const dayEvents = events.filter((ev) => matchesCalendarEventDate(ev, dateStr, dow));
    const dayExams = exams.filter((ex) => ex.date === dateStr);

    if (offset < 7) {
      const pill = document.createElement('div');
      pill.className = `home-day-pill${offset === 0 ? ' today' : ''}`;
      const dotsHtml = [
        dayExams.length ? '<span class="cal-dot exam"></span>' : '',
        dayEvents.length ? '<span class="cal-dot event"></span>' : '',
        dayTodos.length ? '<span class="cal-dot todo"></span>' : ''
      ].join('');
      pill.innerHTML = `
        <span>${dayNames[dow]}</span>
        <span class="home-day-num">${dObj.getDate()}</span>
        <div class="home-day-dots">${dotsHtml}</div>
      `;
      strip.appendChild(pill);
    }

    if (dayTodos.length || dayEvents.length || dayExams.length) {
      totalCount += dayTodos.length + dayEvents.length + dayExams.length;
      const label = offset === 0 ? '오늘' : offset === 1 ? '내일' : formatShortDate(dateStr);
      grouped.push({ dateStr, label, dayTodos, dayEvents, dayExams });
    }
  }

  const upcomingExams = exams
    .map((ex) => ({ ex, due: getDueInfo(ex.date) }))
    .filter((x) => x.due && x.due.diffDays >= 0 && x.due.diffDays <= 14)
    .sort((a, b) => a.due.diffDays - b.due.diffDays);

  if (examStrip) {
    examStrip.innerHTML = '';
    if (upcomingExams.length > 0) {
      examStrip.classList.remove('hidden');
      upcomingExams.forEach(({ ex, due }) => {
        const chip = document.createElement('span');
        chip.className = 'home-exam-chip';
        chip.textContent = `${ex.title} ${due.label}`;
        examStrip.appendChild(chip);
      });
    } else {
      examStrip.classList.add('hidden');
    }
  }

  list.innerHTML = '';
  if (grouped.length === 0) {
    list.innerHTML = '<li class="empty-state">앞으로 7일 내 예정된 할 일이나 일정이 없습니다.</li>';
    return;
  }

  grouped.forEach(({ label, dayTodos, dayEvents, dayExams }) => {
    const hdr = document.createElement('li');
    hdr.className = 'home-date-label';
    hdr.textContent = label;
    list.appendChild(hdr);

    dayExams.forEach((ex) => {
      const li = document.createElement('li');
      li.className = 'card-item compact-row';
      li.style.borderLeft = '2px solid #E06C75';
      li.style.paddingLeft = '8px';
      li.innerHTML = `<div class="card-content"><span class="cal-badge" style="color:#E06C75;background:rgba(224,108,117,0.18);">시험</span><div class="card-title">${escapeHtml(ex.title)}</div></div>`;
      list.appendChild(li);
    });

    dayEvents.forEach((ev) => {
      const li = document.createElement('li');
      li.className = 'card-item compact-row';
      li.innerHTML = `<div class="card-content"><span class="cal-badge event">${escapeHtml(ev.time || '일정')}</span><div class="card-title">${escapeHtml(ev.title)}</div></div>`;
      list.appendChild(li);
    });

    dayTodos.forEach((t) => {
      const catColor = getCategoryByName(t.tag)?.color || '#C79B85';
      const li = document.createElement('li');
      li.className = 'card-item compact-row';
      li.style.borderLeft = `2px solid ${catColor}`;
      li.style.paddingLeft = '8px';
      const checkBtn = document.createElement('button');
      checkBtn.className = 'todo-check';
      checkBtn.onclick = async () => {
        t.done = true;
        renderTodos();
        await persistData();
      };
      const content = document.createElement('div');
      content.className = 'card-content';
      content.innerHTML = `<div class="card-title">${escapeHtml(t.text)}</div>${t.tag ? `<span class="compact-cat-label" style="color:${escapeHtml(catColor)}">${escapeHtml(t.tag)}</span>` : ''}`;
      li.append(checkBtn, content);
      list.appendChild(li);
    });
  });
}

function renderCalendarAgenda() {
  const list = $('calAgendaList');
  const selLabel = $('calSelectedLabel');
  if (!list || !selLabel) return;
  if (!calSelectedDate) calSelectedDate = getTodayDateString();

  const [, m, d] = calSelectedDate.split('-');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = dayNames[new Date(`${calSelectedDate}T00:00:00`).getDay()];
  selLabel.textContent = `${Number(m)}월 ${Number(d)}일 (${dow}) 일정`;

  const dayEvents = (Array.isArray(appData.calendarEvents) ? appData.calendarEvents : [])
    .filter((ev) => matchesCalendarEventDate(ev, calSelectedDate, new Date(`${calSelectedDate}T00:00:00`).getDay()))
    .slice()
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  const dayTodos = appData.items.filter((t) => t.dueDate === calSelectedDate);
  const dayExams = (Array.isArray(appData.studyExams) ? appData.studyExams : []).filter((ex) => ex.date === calSelectedDate);

  list.innerHTML = '';
  if (dayEvents.length === 0 && dayTodos.length === 0 && dayExams.length === 0) {
    list.innerHTML = '<li class="empty-state">등록된 일정이 없습니다.</li>';
    return;
  }

  dayEvents.forEach((ev) => {
    const li = document.createElement('li');
    li.className = 'card-item compact-row';
    const badgeText = ev.repeat === 'weekly'
      ? (ev.time ? `매주 ${ev.time}` : '매주')
      : (ev.time || '일정');
    li.innerHTML = `
      <div class="card-content">
        <div class="card-title"><span class="cal-badge event">${escapeHtml(badgeText)}</span>${escapeHtml(ev.title)}</div>
      </div>
      <div class="card-actions">
        <button class="del-btn" title="삭제">×</button>
      </div>
    `;
    li.querySelector('.del-btn').onclick = async () => {
      if (ev.repeat === 'weekly') {
        const existing = li.querySelector('.cal-delete-confirm');
        if (existing) {
          existing.remove();
          li.classList.remove('has-confirm');
          return;
        }
        li.classList.add('has-confirm');
        const box = document.createElement('div');
        box.className = 'cal-delete-confirm';
        box.innerHTML = `
          <span>반복 삭제:</span>
          <button type="button" class="ghost-btn del-one">이번만</button>
          <button type="button" class="ghost-btn del-after">이후 모두</button>
          <button type="button" class="confirm-del del-all">전체</button>
          <button type="button" class="cancel-del">취소</button>
        `;
        box.querySelector('.del-one').onclick = async () => {
          if (!Array.isArray(ev.excludedDates)) ev.excludedDates = [];
          if (!ev.excludedDates.includes(calSelectedDate)) ev.excludedDates.push(calSelectedDate);
          renderCalendar();
          await persistData();
        };
        box.querySelector('.del-after').onclick = async () => {
          const prevDay = addDaysToDateStr(calSelectedDate, -1);
          if (prevDay < ev.date) {
            appData.calendarEvents = (appData.calendarEvents || []).filter((x) => x.id !== ev.id);
          } else {
            ev.repeatUntil = prevDay;
          }
          renderCalendar();
          await persistData();
        };
        box.querySelector('.del-all').onclick = async () => {
          appData.calendarEvents = (appData.calendarEvents || []).filter((x) => x.id !== ev.id);
          renderCalendar();
          await persistData();
        };
        box.querySelector('.cancel-del').onclick = () => {
          box.remove();
          li.classList.remove('has-confirm');
        };
        li.appendChild(box);
        return;
      }
      appData.calendarEvents = (appData.calendarEvents || []).filter((x) => x.id !== ev.id);
      renderCalendar();
      await persistData();
    };
    list.appendChild(li);
  });

  dayExams.forEach((ex) => {
    const li = document.createElement('li');
    li.className = 'card-item compact-row';
    li.style.borderLeft = '2px solid #E06C75';
    li.style.paddingLeft = '8px';
    li.innerHTML = `
      <div class="card-content">
        <span class="cal-badge" style="color:#E06C75; background:rgba(224,108,117,0.18);">시험</span>
        <div class="card-title">${escapeHtml(ex.title)}</div>
      </div>
    `;
    list.appendChild(li);
  });

  dayTodos.forEach((t) => {
    const catColor = getCategoryByName(t.tag)?.color || '#C79B85';
    const li = document.createElement('li');
    li.className = `card-item compact-row ${t.done ? 'done' : ''}`;
    li.style.borderLeft = `2px solid ${catColor}`;
    li.style.paddingLeft = '8px';
    li.innerHTML = `
      <div class="card-content">
        <span class="cal-badge" style="color:${escapeHtml(catColor)}; background:color-mix(in srgb, ${escapeHtml(catColor)} 18%, transparent);">${t.tag ? escapeHtml(t.tag) : '할 일'}</span>
        <div class="card-title">${escapeHtml(t.text)}</div>
      </div>
    `;
    list.appendChild(li);
  });
}

// --- Header Independent D-Day ---
function getHeaderDdays() {
  if (!Array.isArray(appData.headerDdays)) {
    appData.headerDdays = [];
    if (appData.headerDday && (appData.headerDday.title || appData.headerDday.date)) {
      const migratedId = String(Date.now());
      appData.headerDdays.push({
        id: migratedId,
        title: appData.headerDday.title || '',
        date: appData.headerDday.date || ''
      });
      appData.activeHeaderDdayId = migratedId;
    }
  }
  return appData.headerDdays;
}

function renderHeaderDday() {
  const list = getHeaderDdays();
  const pill = $('headerDdayPill');
  let active = list.find((d) => d.id === appData.activeHeaderDdayId);
  if (!active && list.length > 0) {
    const upcoming = list
      .map((d) => ({ d, due: getDueInfo(d.date) }))
      .filter((x) => x.due && x.due.diffDays >= 0)
      .sort((a, b) => a.due.diffDays - b.due.diffDays);
    active = upcoming[0]?.d || list[0];
    appData.activeHeaderDdayId = active.id;
  }

  const due = active ? getDueInfo(active.date) : null;
  if (active && due && (active.title || active.date)) {
    pill.textContent = active.title ? `${active.title} ${due.label}` : due.label;
    pill.classList.add('has-value');
  } else {
    pill.textContent = '+ D-Day';
    pill.classList.remove('has-value');
  }

  renderHeaderDdayList();
}

function renderHeaderDdayList() {
  const ul = $('headerDdayList');
  if (!ul) return;
  const list = getHeaderDdays();
  ul.innerHTML = '';
  if (list.length === 0) {
    ul.innerHTML = '<li class="dday-list-item" style="justify-content:center;color:var(--text-muted);cursor:default;">등록된 디데이가 없습니다.</li>';
    return;
  }

  list.forEach((d) => {
    const due = getDueInfo(d.date);
    const li = document.createElement('li');
    li.className = `dday-list-item ${d.id === appData.activeHeaderDdayId ? 'active' : ''}`;
    li.innerHTML = `
      <div class="dday-list-info">
        <span class="dday-list-badge">${due ? escapeHtml(due.label) : escapeHtml(d.date)}</span>
        <span class="dday-list-title">${escapeHtml(d.title || '목표')}</span>
        ${d.date ? `<span class="dday-list-date">${escapeHtml(formatShortDate(d.date))}</span>` : ''}
      </div>
      <button type="button" class="del-btn" style="opacity:1;" title="삭제">×</button>
    `;
    li.addEventListener('click', async (e) => {
      if (e.target.closest('.del-btn')) return;
      appData.activeHeaderDdayId = d.id;
      renderHeaderDday();
      $('ddayPopover').classList.add('hidden');
      await persistData();
    });
    li.querySelector('.del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      appData.headerDdays = getHeaderDdays().filter((x) => x.id !== d.id);
      if (appData.activeHeaderDdayId === d.id) {
        appData.activeHeaderDdayId = appData.headerDdays[0]?.id || '';
      }
      renderHeaderDday();
      await persistData();
    });
    ul.appendChild(li);
  });
}

// --- Tab 1.5: Study & Exam Planner ---
function getStudyExams() {
  if (!Array.isArray(appData.studyExams)) {
    appData.studyExams = [];
    if (appData.studyExam && appData.studyExam.date) {
      appData.studyExams.push({
        id: String(Date.now()),
        title: appData.studyExam.title || '시험',
        date: appData.studyExam.date
      });
    }
  }
  return appData.studyExams;
}

function formatShortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
}

function renderExamCard() {
  const exams = [...getStudyExams()].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  $('examDateInput').value = $('examDateInput').value || getTodayDateString();

  const upcoming = exams
    .map((ex) => ({ ex, due: getDueInfo(ex.date) }))
    .filter((x) => x.due && x.due.diffDays >= 0);

  if (upcoming.length > 0) {
    const first = upcoming[0];
    $('examDdayDisplay').textContent = `${first.ex.title} ${first.due.label}`;
  } else if (exams.length > 0) {
    $('examDdayDisplay').textContent = `${exams.length}개 등록`;
  } else {
    $('examDdayDisplay').textContent = '등록된 시험 없음';
  }

  const list = $('examList');
  if (!list) return;
  list.innerHTML = '';
  exams.forEach((ex) => {
    const due = getDueInfo(ex.date);
    const li = document.createElement('li');
    li.className = 'exam-list-item';
    li.innerHTML = `
      <div class="exam-item-left">
        <span class="exam-item-title">${escapeHtml(ex.title)}</span>
        <span class="exam-item-date">${escapeHtml(formatShortDate(ex.date))}</span>
      </div>
      <div class="exam-item-right">
        ${due ? `<span class="exam-item-dday ${due.urgent ? 'urgent' : ''}">${escapeHtml(due.label)}</span>` : ''}
        <button type="button" class="exam-del-btn" title="삭제">×</button>
      </div>
    `;
    li.querySelector('.exam-del-btn').onclick = async () => {
      appData.studyExams = getStudyExams().filter((item) => item.id !== ex.id);
      renderExamCard();
      await persistData();
    };
    list.appendChild(li);
  });
}

function isDailyRoutineDoneToday(plan) {
  if (plan.week !== '매일 루틴') return Boolean(plan.done);
  return plan.lastDoneDate === getTodayDateString();
}

function renderStudyPlans() {
  const list = $('studyList');
  const plans = Array.isArray(appData.studyPlans) ? appData.studyPlans : [];
  const filtered = plans.filter((p) => (activeStudyWeek === 'all' ? true : p.week === activeStudyWeek));

  if (filtered.length === 0) {
    list.innerHTML = '<li class="empty-state">등록된 학습 계획이 없습니다.<br/>일상 루틴이나 주간 공부 목표를 추가해 보세요.</li>';
    return;
  }

  list.innerHTML = '';
  filtered.forEach((plan) => {
    const checked = isDailyRoutineDoneToday(plan);
    const li = document.createElement('li');
    li.className = `card-item ${checked ? 'done' : ''}`;

    const checkBtn = document.createElement('button');
    checkBtn.className = `todo-check ${checked ? 'checked' : ''}`;
    checkBtn.onclick = async () => {
      if (plan.week === '매일 루틴') {
        const today = getTodayDateString();
        if (plan.lastDoneDate === today) {
          plan.lastDoneDate = '';
          plan.streak = Math.max(0, (plan.streak || 1) - 1);
        } else {
          plan.lastDoneDate = today;
          plan.streak = (plan.streak || 0) + 1;
        }
      } else {
        plan.done = !plan.done;
      }
      renderStudyPlans();
      await persistData();
    };

    const content = document.createElement('div');
    content.className = 'card-content';
    const metaParts = [];
    if (plan.subject) metaParts.push(escapeHtml(plan.subject));
    metaParts.push(escapeHtml(plan.week || '이번 주'));
    if (plan.week === '매일 루틴' && plan.streak > 0) {
      metaParts.push(`${plan.streak}회 완료`);
    }

    content.innerHTML = `
      <div class="card-title">${escapeHtml(plan.goal)}</div>
      <div class="card-meta">${metaParts.join(' · ')}</div>
    `;

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.textContent = '×';
    delBtn.onclick = async () => {
      if (checked) {
        appData.studyPlans = appData.studyPlans.filter((p) => p.id !== plan.id);
        renderStudyPlans();
        await persistData();
        return;
      }
      if (content.querySelector('.inline-confirm')) return;
      const box = document.createElement('div');
      box.className = 'inline-confirm';
      box.innerHTML = `
        <span>아직 완료되지 않았습니다. 삭제할까요?</span>
        <button type="button" class="confirm-del">삭제</button>
        <button type="button" class="cancel-del">취소</button>
      `;
      box.querySelector('.confirm-del').onclick = async () => {
        appData.studyPlans = appData.studyPlans.filter((p) => p.id !== plan.id);
        renderStudyPlans();
        await persistData();
      };
      box.querySelector('.cancel-del').onclick = () => box.remove();
      content.appendChild(box);
    };

    li.append(checkBtn, content, delBtn);
    list.appendChild(li);
  });
}

// --- Tab 2: Daily Reports ---
async function loadReports() {
  const list = $('reportsList');
  list.innerHTML = '<li class="empty-state">리포트 목록을 불러오는 중...</li>';

  const res = await api.listReports(appData.settings.reportsDir);
  if (!res.ok) {
    list.innerHTML = `<li class="empty-state">${escapeHtml(res.error)}</li>`;
    return;
  }
  if (res.files.length === 0) {
    list.innerHTML = '<li class="empty-state">표시할 리포트 파일이 없습니다.</li>';
    $('reportUnreadDot').classList.add('hidden');
    return;
  }

  if (!Array.isArray(appData.settings.readReports)) {
    // First-time init: mark older reports read, keep newest 1 unread as indicator
    appData.settings.readReports = res.files.slice(1).map((f) => f.title);
    await persistData();
  }

  const readSet = new Set(appData.settings.readReports);
  let hasUnread = false;

  list.className = 'item-list reports-grid';
  list.innerHTML = '';
  const todayStr = getTodayDateString();
  res.files.forEach((file) => {
    const isUnread = !readSet.has(file.title);
    if (isUnread) hasUnread = true;
    const isToday = file.title === todayStr;

    const li = document.createElement('li');
    li.className = `report-tile${isToday ? ' today' : ''}`;
    const dateMatch = file.title.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const label = dateMatch ? `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}` : file.title;
    li.textContent = label;
    if (isUnread) {
      const dot = document.createElement('span');
      dot.className = 'report-tile-dot';
      li.appendChild(dot);
    }
    li.title = file.path;
    li.onclick = async () => {
      if (!readSet.has(file.title)) {
        readSet.add(file.title);
        appData.settings.readReports = Array.from(readSet).slice(-120);
        await persistData();
        const dotEl = li.querySelector('.report-tile-dot');
        if (dotEl) dotEl.remove();
        const anyLeft = Array.from(list.querySelectorAll('.report-tile-dot')).length > 0;
        $('reportUnreadDot').classList.toggle('hidden', !anyLeft);
      }
      api.openPath(file.path);
    };
    list.appendChild(li);
  });

  $('reportUnreadDot').classList.toggle('hidden', !hasUnread);
}

// --- Tab 3: SKKU Notices ---
async function loadNotices() {
  const list = $('noticesList');
  list.innerHTML = '<li class="empty-state">학교 공지사항을 가져오는 중...</li>';

  const res = await api.fetchNotices(appData.settings.noticeUrl);
  if (!res.ok) {
    list.innerHTML = `<li class="empty-state">공지를 불러오지 못했습니다 (${escapeHtml(res.error)})</li>`;
    return;
  }

  const seenSet = new Set(appData.settings.seenNoticeIds || []);
  let newCount = 0;

  // Put latest regular notices first, pinned notices below
  const sortedNotices = [
    ...res.items.filter((n) => !n.isPinned),
    ...res.items.filter((n) => n.isPinned)
  ];

  list.innerHTML = '';
  let renderedPinnedHeader = false;

  sortedNotices.forEach((notice) => {
    if (notice.isPinned && !renderedPinnedHeader) {
      renderedPinnedHeader = true;
      const sep = document.createElement('li');
      sep.className = 'notice-section-label';
      sep.textContent = '상단 고정 공지';
      list.appendChild(sep);
    }

    const isNew = seenSet.size > 0 && !seenSet.has(notice.id);
    if (isNew) newCount++;

    // Extract optional [bracket] prefix for cleaner title readability
    let prefix = '';
    let displayTitle = notice.title;
    const prefixMatch = displayTitle.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (prefixMatch) {
      prefix = prefixMatch[1];
      displayTitle = prefixMatch[2];
    }

    const li = document.createElement('li');
    li.className = `card-item clickable notice-card ${notice.isPinned ? 'pinned-notice' : ''}`;
    li.innerHTML = `
      <div class="card-content">
        <div class="card-title">${escapeHtml(displayTitle)}</div>
        <div class="card-meta">
          ${isNew ? '<span class="pill pill-new">NEW</span>' : ''}
          ${prefix ? `<span class="pill pill-tag">${escapeHtml(prefix)}</span>` : ''}
          <span>${escapeHtml(notice.date || '공지')}</span>
        </div>
      </div>
      <button class="notice-todo-btn" title="할 일로 추가">+할일</button>
    `;

    li.querySelector('.notice-todo-btn').onclick = async (e) => {
      e.stopPropagation();
      appData.items.unshift({
        id: String(Date.now()),
        text: notice.title,
        time: '',
        tag: 'SKKU',
        dueDate: '',
        priority: 'medium',
        done: false,
        createdAt: Date.now()
      });
      renderTodos();
      await persistData();
      e.target.textContent = '추가됨';
      setTimeout(() => { e.target.textContent = '+할일'; }, 1200);
    };

    li.onclick = async () => {
      if (!seenSet.has(notice.id)) {
        seenSet.add(notice.id);
        appData.settings.seenNoticeIds = Array.from(seenSet).slice(-100);
        await persistData();
      }
      api.openExternal(notice.url);
    };
    list.appendChild(li);
  });

  // First run: seed seen IDs
  if (seenSet.size === 0 && res.items.length > 0) {
    appData.settings.seenNoticeIds = res.items.map((n) => n.id);
    await persistData();
  }

  const badge = $('noticeBadge');
  if (newCount > 0) {
    badge.textContent = newCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// --- Tab 4: Gmail ---
async function loadMail() {
  const container = $('mailContainer');
  const email = appData.settings.email || 'mouphero411@gmail.com';
  $('mailAccountLabel').textContent = email;

  if (!appData.settings.appPassword) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>${escapeHtml(email)}</strong><br/>
        우측 상단 <strong>설정(⚙)</strong>에서 Gmail 앱 비밀번호를 입력하면<br/>
        안 읽은 메일 수와 최근 메일을 바로 확인할 수 있습니다.<br/><br/>
        <button class="ghost-btn" id="quickMailWebBtn">브라우저로 Gmail 열기</button>
      </div>
    `;
    $('quickMailWebBtn').onclick = () => api.openExternal('https://mail.google.com');
    $('mailBadge').classList.add('hidden');
    if ($('mailDot')) $('mailDot').classList.add('hidden');
    return;
  }

  container.innerHTML = '<div class="empty-state">메일함을 동기화하는 중...</div>';
  const res = await api.fetchMail({
    email,
    appPassword: appData.settings.appPassword
  });

  if (!res.ok) {
    container.innerHTML = `<div class="empty-state">메일 조회 실패: ${escapeHtml(res.error || '오류')}</div>`;
    return;
  }

  const badge = $('mailBadge');
  const mailDot = $('mailDot');
  if (res.unreadCount > 0) {
    badge.textContent = res.unreadCount;
    badge.classList.remove('hidden');
    if (mailDot) mailDot.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    if (mailDot) mailDot.classList.add('hidden');
  }

  if (res.messages.length === 0) {
    container.innerHTML = '<div class="empty-state">최근 메일이 없습니다.</div>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'item-list';
  res.messages.forEach((msg) => {
    const li = document.createElement('li');
    li.className = `card-item clickable ${msg.isUnread ? 'mail-unread' : 'mail-read'}`;
    li.innerHTML = `
      <div class="card-content">
        <div class="card-title">${escapeHtml(msg.subject)}</div>
        <div class="card-meta">
          ${msg.isUnread ? '<span class="pill pill-new">안읽음</span>' : ''}
          <span>${escapeHtml(msg.from)}</span>
          ${msg.date ? `<span>· ${escapeHtml(msg.date)}</span>` : ''}
        </div>
      </div>
    `;
    li.onclick = () => api.openExternal('https://mail.google.com');
    ul.appendChild(li);
  });
  container.innerHTML = '';
  container.appendChild(ul);
}

// --- Tab 6: Quick Links & Notion Shortcuts ---
function getQuickLinks() {
  if (!Array.isArray(appData.quickLinks)) {
    appData.quickLinks = [
      { id: 'link-notion', title: 'Notion 앱', url: 'notion://', openInNotionApp: true },
      { id: 'link-icampus', title: '아이캠퍼스', url: 'https://icampus.skku.edu', openInNotionApp: false },
      { id: 'link-kingo', title: '킹고포털', url: 'https://kingo.skku.edu', openInNotionApp: false }
    ];
  }
  return appData.quickLinks;
}

function isLocalAppPath(raw) {
  const s = (raw || '').trim();
  return /^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s) || /\.(exe|lnk|bat|cmd)$/i.test(s);
}

function resolveLinkUrl(link) {
  let raw = (link.url || '').trim();
  if (!raw) return '';
  if (isLocalAppPath(raw)) return raw;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    raw = `https://${raw}`;
  }
  if (link.openInNotionApp || raw.startsWith('notion://')) {
    raw = raw.replace(/^https?:\/\/(www\.)?notion\.so/i, 'notion://www.notion.so');
  }
  return raw;
}

let draggedLinkId = null;
const fileIconCache = new Map();

function getQuickLinkIconSrc(link) {
  const url = (link.url || '').trim();
  const lower = url.toLowerCase();
  if (/antigravity/i.test(lower)) return 'assets/icons/antigravity.png';
  if (/skku\.edu/i.test(lower)) return 'assets/icons/skku.png';
  if (link.openInNotionApp || /notion\.so|^notion:\/\//i.test(lower)) return 'assets/icons/notion.png';
  if (/gemini\.google\.com|gemini\.lnk/i.test(lower)) return 'assets/icons/gemini.png';
  if (/claude\.ai|claude\.lnk/i.test(lower)) return 'assets/icons/claude.png';
  if (/chatgpt\.com|chatgpt\.lnk/i.test(lower)) return 'assets/icons/chatgpt.png';
  if (/^spotify:/i.test(lower) || /spotify\.com/i.test(lower)) return 'assets/icons/spotify.png';
  if (/^https?:\/\//i.test(lower)) {
    try {
      const host = new URL(url).hostname;
      if (host) return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } catch {}
  }
  return '';
}

function renderQuickLinks() {
  const list = $('linksList');
  if (!list) return;
  const links = getQuickLinks();
  list.innerHTML = '';

  if (links.length === 0) {
    list.innerHTML = '<li class="empty-state" style="grid-column:1/-1;">등록된 바로가기가 없습니다.<br/>우측 상단 + 추가 버튼으로 사이트나 노션 페이지를 등록해 보세요.</li>';
    return;
  }

  links.forEach((link) => {
    if (link.type === 'divider') {
      const divLi = document.createElement('li');
      divLi.className = 'link-divider';
      divLi.draggable = true;
      divLi.innerHTML = link.title
        ? `<span class="link-divider-label">${escapeHtml(link.title)}</span><span class="link-divider-line"></span><button type="button" class="link-divider-del" title="구분선 삭제">×</button>`
        : `<span class="link-divider-line"></span><button type="button" class="link-divider-del" title="구분선 삭제">×</button>`;
      divLi.querySelector('.link-divider-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        appData.quickLinks = getQuickLinks().filter((l) => l.id !== link.id);
        renderQuickLinks();
        await persistData();
      });
      divLi.addEventListener('dragstart', (e) => {
        draggedLinkId = link.id;
        divLi.classList.add('dragging');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      divLi.addEventListener('dragend', () => {
        draggedLinkId = null;
        divLi.classList.remove('dragging');
        list.querySelectorAll('.link-tile, .link-divider').forEach((el) => el.classList.remove('drag-over'));
      });
      divLi.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedLinkId && draggedLinkId !== link.id) divLi.classList.add('drag-over');
      });
      divLi.addEventListener('dragleave', () => divLi.classList.remove('drag-over'));
      divLi.addEventListener('drop', async (e) => {
        e.preventDefault();
        divLi.classList.remove('drag-over');
        if (!draggedLinkId || draggedLinkId === link.id) return;
        const arr = getQuickLinks();
        const fromIdx = arr.findIndex((l) => l.id === draggedLinkId);
        const toIdx = arr.findIndex((l) => l.id === link.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        renderQuickLinks();
        await persistData();
      });
      list.appendChild(divLi);
      return;
    }

    const li = document.createElement('li');
    li.className = 'link-tile';
    li.draggable = true;
    const isNotion = link.openInNotionApp || /notion\.so|^notion:\/\//i.test(link.url || '');
    const isLocal = !isNotion && isLocalAppPath(link.url || '');
    const isFolder = isLocal && !/\.(exe|lnk|bat|cmd|url|appref-ms)$/i.test((link.url || '').trim());
    const isApp = isLocal && !isFolder;
    const staticIconSrc = getQuickLinkIconSrc(link);
    const cachedFileIcon = isApp ? fileIconCache.get(link.url) : '';
    const iconSrc = staticIconSrc || cachedFileIcon;
    const fallbackSvg = isFolder
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'
      : isApp
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
    const iconHtml = iconSrc
      ? `<span class="link-app-icon has-img"><img src="${escapeHtml(iconSrc)}" alt="" /></span>`
      : `<span class="link-app-icon${isFolder ? ' folder' : ''}">${fallbackSvg}</span>`;
    li.innerHTML = `
      ${iconHtml}
      <span class="link-tile-title">${escapeHtml(link.title)}</span>
      <button type="button" class="link-edit-btn" title="수정">✎</button>
    `;
    if (isApp && !iconSrc && api.getFileIcon) {
      api.getFileIcon(link.url).then((dataUrl) => {
        if (!dataUrl) return;
        fileIconCache.set(link.url, dataUrl);
        const iconSpan = li.querySelector('.link-app-icon');
        if (iconSpan) {
          iconSpan.classList.add('has-img');
          iconSpan.innerHTML = `<img src="${dataUrl}" alt="" />`;
        }
      });
    }
    li.addEventListener('click', (e) => {
      if (e.target.closest('.link-edit-btn')) return;
      const targetUrl = resolveLinkUrl(link);
      if (!targetUrl) return;
      if (isLocalAppPath(targetUrl)) api.openPath(targetUrl);
      else api.openExternal(targetUrl);
    });
    li.querySelector('.link-edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = list.querySelector(`.link-inline-edit[data-id="${CSS.escape(link.id)}"]`);
      list.querySelectorAll('.link-inline-edit').forEach((el) => el.remove());
      if (existing) return;

      let editNotionApp = Boolean(link.openInNotionApp);
      const editBox = document.createElement('li');
      editBox.className = 'link-inline-edit';
      editBox.dataset.id = link.id;
      editBox.innerHTML = `
        <input type="text" class="edit-link-title" value="${escapeHtml(link.title)}" placeholder="제목" />
        <input type="text" class="edit-link-url" value="${escapeHtml(link.url)}" placeholder="URL 또는 notion:// 링크" />
        <div class="link-inline-edit-actions">
          <button type="button" class="ghost-btn edit-link-notion ${editNotionApp ? 'active' : ''}">노션 앱</button>
          <span class="spacer"></span>
          <button type="button" class="ghost-btn danger-btn delete-link-btn">삭제</button>
          <button type="button" class="ghost-btn cancel-link-btn">취소</button>
          <button type="button" class="ghost-btn save-link-btn" style="border-color:var(--accent);color:var(--accent);">저장</button>
        </div>
      `;
      const notionBtn = editBox.querySelector('.edit-link-notion');
      notionBtn.onclick = () => {
        editNotionApp = !editNotionApp;
        notionBtn.classList.toggle('active', editNotionApp);
      };
      editBox.querySelector('.cancel-link-btn').onclick = () => editBox.remove();
      editBox.querySelector('.delete-link-btn').onclick = async () => {
        appData.quickLinks = getQuickLinks().filter((l) => l.id !== link.id);
        renderQuickLinks();
        await persistData();
      };
      editBox.querySelector('.save-link-btn').onclick = async () => {
        const nextTitle = editBox.querySelector('.edit-link-title').value.trim();
        const nextUrl = editBox.querySelector('.edit-link-url').value.trim();
        if (!nextTitle || !nextUrl) return;
        link.title = nextTitle;
        link.url = nextUrl;
        link.openInNotionApp = editNotionApp || /^notion:\/\//i.test(nextUrl);
        renderQuickLinks();
        await persistData();
      };
      li.insertAdjacentElement('afterend', editBox);
      editBox.querySelector('.edit-link-title').focus();
    });

    li.addEventListener('dragstart', (e) => {
      draggedLinkId = link.id;
      li.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      draggedLinkId = null;
      li.classList.remove('dragging');
      list.querySelectorAll('.link-tile, .link-divider').forEach((el) => {
        el.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
      });
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedLinkId && draggedLinkId !== link.id) {
        const rect = li.getBoundingClientRect();
        const isAfter = (e.clientX - rect.left) > rect.width / 2;
        li.classList.remove('drag-over-before', 'drag-over-after');
        li.classList.add(isAfter ? 'drag-over-after' : 'drag-over-before');
        li.dataset.dropPos = isAfter ? 'after' : 'before';
      }
    });
    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
    });
    li.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dropPos = li.dataset.dropPos || 'before';
      li.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
      if (!draggedLinkId || draggedLinkId === link.id) return;
      const arr = getQuickLinks();
      const fromIdx = arr.findIndex((l) => l.id === draggedLinkId);
      let toIdx = arr.findIndex((l) => l.id === link.id);
      if (fromIdx === -1 || toIdx === -1) return;
      if (dropPos === 'after') toIdx += 1;
      const [moved] = arr.splice(fromIdx, 1);
      if (fromIdx < toIdx) toIdx -= 1;
      arr.splice(toIdx, 0, moved);
      renderQuickLinks();
      await persistData();
    });

    list.appendChild(li);
  });
}

// --- Init & Event Bindings ---
async function init() {
  $('todayDate').textContent = formatToday();
  $('dueDateInput').value = getTodayDateString();
  appData = await api.loadData();
  lastCommittedSnapshot = JSON.stringify(appData);
  applyOpacity(appData.settings.opacity ?? 1);

  // Header Independent D-Day Popover (Multiple D-Days, 1 displayed on pill)
  $('headerDdayPill').addEventListener('click', () => {
    $('headerDdayTitleInput').value = '';
    $('headerDdayDateInput').value = getTodayDateString();
    renderHeaderDdayList();
    $('ddayPopover').classList.toggle('hidden');
    if (!$('ddayPopover').classList.contains('hidden')) {
      $('headerDdayTitleInput').focus();
    }
  });

  $('saveHeaderDdayBtn').addEventListener('click', async () => {
    const title = $('headerDdayTitleInput').value.trim();
    const date = $('headerDdayDateInput').value || '';
    if (!date) return;
    const list = getHeaderDdays();
    const newId = String(Date.now());
    list.push({ id: newId, title, date });
    appData.activeHeaderDdayId = newId;
    $('headerDdayTitleInput').value = '';
    renderHeaderDday();
    await persistData();
  });

  if ($('closeDdayPopoverBtn')) {
    $('closeDdayPopoverBtn').addEventListener('click', () => {
      $('ddayPopover').classList.add('hidden');
    });
  }

  function updateFooterActionButton(tabName) {
    const btn = $('toggleAddTodoBtn');
    if (!btn) return;
    if (
      tabName === 'home' ||
      tabName === 'reports' ||
      tabName === 'notices' ||
      tabName === 'gemini' ||
      tabName === 'memo' ||
      tabName === 'files' ||
      tabName === 'pomodoro'
    ) {
      btn.classList.add('hidden');
      return;
    }
    btn.classList.remove('hidden');
    if (tabName === 'mail') {
      btn.title = '메일 쓰기';
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
      return;
    }
    btn.textContent = '+';
    if (tabName === 'calendar') btn.title = '달력 일정 추가';
    else if (tabName === 'study') btn.title = '시험 추가';
    else if (tabName === 'links') btn.title = '바로가기 추가';
    else if (tabName === 'files') btn.title = '파일 추가';
    else if (tabName === 'memo') btn.title = '새 메모 추가';
    else btn.title = '할 일 추가';
  }

  // Tabs + Drag-and-drop reorder + Keyboard Tab cycling with directional slide animation
  const tabBar = document.querySelector('.tab-bar');
  let tabBtns = Array.from(document.querySelectorAll('.tab-btn'));

  function applySavedTabOrder() {
    const saved = appData?.settings?.tabOrder;
    if (!tabBar || !Array.isArray(saved) || saved.length === 0) return;
    const byName = new Map(tabBtns.map((b) => [b.dataset.tab, b]));
    const indicator = $('tabIndicator');
    saved.forEach((name) => {
      const btn = byName.get(name);
      if (btn) {
        tabBar.insertBefore(btn, indicator || null);
        byName.delete(name);
      }
    });
    byName.forEach((btn) => tabBar.insertBefore(btn, indicator || null));
    tabBtns = Array.from(tabBar.querySelectorAll('.tab-btn'));
  }

  function updateTabIndicator(targetBtn) {
    const indicator = $('tabIndicator');
    const btn = targetBtn || document.querySelector('.tab-btn.active');
    if (!indicator || !btn || !btn.parentElement) return;
    const btnRect = btn.getBoundingClientRect();
    const barRect = btn.parentElement.getBoundingClientRect();
    if (!btnRect.width) return;
    const inset = btnRect.width * 0.2;
    indicator.style.width = `${btnRect.width - inset * 2}px`;
    indicator.style.left = `${btnRect.left - barRect.left + inset}px`;
    indicator.style.top = `${btnRect.bottom - barRect.top - 2}px`;
  }

  function switchToTab(tabName, direction = '') {
    const currentBtn = document.querySelector('.tab-btn.active');
    const curIdx = tabBtns.indexOf(currentBtn);
    const nextBtn = tabBtns.find((b) => b.dataset.tab === tabName);
    if (!nextBtn) return;
    const nextIdx = tabBtns.indexOf(nextBtn);
    const dir = direction || (curIdx !== -1 && nextIdx !== curIdx ? (nextIdx > curIdx ? 'next' : 'prev') : '');

    tabBtns.forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active', 'slide-next', 'slide-prev'));
    nextBtn.classList.add('active');
    updateTabIndicator(nextBtn);
    const targetPanel = $(`tab-${tabName}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
      if (dir === 'next') targetPanel.classList.add('slide-next');
      else if (dir === 'prev') targetPanel.classList.add('slide-prev');
    }
    updateFooterActionButton(tabName);
    if (tabName === 'files' && typeof renderPinnedFiles === 'function') {
      renderPinnedFiles();
    }
  }

  let draggedTabName = null;
  tabBtns.forEach((btn) => {
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => {
      draggedTabName = btn.dataset.tab;
      btn.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedTabName);
      }
    });
    btn.addEventListener('dragend', () => {
      draggedTabName = null;
      tabBtns.forEach((b) => b.classList.remove('dragging', 'drag-over-before', 'drag-over-after'));
    });
    btn.addEventListener('dragover', (e) => {
      if (!draggedTabName || draggedTabName === btn.dataset.tab) return;
      e.preventDefault();
      const rect = btn.getBoundingClientRect();
      const isAfter = (e.clientX - rect.left) > rect.width / 2;
      btn.classList.remove('drag-over-before', 'drag-over-after');
      btn.classList.add(isAfter ? 'drag-over-after' : 'drag-over-before');
      btn.dataset.dropPos = isAfter ? 'after' : 'before';
    });
    btn.addEventListener('dragleave', () => {
      btn.classList.remove('drag-over-before', 'drag-over-after');
    });
    btn.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dropPos = btn.dataset.dropPos || 'before';
      btn.classList.remove('drag-over-before', 'drag-over-after');
      if (!draggedTabName || draggedTabName === btn.dataset.tab || !tabBar) return;
      const draggedBtn = tabBtns.find((b) => b.dataset.tab === draggedTabName);
      if (!draggedBtn) return;
      const refNode = dropPos === 'after' ? btn.nextElementSibling : btn;
      tabBar.insertBefore(draggedBtn, refNode);
      tabBtns = Array.from(tabBar.querySelectorAll('.tab-btn'));
      if (!appData.settings) appData.settings = {};
      appData.settings.tabOrder = tabBtns.map((b) => b.dataset.tab);
      updateTabIndicator();
      await persistData();
    });
  });

  applySavedTabOrder();
  requestAnimationFrame(() => updateTabIndicator());
  window.addEventListener('resize', () => updateTabIndicator());

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      switchToTab(btn.dataset.tab);
    });
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      let targetIdx = -1;
      if (e.key >= '1' && e.key <= '9') {
        targetIdx = parseInt(e.key, 10) - 1;
      } else if (e.key === '0') {
        targetIdx = 9;
      } else if (e.key === '-') {
        targetIdx = 10;
      } else if (e.key === '=') {
        targetIdx = 11;
      }
      if (targetIdx >= 0 && targetIdx < tabBtns.length) {
        e.preventDefault();
        switchToTab(tabBtns[targetIdx].dataset.tab);
        return;
      }
    }
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
      return;
    }
    e.preventDefault();
    const curIdx = tabBtns.findIndex((b) => b.classList.contains('active'));
    const step = e.shiftKey ? -1 : 1;
    const nextIdx = (curIdx + step + tabBtns.length) % tabBtns.length;
    switchToTab(tabBtns[nextIdx].dataset.tab, e.shiftKey ? 'prev' : 'next');
  });

  // Tag filters (dynamic)
  renderTagFilters();

  // Sync/Refresh button next to filter chips
  $('syncTodoBtn').addEventListener('click', async () => {
    appData = await api.loadData();
    applyOpacity(appData.settings.opacity ?? 1);
    renderHeaderDday();
    renderTagFilters();
    renderTodos();
    renderCalendar();
    renderExamCard();
    renderStudyPlans();
  });

  // Auto-sync when todo-schedule-data.json is updated externally
  if (api.onDataUpdated) {
    api.onDataUpdated((freshData) => {
      if (!freshData) return;
      appData = freshData;
      applyOpacity(appData.settings.opacity ?? 1);
      renderHeaderDday();
      renderTagFilters();
      renderTodos();
      renderCalendar();
      renderExamCard();
      renderStudyPlans();
      renderMemoNotes();
      renderPinnedFiles();
      renderPomodoro();
    });
  }

  // Footer '+' button shared across To-Do, Calendar, Study/Exam, and Links tabs
  $('toggleAddTodoBtn').addEventListener('click', () => {
    const activePanel = document.querySelector('.tab-panel.active');
    const activeId = activePanel ? activePanel.id : 'tab-todo';

    if (activeId === 'tab-calendar') {
      const form = $('calAddForm');
      if (form) {
        form.classList.toggle('hidden');
        if (!form.classList.contains('hidden')) {
          $('calTitleInput')?.focus();
        }
      }
      return;
    }

    if (activeId === 'tab-study') {
      const form = $('studyForm');
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) {
        $('studySubjectInput').focus();
      }
      return;
    }

    if (activeId === 'tab-links') {
      const form = $('linkForm');
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) {
        $('linkTitleInput').focus();
      }
      return;
    }

    if (activeId === 'tab-files') {
      addFileFromPicker();
      return;
    }

    if (activeId === 'tab-mail') {
      api.openExternal('https://mail.google.com/mail/?view=cm&fs=1');
      return;
    }

    if (activeId === 'tab-memo') {
      createNewMemo();
      return;
    }

    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="todo"]').classList.add('active');
    $('tab-todo').classList.add('active');

    const form = $('todoForm');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
      $('todoInput').focus();
    }
  });

  // Clear due date & Weekly toggle buttons
  $('clearDueBtn').addEventListener('click', () => {
    $('dueDateInput').value = '';
  });

  $('weeklyToggleBtn').addEventListener('click', () => {
    isWeeklyMode = !isWeeklyMode;
    $('weeklyToggleBtn').classList.toggle('active', isWeeklyMode);
  });

  // Add To-Do
  $('todoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = $('todoInput').value.trim();
    if (!raw) return;
    const parsed = parseQuickInput(raw);
    const autoWeekly = isWeeklyMode || /^매주\s+/.test(parsed.text);
    const cleanText = parsed.text.replace(/^매주\s+/, '').trim() || parsed.text;
    const dueVal = $('dueDateInput').value || (autoWeekly ? getTodayDateString() : '');
    const selectedTag = $('todoTagSelect') ? $('todoTagSelect').value : '';
    const finalTag = selectedTag === '__none__' ? '' : selectedTag || parsed.tag;

    appData.items.unshift({
      id: String(Date.now()),
      text: cleanText,
      time: parsed.time,
      tag: finalTag,
      dueDate: dueVal,
      repeat: autoWeekly ? 'weekly' : 'none',
      priority: $('prioritySelect').value,
      done: false,
      createdAt: Date.now()
    });
    $('todoInput').value = '';
    $('dueDateInput').value = getTodayDateString();
    if ($('todoTagSelect')) $('todoTagSelect').value = '';
    isWeeklyMode = false;
    $('weeklyToggleBtn').classList.remove('active');
    $('todoForm').classList.add('hidden');
    renderTodos();
    await persistData();
  });

  // Window Controls
  $('pinBtn').addEventListener('click', async () => {
    const pinned = await api.togglePin();
    $('pinBtn').classList.toggle('active', pinned);
  });

  if ($('opacityRange')) {
    $('opacityRange').addEventListener('change', async (e) => {
      appData.settings.opacity = parseFloat(e.target.value);
      await persistData();
    });
  }

  $('minWinBtn').addEventListener('click', () => api.minimize());
  $('closeBtn').addEventListener('click', () => api.close());

  // Settings (toggle open/close)
  $('settingsBtn').addEventListener('click', async () => {
    const drawer = $('settingsDrawer');
    if (!drawer.classList.contains('hidden')) {
      drawer.classList.add('hidden');
      $('settingsBtn').classList.remove('active');
      return;
    }
    $('opacityRange').value = appData.settings.opacity || 0.92;
    $('reportsDirInput').value = appData.settings.reportsDir || '';
    $('noticeUrlInput').value = appData.settings.noticeUrl || '';
    $('emailInput').value = appData.settings.email || '';
    $('appPasswordInput').value = appData.settings.appPassword || '';
    try {
      $('autoStartCheck').checked = await api.getAutoStart();
    } catch {
      $('autoStartCheck').checked = false;
    }
    renderCategorySettings();
    drawer.classList.remove('hidden');
    $('settingsBtn').classList.add('active');
  });

  $('addCatBtn').addEventListener('click', () => {
    const name = $('newCatName').value.trim();
    const color = $('newCatColor').value || '#7C8CFF';
    const kwRaw = $('newCatKeywords').value.trim();
    if (!name) return;
    const keywords = kwRaw ? kwRaw.split(',').map((k) => k.trim()).filter(Boolean) : [];
    if (!Array.isArray(appData.settings.categories)) {
      appData.settings.categories = getCategories();
    }
    appData.settings.categories.push({
      id: `cat-${Date.now()}`,
      name,
      color,
      keywords
    });
    $('newCatName').value = '';
    $('newCatKeywords').value = '';
    renderCategorySettings();
    renderTagFilters();
    renderTodos();
  });

  $('closeSettingsBtn').addEventListener('click', () => {
    $('settingsDrawer').classList.add('hidden');
  });

  if ($('quitAppBtn')) {
    $('quitAppBtn').addEventListener('click', () => {
      if (api.quitApp) api.quitApp();
    });
  }

  $('opacityRange').addEventListener('input', (e) => {
    applyOpacity(parseFloat(e.target.value));
  });

  $('saveSettingsBtn').addEventListener('click', async () => {
    appData.settings.opacity = parseFloat($('opacityRange').value);
    appData.settings.reportsDir = $('reportsDirInput').value.trim();
    appData.settings.noticeUrl = $('noticeUrlInput').value.trim();
    appData.settings.email = $('emailInput').value.trim();
    appData.settings.appPassword = $('appPasswordInput').value.trim();
    try {
      await api.setAutoStart($('autoStartCheck').checked);
    } catch {}
    await persistData();
    $('settingsDrawer').classList.add('hidden');
    $('settingsBtn').classList.remove('active');
    loadReports();
    loadNotices();
    loadMail();
  });

  // Refresh & External buttons
  $('refreshReportsBtn').addEventListener('click', loadReports);
  $('refreshNoticesBtn').addEventListener('click', loadNotices);
  $('openNoticeSiteBtn').addEventListener('click', () => {
    api.openExternal(appData.settings.noticeUrl);
  });
  $('refreshMailBtn').addEventListener('click', loadMail);
  $('openGmailWebBtn').addEventListener('click', () => {
    api.openExternal('https://mail.google.com');
  });

  // Study & Exam events
  $('toggleExamEditBtn').addEventListener('click', () => {
    const row = $('examEditRow');
    row.classList.toggle('hidden');
    if (!row.classList.contains('hidden')) {
      $('examDateInput').value = $('examDateInput').value || getTodayDateString();
      $('examTitleInput').focus();
    }
  });

  $('saveExamBtn').addEventListener('click', async () => {
    const title = $('examTitleInput').value.trim();
    const date = $('examDateInput').value;
    if (!title || !date) return;
    getStudyExams().push({
      id: String(Date.now()),
      title,
      date
    });
    $('examTitleInput').value = '';
    renderExamCard();
    $('examEditRow').classList.add('hidden');
    await persistData();
  });

  $('studyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const goal = $('studyGoalInput').value.trim();
    if (!goal) return;
    const subject = $('studySubjectInput').value.trim() || '공통';
    const week = $('studyWeekSelect').value || '이번 주';
    if (!Array.isArray(appData.studyPlans)) appData.studyPlans = [];
    appData.studyPlans.unshift({
      id: String(Date.now()),
      subject,
      goal,
      week,
      done: false,
      createdAt: Date.now()
    });
    $('studyGoalInput').value = '';
    $('studyForm').classList.add('hidden');
    renderStudyPlans();
    await persistData();
  });

  $('clearDoneStudyBtn').addEventListener('click', async () => {
    if (!Array.isArray(appData.studyPlans)) return;
    appData.studyPlans = appData.studyPlans.filter((p) => !p.done);
    renderStudyPlans();
    await persistData();
  });

  document.querySelectorAll('#studyFilters .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#studyFilters .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeStudyWeek = chip.dataset.week;
      renderStudyPlans();
    });
  });

  // Quick Links events
  let isNotionAppMode = false;
  if ($('toggleAddLinkBtn')) {
    $('toggleAddLinkBtn').addEventListener('click', () => {
      const form = $('linkForm');
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) {
        $('linkTitleInput').focus();
      }
    });
  }

  if ($('refreshLinksBtn')) {
    $('refreshLinksBtn').addEventListener('click', async () => {
      fileIconCache.clear();
      const loaded = await api.loadData();
      if (loaded) appData = loaded;
      renderQuickLinks();
    });
  }

  async function refreshSpotifyBar() {
    const bar = $('spotifyMiniBar');
    const label = $('spotifyTrackText');
    const playBtn = $('spotifyPlayBtn');
    if (!bar || !label || !api.getSpotifyStatus) return;
    const st = await api.getSpotifyStatus();
    if (!st || !st.running) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    bar.classList.toggle('playing', Boolean(st.playing));
    if (st.track) {
      label.textContent = st.track;
      label.classList.toggle('playing', Boolean(st.playing));
      if (playBtn) {
        playBtn.innerHTML = st.playing
          ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
          : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
      }
    } else {
      label.textContent = 'Spotify 실행 중';
      label.classList.remove('playing');
      if (playBtn) {
        playBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
      }
    }
  }

  if ($('spotifyOpenBtn')) {
    $('spotifyOpenBtn').addEventListener('click', () => api.openExternal('spotify:'));
  }
  if ($('spotifyPrevBtn')) {
    $('spotifyPrevBtn').addEventListener('click', async () => {
      if (api.controlSpotify) await api.controlSpotify('prev');
      refreshSpotifyBar();
    });
  }
  if ($('spotifyPlayBtn')) {
    $('spotifyPlayBtn').addEventListener('click', async () => {
      if (api.controlSpotify) await api.controlSpotify('playpause');
      refreshSpotifyBar();
    });
  }
  if ($('spotifyNextBtn')) {
    $('spotifyNextBtn').addEventListener('click', async () => {
      if (api.controlSpotify) await api.controlSpotify('next');
      refreshSpotifyBar();
    });
  }
  refreshSpotifyBar();
  setInterval(refreshSpotifyBar, 4000);

  if ($('linkPickAppBtn')) {
    $('linkPickAppBtn').addEventListener('click', async () => {
      if (!api.pickApp) return;
      const picked = await api.pickApp();
      if (picked && picked.ok && picked.path) {
        $('linkUrlInput').value = picked.path;
        if (!$('linkTitleInput').value.trim() && picked.name) {
          $('linkTitleInput').value = picked.name;
        }
        $('linkTitleInput').focus();
      }
    });
  }

  if ($('linkAddDividerBtn')) {
    $('linkAddDividerBtn').addEventListener('click', async () => {
      const label = $('linkTitleInput').value.trim();
      getQuickLinks().push({
        id: `div-${Date.now()}`,
        type: 'divider',
        title: label
      });
      $('linkTitleInput').value = '';
      $('linkUrlInput').value = '';
      isNotionAppMode = false;
      $('linkNotionAppToggle').classList.remove('active');
      $('linkForm').classList.add('hidden');
      renderQuickLinks();
      await persistData();
    });
  }

  $('linkNotionAppToggle').addEventListener('click', () => {
    isNotionAppMode = !isNotionAppMode;
    $('linkNotionAppToggle').classList.toggle('active', isNotionAppMode);
  });

  $('linkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('linkTitleInput').value.trim();
    const url = $('linkUrlInput').value.trim();
    if (!title || !url) return;
    const isNotion = isNotionAppMode || /^notion:\/\//i.test(url) || /notion\.so/i.test(url);
    getQuickLinks().push({
      id: `link-${Date.now()}`,
      title,
      url,
      openInNotionApp: isNotionAppMode || /^notion:\/\//i.test(url) || (isNotion && isNotionAppMode)
    });
    $('linkTitleInput').value = '';
    $('linkUrlInput').value = '';
    isNotionAppMode = false;
    $('linkNotionAppToggle').classList.remove('active');
    $('linkForm').classList.add('hidden');
    renderQuickLinks();
    await persistData();
  });

  // Gemini Mini Chat events
  function getGeminiHistory() {
    if (!Array.isArray(appData.geminiHistory)) appData.geminiHistory = [];
    return appData.geminiHistory;
  }

  function renderGeminiMessages() {
    const log = $('geminiMessages');
    if (!log) return;
    const history = getGeminiHistory();
    if (history.length === 0) {
      log.innerHTML = '<div class="empty-state">Gemini API가 연결되어 있습니다.<br/>간단한 질문이나 요약을 바로 물어보세요.</div>';
      return;
    }
    log.innerHTML = '';
    history.forEach((m) => {
      const div = document.createElement('div');
      if (m.isLoading) {
        div.className = 'gemini-msg model loading';
        div.innerHTML = '<span class="gemini-spinner"></span><span>답변 생성 중...</span>';
      } else {
        div.className = `gemini-msg ${m.role === 'user' ? 'user' : 'model'}${m.isError ? ' error' : ''}`;
        div.textContent = m.text;
      }
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;
  }

  if ($('clearGeminiBtn')) {
    $('clearGeminiBtn').addEventListener('click', async () => {
      appData.geminiHistory = [];
      renderGeminiMessages();
      await persistData();
    });
  }

  let attachedGeminiFiles = [];
  let mentionResults = [];
  let mentionIndex = 0;
  let mentionMode = '@';
  let mentionTimer = null;

  function renderAttachedChips() {
    const box = $('geminiAttachedChips');
    if (!box) return;
    box.innerHTML = '';
    attachedGeminiFiles.forEach((file, idx) => {
      const chip = document.createElement('span');
      chip.className = 'attached-chip';
      chip.title = file.path;
      const prefix = file.prefix || '@';
      chip.innerHTML = `<span>${escapeHtml(prefix + file.name)}</span><button type="button" title="제거">×</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        attachedGeminiFiles.splice(idx, 1);
        renderAttachedChips();
      });
      box.appendChild(chip);
    });
  }

  function hideMentionPopup() {
    const popup = $('geminiMentionPopup');
    if (popup) {
      popup.classList.add('hidden');
      popup.innerHTML = '';
    }
    mentionResults = [];
    mentionIndex = 0;
  }

  function selectMentionFile(file) {
    if (!file) return;
    if (!attachedGeminiFiles.some((f) => f.path === file.path)) {
      attachedGeminiFiles.push({
        name: file.name,
        path: file.path,
        prefix: mentionMode,
        isUrl: Boolean(file.isUrl)
      });
      renderAttachedChips();
    }
    const input = $('geminiInput');
    if (input) {
      if (mentionMode === '/') {
        input.value = input.value.replace(/(^|\s)\/([^\s/]*)$/, '$1').trimStart();
      } else {
        input.value = input.value.replace(/@([^\s@]*)$/, '').trimStart();
      }
      input.focus();
    }
    hideMentionPopup();
  }

  function renderMentionPopup() {
    const popup = $('geminiMentionPopup');
    if (!popup) return;
    if (mentionResults.length === 0) {
      hideMentionPopup();
      return;
    }
    popup.innerHTML = '';
    mentionResults.forEach((file, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mention-item${idx === mentionIndex ? ' active' : ''}`;
      btn.innerHTML = `<span class="mention-item-name">${escapeHtml(file.name)}</span><span class="mention-item-rel">${escapeHtml(file.rel)}</span>`;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectMentionFile(file);
      });
      popup.appendChild(btn);
    });
    popup.classList.remove('hidden');
  }

  if ($('geminiAttachBtn')) {
    $('geminiAttachBtn').addEventListener('click', async () => {
      let pickedPaths = [];
      if (api.pickFiles) {
        const res = await api.pickFiles();
        if (res?.ok && res.paths?.length) pickedPaths = res.paths;
      } else if (api.pickApp) {
        const res = await api.pickApp();
        if (res?.ok && res.path) pickedPaths = [res.path];
      }
      if (pickedPaths.length > 0) {
        for (const p of pickedPaths) {
          if (!attachedGeminiFiles.some((f) => f.path === p)) {
            const name = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
            attachedGeminiFiles.push({ name, path: p, prefix: '@' });
          }
        }
        renderAttachedChips();
        $('geminiInput')?.focus();
      }
    });
  }

  const geminiTabPanel = $('tab-gemini');
  if (geminiTabPanel) {
    document.addEventListener('dragover', (e) => {
      if (!geminiTabPanel.classList.contains('active')) return;
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    document.addEventListener('drop', (e) => {
      if (!geminiTabPanel.classList.contains('active')) return;
      const droppedFiles = e.dataTransfer?.files?.length
        ? Array.from(e.dataTransfer.files)
        : Array.from(e.dataTransfer?.items || [])
            .filter((it) => it.kind === 'file')
            .map((it) => it.getAsFile())
            .filter(Boolean);
      if (!droppedFiles.length) return;
      e.preventDefault();
      e.stopPropagation();
      let added = 0;
      for (const file of droppedFiles) {
        const p = api.getFilePath ? api.getFilePath(file) : file.path;
        if (!p || attachedGeminiFiles.some((f) => f.path === p)) continue;
        const name = file.name || p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
        attachedGeminiFiles.push({ name, path: p, prefix: '@' });
        added++;
      }
      if (added > 0) {
        renderAttachedChips();
        $('geminiInput')?.focus();
      }
    });
  }

  if ($('geminiInput')) {
    $('geminiInput').addEventListener('input', () => {
      const val = $('geminiInput').value;
      const slashMatch = val.match(/(?:^|\s)\/([^\s/]*)$/);
      const atMatch = val.match(/@([^\s@]*)$/);

      if (slashMatch) {
        mentionMode = '/';
        const q = slashMatch[1].trim().toLowerCase();
        clearTimeout(mentionTimer);
        const pinned = Array.isArray(appData.pinnedFiles) ? appData.pinnedFiles : [];
        mentionResults = pinned
          .filter((f) => !q || (f.name || '').toLowerCase().includes(q) || (f.path || '').toLowerCase().includes(q))
          .slice(0, 12)
          .map((f) => ({
            name: f.name || f.path,
            path: f.path,
            isUrl: Boolean(f.isUrl),
            rel: f.isUrl ? '웹 링크' : f.path
          }));
        mentionIndex = 0;
        renderMentionPopup();
        return;
      }

      if (!atMatch || !api.searchLocalFiles) {
        hideMentionPopup();
        return;
      }
      mentionMode = '@';
      const query = atMatch[1];
      clearTimeout(mentionTimer);
      mentionTimer = setTimeout(async () => {
        const files = await api.searchLocalFiles(query);
        mentionResults = Array.isArray(files) ? files : [];
        mentionIndex = 0;
        renderMentionPopup();
      }, 120);
    });

    $('geminiInput').addEventListener('keydown', (e) => {
      const popup = $('geminiMentionPopup');
      if (!popup || popup.classList.contains('hidden') || mentionResults.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionResults.length;
        renderMentionPopup();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionIndex = (mentionIndex - 1 + mentionResults.length) % mentionResults.length;
        renderMentionPopup();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMentionFile(mentionResults[mentionIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideMentionPopup();
      }
    });

    $('geminiInput').addEventListener('blur', () => {
      setTimeout(hideMentionPopup, 150);
    });
  }

  if ($('geminiForm')) {
    $('geminiForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('geminiInput');
      const prompt = input.value.trim();
      if (!prompt) return;
      const filesToAttach = attachedGeminiFiles.slice();
      attachedGeminiFiles = [];
      renderAttachedChips();
      hideMentionPopup();
      input.value = '';
      const displayPrompt = filesToAttach.length > 0
        ? `${prompt}\n[첨부: ${filesToAttach.map((f) => f.name).join(', ')}]`
        : prompt;
      const history = getGeminiHistory();
      history.push({ role: 'user', text: displayPrompt });
      renderGeminiMessages();

      const sendBtn = $('geminiSendBtn');
      sendBtn.disabled = true;

      const contents = history
        .filter((m) => !m.isError && !m.isLoading)
        .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
      const loadingMsg = { role: 'model', text: '', isLoading: true };
      history.push(loadingMsg);
      renderGeminiMessages();

      const getSelectedGeminiModel = () => appData?.settings?.geminiModel || 'gemini-3.8-flash';
      const model = getSelectedGeminiModel();
      let res;
      try {
        res = await api.askGemini({ model, contents, attachedFiles: filesToAttach });
      } finally {
        const idx = history.indexOf(loadingMsg);
        if (idx !== -1) history.splice(idx, 1);
        sendBtn.disabled = false;
      }

      if (res && res.ok) {
        history.push({ role: 'model', text: res.text });
      } else {
        history.push({ role: 'model', text: res?.error || '오류가 발생했습니다.', isError: true });
      }
      renderGeminiMessages();
      await persistData();
    });
  }

  function updateTodoViewModeBtn() {
    const btn = $('todoViewModeBtn');
    if (!btn) return;
    const isSummary = Boolean(appData?.settings?.todoSummaryMode);
    btn.classList.toggle('active', isSummary);
    btn.title = isSummary ? '자세히 보기로 전환' : '요약 보기로 전환';
    btn.innerHTML = isSummary
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1"></rect><rect x="3" y="14" width="18" height="6" rx="1"></rect></svg>'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="14" y2="18"></line></svg>';
  }

  if ($('todoViewModeBtn')) {
    $('todoViewModeBtn').addEventListener('click', async () => {
      if (!appData.settings) appData.settings = {};
      appData.settings.todoSummaryMode = !appData.settings.todoSummaryMode;
      updateTodoViewModeBtn();
      renderTodos();
      await persistData();
    });
  }

  // Cross-section Drag & Drop (To-Do <-> Later/No-Due Dock)
  const todoListEl = $('todoList');
  const noDueDockEl = $('noDueDock');
  if (todoListEl && noDueDockEl) {
    const setupDropTarget = (el, targetLater) => {
      el.addEventListener('dragover', (e) => {
        if (!draggedTodoId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        el.classList.add('drop-active');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) {
          el.classList.remove('drop-active');
        }
      });
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.classList.remove('drop-active');
        const id = draggedTodoId || e.dataTransfer?.getData('text/plain');
        draggedTodoId = null;
        if (!id) return;
        const item = appData.items.find((t) => t.id === id);
        if (!item) return;
        item.later = targetLater;
        if (!targetLater && !item.dueDate) {
          item.dueDate = getTodayDateString();
        }
        renderTodos();
        renderCalendar();
        await persistData();
      });
    };
    setupDropTarget(noDueDockEl, true);
    setupDropTarget(todoListEl, false);
  }

  // Calendar Tab controls
  if ($('calPrevBtn')) {
    $('calPrevBtn').addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) {
        calMonth = 11;
        calYear--;
      }
      renderCalendar();
    });
  }
  if ($('calNextBtn')) {
    $('calNextBtn').addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) {
        calMonth = 0;
        calYear++;
      }
      renderCalendar();
    });
  }
  if ($('calTodayBtn')) {
    $('calTodayBtn').addEventListener('click', () => {
      const now = new Date();
      calYear = now.getFullYear();
      calMonth = now.getMonth();
      calSelectedDate = getTodayDateString();
      renderCalendar();
    });
  }
  if ($('calToggleAddBtn')) {
    $('calToggleAddBtn').addEventListener('click', () => {
      const form = $('calAddForm');
      if (!form) return;
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden')) {
        $('calTitleInput')?.focus();
      }
    });
  }
  if ($('calWeeklyToggleBtn')) {
    $('calWeeklyToggleBtn').addEventListener('click', () => {
      isCalWeeklyMode = !isCalWeeklyMode;
      $('calWeeklyToggleBtn').classList.toggle('active', isCalWeeklyMode);
      $('calRepeatOpts')?.classList.toggle('hidden', !isCalWeeklyMode);
    });
  }
  if ($('calAddForm')) {
    $('calAddForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('calTitleInput').value.trim();
      if (!title) return;
      if (!Array.isArray(appData.calendarEvents)) appData.calendarEvents = [];
      appData.calendarEvents.push({
        id: String(Date.now()),
        date: calSelectedDate || getTodayDateString(),
        time: $('calTimeInput')?.value || '',
        repeat: isCalWeeklyMode ? 'weekly' : 'none',
        repeatUntil: isCalWeeklyMode ? ($('calRepeatUntilInput')?.value || '') : '',
        title
      });
      $('calTitleInput').value = '';
      if ($('calTimeInput')) $('calTimeInput').value = '';
      if ($('calRepeatUntilInput')) $('calRepeatUntilInput').value = '';
      isCalWeeklyMode = false;
      $('calWeeklyToggleBtn')?.classList.remove('active');
      $('calRepeatOpts')?.classList.add('hidden');
      $('calAddForm').classList.add('hidden');
      renderCalendar();
      await persistData();
    });
  }

  function syncGeminiModelUI() {
    const current = appData?.settings?.geminiModel || 'gemini-3.8-flash';
    const btn = $('geminiModelBtn');
    const menu = $('geminiModelMenu');
    if (!btn || !menu) return;
    let activeLabel = '3.8 Flash';
    menu.querySelectorAll('.gemini-model-option').forEach((opt) => {
      const isMatch = opt.dataset.model === current;
      opt.classList.toggle('active', isMatch);
      if (isMatch) activeLabel = opt.textContent.trim();
    });
    btn.textContent = `${activeLabel} ▾`;
  }

  if ($('geminiModelBtn') && $('geminiModelMenu')) {
    $('geminiModelBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      $('geminiModelMenu').classList.toggle('hidden');
    });
    $('geminiModelMenu').querySelectorAll('.gemini-model-option').forEach((opt) => {
      opt.addEventListener('click', async () => {
        if (!appData.settings) appData.settings = {};
        appData.settings.geminiModel = opt.dataset.model;
        syncGeminiModelUI();
        $('geminiModelMenu').classList.add('hidden');
        await persistData();
      });
    });
    document.addEventListener('click', (e) => {
      if (!$('geminiModelWrap')?.contains(e.target)) {
        $('geminiModelMenu')?.classList.add('hidden');
      }
    });
  }

  // Global Ctrl+Z (Undo) / Ctrl+Y or Ctrl+Shift+Z (Redo)
  async function applyHistorySnapshot(snapStr, label) {
    try {
      isRestoringHistory = true;
      appData = JSON.parse(snapStr);
      renderHeaderDday();
      renderTagFilters();
      renderTodos();
      renderCalendar();
      renderExamCard();
      renderStudyPlans();
      renderQuickLinks();
      renderMemoNotes();
      renderPinnedFiles();
      syncGeminiModelUI();
      await persistData();
      showUndoToast(label);
    } finally {
      isRestoringHistory = false;
    }
  }

  document.addEventListener('keydown', async (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      if (undoStack.length === 0) return;
      e.preventDefault();
      const prev = undoStack.pop();
      redoStack.push(JSON.stringify(appData));
      await applyHistorySnapshot(prev, '실행 취소 (Ctrl+Z)');
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      if (redoStack.length === 0) return;
      e.preventDefault();
      const next = redoStack.pop();
      undoStack.push(JSON.stringify(appData));
      await applyHistorySnapshot(next, '다시 실행');
    }
  });

  // Multi-Memo Pad & Sticky Note Cards
  function ensureMemoNotes() {
    if (!Array.isArray(appData.memoNotes)) appData.memoNotes = [];
    if (appData.memoNotes.length === 0) {
      appData.memoNotes.push({
        id: String(Date.now()),
        text: appData.memoText || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    if (!appData.memoNotes.some((n) => n.id === appData.activeMemoId)) {
      appData.activeMemoId = appData.memoNotes[0].id;
    }
    return appData.memoNotes;
  }

  function getActiveMemo() {
    const notes = ensureMemoNotes();
    return notes.find((n) => n.id === appData.activeMemoId) || notes[0];
  }

  function syncMemoEditor() {
    const active = getActiveMemo();
    if ($('memoTextarea')) {
      $('memoTextarea').value = active?.text || '';
    }
  }

  async function createNewMemo() {
    const notes = ensureMemoNotes();
    const now = Date.now();
    const newMemo = { id: String(now), text: '', createdAt: now, updatedAt: now };
    notes.unshift(newMemo);
    appData.activeMemoId = newMemo.id;
    syncMemoEditor();
    renderMemoNotes();
    $('memoTextarea')?.focus();
    await persistData();
  }

  function renderMemoNotes() {
    const list = $('memoNotesList');
    if (!list) return;
    const notes = ensureMemoNotes();
    list.innerHTML = '';

    notes.forEach((n, idx) => {
      const lines = (n.text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const title = lines[0] || `새 메모 ${idx + 1}`;
      const ts = n.createdAt || (Number(n.id) > 1000000000000 ? Number(n.id) : n.updatedAt);
      let createdLabel = '';
      if (ts) {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          createdLabel = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
        }
      }
      const snippet = lines.length > 0 ? (createdLabel || '작성됨') : '비어 있음';
      const li = document.createElement('li');
      li.className = `memo-card${n.id === appData.activeMemoId ? ' active' : ''}`;
      li.innerHTML = `
        <div class="memo-card-title">${escapeHtml(title)}</div>
        <div class="memo-card-snippet">${escapeHtml(snippet)}</div>
        <button type="button" class="memo-card-del" title="메모 삭제">×</button>
      `;
      li.addEventListener('click', async (e) => {
        if (e.target.closest('.memo-card-del')) return;
        appData.activeMemoId = n.id;
        syncMemoEditor();
        renderMemoNotes();
        $('memoTextarea')?.focus();
        await persistData();
      });
      li.querySelector('.memo-card-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        appData.memoNotes = notes.filter((x) => x.id !== n.id);
        ensureMemoNotes();
        syncMemoEditor();
        renderMemoNotes();
        await persistData();
      });
      list.appendChild(li);
    });

    const addCard = document.createElement('li');
    addCard.className = 'memo-card add-new';
    addCard.textContent = '+ 새 메모 추가';
    addCard.addEventListener('click', createNewMemo);
    list.appendChild(addCard);
  }

  let memoSaveTimer = null;
  if ($('memoTextarea')) {
    syncMemoEditor();
    $('memoTextarea').addEventListener('input', () => {
      const active = getActiveMemo();
      active.text = $('memoTextarea').value;
      active.updatedAt = Date.now();
      appData.memoText = active.text;
      renderMemoNotes();
      if (memoSaveTimer) clearTimeout(memoSaveTimer);
      memoSaveTimer = setTimeout(() => { persistData(); }, 300);
    });
  }
  if ($('newMemoBtn')) {
    $('newMemoBtn').addEventListener('click', createNewMemo);
  }
  if ($('copyMemoBtn')) {
    $('copyMemoBtn').addEventListener('click', async () => {
      const txt = $('memoTextarea')?.value || '';
      if (!txt) return;
      try {
        await navigator.clipboard.writeText(txt);
        showUndoToast('메모 복사됨');
      } catch {}
    });
  }
  if ($('clearMemoBtn')) {
    $('clearMemoBtn').addEventListener('click', async () => {
      const active = getActiveMemo();
      if ($('memoTextarea')) $('memoTextarea').value = '';
      active.text = '';
      appData.memoText = '';
      renderMemoNotes();
      await persistData();
    });
  }

  // ---------- Pinned Files Drop-Zone Tab ----------
  let draggedPinnedFileId = null;

  async function addPinnedFilePaths(paths) {
    if (!paths || paths.length === 0) return;
    if (!Array.isArray(appData.pinnedFiles)) appData.pinnedFiles = [];
    let added = 0;
    for (const filePath of paths) {
      if (!filePath) continue;
      if (appData.pinnedFiles.some((f) => f.path === filePath)) continue;
      const parts = filePath.replace(/[\\/]+$/, '').split(/[\\/]/);
      const name = parts[parts.length - 1] || filePath;
      appData.pinnedFiles.unshift({
        id: 'pf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        name,
        path: filePath,
        addedAt: Date.now()
      });
      added++;
    }
    if (added > 0) {
      renderPinnedFiles();
      await persistData();
      showUndoToast(`${added}개 파일 바로가기 등록됨`);
    } else {
      showUndoToast('이미 등록된 파일입니다');
    }
  }

  async function addFileFromPicker() {
    if (api.pickFiles) {
      const picked = await api.pickFiles();
      if (picked?.ok && picked.paths?.length) {
        await addPinnedFilePaths(picked.paths);
      }
      return;
    }
    if (!api.pickApp) return;
    const picked = await api.pickApp();
    if (picked?.ok && picked.path) {
      await addPinnedFilePaths([picked.path]);
    }
  }

  async function addPinnedUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return false;
    let urlStr = trimmed;
    if (!/^https?:\/\//i.test(urlStr)) {
      if (!/\s/.test(urlStr) && urlStr.includes('.')) {
        urlStr = 'https://' + urlStr;
      } else {
        showUndoToast('올바른 웹 링크(URL)를 입력하세요');
        return false;
      }
    }
    let label = urlStr;
    try {
      const u = new URL(urlStr);
      label = u.hostname.replace(/^www\./i, '') + (u.pathname && u.pathname !== '/' ? u.pathname : '');
      if (label.length > 36) label = label.slice(0, 35) + '…';
    } catch {
      showUndoToast('올바른 웹 링크(URL)를 입력하세요');
      return false;
    }
    if (!Array.isArray(appData.pinnedFiles)) appData.pinnedFiles = [];
    if (appData.pinnedFiles.some((f) => f.path === urlStr)) {
      showUndoToast('이미 등록된 링크입니다');
      return true;
    }
    appData.pinnedFiles.unshift({
      id: 'pf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name: label,
      path: urlStr,
      isUrl: true,
      addedAt: Date.now()
    });
    renderPinnedFiles();
    await persistData();
    showUndoToast('웹 링크 바로가기 등록됨');
    return true;
  }

  function renderPinnedFiles() {
    const list = $('pinnedFilesList');
    if (!list) return;
    list.innerHTML = '';
    const files = Array.isArray(appData.pinnedFiles) ? appData.pinnedFiles : [];
    files.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'pinned-file-card';
      li.draggable = true;
      li.title = item.path;

      const iconWrap = document.createElement('div');
      iconWrap.className = 'pinned-file-icon';
      if (item.isUrl) {
        const img = document.createElement('img');
        img.src = `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(item.path)}`;
        img.alt = '';
        img.onerror = () => {
          iconWrap.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
        };
        iconWrap.appendChild(img);
      } else {
        const cached = fileIconCache.get(item.path);
        if (cached) {
          const img = document.createElement('img');
          img.src = cached;
          img.alt = '';
          iconWrap.appendChild(img);
        } else {
          iconWrap.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
          if (api.getFileIcon) {
            api.getFileIcon(item.path).then((dataUrl) => {
              if (dataUrl) {
                fileIconCache.set(item.path, dataUrl);
                iconWrap.innerHTML = '';
                const img = document.createElement('img');
                img.src = dataUrl;
                img.alt = '';
                iconWrap.appendChild(img);
              }
            });
          }
        }
      }

      const meta = document.createElement('div');
      meta.className = 'pinned-file-meta';

      const nameEl = document.createElement('span');
      nameEl.className = 'pinned-file-name';
      nameEl.textContent = item.name || item.path;

      const pathEl = document.createElement('span');
      pathEl.className = 'pinned-file-path';
      pathEl.textContent = item.path;

      meta.appendChild(nameEl);
      meta.appendChild(pathEl);

      const delBtn = document.createElement('button');
      delBtn.className = 'pinned-file-del';
      delBtn.type = 'button';
      delBtn.title = '목록에서 제거';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        appData.pinnedFiles = (appData.pinnedFiles || []).filter((f) => f.id !== item.id);
        renderPinnedFiles();
        await persistData();
      });

      li.addEventListener('click', () => {
        if (item.isUrl) {
          if (api.openExternal) api.openExternal(item.path);
        } else {
          if (api.openPath) api.openPath(item.path);
        }
      });

      li.addEventListener('dragstart', (e) => {
        draggedPinnedFileId = item.id;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
      });
      li.addEventListener('dragend', () => {
        draggedPinnedFileId = null;
        li.classList.remove('dragging');
        list.querySelectorAll('.pinned-file-card.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });
      li.addEventListener('dragover', (e) => {
        if (!draggedPinnedFileId || draggedPinnedFileId === item.id) return;
        e.preventDefault();
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
      });
      li.addEventListener('drop', async (e) => {
        if (!draggedPinnedFileId || draggedPinnedFileId === item.id) return;
        e.preventDefault();
        e.stopPropagation();
        li.classList.remove('drag-over');
        const arr = appData.pinnedFiles || [];
        const fromIdx = arr.findIndex((f) => f.id === draggedPinnedFileId);
        const toIdx = arr.findIndex((f) => f.id === item.id);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [moved] = arr.splice(fromIdx, 1);
          arr.splice(toIdx, 0, moved);
          renderPinnedFiles();
          await persistData();
        }
      });

      li.appendChild(iconWrap);
      li.appendChild(meta);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  }

  const filesTabPanel = $('tab-files');
  const filesDropZone = $('filesDropZone');
  const fileUrlInput = $('fileUrlInput');
  const fileUrlAddBtn = $('fileUrlAddBtn');
  if (filesDropZone) {
    filesDropZone.addEventListener('click', () => {
      addFileFromPicker();
    });
  }
  const submitFileUrl = async () => {
    if (!fileUrlInput) return;
    const ok = await addPinnedUrl(fileUrlInput.value);
    if (ok) fileUrlInput.value = '';
  };
  if (fileUrlInput) {
    fileUrlInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        await submitFileUrl();
      }
    });
  }
  if (fileUrlAddBtn) {
    fileUrlAddBtn.addEventListener('click', submitFileUrl);
  }
  const pickFoldersBtn = $('pickFoldersBtn');
  if (pickFoldersBtn) {
    pickFoldersBtn.addEventListener('click', async () => {
      if (!api.pickFolders) return;
      const picked = await api.pickFolders();
      if (picked?.ok && picked.paths?.length) {
        await addPinnedFilePaths(picked.paths);
      }
    });
  }
  if (filesTabPanel) {
    const isInternalDrag = () => Boolean(draggedPinnedFileId || draggedTabName || draggedTodoId || draggedLinkId);
    document.addEventListener('dragover', (e) => {
      if (!filesTabPanel.classList.contains('active') || isInternalDrag()) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      filesTabPanel.classList.add('drag-over');
    });
    document.addEventListener('dragleave', (e) => {
      if (!filesTabPanel.classList.contains('active')) return;
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        filesTabPanel.classList.remove('drag-over');
      }
    });
    document.addEventListener('drop', async (e) => {
      if (!filesTabPanel.classList.contains('active') || isInternalDrag()) return;
      e.preventDefault();
      e.stopPropagation();
      filesTabPanel.classList.remove('drag-over');
      const droppedFiles = e.dataTransfer?.files?.length
        ? Array.from(e.dataTransfer.files)
        : Array.from(e.dataTransfer?.items || [])
            .filter((it) => it.kind === 'file')
            .map((it) => it.getAsFile())
            .filter(Boolean);
      if (droppedFiles.length) {
        const paths = [];
        for (const file of droppedFiles) {
          const p = api.getFilePath ? api.getFilePath(file) : file.path;
          if (p) paths.push(p);
        }
        if (paths.length > 0) {
          await addPinnedFilePaths(paths);
        } else {
          showUndoToast('파일 경로를 읽을 수 없습니다');
        }
        return;
      }
      const uriList = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
      const firstUrl = uriList.split(/\r?\n/).find((line) => /^https?:\/\//i.test(line.trim()));
      if (firstUrl) {
        await addPinnedUrl(firstUrl.trim());
      }
    });
  }

  const linksTabPanel = $('tab-links');
  if (linksTabPanel) {
    const isInternalLinksDrag = () => Boolean(draggedLinkId || draggedTabName || draggedTodoId || draggedPinnedFileId);
    document.addEventListener('dragover', (e) => {
      if (!linksTabPanel.classList.contains('active') || isInternalLinksDrag()) return;
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    document.addEventListener('drop', async (e) => {
      if (!linksTabPanel.classList.contains('active') || isInternalLinksDrag()) return;
      const droppedFiles = e.dataTransfer?.files?.length
        ? Array.from(e.dataTransfer.files)
        : Array.from(e.dataTransfer?.items || [])
            .filter((it) => it.kind === 'file')
            .map((it) => it.getAsFile())
            .filter(Boolean);
      if (!droppedFiles.length) return;
      e.preventDefault();
      e.stopPropagation();
      if (!Array.isArray(appData.quickLinks)) appData.quickLinks = [];
      let added = 0;
      for (const file of droppedFiles) {
        const p = api.getFilePath ? api.getFilePath(file) : file.path;
        if (!p || appData.quickLinks.some((l) => l.url === p)) continue;
        const name = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
        appData.quickLinks.unshift({
          id: 'ql-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          title: name,
          url: p
        });
        added++;
      }
      if (added > 0) {
        renderQuickLinks();
        await persistData();
        showUndoToast(`${added}개 바로가기 추가됨`);
      } else {
        showUndoToast('이미 등록된 바로가기입니다');
      }
    });
  }

  // Focus Timer Tab
  const POMO_MODES = {
    focus: { label: '집중 타이머', minutes: 25 },
    short: { label: '집중 타이머', minutes: 5 },
    long: { label: '집중 타이머', minutes: 15 },
    deep: { label: '집중 타이머', minutes: 50 },
    custom: { label: '직접 설정', minutes: 25 }
  };
  const POMO_RING_CIRCUMFERENCE = 2 * Math.PI * 60;

  let pomoMode = 'focus';
  let pomoTotalSec = POMO_MODES.focus.minutes * 60;
  let pomoRemainingSec = pomoTotalSec;
  let pomoRunning = false;
  let pomoEndAt = 0;
  let pomoInterval = null;
  let pomoSoundEnabled = true;
  let pomoAlarmRinging = false;
  let pomoAlarmLoopTimer = null;
  let pomoAlarmAutoStopTimer = null;
  let pomoAudioCtx = null;

  function playAlarmPhrase() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!pomoAudioCtx || pomoAudioCtx.state === 'closed') {
        pomoAudioCtx = new AudioCtx();
      }
      if (pomoAudioCtx.state === 'suspended') {
        pomoAudioCtx.resume().catch(() => {});
      }
      const notes = [523.25, 659.25, 783.99, 987.77, 783.99, 659.25];
      notes.forEach((freq, idx) => {
        const osc = pomoAudioCtx.createOscillator();
        const gain = pomoAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = pomoAudioCtx.currentTime + idx * 0.22;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.52);
        osc.connect(gain);
        gain.connect(pomoAudioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.54);
      });
    } catch {}
  }

  function stopPomodoroAlarm() {
    if (pomoAlarmLoopTimer) {
      clearInterval(pomoAlarmLoopTimer);
      pomoAlarmLoopTimer = null;
    }
    if (pomoAlarmAutoStopTimer) {
      clearTimeout(pomoAlarmAutoStopTimer);
      pomoAlarmAutoStopTimer = null;
    }
    if (pomoAudioCtx) {
      try { pomoAudioCtx.close(); } catch {}
      pomoAudioCtx = null;
    }
    if (pomoAlarmRinging) {
      pomoAlarmRinging = false;
      renderPomodoro();
    }
  }

  function startPomodoroAlarm() {
    stopPomodoroAlarm();
    if (!pomoSoundEnabled) return;
    pomoAlarmRinging = true;
    playAlarmPhrase();
    pomoAlarmLoopTimer = setInterval(() => {
      if (!pomoAlarmRinging || !pomoSoundEnabled) {
        stopPomodoroAlarm();
        return;
      }
      playAlarmPhrase();
    }, 2400);
    pomoAlarmAutoStopTimer = setTimeout(() => {
      stopPomodoroAlarm();
    }, 20 * 1000);
    renderPomodoro();
  }

  function getTodayPomoStats() {
    const today = getTodayDateString();
    if (!appData.pomodoroStats || appData.pomodoroStats.date !== today) {
      appData.pomodoroStats = { date: today, count: 0, focusMinutes: 0 };
    }
    return appData.pomodoroStats;
  }

  function renderPomodoro() {
    const cfg = POMO_MODES[pomoMode] || POMO_MODES.focus;
    const mins = Math.floor(Math.max(0, pomoRemainingSec) / 60);
    const secs = Math.max(0, pomoRemainingSec) % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const displayEl = $('pomoTimeDisplay');
    const phaseEl = $('pomoPhaseLabel');
    const ringEl = $('pomoRingProgress');
    const startBtn = $('pomoStartBtn');
    const dotEl = $('pomoRunningDot');
    const cycleEl = $('pomoCycleDots');
    const statsEl = $('pomoTodayStats');
    const taskInput = $('pomoTaskInput');
    const soundBtn = $('pomoSoundToggleBtn');

    if (displayEl) displayEl.textContent = timeStr;
    if (phaseEl) phaseEl.textContent = pomoAlarmRinging ? '타이머 완료!' : cfg.label;
    if (startBtn) {
      startBtn.textContent = pomoAlarmRinging ? '알림 끄기' : (pomoRunning ? '일시정지' : '시작');
      startBtn.classList.toggle('alarming', pomoAlarmRinging);
    }
    if (dotEl) dotEl.classList.toggle('hidden', !pomoRunning && !pomoAlarmRinging);

    if (ringEl) {
      ringEl.style.strokeDasharray = String(POMO_RING_CIRCUMFERENCE);
      const ratio = pomoTotalSec > 0 ? pomoRemainingSec / pomoTotalSec : 0;
      ringEl.style.strokeDashoffset = String(POMO_RING_CIRCUMFERENCE * (1 - ratio));
      ringEl.classList.remove('mode-short', 'mode-long', 'mode-deep');
      if (pomoMode === 'short' || pomoMode === 'long' || pomoMode === 'deep') {
        ringEl.classList.add(`mode-${pomoMode}`);
      }
    }

    const stats = getTodayPomoStats();
    if (statsEl) {
      statsEl.textContent = `오늘 완료: ${stats.count}회 · ${stats.focusMinutes}분 집중`;
    }

    if (soundBtn) {
      soundBtn.innerHTML = pomoSoundEnabled
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg><span>알림음 켜짐</span>`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg><span>알림음 꺼짐</span>`;
    }

    document.querySelectorAll('.pomo-mode-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.pomoMode === pomoMode);
    });
  }

  function stopPomodoroInterval() {
    if (pomoInterval) {
      clearInterval(pomoInterval);
      pomoInterval = null;
    }
    pomoRunning = false;
  }

  function setPomodoroMode(mode) {
    stopPomodoroAlarm();
    stopPomodoroInterval();
    pomoMode = POMO_MODES[mode] ? mode : 'focus';
    pomoTotalSec = POMO_MODES[pomoMode].minutes * 60;
    pomoRemainingSec = pomoTotalSec;
    renderPomodoro();
  }

  async function completePomodoroPhase() {
    stopPomodoroInterval();
    const cfg = POMO_MODES[pomoMode] || POMO_MODES.focus;

    const stats = getTodayPomoStats();
    stats.count += 1;
    stats.focusMinutes += cfg.minutes;
    await persistData();

    if (api.showWindow) {
      api.showWindow();
    }
    switchToTab('pomodoro');

    pomoTotalSec = cfg.minutes * 60;
    pomoRemainingSec = pomoTotalSec;
    showUndoToast(`${cfg.minutes}분 타이머 완료!`);

    if (pomoSoundEnabled) {
      startPomodoroAlarm();
    } else {
      renderPomodoro();
    }
  }

  function startPomodoro() {
    if (pomoAlarmRinging) {
      stopPomodoroAlarm();
      return;
    }
    if (pomoRunning) {
      pomoRemainingSec = Math.max(0, Math.ceil((pomoEndAt - Date.now()) / 1000));
      stopPomodoroInterval();
      renderPomodoro();
      return;
    }
    if (pomoRemainingSec <= 0) {
      pomoRemainingSec = pomoTotalSec;
    }
    pomoRunning = true;
    pomoEndAt = Date.now() + pomoRemainingSec * 1000;
    renderPomodoro();

    pomoInterval = setInterval(() => {
      const left = Math.ceil((pomoEndAt - Date.now()) / 1000);
      if (left <= 0) {
        pomoRemainingSec = 0;
        renderPomodoro();
        completePomodoroPhase();
      } else if (left !== pomoRemainingSec) {
        pomoRemainingSec = left;
        renderPomodoro();
      }
    }, 250);
  }

  document.querySelectorAll('.pomo-mode-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const mode = chip.dataset.pomoMode;
      if (mode === 'custom') {
        openInlinePomoEdit();
      } else {
        setPomodoroMode(mode);
      }
    });
  });

  function openInlinePomoEdit() {
    if (pomoRunning) return;
    const displayEl = $('pomoTimeDisplay');
    const inlineInput = $('pomoInlineMinInput');
    if (!displayEl || !inlineInput) return;
    const curMins = Math.max(1, Math.round(pomoTotalSec / 60));
    inlineInput.value = String(curMins);
    displayEl.classList.add('hidden');
    inlineInput.classList.remove('hidden');
    inlineInput.focus();
    inlineInput.select();
  }

  function commitInlinePomoEdit(apply) {
    const displayEl = $('pomoTimeDisplay');
    const inlineInput = $('pomoInlineMinInput');
    if (!displayEl || !inlineInput || inlineInput.classList.contains('hidden')) return;
    const raw = inlineInput.value.replace(/[^0-9]/g, '');
    inlineInput.classList.add('hidden');
    displayEl.classList.remove('hidden');
    if (!apply) return;
    const mins = parseInt(raw, 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 180) {
      showUndoToast('1~180분 사이로 입력해 주세요');
      return;
    }
    POMO_MODES.custom.minutes = mins;
    setPomodoroMode('custom');
  }

  $('pomoInlineMinInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitInlinePomoEdit(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      commitInlinePomoEdit(false);
    }
  });
  $('pomoInlineMinInput')?.addEventListener('blur', () => {
    commitInlinePomoEdit(true);
  });

  $('pomoStartBtn')?.addEventListener('click', startPomodoro);

  $('pomoResetBtn')?.addEventListener('click', () => {
    setPomodoroMode(pomoMode);
  });

  $('pomoSoundToggleBtn')?.addEventListener('click', () => {
    pomoSoundEnabled = !pomoSoundEnabled;
    if (!pomoSoundEnabled && pomoAlarmRinging) {
      stopPomodoroAlarm();
    }
    renderPomodoro();
  });

  // Initial load
  syncGeminiModelUI();
  renderMemoNotes();
  renderPinnedFiles();
  renderPomodoro();
  updateTodoViewModeBtn();
  updateFooterActionButton('todo');
  renderHeaderDday();
  renderTodos();
  renderCalendar();
  renderExamCard();
  renderStudyPlans();
  renderQuickLinks();
  renderGeminiMessages();
  loadReports();
  loadNotices();
  loadMail();

  // Auto refresh notices every 15 minutes, mail every 1 hour
  setInterval(() => {
    loadNotices();
  }, 15 * 60 * 1000);
  setInterval(() => {
    if (appData.settings.appPassword) loadMail();
  }, 60 * 60 * 1000);
}

init();
