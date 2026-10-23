/** Auto-increment stamps. The history stack owns the counter and its undo. */
(function () {
  function create(x, y, n, style) {
    return {
      type: 'number',
      x,
      y,
      n,
      color: style.color,
      size: style.size,
    };
  }

  window.InkNumbers = { create };
})();
