const { globalShortcut } = require('electron');

/**
 * Register the accelerators from config.js. Failures are logged and skipped
 * so one conflict (another app owns the chord) does not block the rest.
 */
function registerHotkeys(hotkeys, actions) {
  globalShortcut.unregisterAll();
  const entries = Object.entries(hotkeys);
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i][0];
    const accelerator = entries[i][1];
    const action = actions[name];
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

function unregisterHotkeys() {
  globalShortcut.unregisterAll();
}

module.exports = { registerHotkeys, unregisterHotkeys };
