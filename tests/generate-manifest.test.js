'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GENERATOR = path.join(__dirname, '..', 'tools', 'generate-manifest.js');
const { generateManifest, buildManifest } = require(GENERATOR);

// --- fixture helpers -------------------------------------------------------

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  fs.mkdirSync(path.join(root, 'assets', 'images'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets', 'videos'), { recursive: true });
  return root;
}

function assetsOf(root) { return path.join(root, 'assets'); }
function manifestOf(root) { return path.join(root, 'content.json'); }

function addAsset(root, relative, bytes) {
  const full = path.join(assetsOf(root), relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'x'.repeat(bytes || 1));
  return full;
}

function writeManifest(root, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(manifestOf(root), text);
  return text;
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(manifestOf(root), 'utf8'));
}

function itemsBySrc(manifest) {
  return new Map(manifest.items.filter(i => i.src).map(i => [i.src, i]));
}

function run(root) {
  return generateManifest(assetsOf(root), manifestOf(root));
}

function tempFilesIn(root) {
  return fs.readdirSync(root).filter(name => name.includes('.tmp-'));
}

// --- T1: reject unsafe existing input --------------------------------------

test('missing manifest is a supported first run', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg', 10);
  run(root);
  const manifest = readManifest(root);
  assert.equal(manifest.items.length, 1);
  assert.equal(manifest.items[0].src, 'assets/images/2024-01-02_10-00-00.jpg');
});

test('malformed JSON aborts and leaves the original bytes untouched', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  const original = writeManifest(root, '{"items":[ this is not json');
  assert.throws(() => run(root));
  assert.equal(fs.readFileSync(manifestOf(root), 'utf8'), original);
});

test('a parse failure never echoes manifest content', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  const marker = 'THE_NIGHT_SHE_SAID_YES';
  writeManifest(root, `{"items":[],"note":${marker}}`);

  let message = '';
  try { run(root); } catch (error) { message = String(error.message); }
  assert.notEqual(message, '', 'expected the run to fail');
  assert.ok(!message.includes(marker), `diagnostic leaked content: ${message}`);

  let output = '';
  try {
    execFileSync(process.execPath, [GENERATOR, assetsOf(root), manifestOf(root)],
      { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    output = String(error.stdout || '') + String(error.stderr || '');
    assert.notEqual(error.status, 0, 'CLI should exit nonzero');
  }
  assert.ok(!output.includes(marker), `CLI leaked content: ${output}`);
});

test('an empty manifest file is an error, not a first run', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, '   ');
  assert.throws(() => run(root));
});

test('rejects a non-object root and a missing items array', () => {
  for (const bad of ['[]', 'null', '"text"', '{"items":{}}', '{}']) {
    const root = makeRoot();
    addAsset(root, 'images/2024-01-02_10-00-00.jpg');
    writeManifest(root, bad);
    assert.throws(() => run(root), undefined, `should reject root ${bad}`);
  }
});

test('rejects unsupported item types and null items', () => {
  for (const item of [{ type: 'audio', src: 'assets/images/a.jpg' }, null, 'text']) {
    const root = makeRoot();
    addAsset(root, 'images/2024-01-02_10-00-00.jpg');
    writeManifest(root, { items: [item] });
    assert.throws(() => run(root));
  }
});

test('rejects media without a usable src and duplicate src values', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, { items: [{ type: 'image' }] });
  assert.throws(() => run(root));

  const dup = makeRoot();
  addAsset(dup, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(dup, { items: [
    { type: 'image', src: 'assets/images/2024-01-02_10-00-00.jpg' },
    { type: 'image', src: 'assets/images/2024-01-02_10-00-00.jpg' }
  ] });
  assert.throws(() => run(dup));
});

test('rejects non-string editorial fields and invalid calendar dates', () => {
  const src = 'assets/images/2024-01-02_10-00-00.jpg';
  for (const patch of [{ caption: 5 }, { trip: {} }, { id: 1 }, { date: '2024-13-45' }, { date: '2024-02-30' }]) {
    const root = makeRoot();
    addAsset(root, 'images/2024-01-02_10-00-00.jpg');
    writeManifest(root, { items: [Object.assign({ type: 'image', src }, patch)] });
    assert.throws(() => run(root), undefined, `should reject ${JSON.stringify(patch)}`);
  }
});

