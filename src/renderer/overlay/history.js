/**
 * Unlimited undo stack of drawing commands.
 * Objects stay as plain data so the canvas can be rebuilt from the list.
 * The giant pointer arrow is intentionally not a history item.
 */
(function (root, factory) {
  const api = factory();
  root.InkHistory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create() {
    let seq = 1;
    const doc = {
      items: [],
      undoStack: [],
      redoStack: [],
      nextNumber: 1,
    };

    function stampId(obj) {
      if (!obj.id) obj.id = seq++;
      return obj;
    }

    function applyForward(cmd) {
      if (cmd.type === 'add') {
        stampId(cmd.obj);
        doc.items.push(cmd.obj);
        if (cmd.obj.type === 'number') doc.nextNumber = cmd.obj.n + 1;
        return;
      }
      if (cmd.type === 'remove') {
        const entries = cmd.entries.slice().sort((a, b) => b.index - a.index);
        entries.forEach((entry) => {
          if (doc.items[entry.index] === entry.obj) doc.items.splice(entry.index, 1);
          else {
            const index = doc.items.indexOf(entry.obj);
            if (index >= 0) doc.items.splice(index, 1);
          }
        });
        return;
      }
      if (cmd.type === 'move') {
        cmd.obj.x = cmd.to.x;
        cmd.obj.y = cmd.to.y;
        return;
      }
      if (cmd.type === 'mutate') {
        Object.keys(cmd.after).forEach((key) => {
          cmd.obj[key] = cmd.after[key];
        });
        return;
      }
      if (cmd.type === 'clear') {
        doc.items = [];
        doc.nextNumber = 1;
        return;
      }
      if (cmd.type === 'renumber') {
        doc.nextNumber = cmd.to;
      }
    }

    function applyInverse(cmd) {
      if (cmd.type === 'add') {
        const index = doc.items.lastIndexOf(cmd.obj);
        if (index >= 0) doc.items.splice(index, 1);
        // Undoing a number stamp rewinds the counter to that stamp's number.
        if (cmd.obj.type === 'number') doc.nextNumber = cmd.obj.n;
        return;
      }
      if (cmd.type === 'remove') {
        const entries = cmd.entries.slice().sort((a, b) => a.index - b.index);
        entries.forEach((entry) => {
          const index = Math.min(Math.max(entry.index, 0), doc.items.length);
          doc.items.splice(index, 0, entry.obj);
        });
        return;
      }
      if (cmd.type === 'move') {
        cmd.obj.x = cmd.from.x;
        cmd.obj.y = cmd.from.y;
        return;
      }
      if (cmd.type === 'mutate') {
        Object.keys(cmd.before).forEach((key) => {
          cmd.obj[key] = cmd.before[key];
        });
        return;
      }
      if (cmd.type === 'clear') {
        doc.items = cmd.items.slice();
        doc.nextNumber = cmd.nextNumber;
        return;
      }
      if (cmd.type === 'renumber') {
        doc.nextNumber = cmd.from;
      }
    }

    function push(cmd) {
      applyForward(cmd);
      doc.undoStack.push(cmd);
      doc.redoStack = [];
    }

    return {
      get items() {
        return doc.items;
      },
      get nextNumber() {
        return doc.nextNumber;
      },
      canUndo() {
        return doc.undoStack.length > 0;
      },
      canRedo() {
        return doc.redoStack.length > 0;
      },
      pushAdd(obj) {
        push({ type: 'add', obj });
      },
      removeIds(idSet) {
        const entries = [];
        for (let i = 0; i < doc.items.length; i++) {
          if (idSet.has(doc.items[i].id)) entries.push({ index: i, obj: doc.items[i] });
        }
        if (entries.length === 0) return false;
        push({ type: 'remove', entries });
        return true;
      },
      recordMove(obj, from, to) {
        if (from.x === to.x && from.y === to.y) return false;
        obj.x = from.x;
        obj.y = from.y;
        push({ type: 'move', obj, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } });
        return true;
      },
      mutate(obj, after) {
        const before = {};
        const next = {};
        Object.keys(after).forEach((key) => {
          if (obj[key] !== after[key]) {
            before[key] = obj[key];
            next[key] = after[key];
          }
        });
        if (Object.keys(next).length === 0) return false;
        Object.keys(before).forEach((key) => {
          obj[key] = before[key];
        });
        push({ type: 'mutate', obj, before, after: next });
        return true;
      },
      clear() {
        if (doc.items.length === 0 && doc.nextNumber === 1) return false;
        push({
          type: 'clear',
          items: doc.items.slice(),
          nextNumber: doc.nextNumber,
        });
        return true;
      },
      resetNumbers() {
        if (doc.nextNumber === 1) return false;
        push({ type: 'renumber', from: doc.nextNumber, to: 1 });
        return true;
      },
      undo() {
        const cmd = doc.undoStack.pop();
        if (!cmd) return false;
        applyInverse(cmd);
        doc.redoStack.push(cmd);
        return true;
      },
      redo() {
        const cmd = doc.redoStack.pop();
        if (!cmd) return false;
        applyForward(cmd);
        doc.undoStack.push(cmd);
        return true;
      },
    };
  }

  return { create };
});
