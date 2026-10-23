# NoctorInk

NoctorInk is a Windows screen-annotation overlay for teaching and recording. It draws on top of browsers, PDFs, and other apps, then lets clicks pass through again without erasing what you drew.

The app runs **natively on Windows**. Docker is only used to build the installer. An overlay cannot run inside a container.

## Run

Requirements: Windows 10 or 11, and Node.js 22 or newer.

```bash
npm install
npm start
```

The app starts in **pass-through** mode so it does not block the screen. The toolbar is a separate always-on-top window. Click the pencil, or press `Ctrl+Alt+D`, to draw.

Quit from the toolbar close button, the tray menu, or `Ctrl+Alt+Q`.

## Draw mode and pass-through

| Mode | What happens |
| --- | --- |
| Draw | The overlay captures pen, touch, and mouse and adds ink. |
| Pass-through | Clicks go to the apps underneath. Ink stays visible. |

The toolbar is its own window, so it stays usable in both modes. Switching does not clear the drawing.

The overlay covers the monitor under the cursor at launch. The monitor button moves it to the next display. Drawings stay on the monitor they were made on.

## Toolbar

The toolbar is a horizontal row on the top or bottom, and a vertical strip on the left or right. It starts on the top. The dock button cycles top, right, bottom, left. Drag the dotted grip to the left or right end and it stands up on that edge; drag it to the top or bottom and it lies flat again. Collapse shrinks it to a small handle. Position is remembered.

The color button opens a single row of swatches plus a custom color picker in that same row. There is no second palette. The size slider (1–40) sets pen width, shape outline width, arrow thickness, highlighter width, text size, number size, and the giant pointer size.

Shapes are outlines until Fill is turned on. Fill uses the current color with no extra border. Changing color or size affects the next object only.

## Tools

- **Pen** — freehand, round caps, midpoint smoothing.
- **Highlighter** — wide and semi-transparent. A stroke is composited once, so crossing itself does not get darker.
- **Line, arrow, rectangle, ellipse, triangle** — drag to preview, release to commit. Hold **Shift** for 45° lines and arrows, or for a square / circle.
- **Eraser** — removes whole strokes and shapes it touches. One gesture is one undo.
- **Text** — click to place a box, type on the laptop keyboard, Enter for a new line, Esc or a tap outside to commit. Tap existing text to edit it; drag it to move it.
- **Numbers** — each tap places the next circled number (1, 2, 3, …). Reset sets the counter back to 1. Clear does too. Undo of a stamp rewinds the counter.
- **Giant pointer** — a large arrow that follows the cursor in both modes and is never saved into undo history. Its color is the current color. Size follows the slider and `pointerScale` in `src/main/config.js`.
- **Save** — writes the drawing layer to a transparent PNG. The pointer arrow is not included.
- **Undo / redo / clear** — every object type, including erase, text edits, text moves, and clear.

Number keys `1`–`9` pick the first nine swatches while draw mode is active and the overlay or toolbar is focused. They are not global, so they do not affect other apps.

## Hotkeys

Edit accelerators in `src/main/config.js`, then restart. That file is the only shortcut list.

While you are drawing, **Escape** releases the screen and keeps the ink. It is not active in pass-through, so other apps still receive Escape. The red **Esc** button on the toolbar does the same thing. A pen tap on the toolbar counts as a click even when draw mode has focus.

The big arrow is off when NoctorInk starts. The normal cursor stays. Click the arrow button (or press `Ctrl+Alt+P`) to show it, and click again to hide it.

| Action | Default |
| --- | --- |
| Release the screen (draw mode only) | `Escape` |
| Draw / pass-through | `Ctrl+Alt+D` |
| Clear | `Ctrl+Alt+C` |
| Undo | `Ctrl+Alt+Z` |
| Redo | `Ctrl+Alt+Y` |
| Hide / show toolbar | `Ctrl+Alt+H` |
| Big arrow on / off | `Ctrl+Alt+P` |
| Quit | `Ctrl+Alt+Q` |

The tray icon menu can switch mode, hide or show the toolbar, clear, and quit.

## Weylus

