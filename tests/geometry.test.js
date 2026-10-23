const assert = require('assert');
const geo = require('../src/renderer/overlay/geometry');

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

test('line constraint snaps a near-horizontal drag to 0 degrees', () => {
  const end = geo.constrainLine({ x: 0, y: 0 }, { x: 100, y: 8 });
  assert.ok(Math.abs(end.y) < 0.001);
  assert.ok(Math.abs(end.x - Math.hypot(100, 8)) < 0.001);
});

test('line constraint keeps a 45 degree drag', () => {
  const end = geo.constrainLine({ x: 0, y: 0 }, { x: 40, y: 40 });
  assert.ok(Math.abs(end.x - end.y) < 0.001);
  assert.ok(end.x > 0);
});

test('square constraint equalizes width and height', () => {
  const end = geo.constrainSquareEnd({ x: 2, y: 3 }, { x: 12, y: 6 });
  assert.strictEqual(end.x, 12);
  assert.strictEqual(end.y, 13);
});

test('distance to a segment is zero on the segment and perpendicular off it', () => {
  assert.strictEqual(geo.distToSegment(5, 0, 0, 0, 10, 0), 0);
  assert.strictEqual(geo.distToSegment(5, 4, 0, 0, 10, 0), 4);
  assert.strictEqual(geo.distToSegment(-2, 0, 0, 0, 10, 0), 2);
});

test('stroke hit uses the pen width, not only the center line', () => {
  const stroke = { type: 'stroke', tool: 'pen', size: 8, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] };
  assert.strictEqual(geo.hitTest(stroke, 20, 3, 1), true);
  assert.strictEqual(geo.hitTest(stroke, 20, 30, 1), false);
});

test('filled rect hits inside and outline rect does not', () => {
  const box = { type: 'rect', x1: 0, y1: 0, x2: 40, y2: 20, size: 2, fill: false };
  assert.strictEqual(geo.hitTest(box, 20, 10, 2), false);
  assert.strictEqual(geo.hitTest(box, 0, 10, 2), true);
  assert.strictEqual(geo.hitTest({ ...box, fill: true }, 20, 10, 2), true);
});

test('number stamp hit covers the circle', () => {
  const stamp = { type: 'number', x: 100, y: 100, n: 1, size: 6 };
  const radius = geo.numberRadius(6);
  assert.strictEqual(geo.hitTest(stamp, 100, 100, 4), true);
  assert.strictEqual(geo.hitTest(stamp, 100 + radius + 30, 100, 4), false);
});

test('arrow head is larger than the stroke and the shaft stops before the tip', () => {
  const head = geo.arrowGeometry(0, 0, 100, 0, 4);
  assert.ok(head.headLen >= 22);
  assert.ok(head.shaftEnd.x < head.tip.x);
  assert.ok(head.shaftEnd.x > 0);
  assert.strictEqual(geo.pointInTriangle(99, 0, head.tip, head.left, head.right), true);
});

test('text size and pointer arrow grow with the pen size', () => {
  assert.ok(geo.textFontSize(20) > geo.textFontSize(4));
  assert.ok(geo.pointerArrowSize(20, 1) > geo.pointerArrowSize(4, 1));
  assert.ok(geo.pointerArrowSize(8, 2) > geo.pointerArrowSize(8, 1));
  assert.ok(geo.inkWidth({ type: 'stroke', tool: 'highlighter', size: 4 }) > geo.inkWidth({ type: 'stroke', tool: 'pen', size: 4 }));
});

test('triangle points sit on the drag box', () => {
  const pts = geo.trianglePoints(0, 0, 30, 40);
  assert.deepStrictEqual(pts[0], { x: 15, y: 0 });
  assert.deepStrictEqual(pts[1], { x: 0, y: 40 });
  assert.deepStrictEqual(pts[2], { x: 30, y: 40 });
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