test('aborts when an existing type conflicts with the scanned type', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, { items: [
    { type: 'video', src: 'assets/images/2024-01-02_10-00-00.jpg' }
  ] });
  assert.throws(() => run(root));
});

// --- T2: preserve metadata -------------------------------------------------

test('preserves curated fields while refreshing scanner-owned fields', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg', 500);
  writeManifest(root, { items: [{
    id: 'custom-id',
    type: 'image',
    src: 'assets/images/2024-01-02_10-00-00.jpg',
    date: '2023-05-05',
    caption: 'the night she said yes',
    trip: 'Paris',
    fileSize: 1,
    mood: 'happy'
  }] });
  run(root);

  const item = readManifest(root).items[0];
  assert.equal(item.id, 'custom-id');
  assert.equal(item.date, '2023-05-05');
  assert.equal(item.caption, 'the night she said yes');
  assert.equal(item.trip, 'Paris');
  assert.equal(item.mood, 'happy', 'unknown properties survive');
  assert.equal(item.fileSize, 500, 'fileSize is refreshed from disk');
});

test('an empty caption is an intentional value, not missing data', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, { items: [
    { type: 'image', src: 'assets/images/2024-01-02_10-00-00.jpg', caption: '', trip: '' }
  ] });
  run(root);
  const item = readManifest(root).items[0];
  assert.equal(item.caption, '');
  assert.equal(item.trip, '');
});

test('new media uses scanner output', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg', 42);
  writeManifest(root, { items: [] });
  run(root);
  const item = readManifest(root).items[0];
  assert.equal(item.date, '2024-01-02');
  assert.equal(item.caption, '10:00 AM');
  assert.equal(item.fileSize, 42);
});

test('same basename in different directories stays independent', () => {
  const root = makeRoot();
  addAsset(root, 'images/Paris/2024-01-02_10-00-00.jpg');
  addAsset(root, 'images/Rome/2024-01-02_10-00-00.jpg');
  writeManifest(root, { items: [
    { type: 'image', src: 'assets/images/Paris/2024-01-02_10-00-00.jpg', caption: 'paris one' },
    { type: 'image', src: 'assets/images/Rome/2024-01-02_10-00-00.jpg', caption: 'rome one' }
  ] });
  run(root);
  const bySrc = itemsBySrc(readManifest(root));
  assert.equal(bySrc.get('assets/images/Paris/2024-01-02_10-00-00.jpg').caption, 'paris one');
  assert.equal(bySrc.get('assets/images/Rome/2024-01-02_10-00-00.jpg').caption, 'rome one');
});

test('poems survive whole, including unknown properties and no src', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, { items: [
    { type: 'poem', title: 'For you', text: 'line one', author: 'me' }
  ] });
  run(root);
  const poem = readManifest(root).items.find(i => i.type === 'poem');
  assert.deepEqual(poem, { type: 'poem', title: 'For you', text: 'line one', author: 'me' });
});

test('unknown top-level properties are preserved', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, { title: 'Our story', items: [] });
  run(root);
  assert.equal(readManifest(root).title, 'Our story');
});

// --- T2: moved and renamed assets -----------------------------------------

test('a file moved into a trip directory keeps its metadata and updates src', () => {
  const root = makeRoot();
  writeManifest(root, { items: [{
    type: 'image',
    src: 'assets/images/2024-01-02_10-00-00.jpg',
    caption: 'the lake',
    date: '2024-01-02'
  }] });
  addAsset(root, 'images/Paris/2024-01-02_10-00-00.jpg');

  const result = run(root);
  const items = readManifest(root).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].src, 'assets/images/Paris/2024-01-02_10-00-00.jpg');
  assert.equal(items[0].caption, 'the lake', 'caption follows the file');
  assert.equal(items[0].trip, 'Paris', 'trip comes from the new directory');
  assert.equal(result.report.recovered.length, 1);
});

