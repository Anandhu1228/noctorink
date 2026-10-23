const path = require('path');
const { Tray, Menu, nativeImage } = require('electron');

let tray = null;

function loadIcon() {
  const file = path.join(__dirname, '../../assets/icon.png');
  try {
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) return nativeImage.createEmpty();
    return image.resize({ width: 32, height: 32, quality: 'best' });
  } catch (error) {
    console.error('[noctorink] tray icon failed:', error.message);
    return nativeImage.createEmpty();
  }
}

function createTray(getSnapshot, actions) {
  tray = new Tray(loadIcon());
  tray.setToolTip('NoctorInk');
  refresh(getSnapshot, actions);
  return tray;
}

function refresh(getSnapshot, actions) {
  if (!tray) return;
  const snapshot = getSnapshot();
  const drawing = snapshot.mode === 'draw';
  const menu = Menu.buildFromTemplate([
    {
      label: drawing ? 'Switch to pass-through' : 'Switch to draw',
      click: () => actions.toggleDraw(),
    },
    {
      label: snapshot.toolbarVisible ? 'Hide toolbar' : 'Show toolbar',
      click: () => actions.hideToolbar(),
    },
    {
      label: 'Clear drawings',
      click: () => actions.clear(),
    },
    { type: 'separator' },
    {
      label: 'Quit NoctorInk',
      click: () => actions.quit(),
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(drawing ? 'NoctorInk — draw mode' : 'NoctorInk — pass-through');
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, refresh, destroyTray };
