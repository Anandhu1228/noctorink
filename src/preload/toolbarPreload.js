/**
 * Toolbar bridge. Buttons in this window ask the main process to change
 * mode, tools, and history. The overlay window is what actually draws.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolbarApi', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:updated', listener);
    return () => ipcRenderer.removeListener('state:updated', listener);
  },
  toggleMode: () => ipcRenderer.send('state:toggle-mode'),
  setTool: (tool) => ipcRenderer.send('state:set-tool', tool),
  setColor: (color) => ipcRenderer.send('state:set-color', color),
  setSize: (size) => ipcRenderer.send('state:set-size', size),
  toggleFill: () => ipcRenderer.send('state:toggle-fill'),
  togglePointer: () => ipcRenderer.send('state:toggle-pointer'),
  undo: () => ipcRenderer.send('history:undo'),
  redo: () => ipcRenderer.send('history:redo'),
  clear: () => ipcRenderer.send('history:clear'),
  resetNumbers: () => ipcRenderer.send('numbers:reset'),
  cycleDock: () => ipcRenderer.send('toolbar:cycle-dock'),
  toggleCollapse: () => ipcRenderer.send('toolbar:toggle-collapse'),
  cycleMonitor: () => ipcRenderer.send('monitor:cycle'),
  screenshot: () => ipcRenderer.send('screenshot:request'),
  resize: (width, height) => ipcRenderer.send('toolbar:resize', { width, height }),
  quit: () => ipcRenderer.send('app:quit'),
});
