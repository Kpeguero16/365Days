'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const SOURCE = path.join(__dirname, '..', 'scripts', 'content.js');

// --- loading the browser IIFE ---------------------------------------------
// scripts/content.js is not a module: it assigns window.ContentAPI. Load it in
// a vm context against a stub window and drive the same public surface the
// application uses, so the source needs no test-only export.

function loadContentAPI() {
  const context = { window: {}, console: { warn() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), context, { filename: SOURCE });
  assert.ok(context.window.ContentAPI, 'content.js did not assign window.ContentAPI');
  return context.window.ContentAPI;
}

function item(date) { return { type: 'image', src: `assets/images/${date}.jpg`, date }; }

// Season label for a single date, read back through the public grouping API.
function seasonOf(date) {
  const groups = loadContentAPI().groupBySeason([item(date)]);
  assert.equal(groups.length, 1, `expected one section for ${date}`);
  return groups[0].season;
}

// groupBySeason returns arrays built inside the vm realm, whose prototype is not
// this realm's Array.prototype. deepStrictEqual compares prototypes, so copy the
// results across the boundary with this realm's Array.from before asserting.
function sectionsOf(dates) {
  const groups = loadContentAPI().groupBySeason(dates.map(item));
  return Array.from(groups, g => ({
    season: g.season,
    dates: Array.from(g.items, i => i.date)
  }));
}

// --- R03: winter must not fold a year onto itself -------------------------

test('R03: December does not share a section with the same year January', () => {
  const sections = sectionsOf(['2022-01-15', '2022-02-10', '2022-12-04']);
  const withJan = sections.find(s => s.dates.includes('2022-01-15'));
  assert.ok(!withJan.dates.includes('2022-12-04'),
    `January and December of 2022 share section "${withJan.season}"`);
});

test('R03: December groups with the FOLLOWING January and February', () => {
  const sections = sectionsOf(['2021-12-06', '2022-01-15', '2022-02-10']);
  assert.equal(sections.length, 1, 'one winter spans Dec 2021 to Feb 2022');
  assert.deepEqual(sections[0].dates, ['2021-12-06', '2022-01-15', '2022-02-10']);
});

test('R03: sections run in strict chronological order', () => {
  // One date per month across the range the real collection covers.
  const dates = [];
  for (let y = 2021; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      const d = `${y}-${String(m).padStart(2, '0')}-15`;
      if (d >= '2021-09-15' && d <= '2025-09-15') dates.push(d);
    }
  }
  const sections = sectionsOf(dates);
  const flat = sections.flatMap(s => s.dates);
  assert.deepEqual(flat, [...flat].sort(),
    'rendered order is not chronological across sections');
});

test('R03: no section spans more than three months', () => {
  const dates = [];
  for (let y = 2021; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) dates.push(`${y}-${String(m).padStart(2, '0')}-15`);
  }
  for (const s of sectionsOf(dates)) {
    const months = s.dates.map(d => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)));
    const span = Math.max(...months) - Math.min(...months);
    assert.ok(span <= 2, `section "${s.season}" spans ${span + 1} months: ${s.dates.join(', ')}`);
  }
});

// --- R04: the same date means the same season everywhere ------------------

const ZONES = ['America/New_York', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati'];
const PROBES = ['2025-03-01', '2025-01-01', '2024-12-01', '2024-06-01', '2024-09-01',
                '2024-12-31', '2024-02-29', '2024-08-31', '2024-11-30'];

test('R04: season assignment is identical in every timezone', () => {
  // A child process per zone: TZ must be set before the first Date use, and a
  // process that has already resolved its zone may cache it.
  const script = `
    const path = require('path'), fs = require('fs'), vm = require('vm');
    const ctx = { window: {}, console: { warn() {} } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(${JSON.stringify(SOURCE)}, 'utf8'), ctx);
    const out = {};
    for (const d of ${JSON.stringify(PROBES)}) {
      out[d] = ctx.window.ContentAPI.groupBySeason([{ type: 'image', src: 'x', date: d }])[0].season;
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const results = ZONES.map(tz => ({
    tz,
    seasons: JSON.parse(execFileSync(process.execPath, ['-e', script], {
      env: { ...process.env, TZ: tz }, encoding: 'utf8'
    }))
  }));
  const reference = results[0];
  for (const { tz, seasons } of results.slice(1)) {
    for (const date of PROBES) {
      assert.equal(seasons[date], reference.seasons[date],
        `${date}: ${tz} gives "${seasons[date]}" but ${reference.tz} gives "${reference.seasons[date]}"`);
    }
  }
});

test('R04: 2025-03-01 is Spring 2025 regardless of zone', () => {
  const previous = process.env.TZ;
  try {
    for (const tz of ZONES) {
      process.env.TZ = tz;
      assert.equal(seasonOf('2025-03-01'), 'Spring 2025', `wrong season in ${tz}`);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
