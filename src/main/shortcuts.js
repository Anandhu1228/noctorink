const { globalShortcut } = require('electron');

/**
 * Register the accelerators from config.js. Failures are logged and skipped
 * so one conflict (another app owns the chord) does not block the rest.
 */
let drawRelease = null;

function registerHotkeys(hotkeys, actions) {
  globalShortcut.unregisterAll();
  drawRelease = null;
  const entries = Object.entries(hotkeys);
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i][0];
    const accelerator = entries[i][1];
    const action = actions[name];
    // Escape is registered only during draw mode. See setDrawRelease.
    if (name === 'release') continue;
    if (!accelerator || typeof action !== 'function') {
      console.error(`[noctorink] no action for hotkey ${name}`);
      continue;
    }
    const ok = globalShortcut.register(accelerator, () => {
      try {
        action();
      } catch (error) {
        console.error(`[noctorink] hotkey ${name} failed:`, error);
      }
    });
    if (!ok) console.error(`[noctorink] could not register ${name} (${accelerator})`);
  }
}

/**
 * Escape must not be global all the time, or it would break other apps while
 * NoctorInk is sitting in pass-through. It is registered only in draw mode.
 */
function setDrawRelease(enabled, accelerator, action) {
  if (drawRelease) {
    globalShortcut.unregister(drawRelease);
    drawRelease = null;
  }
  if (!enabled || !accelerator || typeof action !== 'function') return;
  const ok = globalShortcut.register(accelerator, () => {
    try {
      action();
    } catch (error) {
      console.error('[noctorink] release hotkey failed:', error);
    }
  });
  if (!ok) console.error(`[noctorink] could not register release (${accelerator})`);
  else drawRelease = accelerator;
}

function unregisterHotkeys() {
  drawRelease = null;
  globalShortcut.unregisterAll();
}

module.exports = { registerHotkeys, unregisterHotkeys, setDrawRelease };
