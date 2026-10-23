/** Eraser radius and hit collection. Whole objects are removed, not pixels. */
(function () {
  function radius(penSize) {
    return Math.max(12, penSize * 2);
  }

  function hits(items, x, y, eraserRadius) {
    const found = [];
    for (let i = 0; i < items.length; i++) {
      if (window.InkGeo.hitTest(items[i], x, y, eraserRadius)) found.push(items[i]);
    }
    return found;
  }

  window.InkEraser = { radius, hits };
})();
