const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const tls = require('tls');
const { execFile } = require('child_process');

const DATA_FILE = path.join(app.getPath('appData'), 'my-todo-schedule-widget', 'todo-schedule-data.json');
const DEFAULT_REPORTS_DIR = 'C:\\Users\\mouph\\Desktop\\Daily Reports\\reports';
const DEFAULT_NOTICE_URL = 'https://sco.skku.edu/sco/community/notice.do';
const DEFAULT_EMAIL = 'mouphero411@gmail.com';

let mainWindow;
let tray = null;
let isAlwaysOnTop = true;
let isClickThrough = false;
let isQuitting = false;

const DEFAULT_CATEGORIES = [
  { id: 'cat-study', name: '학업', color: '#34D399', keywords: ['과제', '시험', '수업', '강의', '미팅', '캡스톤', '연구', '발표', '논문', '공부'] },
  { id: 'cat-scaa', name: 'SCAA', color: '#4361EE', keywords: ['SCAA', '성균웹진', '웹진'] }
];

function getDefaultData() {
  return {
    items: [
      { id: '1', text: '14:00 캡스톤 팀 미팅', time: '14:00', tag: '학업', priority: 'high', done: false, createdAt: Date.now() },
      { id: '2', text: '오늘의 안티그래비티 리포트 확인', time: '', tag: '리포트', priority: 'medium', done: false, createdAt: Date.now() - 1000 },
      { id: '3', text: '위젯 초기 세팅 완료', time: '', tag: '개발', priority: 'low', done: true, createdAt: Date.now() - 2000 }
    ],
    headerDday: { title: '', date: '' },
    studyExam: { title: '시험', date: '' },
    studyExams: [],
    quickLinks: [
      { id: 'link-notion', title: 'Notion 앱', url: 'notion://', openInNotionApp: true },
      { id: 'link-icampus', title: '아이캠퍼스', url: 'https://icampus.skku.edu', openInNotionApp: false },
      { id: 'link-kingo', title: '킹고포털', url: 'https://kingo.skku.edu', openInNotionApp: false }
    ],
    studyPlans: [],
    settings: {
      opacity: 1,
      reportsDir: DEFAULT_REPORTS_DIR,
      noticeUrl: DEFAULT_NOTICE_URL,
      email: DEFAULT_EMAIL,
      appPassword: '',
      seenNoticeIds: [],
      readReports: [],
      categories: DEFAULT_CATEGORIES
    }
  };
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      const def = getDefaultData();
      return {
        ...parsed,
        items: Array.isArray(parsed.items) ? parsed.items : def.items,
        headerDday: parsed.headerDday || def.headerDday,
        studyExam: parsed.studyExam || def.studyExam,
        studyExams: Array.isArray(parsed.studyExams) ? parsed.studyExams : [],
        studyPlans: Array.isArray(parsed.studyPlans) ? parsed.studyPlans : [],
        calendarEvents: Array.isArray(parsed.calendarEvents) ? parsed.calendarEvents : [],
        quickLinks: Array.isArray(parsed.quickLinks) ? parsed.quickLinks : undefined,
        geminiHistory: Array.isArray(parsed.geminiHistory) ? parsed.geminiHistory : [],
        settings: {
          ...def.settings,
          ...(parsed.settings || {}),
          categories: Array.isArray(parsed.settings?.categories) && parsed.settings.categories.length > 0
            ? parsed.settings.categories
            : DEFAULT_CATEGORIES
        }
      };
    }
  } catch (err) {
    console.error('Failed to load data:', err);
  }
  return getDefaultData();
}

let lastSelfWriteAt = 0;

function saveData(data) {
  try {
    if (fs.existsSync(DATA_FILE)) {
      try {
        fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
      } catch {}
    }
    lastSelfWriteAt = Date.now();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save data:', err);
  }
}

