const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('widgetAPI', {
  getFilePath: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch {}
    return file?.path || '';
  },
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  onDataUpdated: (cb) => ipcRenderer.on('data:external-update', (_event, data) => cb(data)),
  listReports: (dirPath) => ipcRenderer.invoke('reports:list', dirPath),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  getFileIcon: (targetPath) => ipcRenderer.invoke('shell:get-file-icon', targetPath),
  getSpotifyStatus: () => ipcRenderer.invoke('spotify:status'),
  controlSpotify: (action) => ipcRenderer.invoke('spotify:control', action),
  pickApp: () => ipcRenderer.invoke('dialog:pick-app'),
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  pickFolders: () => ipcRenderer.invoke('dialog:pick-folders'),
  searchLocalFiles: (query) => ipcRenderer.invoke('files:search', query),
  fetchNotices: (url) => ipcRenderer.invoke('notices:fetch', url),
  fetchMail: (creds) => ipcRenderer.invoke('mail:fetch', creds),
  askGemini: (payload) => ipcRenderer.invoke('gemini:ask', payload),
  togglePin: () => ipcRenderer.invoke('window:toggle-pin'),
  toggleLock: () => ipcRenderer.invoke('window:toggle-lock'),
  setMini: (isMini) => ipcRenderer.invoke('window:set-mini', isMini),
  setOpacity: (val) => ipcRenderer.invoke('window:set-opacity', val),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  showWindow: () => ipcRenderer.invoke('window:show'),
  close: () => ipcRenderer.invoke('window:close'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  getAutoStart: () => ipcRenderer.invoke('startup:get'),
  setAutoStart: (enabled) => ipcRenderer.invoke('startup:set', enabled)
});
