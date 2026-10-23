const assert = require('assert');
const { create } = require('../src/renderer/overlay/history');

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

test('undo and redo restore strokes', () => {
  const history = create();
  history.pushAdd({ type: 'stroke', tool: 'pen', points: [{ x: 1, y: 1 }] });
  assert.strictEqual(history.items.length, 1);
  assert.strictEqual(history.undo(), true);
  assert.strictEqual(history.items.length, 0);
  assert.strictEqual(history.redo(), true);
  assert.strictEqual(history.items.length, 1);
  assert.strictEqual(history.canUndo(), true);
  assert.strictEqual(history.canRedo(), false);
});

test('number stamps advance and undo rewinds the counter', () => {
  const history = create();
  history.pushAdd({ type: 'number', n: history.nextNumber, x: 0, y: 0 });
  history.pushAdd({ type: 'number', n: history.nextNumber, x: 4, y: 4 });
  assert.strictEqual(history.nextNumber, 3);
  assert.deepStrictEqual(history.items.map((item) => item.n), [1, 2]);
  history.undo();
  assert.strictEqual(history.nextNumber, 2);
  history.undo();
  assert.strictEqual(history.nextNumber, 1);
  history.redo();
  assert.strictEqual(history.nextNumber, 2);
  assert.strictEqual(history.items[0].n, 1);
});

test('a stroke after a stamp does not change the counter when undone', () => {
  const history = create();
  history.pushAdd({ type: 'number', n: history.nextNumber, x: 0, y: 0 });
  history.pushAdd({ type: 'stroke', tool: 'pen', points: [{ x: 1, y: 1 }] });
  assert.strictEqual(history.nextNumber, 2);
  history.undo();
  assert.strictEqual(history.nextNumber, 2);
  assert.strictEqual(history.items.length, 1);
});

test('clear resets the counter and undo restores both', () => {
  const history = create();
  history.pushAdd({ type: 'number', n: history.nextNumber, x: 1, y: 1 });
  history.pushAdd({ type: 'rect', x1: 0, y1: 0, x2: 3, y2: 3 });
  assert.strictEqual(history.clear(), true);
  assert.strictEqual(history.items.length, 0);
  assert.strictEqual(history.nextNumber, 1);
  history.undo();
  assert.strictEqual(history.items.length, 2);
  assert.strictEqual(history.nextNumber, 2);
});

test('reset counter is undoable', () => {
  const history = create();
  history.pushAdd({ type: 'number', n: history.nextNumber, x: 0, y: 0 });
  history.resetNumbers();
  assert.strictEqual(history.nextNumber, 1);
  history.undo();
  assert.strictEqual(history.nextNumber, 2);
});

test('eraser removal of several objects is one undo', () => {
  const history = create();
  history.pushAdd({ type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 });
  history.pushAdd({ type: 'text', text: 'Hi', x: 2, y: 2 });
  history.pushAdd({ type: 'ellipse', x1: 0, y1: 0, x2: 8, y2: 8 });
  const ids = new Set(history.items.map((item) => item.id));
  history.removeIds(ids);
  assert.strictEqual(history.items.length, 0);
  history.undo();
  assert.strictEqual(history.items.length, 3);
  assert.strictEqual(history.items[1].text, 'Hi');
});

test('moving text is undoable', () => {
  const history = create();
  history.pushAdd({ type: 'text', text: 'A', x: 1, y: 2 });
  const obj = history.items[0];
  obj.x = 30;
  obj.y = 40;
  history.recordMove(obj, { x: 1, y: 2 }, { x: 30, y: 40 });
  assert.strictEqual(obj.x, 30);
  history.undo();
  assert.strictEqual(obj.x, 1);
  assert.strictEqual(obj.y, 2);
  history.redo();
  assert.strictEqual(obj.x, 30);
});

test('editing text is undoable and a new action drops redo', () => {
  const history = create();
  history.pushAdd({ type: 'text', text: 'old', x: 0, y: 0 });
  const obj = history.items[0];
  history.mutate(obj, { text: 'new' });
  assert.strictEqual(obj.text, 'new');
  history.undo();
  assert.strictEqual(obj.text, 'old');
  history.pushAdd({ type: 'arrow', x1: 0, y1: 0, x2: 5, y2: 5 });
  assert.strictEqual(history.canRedo(), false);
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
