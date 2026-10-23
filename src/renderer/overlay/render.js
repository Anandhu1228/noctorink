/**
 * Draws committed objects onto a canvas whose transform is already devicePixelRatio.
 * One pass per object, round caps, no halo and no second outline.
 * Highlighter strokes are painted opaquely into a scratch canvas and then
 * composited once, so a stroke that crosses itself stays a single alpha.
 */

(function () {
  const HIGHLIGHTER_ALPHA = 0.38;
  let scratch = null;

  function geo() {
    return window.InkGeo;
  }

  function prepStroke(ctx, color, width) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
  }

  /**
   * Midpoint quadratic smoothing. The curve is continuous: each segment starts
   * where the previous one ended, which is what keeps a fast Weylus stroke from
   * collapsing into dots or chords between sparse samples.
   */
  function traceSmooth(ctx, points) {
    if (points.length < 2) return false;
    ctx.beginPath();
    if (points.length === 2) {
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      return true;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    return true;
  }

  function paintDot(ctx, x, y, width, color) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintStroke(ctx, points, color, width) {
    prepStroke(ctx, color, width);
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      paintDot(ctx, points[0].x, points[0].y, width, color);
      return;
    }
    if (traceSmooth(ctx, points)) ctx.stroke();
  }

  function paddedBounds(points, pad) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxX = Math.max(maxX, points[i].x);
      maxY = Math.max(maxY, points[i].y);
    }
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }

  function scratchFor(cssW, cssH, dpr) {
    const pw = Math.max(1, Math.ceil(cssW * dpr));
    const ph = Math.max(1, Math.ceil(cssH * dpr));
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < pw) scratch.width = pw;
    if (scratch.height < ph) scratch.height = ph;
    return { canvas: scratch, pw, ph };
  }

  function drawHighlighter(ctx, obj, dpr) {
    const width = geo().inkWidth(obj);
    const bounds = paddedBounds(obj.points, width / 2 + 2);
    if (!(bounds.w > 0) || !(bounds.h > 0)) return;
    const sheet = scratchFor(bounds.w, bounds.h, dpr);
    const sctx = sheet.canvas.getContext('2d');
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sheet.pw, sheet.ph);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.translate(-bounds.x, -bounds.y);
    paintStroke(sctx, obj.points, obj.color, width);
    ctx.save();
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.drawImage(sheet.canvas, 0, 0, sheet.pw, sheet.ph, bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.restore();
  }

  function drawLine(ctx, obj) {
    const width = geo().inkWidth(obj);
    prepStroke(ctx, obj.color, width);
    ctx.beginPath();
    ctx.moveTo(obj.x1, obj.y1);
    ctx.lineTo(obj.x2, obj.y2);
    ctx.stroke();
  }

  function drawArrow(ctx, obj) {
    const width = geo().inkWidth(obj);
    const head = geo().arrowGeometry(obj.x1, obj.y1, obj.x2, obj.y2, width);
    prepStroke(ctx, obj.color, width);
    ctx.beginPath();
    ctx.moveTo(obj.x1, obj.y1);
    ctx.lineTo(head.shaftEnd.x, head.shaftEnd.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(head.tip.x, head.tip.y);
    ctx.lineTo(head.left.x, head.left.y);
    ctx.lineTo(head.right.x, head.right.y);
    ctx.closePath();
    ctx.fill();
  }

  function drawBoxShape(ctx, obj) {
    const width = geo().inkWidth(obj);
    const box = geo().normRect(obj.x1, obj.y1, obj.x2, obj.y2);
    prepStroke(ctx, obj.color, width);
    ctx.beginPath();
    if (obj.type === 'ellipse') {
      ctx.ellipse(
        box.x + box.w / 2,
        box.y + box.h / 2,
        Math.max(box.w / 2, 0.5),
        Math.max(box.h / 2, 0.5),
        0,
        0,
        Math.PI * 2
      );
    } else if (obj.type === 'triangle') {
      const pts = geo().trianglePoints(obj.x1, obj.y1, obj.x2, obj.y2);
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.closePath();
    } else {
      ctx.rect(box.x, box.y, Math.max(box.w, 0.5), Math.max(box.h, 0.5));
    }
    if (obj.fill) ctx.fill();
    else ctx.stroke();
  }

  function fontCss(fontSize) {
    return `${fontSize}px "Segoe UI", sans-serif`;
  }

  function drawText(ctx, obj) {
    const fontSize = obj.fontSize || 16;
    const lineHeight = obj.lineHeight || fontSize * 1.25;
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.font = fontCss(fontSize);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const lines = String(obj.text || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], obj.x, obj.y + i * lineHeight);
    }
    ctx.restore();
  }

  function measureText(ctx, text, fontSize) {
    const lineHeight = fontSize * 1.25;
    const lines = String(text || '').split('\n');
    ctx.save();
    ctx.font = fontCss(fontSize);
    let width = fontSize;
    for (let i = 0; i < lines.length; i++) {
      width = Math.max(width, ctx.measureText(lines[i] || ' ').width);
    }
    ctx.restore();
    return { width, height: Math.max(lineHeight, lines.length * lineHeight), lineHeight };
  }

  function drawNumber(ctx, obj) {
    const radius = geo().numberRadius(obj.size);
    const ring = Math.max(2, obj.size * 0.35);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.lineWidth = ring;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `600 ${Math.round(radius * 0.95)}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(obj.n), obj.x, obj.y);
    ctx.restore();
  }

  function drawObject(ctx, obj, dpr) {
    if (!obj) return;
    if (obj.type === 'stroke' && obj.tool === 'highlighter') {
      drawHighlighter(ctx, obj, dpr || 1);
      return;
    }
    if (obj.type === 'stroke') {
      paintStroke(ctx, obj.points, obj.color, geo().inkWidth(obj));
      return;
    }
    if (obj.type === 'line') return drawLine(ctx, obj);
    if (obj.type === 'arrow') return drawArrow(ctx, obj);
    if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'triangle') return drawBoxShape(ctx, obj);
    if (obj.type === 'text') return drawText(ctx, obj);
    if (obj.type === 'number') return drawNumber(ctx, obj);
  }

  function drawAll(ctx, items, dpr) {
    for (let i = 0; i < items.length; i++) drawObject(ctx, items[i], dpr);
  }

  /** Clear to real transparency so a PNG export of this canvas has no veil. */
  function clearCanvas(ctx, canvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  window.InkRender = {
    drawObject,
    drawAll,
    clearCanvas,
    measureText,
    HIGHLIGHTER_ALPHA,
  };
})();
