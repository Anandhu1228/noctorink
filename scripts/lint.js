/**
 * Syntax-check every project JavaScript file. No extra linter dependency.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', 'dist', 'out', '.git']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
}

walk(root);

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    console.error(result.stderr || result.stdout);
  }
}

if (failed) {
  console.error(`${failed} file(s) failed syntax check`);
  process.exit(1);
}
console.log(`syntax ok (${files.length} files)`);