test('a deleted file drops its entry and reports it', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, { items: [
    { type: 'image', src: 'assets/images/2024-01-02_10-00-00.jpg' },
    { type: 'image', src: 'assets/images/2024-03-03_11-00-00.jpg', caption: 'gone' }
  ] });

  const result = run(root);
  const items = readManifest(root).items;
  assert.equal(items.length, 1);
  assert.equal(result.report.dropped.length, 1);
  assert.ok(result.report.dropped[0].includes('2024-03-03_11-00-00.jpg'));
});

test('an ambiguous basename is dropped rather than guessed', () => {
  const root = makeRoot();
  addAsset(root, 'images/Paris/2024-01-02_10-00-00.jpg');
  addAsset(root, 'images/Rome/2024-01-02_10-00-00.jpg');
  writeManifest(root, { items: [
    { type: 'image', src: 'assets/images/2024-01-02_10-00-00.jpg', caption: 'which one?' }
  ] });

  const result = run(root);
  const items = readManifest(root).items;
  assert.equal(items.length, 2, 'both scanned files appear as new items');
  assert.ok(!items.some(i => i.caption === 'which one?'), 'the caption was not guessed onto a file');
  assert.equal(result.report.dropped.length, 1);
});

test('no run requires a manual edit to succeed', () => {
  const root = makeRoot();
  writeManifest(root, { items: [
    { type: 'image', src: 'assets/images/vanished.jpg', caption: 'gone' }
  ] });
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  assert.doesNotThrow(() => run(root));
});

test('an empty scan refuses to wipe a populated manifest', () => {
  const root = makeRoot();
  const original = writeManifest(root, { items: [
    { type: 'image', src: 'assets/images/a.jpg', caption: 'kept one' },
    { type: 'image', src: 'assets/images/b.jpg', caption: 'kept two' }
  ] });

  assert.throws(() => run(root), /no media found/);
  assert.equal(fs.readFileSync(manifestOf(root), 'utf8'), original,
    'a wrong or unmounted assets directory must not empty the manifest');
});

test('an empty scan is still fine when the manifest has no media', () => {
  const root = makeRoot();
  writeManifest(root, { items: [{ type: 'poem', title: 'only a poem' }] });
  assert.doesNotThrow(() => run(root));
  assert.equal(readManifest(root).items.length, 1);
});

test('a poster that no longer exists is kept but warned about', () => {
  const root = makeRoot();
  addAsset(root, 'videos/2024-01-02_10-00-00.mov');
  writeManifest(root, { items: [{
    type: 'video',
    src: 'assets/videos/2024-01-02_10-00-00.mov',
    poster: 'assets/videos/gone_poster.jpg'
  }] });

  const result = run(root);
  assert.equal(readManifest(root).items[0].poster, 'assets/videos/gone_poster.jpg');
  assert.ok(result.report.warnings.some(w => w.includes('gone_poster.jpg')),
    'a stale poster path is otherwise an invisible 404');
});

test('a renamed file is not silently matched to the wrong entry', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, { items: [
    { type: 'image', src: 'assets/images/2024-01-02_10-00-00.jpg', caption: 'kept' }
  ] });
  run(root);

  fs.renameSync(
    path.join(assetsOf(root), 'images/2024-01-02_10-00-00.jpg'),
    path.join(assetsOf(root), 'images/2024-01-02_10-00-00-renamed.jpg'));

  const result = run(root);
  const items = readManifest(root).items;
  assert.equal(items.length, 1);
  assert.notEqual(items[0].caption, 'kept', 'a different basename is a different file');
  assert.equal(result.report.dropped.length, 1);
});

// --- T2: output stability --------------------------------------------------

test('absent values are omitted, never null, and key order is fixed', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  run(root);
  const item = readManifest(root).items[0];
  assert.ok(!('trip' in item), 'trip is omitted, not null');
  assert.ok(!('poster' in item), 'poster is omitted, not null');
  assert.deepEqual(Object.keys(item), ['id', 'type', 'src', 'date', 'caption', 'fileSize']);
});

