/**
 * Drag tools: line, arrow, rectangle, ellipse, triangle.
 * Shift constrains lines and arrows to 45 degrees and boxes to a square,
 * which makes the ellipse a circle.
 */
(function () {
  const SHAPES = { line: true, arrow: true, rect: true, ellipse: true, triangle: true };

  function start(type, point, style) {
    return {
      kind: 'shape',
      type,
      anchor: { x: point.x, y: point.y },
      end: { x: point.x, y: point.y },
      color: style.color,
      size: style.size,
      fill: Boolean(style.fill),
    };
  }

  function constrainedEnd(gesture, point, shift) {
    if (!shift) return { x: point.x, y: point.y };
    if (gesture.type === 'line' || gesture.type === 'arrow') {
      return window.InkGeo.constrainLine(gesture.anchor, point);
    }
    return window.InkGeo.constrainSquareEnd(gesture.anchor, point);
  }

  function update(gesture, point, shift) {
    gesture.end = constrainedEnd(gesture, point, shift);
  }

  function toObject(gesture) {
    const dx = gesture.end.x - gesture.anchor.x;
    const dy = gesture.end.y - gesture.anchor.y;
    if (Math.hypot(dx, dy) < 2) return null;
    return {
      type: gesture.type,
      x1: gesture.anchor.x,
      y1: gesture.anchor.y,
      x2: gesture.end.x,
      y2: gesture.end.y,
      color: gesture.color,
      size: gesture.size,
      fill: gesture.type === 'line' || gesture.type === 'arrow' ? false : gesture.fill,
    };
  }

  window.InkShapes = { SHAPES, start, update, toObject };
})();
