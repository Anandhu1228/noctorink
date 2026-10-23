/**
 * Two top-level windows:
 *   overlay — full monitor, transparent, draws the ink
 *   toolbar — small, always clickable, even when the overlay lets clicks through
 *
 * Drawing input is NOT hooked here. The overlay renderer uses Pointer Events.
 * The main process only toggles whether the overlay window accepts input
 * (draw mode) or forwards it (pass-through).
 */

const path = require('path');
const { BrowserWindow, screen } = require('electron');

const PRELOAD_OVERLAY = path.join(__dirname, '../preload/overlayPreload.js');
const PRELOAD_TOOLBAR = path.join(__dirname, '../preload/toolbarPreload.js');
const OVERLAY_HTML = path.join(__dirname, '../renderer/overlay/index.html');
const TOOLBAR_HTML = path.join(__dirname, '../renderer/toolbar/index.html');
const ICON = path.join(__dirname, '../../assets/icon.png');

let overlay = null;
let toolbar = null;
let onToolbarMove = null;
let toolbarShown = false;

function webPreferences(preload) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: false,
    spellcheck: false,
  };
}

function attachConsole(win, name) {
  // One argument only. Electron warns if the listener still takes the deprecated
  // (level, message, line, sourceId) parameters.
  win.webContents.on('console-message', (event) => {
    const text = event && event.message ? String(event.message) : '';
    const lvl = event && event.level;
    if (text.includes('[noctorink]')) {
      console.log(`[${name}]`, text);
      return;
    }
    if (lvl === 'warning' || lvl === 'error' || lvl === 2 || lvl === 3) {
      console.log(`[${name}]`, text);
    }
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[${name}] renderer gone:`, details && details.reason);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[${name}] failed to load:`, code, description);
  });
}

function lockZoom(win) {
  const apply = () => {
    win.webContents.setZoomFactor(1);
    win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  };
  win.webContents.on('did-finish-load', apply);
  // Block the shortcuts Chromium uses to zoom the page. A zoomed overlay
  // would put ink beside the pen instead of under it.
  win.webContents.on('before-input-event', (event, input) => {
    if (!input.control) return;
    if (input.key === '=' || input.key === '+' || input.key === '-' || input.key === '_' || input.key === '0') {
      event.preventDefault();
    }
  });
}

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    thickFrame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    roundedCorners: false,
    enableLargerThanScreen: true,
    icon: ICON,
    webPreferences: webPreferences(PRELOAD_OVERLAY),
  });

  overlay.setAlwaysOnTop(true, 'screen-saver', 1);
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  attachConsole(overlay, 'overlay');
  lockZoom(overlay);
  overlay.loadFile(OVERLAY_HTML);
  overlay.once('ready-to-show', () => {
    // showInactive so a pass-through overlay does not steal the user's focus.
    overlay.showInactive();
    overlay.setAlwaysOnTop(true, 'screen-saver', 1);
  });
  return overlay;
}

function createToolbar(moveHandler) {
  onToolbarMove = moveHandler;
  const display = screen.getPrimaryDisplay();
  const width = 960;
  const height = 48;
  toolbar = new BrowserWindow({
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: display.workArea.y + 10,
    width,
    height,
    transparent: true,
    frame: false,
    thickFrame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    roundedCorners: false,
    icon: ICON,
    webPreferences: webPreferences(PRELOAD_TOOLBAR),
  });

  // Above the overlay (relative level 2 > 1) so the bar stays clickable in draw mode.
  toolbar.setAlwaysOnTop(true, 'screen-saver', 2);
  toolbar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  attachConsole(toolbar, 'toolbar');
  lockZoom(toolbar);
  toolbar.loadFile(TOOLBAR_HTML);
  toolbar.on('move', () => {
    if (typeof onToolbarMove === 'function' && toolbarShown) onToolbarMove(toolbar.getBounds());
  });
  return toolbar;
}

function raiseWindows() {
  if (overlay && !overlay.isDestroyed()) overlay.setAlwaysOnTop(true, 'screen-saver', 1);
  if (toolbar && !toolbar.isDestroyed() && toolbar.isVisible()) {
    toolbar.setAlwaysOnTop(true, 'screen-saver', 2);
  }
}

/**
 * Draw mode captures pen, touch, and mouse on the overlay.
 * Pass-through lets those events fall through to whatever is underneath.
 * Existing pixels stay on screen either way.
 */
function applyInputMode(mode) {
  if (!overlay || overlay.isDestroyed()) return;
  if (mode === 'draw') {
    overlay.setFocusable(true);
    overlay.setIgnoreMouseEvents(false);
    overlay.show();
    overlay.focus();
  } else {
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setFocusable(false);
    if (overlay.isFocused()) overlay.blur();
  }
  raiseWindows();
}

function placeOverlayOn(display) {
  if (!overlay || overlay.isDestroyed() || !display) return;
  const b = display.bounds;
  overlay.setBounds({
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.width),
    height: Math.round(b.height),
  });
  raiseWindows();
}

function currentToolbarBounds() {
  if (!toolbar || toolbar.isDestroyed()) return null;
  return toolbar.getBounds();
}

/**
 * Resize and, unless the user has dragged the bar, snap it to a screen edge.
 * Coordinates are DIP, which match CSS pixels in the toolbar renderer.
 */
function layoutToolbar({ width, height, dock, custom, display }) {
  if (!toolbar || toolbar.isDestroyed()) return;
  const w = Math.max(28, Math.ceil(width));
  const h = Math.max(28, Math.ceil(height));
  const area = display ? display.workArea : screen.getPrimaryDisplay().workArea;
  const current = toolbar.getBounds();
  let x = current.x;
  let y = current.y;

  if (!custom) {
    if (dock === 'bottom') {
      x = Math.round(area.x + (area.width - w) / 2);
      y = Math.round(area.y + area.height - h - 10);
    } else if (dock === 'left') {
      x = Math.round(area.x + 10);
      y = Math.round(area.y + Math.max(0, (area.height - h) / 2));
    } else if (dock === 'right') {
      x = Math.round(area.x + area.width - w - 10);
      y = Math.round(area.y + Math.max(0, (area.height - h) / 2));
    } else {
      x = Math.round(area.x + (area.width - w) / 2);
      y = Math.round(area.y + 10);
    }
  }

  x = Math.min(Math.max(x, area.x), area.x + Math.max(0, area.width - w));
  y = Math.min(Math.max(y, area.y), area.y + Math.max(0, area.height - h));
  toolbar.setBounds({ x, y, width: w, height: h });
  if (!toolbarShown) {
    toolbar.show();
    toolbarShown = true;
  }
  raiseWindows();
}

function setToolbarVisible(visible) {
  if (!toolbar || toolbar.isDestroyed()) return;
  if (visible) {
    toolbar.show();
    toolbarShown = true;
    toolbar.focus();
    raiseWindows();
  } else {
    toolbar.hide();
  }
}

function isToolbarVisible() {
  return Boolean(toolbar && !toolbar.isDestroyed() && toolbar.isVisible());
}

function focusToolbar() {
  if (toolbar && !toolbar.isDestroyed()) {
    toolbar.show();
    toolbarShown = true;
    toolbar.focus();
  }
}

function getOverlay() {
  return overlay;
}

function getToolbar() {
  return toolbar;
}

function send(win, channel, payload) {
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

module.exports = {
  createOverlay,
  createToolbar,
  applyInputMode,
  placeOverlayOn,
  layoutToolbar,
  setToolbarVisible,
  isToolbarVisible,
  focusToolbar,
  getOverlay,
  getToolbar,
  currentToolbarBounds,
  raiseWindows,
  send,
};
