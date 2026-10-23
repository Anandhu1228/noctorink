/**
 * Giant teaching cursor. Drawn on its own canvas so it never enters undo
 * history and is not included in the PNG export of the ink layer.
 * The tip of the arrow is the cursor hotspot.
 */
(function () {
  function draw(ctx, x, y, penSize, color, pointerScale) {
    const size = window.InkGeo.pointerArrowSize(penSize, pointerScale);
    const u = size / 34;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    // Classic pointer: tip at the real cursor, long tail, separate notch.
    ctx.moveTo(0.6 * u, 0.4 * u);
    ctx.lineTo(1.2 * u, 28 * u);
    ctx.lineTo(8.2 * u, 21.2 * u);
    ctx.lineTo(15.4 * u, 33.2 * u);
    ctx.lineTo(20.2 * u, 30.6 * u);
    ctx.lineTo(13 * u, 18.8 * u);
    ctx.lineTo(22.4 * u, 18.2 * u);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(3.5, 4.2 * u);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.stroke();
    ctx.lineWidth = Math.max(1.6, 2 * u);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  window.InkPointer = { draw };
})();
