'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// scripts/wall.js is a browser IIFE that assigns window.WallLayout.
const SOURCE = path.join(__dirname, '..', 'scripts', 'wall.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), context, { filename: SOURCE });
const { pack } = context.window.WallLayout;

test('pack fills the shortest column first and reports the wall height', () => {
  // 404px is two 200px columns with a 4px gap.
  const { positions, height } = pack([1, 2, 1, 1], 404);
  assert.deepEqual(Array.from(positions, p => [p.x, p.y, p.height]),
    [[0, 0, 200], [204, 0, 400], [0, 204, 200], [204, 404, 200]]);
  assert.equal(height, 604);
});

test('tile tops never decrease in wall order, which the month bar relies on', () => {
  const ratios = Array.from({ length: 300 }, (_, i) => 0.5 + ((i * 37) % 17) / 10);
  const tops = Array.from(pack(ratios, 1440).positions, p => p.y);
  assert.ok(tops.every((y, i) => i === 0 || y >= tops[i - 1]));
});
