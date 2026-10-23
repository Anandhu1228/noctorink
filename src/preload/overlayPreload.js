/**
 * Overlay bridge. The page never sees Node or ipcRenderer — only these calls.
 * Channels are fixed; the main process validates every payload.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:updated', listener);
    return () => ipcRenderer.removeListener('state:updated', listener);
  },
  onHistory: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('history:command', listener);
    return () => ipcRenderer.removeListener('history:command', listener);
  },
  onCursor: (callback) => {
    const listener = (_event, position) => callback(position);
    ipcRenderer.on('cursor:move', listener);
    return () => ipcRenderer.removeListener('cursor:move', listener);
  },
  reportHistory: (info) => ipcRenderer.send('history:report', info),
  setColorIndex: (index) => ipcRenderer.send('state:set-color-index', index),
  savePng: (dataUrl) => ipcRenderer.send('screenshot:png', dataUrl),
});
