const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ranking', {
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    setKey: (k) => ipcRenderer.invoke('ai:setKey', k),
    clearKey: () => ipcRenderer.invoke('ai:clearKey'),
    describe: (p) => ipcRenderer.invoke('ai:describe', p)
  }
});
