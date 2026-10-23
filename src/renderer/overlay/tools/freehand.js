/**
 * Pen and highlighter gestures. Points come from pointermove plus
 * getCoalescedEvents(); this file only stores them and builds a stroke object.
 */
(function () {
  const MIN_STEP = 0.2;

  function start(tool, point, style) {
    return {
      kind: 'stroke',
      tool,
      points: [{ x: point.x, y: point.y }],
      color: style.color,
      size: style.size,
    };
  }

  function pushPoint(gesture, point) {
    const points = gesture.points;
    const last = points[points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < MIN_STEP) return false;
    points.push({ x: point.x, y: point.y });
    return true;
  }

  function toObject(gesture) {
    if (!gesture.points.length) return null;
    return {
      type: 'stroke',
      tool: gesture.tool,
      points: gesture.points.map((p) => ({ x: p.x, y: p.y })),
      color: gesture.color,
      size: gesture.size,
    };
  }

  window.InkFreehand = { start, pushPoint, toObject };
})();
