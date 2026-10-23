/**
 * Single-row toolbar. It is its own window so it stays clickable while the
 * overlay is in pass-through. Popovers are not used: the color choices are
 * one extra run of circles in this same row.
 */

(function () {
  const api = window.toolbarApi;
  const bar = document.getElementById('bar');
  const toolsEl = document.getElementById('tools');
  const historyEl = document.getElementById('history');
  const sessionEl = document.getElementById('session');
  const swatchesEl = document.getElementById('swatches');
  const colorBtn = document.getElementById('color-btn');
  const sizeInput = document.getElementById('size');
  const fillBtn = document.getElementById('fill');
  const expandBtn = document.getElementById('expand');

  const TOOLS = [
    ['pen', 'Pen', svgPen],
    ['highlighter', 'Highlighter', svgHighlighter],
    ['line', 'Line', svgLine],
    ['arrow', 'Arrow', svgArrow],
    ['rect', 'Rectangle', svgRect],
    ['ellipse', 'Circle / ellipse', svgEllipse],
    ['triangle', 'Triangle', svgTriangle],
    ['eraser', 'Eraser', svgEraser],
    ['text', 'Text', svgText],
    ['numbers', 'Number stamps', svgNumber],
  ];

  let state = null;
  let swatchesOpen = false;
  let lastSent = '';

  function svgWrap(body) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  function svgPen() {
    return svgWrap('<path d="M4 20l4.2-1.1L19 8.1 15.9 5 5.1 15.8 4 20z"/><path d="M13.8 7.1l3.1 3.1"/>');
  }
  function svgHighlighter() {
    return svgWrap('<path d="M5 19l3.2-.6L19 7.6 16.4 5 5.6 15.8 5 19z"/><path d="M5 19h6" stroke-width="3"/>');
  }
  function svgLine() {
    return svgWrap('<path d="M5 19L19 5"/>');
  }
  function svgArrow() {
    return svgWrap('<path d="M5 19L19 5"/><path d="M10 5h9v9"/>');
  }
  function svgRect() {
    return svgWrap('<rect x="5" y="6" width="14" height="12" rx="1"/>');
  }
  function svgEllipse() {
    return svgWrap('<ellipse cx="12" cy="12" rx="7.5" ry="5.5"/>');
  }
  function svgTriangle() {
    return svgWrap('<path d="M12 5l7 14H5l7-14z"/>');
  }
  function svgEraser() {
    return svgWrap('<path d="M4 15.5l7-7 6.5 6.5-3.2 3.2H7.2L4 15.5z"/><path d="M8.5 11l5.5 5.5"/>');
  }
  function svgText() {
    return svgWrap('<path d="M6 6h12M12 6v12"/>');
  }
  function svgNumber() {
    return svgWrap('<circle cx="12" cy="12" r="7"/>');
  }
  function svgReset() {
    return svgWrap('<path d="M6 12a6 6 0 1 0 1.6-4"/><path d="M6 5v4h4"/>');
  }
  function svgUndo() {
    return svgWrap('<path d="M8 8H4v4"/><path d="M4.5 11a8 8 0 1 1 1.2 5"/>');
  }
  function svgRedo() {
    return svgWrap('<path d="M16 8h4v4"/><path d="M19.5 11a8 8 0 1 0-1.2 5"/>');
  }
  function svgClear() {
    return svgWrap('<path d="M5 8h14"/><path d="M9 8V6h6v2"/><path d="M7 8l1 11h8l1-11"/>');
  }
  function svgSave() {
    return svgWrap('<rect x="5" y="5" width="14" height="14" rx="1.5"/><path d="M8 5v4h8V5"/><path d="M8 16h8"/>');
  }
  function svgDraw() {
    return svgWrap('<path d="M4 18l3.5-.8L18 6.7 15.3 4 4.8 14.5 4 18z"/>');
  }
  function svgRelease() {
    return svgWrap('<path d="M9 6H6v12h3"/><path d="M10 12h8"/><path d="M15 9l3 3-3 3"/>');
  }
  function svgPointer() {
    return svgWrap('<path d="M6 4l1.2 12 3-2.2 2.4 5.2 2.2-1-2.4-5.2H18L6 4z" fill="currentColor" stroke="none"/>');
  }
  function svgMonitor() {
    return svgWrap('<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M9 20h6M12 16v4"/>');
  }
  function svgDock() {
    return svgWrap('<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 9h16"/>');
  }
  function svgCollapse() {
    return svgWrap('<path d="M8 12h8"/><path d="M6 8h12M6 16h12"/>');
  }
  function svgExpand() {
    return svgWrap('<path d="M5 12h14M12 5v14"/>');
  }
  function svgClose() {
    return svgWrap('<path d="M7 7l10 10M17 7L7 17"/>');
  }

  function makeButton(id, title, markup, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = className || 'icon-btn';
    button.title = title;
    button.innerHTML = markup;
    return button;
  }

  function build() {
    TOOLS.forEach(([id, title, icon]) => {
      const button = makeButton(`tool-${id}`, title, icon());
      button.addEventListener('click', () => api.setTool(id));
      if (id === 'numbers') {
        const badge = document.createElement('span');
        badge.id = 'next-num';
        badge.textContent = '1';
        button.appendChild(badge);
      }
      toolsEl.appendChild(button);
    });

    const reset = makeButton('reset-numbers', 'Reset number counter', svgReset());
    reset.addEventListener('click', () => api.resetNumbers());
    toolsEl.appendChild(reset);

    colorBtn.innerHTML = '<span class="swatch-dot"></span>';
    colorBtn.addEventListener('click', () => {
      swatchesOpen = !swatchesOpen;
      render();
    });

    const undo = makeButton('undo', 'Undo', svgUndo());
    const redo = makeButton('redo', 'Redo', svgRedo());
    const clear = makeButton('clear', 'Clear', svgClear(), 'icon-btn danger');
    const save = makeButton('save', 'Save drawing as PNG', svgSave());
    undo.addEventListener('click', () => api.undo());
    redo.addEventListener('click', () => api.redo());
    clear.addEventListener('click', () => api.clear());
    save.addEventListener('click', () => api.screenshot());
    historyEl.append(undo, redo, clear, save);

    const mode = makeButton('mode', 'Draw / pass-through', svgDraw());
    const pointer = makeButton('pointer', 'Giant pointer arrow', svgPointer());
    const monitor = makeButton('monitor', 'Monitor', svgMonitor());
    const dock = makeButton('dock', 'Dock toolbar', svgDock());
    const collapse = makeButton('collapse', 'Collapse toolbar', svgCollapse());
    const close = makeButton('close', 'Quit', svgClose(), 'icon-btn danger');
    mode.addEventListener('click', () => api.toggleMode());
    pointer.addEventListener('click', () => api.togglePointer());
    monitor.addEventListener('click', () => api.cycleMonitor());
    dock.addEventListener('click', () => api.cycleDock());
    collapse.addEventListener('click', () => api.toggleCollapse());
    close.addEventListener('click', () => api.quit());
    sessionEl.append(mode, pointer, monitor, dock, collapse, close);

    expandBtn.innerHTML = svgExpand();
    expandBtn.addEventListener('click', () => api.toggleCollapse());

    sizeInput.addEventListener('input', () => {
      api.setSize(Number(sizeInput.value));
    });

    fillBtn.innerHTML = svgWrap('<rect x="5" y="6" width="14" height="12" rx="1.5" fill="currentColor" stroke="none"/>');
    fillBtn.addEventListener('click', () => api.toggleFill());
  }

  function ensureSwatches() {
    if (!state) return;
    if (swatchesEl.childElementCount === state.presets.length + 1) return;
    swatchesEl.replaceChildren();
    state.presets.forEach((color, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = index < 9 ? `Color ${index + 1}` : color;
      button.style.background = color;
      button.addEventListener('click', () => api.setColor(color));
      swatchesEl.appendChild(button);
    });
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.title = 'Custom color';
    custom.value = state.color;
    custom.addEventListener('input', () => api.setColor(custom.value));
    swatchesEl.appendChild(custom);
  }

  function hotkey(name) {
    return state && state.hotkeys && state.hotkeys[name] ? ` (${state.hotkeys[name]})` : '';
  }

  function render() {
    if (!state) return;
    document.body.classList.toggle('collapsed', state.collapsed);
    ensureSwatches();
    swatchesEl.hidden = !swatchesOpen || state.collapsed;

    TOOLS.forEach(([id, title]) => {
      const button = document.getElementById(`tool-${id}`);
      button.classList.toggle('active', state.tool === id);
      button.title = title;
    });
    const badge = document.getElementById('next-num');
    if (badge) badge.textContent = String(state.nextNumber);

    const dot = colorBtn.querySelector('.swatch-dot');
    dot.style.background = state.color;
    colorBtn.title = `Color ${state.color}`;

    const chips = swatchesEl.querySelectorAll('button');
    chips.forEach((chip, index) => {
      chip.classList.toggle('active', state.presets[index] === state.color);
    });
    const custom = swatchesEl.querySelector('input[type="color"]');
    if (custom && custom.value.toLowerCase() !== state.color.toLowerCase() && document.activeElement !== custom) {
      custom.value = state.color;
    }

    if (document.activeElement !== sizeInput) sizeInput.value = String(state.size);
    sizeInput.title = `Size ${state.size}`;

    fillBtn.classList.toggle('active', state.fill);
    fillBtn.title = state.fill ? 'Filled shapes' : 'Outline shapes';

    const undo = document.getElementById('undo');
    const redo = document.getElementById('redo');
    undo.disabled = !state.canUndo;
    redo.disabled = !state.canRedo;
    undo.title = `Undo${hotkey('undo')}`;
    redo.title = `Redo${hotkey('redo')}`;
    document.getElementById('clear').title = `Clear${hotkey('clear')}`;

    const drawing = state.mode === 'draw';
    const mode = document.getElementById('mode');
    mode.classList.toggle('live', drawing);
    mode.innerHTML = drawing ? `${svgRelease()}<span class="esc">Esc</span>` : svgDraw();
    mode.title = drawing ? `Release screen (Esc)` : `Draw${hotkey('toggleDraw')}`;

    const pointer = document.getElementById('pointer');
    pointer.classList.toggle('active', state.pointerArrow);
    pointer.title = state.pointerArrow ? `Hide big arrow${hotkey('togglePointer')}` : `Show big arrow${hotkey('togglePointer')}`;

    const monitor = document.getElementById('monitor');
    if (state.display) {
      monitor.title = `Monitor ${state.display.index + 1}/${state.display.count} · ${Math.round(state.display.scaleFactor * 100)}%`;
    }

    const dock = document.getElementById('dock');
    dock.title = `Docked ${state.dock}. Click for the next edge.`;
    document.getElementById('collapse').title = 'Collapse';
    document.getElementById('close').title = `Quit${hotkey('quit')}`;
    expandBtn.title = 'Expand toolbar';

    scheduleMeasure();
  }

  function scheduleMeasure() {
    requestAnimationFrame(() => {
      const rect = bar.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);
      const key = `${width}x${height}`;
      if (key === lastSent || width < 20 || height < 20) return;
      lastSent = key;
      api.resize(width, height);
    });
  }

  api.onPenClick((point) => {
    if (!point) return;
    const el = document.elementFromPoint(point.x, point.y);
    const control = el && el.closest ? el.closest('button, input, label') : null;
    if (control && typeof control.click === 'function') control.click();
  });

  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', (event) => {
    if (!state || state.mode !== 'draw') return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (/^[1-9]$/.test(event.key)) {
      const color = state.presets[Number(event.key) - 1];
      if (color) api.setColor(color);
    }
  });

  build();
  api.onState((next) => {
    state = next;
    render();
  });
  api.getState().then((initial) => {
    state = initial;
    render();
  });
})();
