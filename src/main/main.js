/**
 * NoctorInk main process.
 *
 * The overlay does not install a mouse hook, WinTab handler, or Windows Ink
 * recognizer. Those paths turn Weylus pen packets into dots. Input is handled
 * in the overlay renderer with the Pointer Events API, the same way a browser
 * whiteboard does. This process only owns windows, mode, shortcuts, and the
 * giant-pointer poll (the overlay cannot see the cursor while it is click-through).
 */

const { app, BrowserWindow, dialog, ipcMain, screen, Menu } = require('electron');
const fs = require('fs');
const config = require('./config');
const windows = require('./windows');
const shortcuts = require('./shortcuts');
const tray = require('./tray');

// A fully transparent window is often treated as occluded and stops painting.
// Leave the GPU on — disabling it makes the layered window flicker or go black.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let state = null;
let cursorTimer = null;
let lastCursorKey = '';
let saveTimer = null;
let quitting = false;
let suppressToolbarMove = false;

function snapshot() {
  return {
    mode: state.mode,
    tool: state.tool,
    color: state.color,
    size: state.size,
    fill: state.fill,
    pointerArrow: state.pointerArrow,
    pointerScale: state.pointerScale,
    nextNumber: state.nextNumber,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    dock: state.dock,
    collapsed: state.collapsed,
    toolbarVisible: state.toolbarVisible,
    toolbarBounds: windows.currentToolbarBounds(),
    display: state.display,
    presets: config.PRESET_COLORS.slice(),
    hotkeys: config.HOTKEYS,
  };
}

function broadcast() {
  const payload = snapshot();
  windows.send(windows.getOverlay(), 'state:updated', payload);
  windows.send(windows.getToolbar(), 'state:updated', payload);
  tray.refresh(() => ({
    mode: state.mode,
    toolbarVisible: state.toolbarVisible,
  }), actions);
}

function persistSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const bounds = windows.currentToolbarBounds();
    config.updateSettings({
      toolbar: {
        x: bounds ? bounds.x : state.savedToolbarX,
        y: bounds ? bounds.y : state.savedToolbarY,
        dock: state.dock,
        collapsed: state.collapsed,
        custom: state.toolbarCustom,
      },
      tool: state.tool,
      color: state.color,
      size: state.size,
      fill: state.fill,
      pointerArrow: state.pointerArrow,
      pointerScale: state.pointerScale,
      displayId: state.display ? state.display.id : null,
    });
  }, 200);
}

function displayList() {
  return screen.getAllDisplays();
}

function describeDisplay(display) {
  const all = displayList();
  let index = all.findIndex((item) => item.id === display.id);
  if (index < 0) index = 0;
  return {
    id: display.id,
    index,
    count: all.length,
    scaleFactor: display.scaleFactor,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
    workArea: {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    },
  };
}