Connect the tablet with [Weylus](https://github.com/H-M-H/Weylus) and draw in NoctorInk the same way you would on a web whiteboard. Pen, finger, and mouse all use the browser Pointer Events API (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`), with `touch-action: none`, `setPointerCapture`, and `getCoalescedEvents()`.

NoctorInk does **not** use a global mouse hook, WinTab, or the Windows Ink APIs. Those are what turn Weylus input into isolated dots or straight jumps in Paint and ppInk. Leave this path in the overlay renderer.

If the tablet draws in Chrome (for example Ziteboard) but nothing arrives in NoctorInk, **run Weylus as Administrator** and start NoctorInk again. Windows blocks injected input when the two processes are at different integrity levels. If Weylus is already elevated and the overlay still sees no events, start NoctorInk as Administrator too so both sides match. Do not “fix” a missing stream by switching the overlay to a native ink API.

The keyboard for the text tool is the laptop keyboard. Weylus does not forward keys.

## Display scaling

The overlay window is positioned in device-independent pixels (the same units Electron uses for `screen.getCursorScreenPoint()` and window bounds). The canvas backing store is `devicePixelRatio` times the CSS size, and strokes are stored in CSS pixels, so at 125% and 150% the ink should sit under the pen. Page zoom is locked so it cannot shift that mapping.

The giant pointer is polled in the main process at about 60Hz, and only while it is enabled, because a click-through window does not receive pointer moves. In draw mode the arrow also follows Pointer Events directly.

## Build a Windows installer

On a Windows machine:

```bash
npm install
npm run dist
```

`dist/` receives an NSIS installer and a portable exe.

### Docker (packaging only)

Docker builds that same Windows installer. It does not start the overlay.

```bash
docker compose run --rm build
```

The compose file uses `electronuserland/builder:wine`, caches `node_modules` and the Electron download in named volumes, and writes `./dist` on the host. An optional syntax-and-test job:

```bash
docker compose run --rm lint
```

`Dockerfile` is the same Wine-based build (`npm ci` then `electron-builder --win`). Prefer the compose command so the installer lands in `./dist` instead of staying inside an image layer.

If the floating `:wine` tag is ever too old for the Electron version in `package.json`, change both files to `electronuserland/builder:22-wine`.

Code signing is off (`CSC_IDENTITY_AUTO_DISCOVERY=false`). The build is unsigned.

## Checks

```bash
npm test
npm run lint
```

`npm test` covers hit testing, Shift constraints, the number counter, and undo/redo. It does not replace trying a real stylus through Weylus.

## Troubleshooting

- **Strokes are dots or straight segments.** Confirm you are in draw mode and that the pointer stream is the web one described above. If the laptop mouse is smooth and the tablet is not, run Weylus as Administrator (see above).
- **The screen ignores clicks after you meant to stop drawing.** Press `Ctrl+Alt+D` or use the tray menu. Pass-through is the default at startup.
- **The toolbar disappeared.** `Ctrl+Alt+H`, or the tray item “Show toolbar”. If it is only a small plus button, it is collapsed.
- **Ink is on the wrong monitor.** Use the monitor button on the toolbar. The overlay follows one display at a time so each screen keeps a 1:1 pixel mapping.
- **A game or exclusive fullscreen window covers the ink.** Use borderless or windowed mode. NoctorInk stays above normal and fullscreen-borderless windows; it cannot draw over exclusive DirectX fullscreen.
- **A hotkey does nothing.** Another app already owns that chord. Change it in `src/main/config.js`.
- **`npm run dist` fails while extracting winCodeSign.** Turn on Windows Developer Mode, or set `signAndEditExecutable: false` under `win:` in `electron-builder.yml`. The Docker build does not hit that Windows symlink limitation.
- **The overlay is a faint shade over the desktop.** Draw mode needs a 1/255 alpha veil so Windows delivers clicks to “empty” areas of a transparent window. It should be barely visible. Do not remove it or the pen will only hit existing ink.

## Layout

```
src/main/        windows, shortcuts, tray, config
src/preload/     contextBridge only
src/renderer/overlay/   Pointer Events, tools, history, paint
src/renderer/toolbar/   one-row controls
assets/          generated icon
```

Security settings: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no remote pages. The renderers talk to the main process through a fixed set of IPC channels.
