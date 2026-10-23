/**
 * NoctorInk configuration.
 *
 * Hotkeys live only in this file. Edit HOTKEYS, restart the app, and the new
 * accelerators are registered with Electron globalShortcut. Accelerator syntax
 * is the Electron one, for example "Ctrl+Alt+D".
 *
 * Window position, last tool, color, and size are remembered separately in
 * %APPDATA%/noctorink/settings.json so this file stays the source of truth
 * for shortcuts.
 */

const fs = require('fs');
const path = require('path');

const HOTKEYS = {
  toggleDraw: 'Ctrl+Alt+D',
  clear: 'Ctrl+Alt+C',
  undo: 'Ctrl+Alt+Z',
  redo: 'Ctrl+Alt+Y',
  hideToolbar: 'Ctrl+Alt+H',
  togglePointer: 'Ctrl+Alt+P',
  quit: 'Ctrl+Alt+Q',
};

/** First nine entries are selectable with number keys 1–9 while drawing. */
const PRESET_COLORS = [
  '#ff3b30',
  '#ff9500',
  '#ffd60a',
  '#30d158',
  '#0a84ff',
  '#bf5af2',
  '#ff375f',
  '#ffffff',
  '#1c1c1e',
  '#64d2ff',
];

/**
 * Base multiplier for the giant pointer arrow. The toolbar size slider scales
 * the arrow as well. 1 is a large teaching cursor; useful range is about 0.6–2.5.
 */
const POINTER_SCALE = 1;

const DEFAULT_SETTINGS = {
  toolbar: {
    x: null,
    y: null,
    dock: 'top',
    collapsed: false,
    custom: false,
  },
  tool: 'pen',
  color: PRESET_COLORS[0],
  size: 6,
  fill: false,
  pointerArrow: false,
  pointerScale: POINTER_SCALE,
  displayId: null,
};

const TOOLS = [
  'pen',
  'highlighter',
  'line',
  'arrow',
  'rect',
  'ellipse',
  'triangle',
  'eraser',
  'text',
  'numbers',
];

const DOCKS = ['top', 'right', 'bottom', 'left'];

let settingsPath = null;
let settings = clone(DEFAULT_SETTINGS);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampSize(size) {
  const n = Math.round(Number(size));
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.size;
  return Math.min(40, Math.max(1, n));
}

function normalizeHex(color) {
  if (typeof color !== 'string') return null;
  const match = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function sanitize(raw) {
  const next = clone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') return next;

  const dock = raw.toolbar && raw.toolbar.dock;
  next.toolbar.dock = DOCKS.includes(dock) ? dock : next.toolbar.dock;
  next.toolbar.collapsed = Boolean(raw.toolbar && raw.toolbar.collapsed);
  next.toolbar.custom = Boolean(raw.toolbar && raw.toolbar.custom);
  if (raw.toolbar && Number.isFinite(raw.toolbar.x)) next.toolbar.x = raw.toolbar.x;
  if (raw.toolbar && Number.isFinite(raw.toolbar.y)) next.toolbar.y = raw.toolbar.y;

  if (TOOLS.includes(raw.tool)) next.tool = raw.tool;
  const color = normalizeHex(raw.color);
  if (color) next.color = color;
  next.size = clampSize(raw.size);
  next.fill = Boolean(raw.fill);
  next.pointerArrow = Boolean(raw.pointerArrow);
  if (Number.isFinite(Number(raw.pointerScale)) && Number(raw.pointerScale) > 0) {
    next.pointerScale = Math.min(4, Math.max(0.4, Number(raw.pointerScale)));
  } else {
    next.pointerScale = POINTER_SCALE;
  }
  if (Number.isFinite(raw.displayId)) next.displayId = raw.displayId;
  return next;
}

function init(userDataDir) {
  settingsPath = path.join(userDataDir, 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      settings = sanitize(JSON.parse(fs.readFileSync(settingsPath, 'utf8')));
    }
  } catch (error) {
    console.error('[noctorink] could not read settings.json:', error.message);
    settings = clone(DEFAULT_SETTINGS);
  }
  return getSettings();
}

function getSettings() {
  return clone(settings);
}

function updateSettings(partial) {
  const merged = sanitize({
    ...settings,
    ...partial,
    toolbar: {
      ...settings.toolbar,
      ...(partial && partial.toolbar ? partial.toolbar : {}),
    },
  });
  settings = merged;
  if (!settingsPath) return getSettings();
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('[noctorink] could not write settings.json:', error.message);
  }
  return getSettings();
}

module.exports = {
  HOTKEYS,
  PRESET_COLORS,
  POINTER_SCALE,
  TOOLS,
  DOCKS,
  init,
  getSettings,
  updateSettings,
  clampSize,
  normalizeHex,
};