function displayById(id) {
  const all = displayList();
  if (id != null) {
    const found = all.find((item) => item.id === id);
    if (found) return found;
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function applyDisplay(display, recenterToolbar) {
  windows.placeOverlayOn(display);
  state.display = describeDisplay(display);
  if (recenterToolbar && !state.toolbarCustom) {
    layoutToolbarFromRenderer(state.toolbarWidth, state.toolbarHeight);
  }
  console.log(
    `[noctorink] monitor ${state.display.index + 1}/${state.display.count} ` +
      `scale ${Math.round(state.display.scaleFactor * 100)}% ` +
      `${state.display.bounds.width}x${state.display.bounds.height}`
  );
}

function layoutToolbarFromRenderer(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  state.toolbarWidth = width;
  state.toolbarHeight = height;
  const display = displayById(state.display && state.display.id);
  suppressToolbarMove = true;
  windows.layoutToolbar({
    width,
    height,
    dock: state.dock,
    custom: state.toolbarCustom,
    display,
  });
  setTimeout(() => {
    suppressToolbarMove = false;
  }, 200);
}

function isVerticalDock(dock) {
  return dock === 'left' || dock === 'right';
}

// Which edge a dropped toolbar should snap to. A bar already on the top or
// bottom becomes vertical once its left or right side is pushed to that end.
// A nearly full-width bar is not treated as touching both sides at once.
function pickDockEdge(bounds, area, current) {
  const gap = {
    left: bounds.x - area.x,
    right: area.x + area.width - (bounds.x + bounds.width),
    top: bounds.y - area.y,
    bottom: area.y + area.height - (bounds.y + bounds.height),
  };
  const SNAP = 56;
  let names = ['left', 'right', 'top', 'bottom'];
  // A long bar is close to both ends of its own axis. That is its length, not a dock request.
  if (gap.left <= SNAP && gap.right <= SNAP) names = names.filter((name) => name !== 'left' && name !== 'right');
  if (gap.top <= SNAP && gap.bottom <= SNAP) names = names.filter((name) => name !== 'top' && name !== 'bottom');
  const hits = names.filter((name) => name !== current && gap[name] <= SNAP);
  hits.sort((a, b) => gap[a] - gap[b]);
  return hits.length ? hits[0] : null;
}

function applyDock(next) {
  if (!config.DOCKS.includes(next)) return;
  const wasVertical = isVerticalDock(state.dock);
  state.dock = next;
  state.toolbarCustom = false;
  const nowVertical = isVerticalDock(next);
  const area = displayById(state.display && state.display.id).workArea;
  if (wasVertical !== nowVertical) {
    // The renderer measures the real strip on the next frame. This size only
    // parks the window on the new edge until that measurement arrives.
    if (nowVertical) layoutToolbarFromRenderer(96, Math.min(area.height - 24, 640));
    else layoutToolbarFromRenderer(720, 48);
  } else {
    layoutToolbarFromRenderer(state.toolbarWidth, state.toolbarHeight);
  }
  console.log(`[noctorink] toolbar docked ${next}`);
  persistSoon();
  broadcast();
}

function setMode(mode) {
  if (mode !== 'draw' && mode !== 'passthrough') return;
  state.mode = mode;
  windows.applyInputMode(mode);
  // Escape is the panic button, and only while the screen is captured.
  shortcuts.setDrawRelease(mode === 'draw', config.HOTKEYS.release || 'Escape', () => {
    // Unregister after this callback returns. Doing it inline can drop the key event.
    setImmediate(() => {
      if (state && state.mode === 'draw') setMode('passthrough');
    });
  });
  console.log(`[noctorink] ${mode === 'draw' ? 'draw mode' : 'pass-through mode'}`);
  broadcast();
}

function setPointer(enabled) {
  state.pointerArrow = Boolean(enabled);
  if (state.pointerArrow) startCursorPoll();
  else stopCursorPoll();
  persistSoon();
  broadcast();
}

function sendHistory(command) {
  windows.send(windows.getOverlay(), 'history:command', command);
}

function startCursorPoll() {
  stopCursorPoll();
  // ~60 Hz, and only while the giant arrow is on. getCursorScreenPoint and
  // BrowserWindow bounds are both DIP, so subtracting them matches CSS pixels
  // in the overlay at 100%, 125%, and 150% scaling.
  cursorTimer = setInterval(() => {
    const overlay = windows.getOverlay();
    if (!overlay || overlay.isDestroyed() || !state.pointerArrow) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = overlay.getBounds();
    const x = cursor.x - bounds.x;
    const y = cursor.y - bounds.y;
    const inside = x >= 0 && y >= 0 && x < bounds.width && y < bounds.height;
    const key = `${inside ? 1 : 0}:${Math.round(x * 2)}:${Math.round(y * 2)}`;
    if (key === lastCursorKey) return;
    lastCursorKey = key;
    windows.send(overlay, 'cursor:move', {
      x,
      y,
      inside,
      windowWidth: bounds.width,
      windowHeight: bounds.height,
    });
  }, 16);
}

function stopCursorPoll() {
  if (cursorTimer) {
    clearInterval(cursorTimer);
    cursorTimer = null;
  }
  lastCursorKey = '';
  const overlay = windows.getOverlay();
  windows.send(overlay, 'cursor:move', null);
}

const actions = {
  toggleDraw() {
    setMode(state.mode === 'draw' ? 'passthrough' : 'draw');
  },
  clear() {
    sendHistory({ type: 'clear' });
  },
  undo() {
    sendHistory({ type: 'undo' });
  },
  redo() {
    sendHistory({ type: 'redo' });
  },
  hideToolbar() {
    const visible = windows.isToolbarVisible();
    windows.setToolbarVisible(!visible);
    state.toolbarVisible = windows.isToolbarVisible();
    broadcast();
  },
  togglePointer() {
    setPointer(!state.pointerArrow);
  },
  quit() {
    app.quit();
  },
};

function isFrom(win, event) {
  return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
}

function registerIpc() {
  ipcMain.handle('app:get-state', () => snapshot());

  ipcMain.on('state:toggle-mode', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    actions.toggleDraw();
  });

  ipcMain.on('state:release', (event) => {
    if (!isFrom(windows.getOverlay(), event)) return;
    setMode('passthrough');
  });

  // The pen can hit the overlay even when the tip is visually over the toolbar,
  // because Weylus delivers events to the focused window. Replay that tap on the bar.
  ipcMain.on('toolbar:pen-click', (event, point) => {
    if (!isFrom(windows.getOverlay(), event)) return;
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return;
    windows.raiseToolbar();
    windows.send(windows.getToolbar(), 'toolbar:pen-click', {
      x: Number(point.x),
      y: Number(point.y),
    });
  });

  ipcMain.on('state:set-tool', (event, tool) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    if (!config.TOOLS.includes(tool)) return;
    state.tool = tool;
    persistSoon();
    broadcast();
  });

  ipcMain.on('state:set-color', (event, color) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    const hex = config.normalizeHex(color);
    if (!hex) return;
    state.color = hex;
    persistSoon();
    broadcast();
  });

  ipcMain.on('state:set-color-index', (event, index) => {
    if (!isFrom(windows.getOverlay(), event)) return;
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= config.PRESET_COLORS.length) return;
    state.color = config.PRESET_COLORS[i];
    persistSoon();
    broadcast();
  });

  ipcMain.on('state:set-size', (event, size) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    state.size = config.clampSize(size);
    persistSoon();
    broadcast();
  });

  ipcMain.on('state:toggle-fill', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    state.fill = !state.fill;
    persistSoon();
    broadcast();
  });

  ipcMain.on('state:toggle-pointer', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    actions.togglePointer();
  });

  ipcMain.on('history:undo', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    actions.undo();
  });
  ipcMain.on('history:redo', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    actions.redo();
  });
  ipcMain.on('history:clear', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    actions.clear();
  });
  ipcMain.on('numbers:reset', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    sendHistory({ type: 'reset-numbers' });
  });

  ipcMain.on('history:report', (event, info) => {
    if (!isFrom(windows.getOverlay(), event)) return;
    if (!info || typeof info !== 'object') return;
    state.canUndo = Boolean(info.canUndo);
    state.canRedo = Boolean(info.canRedo);
    const n = Number(info.nextNumber);
    state.nextNumber = Number.isInteger(n) && n > 0 ? n : 1;
    broadcast();
  });

  ipcMain.on('toolbar:cycle-dock', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    const index = config.DOCKS.indexOf(state.dock);
    applyDock(config.DOCKS[(index + 1) % config.DOCKS.length]);
  });

  ipcMain.on('toolbar:toggle-collapse', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    state.collapsed = !state.collapsed;
    persistSoon();
    broadcast();
  });

  ipcMain.on('toolbar:resize', (event, payload) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    if (!payload) return;
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    if (width < 20 || height < 20 || width > 4096 || height > 4096) return;
    layoutToolbarFromRenderer(width, height);
    persistSoon();
    broadcast();
  });

  ipcMain.on('monitor:cycle', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    const all = displayList();
    if (all.length === 0) return;
    const current = state.display ? state.display.id : null;
    let index = all.findIndex((item) => item.id === current);
    index = (index + 1) % all.length;
    state.toolbarCustom = false;
    applyDisplay(all[index], true);
    persistSoon();
    broadcast();
  });

  ipcMain.on('screenshot:request', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    sendHistory({ type: 'capture' });
  });

  ipcMain.on('screenshot:png', async (event, dataUrl) => {
    if (!isFrom(windows.getOverlay(), event)) return;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return;
    if (dataUrl.length > 48 * 1024 * 1024) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const parent = windows.getToolbar();
    const result = await dialog.showSaveDialog(parent && !parent.isDestroyed() ? parent : undefined, {
      title: 'Save NoctorInk drawing',
      defaultPath: `noctorink-${stamp}.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return;
    const body = dataUrl.slice('data:image/png;base64,'.length);
    try {
      fs.writeFileSync(result.filePath, Buffer.from(body, 'base64'));
    } catch (error) {
      console.error('[noctorink] could not save png:', error.message);
    }
  });

  ipcMain.on('app:quit', (event) => {
    if (!isFrom(windows.getToolbar(), event)) return;
    app.quit();
  });
}

function wireDisplayListeners() {
  const refresh = () => {
    if (!state) return;
    const display = displayById(state.display && state.display.id);
    applyDisplay(display, false);
    if (!state.toolbarCustom) layoutToolbarFromRenderer(state.toolbarWidth, state.toolbarHeight);
    broadcast();
  };
  screen.on('display-added', refresh);
  screen.on('display-removed', refresh);
  screen.on('display-metrics-changed', refresh);
}

function createInitialState(saved) {
  state = {
    mode: 'passthrough',
    tool: saved.tool,
    color: saved.color,
    size: saved.size,
    fill: saved.fill,
    pointerArrow: saved.pointerArrow,
    pointerScale: saved.pointerScale,
    nextNumber: 1,
    canUndo: false,
    canRedo: false,
    dock: saved.toolbar.dock,
    collapsed: saved.toolbar.collapsed,
    toolbarVisible: true,
    toolbarCustom: saved.toolbar.custom,
    savedToolbarX: saved.toolbar.x,
    savedToolbarY: saved.toolbar.y,
    toolbarWidth: 960,
    toolbarHeight: 48,
    display: null,
  };
}

function boot() {
  app.setAppUserModelId('app.noctorink');
  Menu.setApplicationMenu(null);
  const saved = config.init(app.getPath('userData'));
  createInitialState(saved);
  // Register IPC before the pages load so their first getState cannot race.
  registerIpc();

  const overlay = windows.createOverlay();
  const toolbar = windows.createToolbar((bounds) => {
    if (suppressToolbarMove || !state) return;
    state.toolbarCustom = true;
    state.savedToolbarX = bounds.x;
    state.savedToolbarY = bounds.y;
    persistSoon();
  }, (bounds) => {
    if (suppressToolbarMove || !state || !bounds) return;
    const display = displayById(state.display && state.display.id);
    const next = pickDockEdge(bounds, display.workArea, state.dock);
    if (!next || next === state.dock) return;
    applyDock(next);
  });

  const startDisplay = displayById(saved.displayId);
  applyDisplay(startDisplay, false);

  if (saved.toolbar.custom && Number.isFinite(saved.toolbar.x) && Number.isFinite(saved.toolbar.y)) {
    suppressToolbarMove = true;
    toolbar.setPosition(Math.round(saved.toolbar.x), Math.round(saved.toolbar.y));
    setTimeout(() => {
      suppressToolbarMove = false;
    }, 300);
  }

  // Pages listen before did-finish-load. Push state again and let the cursor
  // poll send a fresh point even if the pointer has not moved.
  const onReady = () => {
    lastCursorKey = '';
    broadcast();
  };
  overlay.webContents.on('did-finish-load', onReady);
  toolbar.webContents.on('did-finish-load', onReady);

  windows.applyInputMode('passthrough');
  shortcuts.registerHotkeys(config.HOTKEYS, actions);
  tray.createTray(() => ({ mode: state.mode, toolbarVisible: state.toolbarVisible }), actions);
  wireDisplayListeners();
  if (state.pointerArrow) startCursorPoll();

  overlay.on('closed', () => {
    if (!quitting) app.quit();
  });
  toolbar.on('closed', () => {
    if (!quitting) app.quit();
  });

  // If the toolbar page never reports a size, show the default window anyway.
  setTimeout(() => {
    if (!quitting && state && !windows.isToolbarVisible()) {
      windows.setToolbarVisible(true);
      state.toolbarVisible = true;
    }
  }, 1500);

  console.log('[noctorink] ready. Pass-through until you press Ctrl+Alt+D or the draw button.');
}

if (gotLock) {
  app.on('second-instance', () => {
    windows.focusToolbar();
    if (state) {
      state.toolbarVisible = true;
      broadcast();
    }
  });

  app.whenReady().then(boot).catch((error) => {
    console.error('[noctorink] failed to start:', error);
    app.quit();
  });

  app.on('will-quit', () => {
    quitting = true;
    stopCursorPoll();
    windows.stopToolbarRaise();
    shortcuts.unregisterHotkeys();
    tray.destroyTray();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
