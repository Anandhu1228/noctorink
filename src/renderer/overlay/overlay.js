/**
 * Overlay input.
 *
 * All drawing goes through the Pointer Events API (pointerdown / pointermove /
 * pointerup / pointercancel), including pen, touch, and mouse. That is the
 * same path Chrome uses for a web whiteboard, and it is the path that stays
 * smooth when Weylus injects a stylus. Do not replace this with a native hook.
 *
 * getCoalescedEvents() fills in the samples Chromium merged between frames.
 * setPointerCapture keeps the stroke intact if the pen leaves the window.
 * Only the first active pointer draws; extra fingers are ignored.
 */

(function () {
  const api = window.overlayApi;
  const history = window.InkHistory.create();

  const hitCanvas = document.getElementById('hit');
  const inkCanvas = document.getElementById('ink');
  const previewCanvas = document.getElementById('preview');
  const pointerCanvas = document.getElementById('pointer');
  const textEditor = document.getElementById('text-editor');

  const hitCtx = hitCanvas.getContext('2d');
  const inkCtx = inkCanvas.getContext('2d');
  const previewCtx = previewCanvas.getContext('2d');
  const pointerCtx = pointerCanvas.getContext('2d');

  let state = null;
  let dpr = 1;
  let activePointerId = null;
  let shiftKey = false;
  let gesture = null;
  let erasedIds = new Set();
  let textSession = null;
  let polledCursor = null;
  let livePointer = null;
  let livePointerAt = 0;
  let loggedPointerType = false;

  previewCanvas.style.touchAction = 'none';
  inkCanvas.style.touchAction = 'none';

  function cssSize() {
    return {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    };
  }

  function fit(canvas, ctx, size) {
    const bw = Math.max(1, Math.round(size.w * size.dpr));
    const bh = Math.max(1, Math.round(size.h * size.dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  }

  function resize() {
    const size = cssSize();
    dpr = size.dpr;
    fit(hitCanvas, hitCtx, size);
    fit(inkCanvas, inkCtx, size);
    fit(previewCanvas, previewCtx, size);
    fit(pointerCanvas, pointerCtx, size);
    paintHitVeil();
    redraw();
    clearPreview();
    drawPointer();
  }

  /** Non-zero alpha across the whole window so draw mode receives the pen everywhere. */
  function paintHitVeil() {
    hitCtx.setTransform(1, 0, 0, 1, 0, 0);
    hitCtx.clearRect(0, 0, hitCanvas.width, hitCanvas.height);
    hitCtx.fillStyle = 'rgba(0, 0, 0, 0.004)';
    hitCtx.fillRect(0, 0, hitCanvas.width, hitCanvas.height);
  }

  function redraw() {
    window.InkRender.clearCanvas(inkCtx, inkCanvas);
    inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const visible = history.items.filter((obj) => !erasedIds.has(obj.id) && !(textSession && textSession.obj === obj));
    window.InkRender.drawAll(inkCtx, visible, dpr);
  }

  function clearLayer(ctx, canvas) {
    window.InkRender.clearCanvas(ctx, canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearPreview() {
    clearLayer(previewCtx, previewCanvas);
  }

  function report() {
    if (!api) return;
    api.reportHistory({
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      nextNumber: history.nextNumber,
    });
  }

  function styleNow() {
    return {
      color: state.color,
      size: state.size,
      fill: state.fill,
    };
  }

  function localPoint(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function eachCoalesced(event, fn) {
    const list = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
    if (list && list.length) {
      for (let i = 0; i < list.length; i++) fn(localPoint(list[i]));
      return;
    }
    fn(localPoint(event));
  }

  function rememberPointer(event) {
    if (activePointerId !== null && event.pointerId !== activePointerId) return;
    livePointer = localPoint(event);
    livePointerAt = performance.now();
    drawPointer();
  }

  function drawPointer() {
    clearLayer(pointerCtx, pointerCanvas);
    if (!state || !state.pointerArrow) return;
    const freshPen = state.mode === 'draw' && livePointer && performance.now() - livePointerAt < 80;
    let point = null;
    if (freshPen) {
      point = livePointer;
    } else if (polledCursor && polledCursor.inside) {
      const sx = polledCursor.windowWidth ? window.innerWidth / polledCursor.windowWidth : 1;
      const sy = polledCursor.windowHeight ? window.innerHeight / polledCursor.windowHeight : 1;
      point = { x: polledCursor.x * sx, y: polledCursor.y * sy };
    }
    if (!point) return;
    const px = Math.round(point.x * dpr) / dpr;
    const py = Math.round(point.y * dpr) / dpr;
    window.InkPointer.draw(pointerCtx, px, py, state.size, state.color, state.pointerScale);
  }

  function previewGesture() {
    clearPreview();
    if (!gesture) return;
    if (gesture.kind === 'stroke') {
      window.InkRender.drawObject(previewCtx, window.InkFreehand.toObject(gesture), dpr);
      return;
    }
    if (gesture.kind === 'shape') {
      const dx = gesture.end.x - gesture.anchor.x;
      const dy = gesture.end.y - gesture.anchor.y;
      if (Math.hypot(dx, dy) < 0.5) return;
      const obj = {
        type: gesture.type,
        x1: gesture.anchor.x,
        y1: gesture.anchor.y,
        x2: gesture.end.x,
        y2: gesture.end.y,
        color: gesture.color,
        size: gesture.size,
        fill: gesture.type === 'line' || gesture.type === 'arrow' ? false : gesture.fill,
      };
      window.InkRender.drawObject(previewCtx, obj, dpr);
      return;
    }
    if (gesture.kind === 'eraser' && gesture.cursor) {
      const radius = window.InkEraser.radius(gesture.size);
      previewCtx.beginPath();
      previewCtx.lineWidth = 1.5;
      previewCtx.strokeStyle = gesture.color;
      previewCtx.arc(gesture.cursor.x, gesture.cursor.y, radius, 0, Math.PI * 2);
      previewCtx.stroke();
    }
  }

  function startGesture(point) {
    const style = styleNow();
    const tool = state.tool;
    if (tool === 'pen' || tool === 'highlighter') {
      gesture = window.InkFreehand.start(tool, point, style);
      previewGesture();
      return;
    }
    if (window.InkShapes.SHAPES[tool]) {
      gesture = window.InkShapes.start(tool, point, style);
      previewGesture();
      return;
    }
    if (tool === 'eraser') {
      gesture = { kind: 'eraser', size: style.size, color: style.color, cursor: point };
      eraseAt(point);
      previewGesture();
      return;
    }
    if (tool === 'numbers') {
      gesture = { kind: 'number', origin: point, moved: false };
      return;
    }
    if (tool === 'text') {
      const existing = window.InkGeo.hitTextObject(history.items, point.x, point.y);
      if (existing) {
        gesture = {
          kind: 'textdrag',
          obj: existing,
          origin: point,
          from: { x: existing.x, y: existing.y },
          dx: point.x - existing.x,
          dy: point.y - existing.y,
          moved: false,
        };
      } else {
        gesture = { kind: 'textplace', origin: point };
      }
    }
  }

  function eraseAt(point) {
    const found = window.InkEraser.hits(history.items, point.x, point.y, window.InkEraser.radius(state.size));
    let changed = false;
    for (let i = 0; i < found.length; i++) {
      if (!erasedIds.has(found[i].id)) {
        erasedIds.add(found[i].id);
        changed = true;
      }
    }
    if (changed) redraw();
  }

  function extendGesture(point) {
    if (!gesture) return;
    if (gesture.kind === 'stroke') {
      if (window.InkFreehand.pushPoint(gesture, point)) previewGesture();
      return;
    }
    if (gesture.kind === 'shape') {
      window.InkShapes.update(gesture, point, shiftKey);
      previewGesture();
      return;
    }
    if (gesture.kind === 'eraser') {
      gesture.cursor = point;
      eraseAt(point);
      previewGesture();
      return;
    }
    if (gesture.kind === 'number') {
      if (Math.hypot(point.x - gesture.origin.x, point.y - gesture.origin.y) > 6) gesture.moved = true;
      return;
    }
    if (gesture.kind === 'textdrag') {
      const nx = point.x - gesture.dx;
      const ny = point.y - gesture.dy;
      if (Math.hypot(point.x - gesture.origin.x, point.y - gesture.origin.y) > 3) gesture.moved = true;
      gesture.obj.x = nx;
      gesture.obj.y = ny;
      redraw();
    }
  }

  function finishGesture() {
    const current = gesture;
    gesture = null;
    clearPreview();
    if (!current) return;

    if (current.kind === 'stroke') {
      const obj = window.InkFreehand.toObject(current);
      if (obj) {
        history.pushAdd(obj);
        redraw();
        report();
      }
      return;
    }
    if (current.kind === 'shape') {
      const obj = window.InkShapes.toObject(current);
      if (obj) {
        history.pushAdd(obj);
        redraw();
        report();
      }
      return;
    }
    if (current.kind === 'eraser') {
      const ids = erasedIds;
      erasedIds = new Set();
      if (ids.size) {
        history.removeIds(ids);
        redraw();
        report();
      }
      return;
    }
    if (current.kind === 'number') {
      const obj = window.InkNumbers.create(current.origin.x, current.origin.y, history.nextNumber, styleNow());
      history.pushAdd(obj);
      redraw();
      report();
      return;
    }
    if (current.kind === 'textdrag') {
      if (current.moved) {
        history.recordMove(current.obj, current.from, { x: current.obj.x, y: current.obj.y });
        redraw();
        report();
      } else {
        beginTextEdit(current.obj.x, current.obj.y, current.obj);
      }
      return;
    }
    if (current.kind === 'textplace') {
      beginTextEdit(current.origin.x, current.origin.y, null);
    }
  }

  function cancelGesture() {
    const current = gesture;
    gesture = null;
    activePointerId = null;
    if (current && current.kind === 'textdrag' && current.moved) {
      current.obj.x = current.from.x;
      current.obj.y = current.from.y;
    }
    if (erasedIds.size) {
      erasedIds = new Set();
    }
    clearPreview();
    redraw();
  }

  function beginTextEdit(x, y, obj) {
    const fontSize = obj ? obj.fontSize : window.InkText.fontSize(state.size);
    textSession = {
      x,
      y,
      obj,
      color: obj ? obj.color : state.color,
      fontSize,
      text: obj ? obj.text : '',
    };
    window.InkText.open(textEditor, textSession);
    redraw();
  }

  function commitText() {
    if (!textSession) return;
    const session = textSession;
    const raw = textEditor.value;
    textSession = null;
    window.InkText.close(textEditor);
    const text = raw.replace(/\s+$/g, '');
    if (text.trim() === '') {
      if (session.obj) history.removeIds(new Set([session.obj.id]));
      redraw();
      report();
      return;
    }
    const metrics = window.InkRender.measureText(inkCtx, text, session.fontSize);
    if (session.obj) {
      history.mutate(session.obj, {
        text,
        width: metrics.width,
        height: metrics.height,
        lineHeight: metrics.lineHeight,
      });
    } else {
      history.pushAdd({
        type: 'text',
        x: session.x,
        y: session.y,
        text,
        color: session.color,
        fontSize: session.fontSize,
        width: metrics.width,
        height: metrics.height,
        lineHeight: metrics.lineHeight,
      });
    }
    redraw();
    report();
  }

  function cancelText() {
    if (!textSession) return;
    textSession = null;
    window.InkText.close(textEditor);
    redraw();
  }

  /** Screen point of this event in the same DIP space as the toolbar window. */
  function toolbarHit(event) {
    const box = state && state.toolbarBounds;
    const origin = state && state.display && state.display.bounds;
    if (!box || !origin || state.toolbarVisible === false) return null;
    const x = origin.x + event.clientX;
    const y = origin.y + event.clientY;
    const pad = 8;
    if (x < box.x - pad || y < box.y - pad || x >= box.x + box.width + pad || y >= box.y + box.height + pad) {
      return null;
    }
    return { x: x - box.x, y: y - box.y };
  }

  function onPointerDown(event) {
    if (!state || state.mode !== 'draw') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (activePointerId !== null) return;
    if (textSession && event.target === textEditor) return;

    const barHit = toolbarHit(event);
    if (barHit) {
      event.preventDefault();
      api.toolbarClick(barHit.x, barHit.y);
      return;
    }

    event.preventDefault();
    if (!loggedPointerType) {
      loggedPointerType = true;
      console.log(`[noctorink] input ${event.pointerType}`);
    }
    rememberPointer(event);

    if (textSession) {
      commitText();
      return;
    }

    activePointerId = event.pointerId;
    shiftKey = event.shiftKey;
    try {
      previewCanvas.setPointerCapture(event.pointerId);
    } catch (error) {
      /* Capture can fail if the pointer was already released. The up handler still ends the stroke. */
    }
    const first = localPoint(event);
    startGesture(first);
    eachCoalesced(event, (point) => {
      if (point.x !== first.x || point.y !== first.y) extendGesture(point);
    });
  }

  function onPointerMove(event) {
    rememberPointer(event);
    if (event.pointerId !== activePointerId) return;
    shiftKey = event.shiftKey;
    eachCoalesced(event, extendGesture);
  }

  function onPointerUp(event) {
    if (event.pointerId !== activePointerId) return;
    shiftKey = event.shiftKey;
    eachCoalesced(event, extendGesture);
    try {
      if (previewCanvas.hasPointerCapture(event.pointerId)) previewCanvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* already released */
    }
    activePointerId = null;
    finishGesture();
  }

  function applyState(next) {
    const previousMode = state && state.mode;
    state = next;
    if (previousMode === 'draw' && state.mode !== 'draw') {
      if (textSession) commitText();
      else if (gesture) finishGesture();
    }
    drawPointer();
  }

  function runHistory(command) {
    if (!command) return;
    if (command.type === 'capture') {
      exportPng();
      return;
    }
    // Undo/redo dismiss an in-progress edit or stroke first, so one keypress
    // does not also rewind the previous object.
    if (command.type === 'undo' || command.type === 'redo') {
      if (textSession) {
        cancelText();
        return;
      }
      if (gesture) {
        cancelGesture();
        return;
      }
    } else {
      if (textSession) cancelText();
      if (gesture) cancelGesture();
    }
    let changed = false;
    if (command.type === 'undo') changed = history.undo();
    else if (command.type === 'redo') changed = history.redo();
    else if (command.type === 'clear') changed = history.clear();
    else if (command.type === 'reset-numbers') changed = history.resetNumbers();
    if (changed) {
      erasedIds = new Set();
      redraw();
      report();
    }
  }

  function exportPng() {
    try {
      const url = inkCanvas.toDataURL('image/png');
      api.savePng(url);
    } catch (error) {
      console.error('[noctorink] png export failed', error);
    }
  }

  previewCanvas.addEventListener('pointerdown', onPointerDown);
  previewCanvas.addEventListener('pointermove', onPointerMove);
  previewCanvas.addEventListener('pointerup', onPointerUp);
  previewCanvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointermove', rememberPointer);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') shiftKey = true;
    // Backup for when the global Escape shortcut did not register.
    // Leaving draw mode also commits an open text box.
    if (event.key === 'Escape' && state && state.mode === 'draw') {
      event.preventDefault();
      if (textSession) commitText();
      api.release();
      return;
    }
    if (event.target === textEditor) return;
    if (!state || state.mode !== 'draw') return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (/^[1-9]$/.test(event.key)) api.setColorIndex(Number(event.key) - 1);
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') shiftKey = false;
  });

  window.addEventListener('blur', () => {
    shiftKey = false;
  });

  textEditor.addEventListener('input', () => {
    if (!textSession) return;
    window.InkText.autosize(textEditor, textSession.fontSize);
  });

  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('dragstart', (event) => event.preventDefault());
  window.addEventListener('selectstart', (event) => {
    if (event.target !== textEditor) event.preventDefault();
  });
  window.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });

  window.addEventListener('resize', resize);

  function watchDpr() {
    const media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      media.removeEventListener('change', onChange);
      resize();
      watchDpr();
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
  }

  api.onState(applyState);
  api.onHistory(runHistory);
  api.onCursor((position) => {
    polledCursor = position;
    drawPointer();
  });

  resize();
  watchDpr();
  api.getState().then((initial) => {
    applyState(initial);
    report();
    const coalesced = typeof PointerEvent !== 'undefined' && 'getCoalescedEvents' in PointerEvent.prototype;
    console.log(
      `[noctorink] overlay dpr=${window.devicePixelRatio} ${window.innerWidth}x${window.innerHeight} coalesced=${coalesced}`
    );
  });
})();