// 1. Scan Daily Reports directory recursively (newest first)
function scanDailyReports(baseDir) {
  const results = [];
  if (!baseDir || !fs.existsSync(baseDir)) {
    return { ok: false, error: '리포트 폴더를 찾을 수 없습니다.', files: [] };
  }

  function walk(dir, depth = 0) {
    if (depth > 2) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (/\.html$/i.test(entry.name)) {
        try {
          const stat = fs.statSync(fullPath);
          const ext = path.extname(entry.name).toLowerCase().slice(1);
          const baseName = path.basename(entry.name, path.extname(entry.name));
          const folder = path.relative(baseDir, dir) || '루트';
          results.push({
            name: entry.name,
            title: baseName,
            ext,
            folder,
            path: fullPath,
            mtime: stat.mtimeMs,
            dateStr: new Date(stat.mtimeMs).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
          });
        } catch {}
      }
    }
  }

  walk(baseDir);

  // Deduplicate same folder + title, preferring html > pdf > md
  const extPriority = { html: 3, pdf: 2, md: 1 };
  const byKey = new Map();
  for (const item of results) {
    const key = `${item.folder}::${item.title}`;
    const existing = byKey.get(key);
    if (!existing || (extPriority[item.ext] || 0) > (extPriority[existing.ext] || 0)) {
      byKey.set(key, item);
    }
  }

  const deduped = Array.from(byKey.values());
  deduped.sort((a, b) => b.mtime - a.mtime);
  return { ok: true, files: deduped.slice(0, 40) };
}

