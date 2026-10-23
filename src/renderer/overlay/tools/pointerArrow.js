/**
 * Giant teaching cursor. Drawn on its own canvas so it never enters undo
 * history and is not included in the PNG export of the ink layer.
 * The tip of the arrow is the cursor hotspot.
 */
(function () {
  function draw(ctx, x, y, penSize, color, pointerScale) {
    const size = window.InkGeo.pointerArrowSize(penSize, pointerScale);
    const u = size / 22;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 20 * u);
    ctx.lineTo(5.2 * u, 15.2 * u);
    ctx.lineTo(10.2 * u, 23.2 * u);
    ctx.lineTo(13.4 * u, 21.6 * u);
    ctx.lineTo(8.4 * u, 13.6 * u);
    ctx.lineTo(15.2 * u, 13.2 * u);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  window.InkPointer = { draw };
})();