test('two consecutive runs produce identical bytes', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg', 30);
  addAsset(root, 'images/2024-01-02_11-00-00.jpg', 40);
  addAsset(root, 'videos/2024-02-02_09-00-00.mov', 50);
  run(root);
  const first = fs.readFileSync(manifestOf(root), 'utf8');
  run(root);
  assert.equal(fs.readFileSync(manifestOf(root), 'utf8'), first);
});

test('items sharing a date keep their existing relative order', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  addAsset(root, 'images/2024-01-02_11-00-00.jpg');
  writeManifest(root, { items: [
    { type: 'image', src: 'assets/images/2024-01-02_11-00-00.jpg', date: '2024-01-02', caption: 'second file, first entry' },
    { type: 'image', src: 'assets/images/2024-01-02_10-00-00.jpg', date: '2024-01-02', caption: 'first file, second entry' }
  ] });
  run(root);
  const items = readManifest(root).items;
  assert.equal(items[0].src, 'assets/images/2024-01-02_11-00-00.jpg');
  assert.equal(items[1].src, 'assets/images/2024-01-02_10-00-00.jpg');
});

test('an undated poem does not disturb the order of dated items', () => {
  const root = makeRoot();
  addAsset(root, 'images/2021-01-01_10-00-00.jpg');
  addAsset(root, 'images/2025-01-01_10-00-00.jpg');
  writeManifest(root, { items: [{ type: 'poem', title: 'no date' }] });
  run(root);
  const dates = readManifest(root).items.filter(i => i.date).map(i => i.date);
  assert.deepEqual(dates, ['2021-01-01', '2025-01-01']);
});

// --- T3: safe replacement --------------------------------------------------

test('a rename failure preserves the destination and leaves no temp file', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  const original = writeManifest(root, { items: [] });

  const realRename = fs.renameSync;
  fs.renameSync = () => { throw new Error('injected rename failure'); };
  try {
    assert.throws(() => run(root), /injected rename failure/);
  } finally {
    fs.renameSync = realRename;
  }

  assert.equal(fs.readFileSync(manifestOf(root), 'utf8'), original);
  assert.deepEqual(tempFilesIn(root), [], 'temporary file was cleaned up');
});

test('a write failure preserves the destination', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  const original = writeManifest(root, { items: [] });

  const realWrite = fs.writeSync;
  fs.writeSync = () => { throw new Error('injected write failure'); };
  try {
    assert.throws(() => run(root), /injected write failure/);
  } finally {
    fs.writeSync = realWrite;
  }

  assert.equal(fs.readFileSync(manifestOf(root), 'utf8'), original);
  assert.deepEqual(tempFilesIn(root), []);
});

test('a first-run failure creates no destination file', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');

  const realRename = fs.renameSync;
  fs.renameSync = () => { throw new Error('injected rename failure'); };
  try {
    assert.throws(() => run(root));
  } finally {
    fs.renameSync = realRename;
  }

  assert.equal(fs.existsSync(manifestOf(root)), false);
  assert.deepEqual(tempFilesIn(root), []);
});

test('a successful run leaves no temporary file', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  run(root);
  assert.deepEqual(tempFilesIn(root), []);
});

// --- T4: CLI behaviour -----------------------------------------------------

test('the CLI succeeds from an unrelated working directory', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-'));
  const output = execFileSync(process.execPath, [GENERATOR, assetsOf(root), manifestOf(root)],
    { cwd: elsewhere, encoding: 'utf8' });
  assert.match(output, /Generated manifest/);
  assert.equal(readManifest(root).items.length, 1);
});

test('the CLI exits nonzero and writes to stderr on failure', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  writeManifest(root, '{ broken');
  try {
    execFileSync(process.execPath, [GENERATOR, assetsOf(root), manifestOf(root)],
      { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('expected a nonzero exit');
  } catch (error) {
    assert.notEqual(error.status, 0);
    assert.match(String(error.stderr), /content\.json/);
  }
});

test('buildManifest does not write anything', () => {
  const root = makeRoot();
  addAsset(root, 'images/2024-01-02_10-00-00.jpg');
  buildManifest(assetsOf(root), manifestOf(root));
  assert.equal(fs.existsSync(manifestOf(root)), false);
});