// 2. Fetch and parse SKKU notice board
async function fetchSkkuNotices(noticeUrl) {
  const targetUrl = noticeUrl || DEFAULT_NOTICE_URL;
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const html = await res.text();
  const baseObj = new URL(targetUrl);
  const items = [];
  const seen = new Set();

  // 1) Match <dl>...</dl> notice blocks (used by SKKU CMS boards like sco.skku.edu)
  const dlRegex = /<dl[^>]*>([\s\S]*?)<\/dl>/gi;
  let dlMatch;
  while ((dlMatch = dlRegex.exec(html)) !== null) {
    const dlHtml = dlMatch[1];
    const linkMatch = dlHtml.match(/<a[^>]*href=["']([^"']*articleNo=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawHref = linkMatch[1].replace(/&amp;/g, '&');
    const articleNo = linkMatch[2];
    if (seen.has(articleNo)) continue;
    seen.add(articleNo);

    let title = linkMatch[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const catMatch = dlHtml.match(/<span[^>]*class=["'][^"']*category[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const catText = catMatch ? catMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    if (catText && !title.startsWith(catText)) {
      title = `${catText} ${title}`;
    }

    const dateMatch = dlHtml.match(/(\d{4}[.-]\d{2}[.-]\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';
    const isPinned = /board-list-content-top/i.test(dlHtml) || /<li[^>]*>\s*공지\s*<\/li>/i.test(dlHtml);
    const fullUrl = new URL(rawHref, baseObj.origin + baseObj.pathname).toString();

    items.push({ id: articleNo, title, date, url: fullUrl, isPinned });
  }

  // 2) Match <tr> blocks with articleNo=
  if (items.length === 0) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const linkMatch = rowHtml.match(/<a[^>]*href=["']([^"']*articleNo=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      const rawHref = linkMatch[1].replace(/&amp;/g, '&');
      const articleNo = linkMatch[2];
      if (seen.has(articleNo)) continue;
      seen.add(articleNo);

      const title = linkMatch[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!title) continue;

      const dateMatch = rowHtml.match(/(\d{4}[.-]\d{2}[.-]\d{2})/);
      const date = dateMatch ? dateMatch[1] : '';
      const isPinned = /공지|notice|top/i.test(rowHtml) && !/^\s*<td>\s*\d+\s*<\/td>/i.test(rowHtml);
      const fullUrl = new URL(rawHref, baseObj.origin + baseObj.pathname).toString();

      items.push({ id: articleNo, title, date, url: fullUrl, isPinned });
    }
  }

  // Fallback if table rows didn't match
  if (items.length === 0) {
    const aRegex = /<a[^>]*href=["']([^"']*articleNo=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = aRegex.exec(html)) !== null) {
      const articleNo = m[2];
      if (seen.has(articleNo)) continue;
      seen.add(articleNo);
      const title = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      const fullUrl = new URL(m[1].replace(/&amp;/g, '&'), baseObj.origin + baseObj.pathname).toString();
      items.push({ id: articleNo, title, date: '', url: fullUrl, isPinned: false });
    }
  }

  return items.slice(0, 20);
}

// 3. Lightweight Gmail IMAP client over Node TLS (no external deps needed)
function decodeMimeHeader(str) {
  if (!str) return '';
  return str
    .replace(/\r?\n\s+/g, ' ')
    .replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_m, charset, enc, data) => {
      try {
        let buf;
        if (enc.toUpperCase() === 'B') {
          buf = Buffer.from(data, 'base64');
        } else {
          const qp = data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          buf = Buffer.from(qp, 'binary');
        }
        return new TextDecoder(charset.toLowerCase() === 'utf-8' ? 'utf-8' : 'utf-8', { fatal: false }).decode(buf);
      } catch {
        return data;
      }
    })
    .trim();
}

function fetchGmailImap(email, appPassword) {
  return new Promise((resolve, reject) => {
    if (!email || !appPassword) {
      return resolve({ ok: false, needsConfig: true, unreadCount: 0, messages: [] });
    }

    const cleanPass = appPassword.replace(/\s+/g, '');
    const socket = tls.connect(993, 'imap.gmail.com', { rejectUnauthorized: false });
    let buffer = '';
    let step = 0;
    let unreadCount = 0;
    let totalCount = 0;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error('IMAP 연결 시간 초과'));
      }
    }, 12000);

    function finish(result, err) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      try { socket.write('A9 LOGOUT\r\n'); } catch {}
      socket.destroy();
      if (err) reject(err);
      else resolve(result);
    }

    socket.on('error', (err) => finish(null, err));

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      if (step === 0 && buffer.includes('* OK')) {
        buffer = '';
        step = 1;
        socket.write(`A1 LOGIN "${email}" "${cleanPass}"\r\n`);
      } else if (step === 1 && buffer.includes('A1 ')) {
        if (!buffer.includes('A1 OK')) {
          return finish(null, new Error('Gmail 로그인 실패 (이메일 또는 앱 비밀번호를 확인하세요)'));
        }
        buffer = '';
        step = 2;
        socket.write('A2 STATUS INBOX (UNSEEN MESSAGES)\r\n');
      } else if (step === 2 && buffer.includes('A2 ')) {
        const unseenM = buffer.match(/UNSEEN\s+(\d+)/i);
        const msgM = buffer.match(/MESSAGES\s+(\d+)/i);
        unreadCount = unseenM ? parseInt(unseenM[1], 10) : 0;
        totalCount = msgM ? parseInt(msgM[1], 10) : 0;
        buffer = '';
        if (totalCount === 0) {
          return finish({ ok: true, unreadCount, messages: [] });
        }
        step = 3;
        socket.write('A3 EXAMINE INBOX\r\n');
      } else if (step === 3 && buffer.includes('A3 ')) {
        buffer = '';
        step = 4;
        const start = Math.max(1, totalCount - 7);
        socket.write(`A4 FETCH ${start}:${totalCount} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])\r\n`);
      } else if (step === 4 && buffer.includes('A4 OK')) {
        const messages = [];
        const blocks = buffer.split(/\* \d+ FETCH /);
        for (const blk of blocks.slice(1)) {
          const isUnread = !/\\Seen/i.test(blk.split('\n')[0] || '');
          const fromM = blk.match(/^From:\s*(.+)$/im);
          const subjM = blk.match(/^Subject:\s*(.+)$/im);
          const dateM = blk.match(/^Date:\s*(.+)$/im);
          const fromRaw = fromM ? decodeMimeHeader(fromM[1]) : '(발신자 없음)';
          const fromName = fromRaw.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || fromRaw;
          const subject = subjM ? decodeMimeHeader(subjM[1]) : '(제목 없음)';
          let dateStr = '';
          if (dateM) {
            const d = new Date(dateM[1].trim());
            if (!isNaN(d.getTime())) {
              dateStr = d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
            }
          }
          messages.push({ from: fromName, subject, date: dateStr, isUnread });
        }
        messages.reverse();
        finish({ ok: true, unreadCount, messages });
      } else if (step === 4 && (buffer.includes('A4 NO') || buffer.includes('A4 BAD'))) {
        finish(null, new Error('메일 목록 조회 실패'));
      }
    });
  });
}

const STARTUP_VBS_PATH = path.join(
  app.getPath('appData'),
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
  'MyDeskHub.vbs'
);

function getStartupVbsContent() {
  const appDir = __dirname.replace(/\\/g, '\\');
  const electronExe = process.execPath;
  return `Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.CurrentDirectory = "${appDir}"\r\nWshShell.Run """${electronExe}"" ""${appDir}""", 0, False\r\n`;
}

function isAutoStartEnabled() {
  return fs.existsSync(STARTUP_VBS_PATH);
}

