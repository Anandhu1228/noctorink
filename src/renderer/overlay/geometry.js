/**
 * Pure geometry shared by the overlay and the node tests.
 * Coordinates are CSS pixels. Hit testing uses the same widths the renderer strokes with.
 */
(function (root, factory) {
  const api = factory();
  root.InkGeo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function inkWidth(obj) {
    if (obj && obj.type === 'stroke' && obj.tool === 'highlighter') {
      return Math.max(12, obj.size * 3);
    }
    return Math.max(1, obj && obj.size ? obj.size : 1);
  }

  function textFontSize(penSize) {
    return Math.round(Math.max(16, 10 + penSize * 1.6));
  }

  function numberRadius(penSize) {
    return Math.max(16, penSize * 2.4);
  }

  function pointerArrowSize(penSize, pointerScale) {
    const scale = Number.isFinite(pointerScale) && pointerScale > 0 ? pointerScale : 1;
    const penFactor = 0.75 + (Math.max(1, penSize) / 40) * 0.9;
    return 56 * scale * penFactor;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function signOf(delta) {
    return delta < 0 ? -1 : 1;
  }

  /** Snap a segment to the nearest 45 degrees, keeping its length. */
  function constrainLine(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return { x: end.x, y: end.y };
    const angle = Math.atan2(dy, dx);
    const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return {
      x: start.x + Math.cos(snap) * length,
      y: start.y + Math.sin(snap) * length,
    };
  }

  /** Square / circle: equal width and height, anchored at the drag start. */
  function constrainSquareEnd(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: start.x + signOf(dx) * side,
      y: start.y + signOf(dy) * side,
    };
  }

  function normRect(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    };
  }

  function trianglePoints(x1, y1, x2, y2) {
    const box = normRect(x1, y1, x2, y2);
    return [
      { x: box.x + box.w / 2, y: box.y },
      { x: box.x, y: box.y + box.h },
      { x: box.x + box.w, y: box.y + box.h },
    ];
  }

  /**
   * Large filled arrow head. The shaft should stop near `shaftEnd` so the
   * stroke and the head do not stack into a darker joint.
   */
  function arrowGeometry(x1, y1, x2, y2, width) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(22, width * 4.5);
    const halfWidth = headLen * 0.48;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const px = Math.cos(angle + Math.PI / 2);
    const py = Math.sin(angle + Math.PI / 2);
    return {
      headLen,
      shaftEnd: {
        x: x2 - ux * headLen * 0.72,
        y: y2 - uy * headLen * 0.72,
      },
      tip: { x: x2, y: y2 },
      left: {
        x: x2 - ux * headLen + px * halfWidth,
        y: y2 - uy * headLen + py * halfWidth,
      },
      right: {
        x: x2 - ux * headLen - px * halfWidth,
        y: y2 - uy * headLen - py * halfWidth,
      },
    };
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function pointInTriangle(px, py, a, b, c) {
    const area = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const ab = area(a, b, { x: px, y: py });
    const bc = area(b, c, { x: px, y: py });
    const ca = area(c, a, { x: px, y: py });
    const hasNeg = ab < 0 || bc < 0 || ca < 0;
    const hasPos = ab > 0 || bc > 0 || ca > 0;
    return !(hasNeg && hasPos);
  }

  function hitStroke(obj, x, y, radius) {
    const points = obj.points || [];
    const limit = radius + inkWidth(obj) / 2;
    if (points.length === 0) return false;
    if (points.length === 1) return dist(x, y, points[0].x, points[0].y) <= limit;
    for (let i = 1; i < points.length; i++) {
      const d = distToSegment(x, y, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
      if (d <= limit) return true;
    }
    return false;
  }

  function hitLine(obj, x, y, radius) {
    const limit = radius + inkWidth(obj) / 2;
    if (distToSegment(x, y, obj.x1, obj.y1, obj.x2, obj.y2) <= limit) return true;
    if (obj.type !== 'arrow') return false;
    const head = arrowGeometry(obj.x1, obj.y1, obj.x2, obj.y2, inkWidth(obj));
    if (pointInTriangle(x, y, head.tip, head.left, head.right)) return true;
    return (
      distToSegment(x, y, head.tip.x, head.tip.y, head.left.x, head.left.y) <= radius ||
      distToSegment(x, y, head.tip.x, head.tip.y, head.right.x, head.right.y) <= radius
    );
  }

  function hitRect(obj, x, y, radius) {
    const box = normRect(obj.x1, obj.y1, obj.x2, obj.y2);
    if (obj.fill) {
      return (
        x >= box.x - radius &&
        y >= box.y - radius &&
        x <= box.x + box.w + radius &&
        y <= box.y + box.h + radius
      );
    }
    const limit = radius + inkWidth(obj) / 2;
    const edges = [
      [box.x, box.y, box.x + box.w, box.y],
      [box.x + box.w, box.y, box.x + box.w, box.y + box.h],
      [box.x + box.w, box.y + box.h, box.x, box.y + box.h],
      [box.x, box.y + box.h, box.x, box.y],
    ];
    for (let i = 0; i < edges.length; i++) {
      if (distToSegment(x, y, edges[i][0], edges[i][1], edges[i][2], edges[i][3]) <= limit) return true;
    }
    return false;
  }

  function hitEllipse(obj, x, y, radius) {
    const box = normRect(obj.x1, obj.y1, obj.x2, obj.y2);
    const rx = Math.max(box.w / 2, 0.5);
    const ry = Math.max(box.h / 2, 0.5);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const normalized = nx * nx + ny * ny;
    if (obj.fill) {
      const pad = radius / Math.min(rx, ry);
      return normalized <= (1 + pad) * (1 + pad);
    }
    const distance = Math.abs(Math.sqrt(normalized) - 1) * Math.min(rx, ry);
    return distance <= radius + inkWidth(obj) / 2;
  }

  function hitTriangle(obj, x, y, radius) {
    const pts = trianglePoints(obj.x1, obj.y1, obj.x2, obj.y2);
    if (obj.fill && pointInTriangle(x, y, pts[0], pts[1], pts[2])) return true;
    const limit = radius + (obj.fill ? 0 : inkWidth(obj) / 2);
    for (let i = 0; i < 3; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 3];
      if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= limit) return true;
    }
    return false;
  }

  function hitText(obj, x, y, radius) {
    const w = obj.width || 0;
    const h = obj.height || 0;
    return x >= obj.x - radius && y >= obj.y - radius && x <= obj.x + w + radius && y <= obj.y + h + radius;
  }

  function hitNumber(obj, x, y, radius) {
    return dist(x, y, obj.x, obj.y) <= numberRadius(obj.size) + radius;
  }

  function hitTest(obj, x, y, radius) {
    if (!obj) return false;
    if (obj.type === 'stroke') return hitStroke(obj, x, y, radius);
    if (obj.type === 'line' || obj.type === 'arrow') return hitLine(obj, x, y, radius);
    if (obj.type === 'rect') return hitRect(obj, x, y, radius);
    if (obj.type === 'ellipse') return hitEllipse(obj, x, y, radius);
    if (obj.type === 'triangle') return hitTriangle(obj, x, y, radius);
    if (obj.type === 'text') return hitText(obj, x, y, radius);
    if (obj.type === 'number') return hitNumber(obj, x, y, radius);
    return false;
  }

  /** Top-most text object under a point, or null. */
  function hitTextObject(items, x, y) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].type === 'text' && hitText(items[i], x, y, 4)) return items[i];
    }
    return null;
  }

  return {
    inkWidth,
    textFontSize,
    numberRadius,
    pointerArrowSize,
    dist,
    constrainLine,
    constrainSquareEnd,
    normRect,
    trianglePoints,
    arrowGeometry,
    distToSegment,
    pointInTriangle,
    hitTest,
    hitTextObject,
  };
});