function setAutoStart(enabled) {
  if (enabled) {
    fs.mkdirSync(path.dirname(STARTUP_VBS_PATH), { recursive: true });
    fs.writeFileSync(STARTUP_VBS_PATH, getStartupVbsContent(), 'utf-8');
  } else if (fs.existsSync(STARTUP_VBS_PATH)) {
    fs.unlinkSync(STARTUP_VBS_PATH);
  }
  return isAutoStartEnabled();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Archive Hub (Alt+Shift+W)');
  const menu = Menu.buildFromTemplate([
    {
      label: '위젯 열기 / 숨기기 (Alt+Shift+W)',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: '완전 종료',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    width: 376,
    height: 720,
    title: 'Archive Hub',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    frame: false,
    transparent: false,
    backgroundColor: '#1C1C1B',
    resizable: true,
    minWidth: 320,
    minHeight: 420,
    alwaysOnTop: isAlwaysOnTop,
    skipTaskbar: false,
    hasShadow: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.center();
  mainWindow.setOpacity(1.0);
  if (process.platform === 'win32' && typeof mainWindow.setAppDetails === 'function') {
    const icoPath = path.join(__dirname, 'icon.ico');
    mainWindow.setAppDetails({
      appId: 'com.momentarchive.widget',
      appIconPath: fs.existsSync(icoPath) ? icoPath : iconPath,
      relaunchCommand: `"${process.execPath}" "${__dirname}"`,
      relaunchDisplayName: 'Archive Hub'
    });
  }
  mainWindow.show();
  mainWindow.focus();

  mainWindow.loadFile('index.html');

  // Hide to system tray instead of quitting when closing the window
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Hot-reload renderer files automatically on edit
  let reloadTimer = null;
  for (const file of ['index.html', 'styles.css', 'renderer.js']) {
    try {
      fs.watch(path.join(__dirname, file), () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reloadIgnoringCache();
          }
        }, 120);
      });
    } catch {}
  }

  // Watch DATA_FILE for external updates (e.g. assistant-added tasks)
  let dataWatchTimer = null;
  try {
    const dataDir = path.dirname(DATA_FILE);
    const dataName = path.basename(DATA_FILE);
    if (fs.existsSync(dataDir)) {
      fs.watch(dataDir, (_eventType, filename) => {
        if (filename && filename !== dataName) return;
        if (Date.now() - lastSelfWriteAt < 1000) return;
        clearTimeout(dataWatchTimer);
        dataWatchTimer = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('data:external-update', loadData());
          }
        }, 150);
      });
    }
  } catch {}
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.setAppUserModelId('com.momentarchive.widget');
app.whenReady().then(() => {
  createWindow();
  createTray();

  ipcMain.handle('data:load', () => loadData());
  ipcMain.handle('data:save', (_event, data) => {
    saveData(data);
    return { ok: true };
  });

  ipcMain.handle('reports:list', (_event, dirPath) => {
    return scanDailyReports(dirPath || DEFAULT_REPORTS_DIR);
  });

  ipcMain.handle('shell:open-path', async (_event, targetPath) => {
    if (!targetPath) return false;
    const err = await shell.openPath(targetPath);
    return !err;
  });

  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (!url) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('shell:get-file-icon', async (_event, targetPath) => {
    try {
      if (!targetPath || !fs.existsSync(targetPath)) return '';
      const img = await app.getFileIcon(targetPath, { size: 'normal' });
      return img && !img.isEmpty() ? img.toDataURL() : '';
    } catch {
      return '';
    }
  });

  function readSpotifyStatus(action = '') {
    return new Promise((resolve) => {
      const scriptPath = path.join(__dirname, 'scripts', 'spotify-status.ps1');
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
      if (action) args.push('-Action', action);
      execFile(
        'powershell',
        args,
        { windowsHide: true, timeout: 4000, encoding: 'utf8' },
        (err, stdout) => {
          if (err) return resolve({ running: false, playing: false, track: '' });
          const out = (stdout || '').trim();
          if (!out.startsWith('RUNNING|')) return resolve({ running: false, playing: false, track: '' });
          const parts = out.split('|');
          const playing = parts[1] === 'PLAYING';
          const track = parts.slice(2).join('|').trim();
          resolve({ running: true, playing, track });
        }
      );
    });
  }

  ipcMain.handle('spotify:status', () => readSpotifyStatus());

  ipcMain.handle('spotify:control', async (_event, action) => {
    if (!['playpause', 'next', 'prev'].includes(action)) {
      return readSpotifyStatus();
    }
    return readSpotifyStatus(action);
  });

  ipcMain.handle('notices:fetch', async (_event, url) => {
    try {
      const items = await fetchSkkuNotices(url);
      return { ok: true, items };
    } catch (err) {
      return { ok: false, error: err.message, items: [] };
    }
  });

  ipcMain.handle('mail:fetch', async (_event, { email, appPassword }) => {
    try {
      return await fetchGmailImap(email, appPassword);
    } catch (err) {
      return { ok: false, error: err.message, unreadCount: 0, messages: [] };
    }
  });

  ipcMain.handle('window:toggle-pin', () => {
    isAlwaysOnTop = !isAlwaysOnTop;
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
    }
    return isAlwaysOnTop;
  });

  ipcMain.handle('window:toggle-lock', () => {
    isClickThrough = !isClickThrough;
    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
    }
    return isClickThrough;
  });

  ipcMain.handle('window:set-mini', (_event, isMini) => {
    if (!mainWindow) return;
    const [w] = mainWindow.getSize();
    mainWindow.setMinimumSize(320, isMini ? 96 : 420);
    mainWindow.setSize(w, isMini ? 116 : 720, true);
  });

  ipcMain.handle('window:set-opacity', (_event, val) => {
    if (mainWindow && typeof val === 'number') {
      mainWindow.setOpacity(Math.min(1, Math.max(0.45, val)));
    }
  });

  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('app:quit', () => {
    isQuitting = true;
    app.quit();
  });

  ipcMain.handle('startup:get', () => isAutoStartEnabled());
  ipcMain.handle('startup:set', (_event, enabled) => setAutoStart(Boolean(enabled)));

  ipcMain.handle('dialog:pick-app', async () => {
    if (!mainWindow) return { ok: false };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '실행할 앱 또는 바로가기 선택',
      properties: ['openFile'],
      filters: [
        { name: '앱 / 바로가기', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url', 'appref-ms'] },
        { name: '모든 파일', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false };
    }
    const picked = result.filePaths[0];
    return {
      ok: true,
      path: picked,
      name: path.basename(picked, path.extname(picked))
    };
  });

  ipcMain.handle('dialog:pick-files', async () => {
    if (!mainWindow) return { ok: false, paths: [] };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '바로가기 등록할 파일 선택',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '모든 파일', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, paths: [] };
    }
    return {
      ok: true,
      paths: result.filePaths
    };
  });

  ipcMain.handle('dialog:pick-folders', async () => {
    if (!mainWindow) return { ok: false, paths: [] };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '바로가기 등록할 폴더 선택',
      properties: ['openDirectory', 'multiSelections']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, paths: [] };
    }
    return {
      ok: true,
      paths: result.filePaths
    };
  });

  ipcMain.handle('files:search', async (_event, query) => {
    const q = String(query || '').trim().toLowerCase();
    const skkuDir = path.join(app.getPath('desktop'), 'SKKU');
    const roots = [{ label: 'SKKU', dir: skkuDir }];
    const skipDirs = new Set(['node_modules', '.git', 'dist', '.venv', '__pycache__', '.next', 'build']);
    const textExts = new Set(['.txt', '.md', '.json', '.js', '.ts', '.py', '.html', '.css', '.csv', '.log', '.yml', '.yaml', '.xml', '.sql', '.java', '.c', '.cpp', '.h', '.tex']);
    const seen = new Set();
    const results = [];

    function walk(baseLabel, baseDir, currentDir, depth) {
      if (depth > 4 || results.length >= 60) return;
      let entries;
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= 40) break;
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) {
            walk(baseLabel, baseDir, fullPath, depth + 1);
          }
          continue;
        }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!textExts.has(ext) && !q) continue;
        const normPath = fullPath.toLowerCase();
        if (seen.has(normPath)) continue;
        seen.add(normPath);
        const rel = `${baseLabel}/${path.relative(baseDir, fullPath).replace(/\\/g, '/')}`;
        if (!q || entry.name.toLowerCase().includes(q) || rel.toLowerCase().includes(q)) {
          let mtimeMs = 0;
          try { mtimeMs = fs.statSync(fullPath).mtimeMs; } catch {}
          results.push({ name: entry.name, path: fullPath, rel, ext, mtimeMs });
        }
      }
    }

    for (const r of roots) {
      if (r.dir && fs.existsSync(r.dir)) {
        walk(r.label, r.dir, r.dir, 0);
      }
    }
    results.sort((a, b) => {
      const aStarts = q && a.name.toLowerCase().startsWith(q) ? 1 : 0;
      const bStarts = q && b.name.toLowerCase().startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return b.mtimeMs - a.mtimeMs;
    });
    return results.slice(0, 15).map(({ name, path: filePath, rel, ext }) => ({ name, path: filePath, rel, ext }));
  });

  ipcMain.handle('gemini:ask', async (_event, { model, contents, attachedFiles }) => {
    const data = loadData();
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || data?.settings?.geminiApiKey || '';
    if (!apiKey) {
      return { ok: false, error: 'GEMINI_API_KEY 환경 변수가 설정되어 있지 않습니다.' };
    }
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const scheduleContext = {
      today: todayStr,
      headerDday: data.headerDday || null,
      todos: (data.items || []).map((i) => ({
        text: i.text,
        dueDate: i.dueDate || null,
        time: i.time || null,
        tag: i.tag || null,
        priority: i.priority || 'medium',
        repeat: i.repeat || 'none',
        done: Boolean(i.done)
      })),
      exams: data.studyExams || [],
      studyPlans: (data.studyPlans || []).map((p) => ({
        subject: p.subject,
        goal: p.goal,
        week: p.week,
        done: Boolean(p.done)
      }))
    };
    let attachedContext = '';
    const inlineMediaParts = [];
    const MEDIA_MIME_MAP = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mp3',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac'
    };
    if (Array.isArray(attachedFiles) && attachedFiles.length > 0) {
      const blocks = [];
      for (const f of attachedFiles.slice(0, 5)) {
        if (!f || !f.path) continue;
        if (f.isMemo || typeof f.memoText === 'string') {
          continue;
        }
        if (f.isUrl || /^https?:\/\//i.test(f.path)) {
          blocks.push(`--- Web Link: ${f.name || f.path} (${f.path}) ---`);
          continue;
        }
        try {
          if (fs.existsSync(f.path)) {
            const stat = fs.statSync(f.path);
            if (stat.isDirectory()) {
              const entries = fs.readdirSync(f.path).slice(0, 40);
              blocks.push(`--- Folder: ${f.name || path.basename(f.path)} (${f.path}) ---\n${entries.join('\n')}`);
            } else if (stat.isFile()) {
              const ext = path.extname(f.path).toLowerCase();
              const mimeType = MEDIA_MIME_MAP[ext];
              if (mimeType) {
                if (stat.size <= 15 * 1024 * 1024) {
                  const b64 = fs.readFileSync(f.path).toString('base64');
                  inlineMediaParts.push({ inlineData: { mimeType, data: b64 } });
                  blocks.push(`--- Attached Media File: ${f.name || path.basename(f.path)} (${mimeType}) ---`);
                } else {
                  blocks.push(`--- File: ${f.name || path.basename(f.path)} (15MB 초과로 직접 첨부 생략) ---`);
                }
              } else {
                const raw = fs.readFileSync(f.path, 'utf8');
                const snippet = raw.length > 12000 ? `${raw.slice(0, 12000)}\n...(truncated)` : raw;
                blocks.push(`--- File: ${f.name || path.basename(f.path)} (${f.path}) ---\n${snippet}`);
              }
            }
          } else {
            blocks.push(`--- File: ${f.name || f.path} (파일을 찾을 수 없음) ---`);
          }
        } catch (err) {
          blocks.push(`--- File: ${f.name || f.path} (읽기 실패: ${err.message}) ---`);
        }
      }
      if (blocks.length > 0) {
        attachedContext = `\n\n[Attached Local Files]\n${blocks.join('\n\n')}`;
      }
    }
    if (inlineMediaParts.length > 0 && Array.isArray(contents) && contents.length > 0) {
      const lastTurn = contents[contents.length - 1];
      if (lastTurn && Array.isArray(lastTurn.parts)) {
        lastTurn.parts = [...inlineMediaParts, ...lastTurn.parts];
      }
    }

    const systemPromptText =
      `You are a concise Korean assistant. ` +
      `Always reply in plain text ONLY. Do NOT use Markdown formatting (no **, *, #, backticks, or markdown links).` +
      `${attachedContext}`;

    const systemInstruction = { parts: [{ text: systemPromptText }] };

    function toPlainText(str) {
      return String(str || '')
        .replace(/```[\w-]*\n?/g, '')
        .replace(/```/g, '')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .trim();
    }

    function applyAiActions(rawText) {
      let cleanText = rawText || '';
      const actions = [];
      cleanText = cleanText.replace(/<<<ACTION:(\{[\s\S]*?\})>>>/g, (_m, jsonStr) => {
        try {
          actions.push(JSON.parse(jsonStr));
        } catch {}
        return '';
      }).trim();
      cleanText = toPlainText(cleanText);

      if (actions.length > 0) {
        const latest = loadData();
        if (!Array.isArray(latest.items)) latest.items = [];
        if (!Array.isArray(latest.studyExams)) latest.studyExams = [];
        const addedNotes = [];
        for (const act of actions) {
          if (act.type === 'add_todo' && act.text) {
            latest.items.unshift({
              id: String(Date.now() + Math.floor(Math.random() * 1000)),
              text: String(act.text).trim(),
              time: '',
              tag: act.tag || '일반',
              dueDate: act.dueDate || '',
              repeat: act.repeat === 'weekly' ? 'weekly' : 'none',
              priority: ['high', 'medium', 'low'].includes(act.priority) ? act.priority : 'medium',
              done: false,
              createdAt: Date.now()
            });
            addedNotes.push(`✓ 일정 추가: ${act.text}${act.dueDate ? ` (${act.dueDate})` : ''}`);
          } else if (act.type === 'add_exam' && act.title && act.date) {
            latest.studyExams.push({
              id: String(Date.now() + Math.floor(Math.random() * 1000)),
              title: String(act.title).trim(),
              date: String(act.date).trim()
            });
            addedNotes.push(`✓ 시험 추가: ${act.title} (${act.date})`);
          }
        }
        if (addedNotes.length > 0) {
          saveData(latest);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('data:external-update', latest);
          }
          cleanText = [cleanText, addedNotes.join('\n')].filter(Boolean).join('\n\n');
        }
      }
      return cleanText;
    }

    const targetModel = model || 'gemini-3.8-flash';
    if (targetModel.startsWith('ollama:')) {
      try {
        const tagsRes = await fetch('http://127.0.0.1:11434/api/tags');
        const tagsData = await tagsRes.json();
        const firstModel = tagsData?.models?.[0]?.name;
        if (!firstModel) {
          return { ok: false, error: 'Ollama에 설치된 모델이 없습니다. (예: ollama pull qwen2.5:3b)' };
        }
        const ollamaMessages = [
          { role: 'system', content: systemPromptText },
          ...contents.map((c) => ({
            role: c.role === 'model' ? 'assistant' : 'user',
            content: (c.parts || []).map((p) => p.text || '').join('')
          }))
        ];
        const oRes = await fetch('http://127.0.0.1:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: firstModel, messages: ollamaMessages, stream: false })
        });
        const oData = await oRes.json();
        const rawReply = oData?.message?.content || '';
        return { ok: true, text: applyAiActions(rawReply) || '(응답이 비어 있습니다)' };
      } catch {
        return { ok: false, error: '로컬 Ollama(127.0.0.1:11434)가 실행 중이 아닙니다. Ollama 설치 후 실행해 주세요.' };
      }
    }

    const candidates = [targetModel];
    if (targetModel === 'gemini-3.8-flash') {
      candidates.push('gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash');
    }

    let lastError = 'Gemini 호출 실패';
    for (const m of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemInstruction, contents }),
            signal: controller.signal
          }
        );
        clearTimeout(timer);
        const resData = await res.json();
        if (!res.ok) {
          lastError = resData?.error?.message || `API 오류 (${res.status})`;
          if ((res.status === 503 || res.status === 429) && m !== candidates[candidates.length - 1]) {
            continue;
          }
          return { ok: false, error: lastError };
        }
        const text = resData?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        return { ok: true, text: applyAiActions(text) || '(응답이 비어 있습니다)' };
      } catch (err) {
        clearTimeout(timer);
        if (err?.name === 'AbortError') {
          lastError = '응답 시간이 초과되었습니다 (90초). 다시 시도해 주세요.';
        } else {
          lastError = err?.message || 'Gemini 호출 실패';
        }
      }
    }
    return { ok: false, error: lastError };
  });

  // Global shortcut: Alt+Shift+W to toggle/focus the widget
  globalShortcut.register('Alt+Shift+W', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
