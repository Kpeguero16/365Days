'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { generateThumbnails } = require('../tools/generate-thumbnails.js');

function fixture(items) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-test-'));
  fs.writeFileSync(path.join(root, 'content.json'), JSON.stringify({ items }, null, 2));
  return root;
}
const read = root => JSON.parse(fs.readFileSync(path.join(root, 'content.json'), 'utf8')).items;
const fakeEncode = async (source, outputs) => outputs.forEach(file => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'webp');
});
const fakeMeasure = async () => ({ width: 800, height: 600 });

test('records thumb, width and height on images only, mirroring trip folders', async () => {
  const root = fixture([
    { id: 'a', type: 'image', src: 'assets/images/a.JPG', caption: 'kept' },
    { id: 'b', type: 'image', src: 'assets/images/Paris/b.jpeg', trip: 'Paris' },
    { id: 'v', type: 'video', src: 'assets/videos/v.MOV' },
    { type: 'poem', title: 'p', text: 't' },
  ]);
  await generateThumbnails({ root, encode: fakeEncode, measure: fakeMeasure });
  const [a, b, v, poem] = read(root);
  assert.deepEqual(a, { id: 'a', type: 'image', src: 'assets/images/a.JPG', caption: 'kept', thumb: 'thumbs/images/a', width: 800, height: 600 });
  assert.equal(b.thumb, 'thumbs/images/Paris/b');
  assert.ok(fs.existsSync(path.join(root, 'thumbs/images/Paris/b-400.webp')));
  assert.deepEqual([v.thumb, poem.thumb], [undefined, undefined]);

  const again = await generateThumbnails({ root, encode: () => assert.fail('re-encoded'), measure: fakeMeasure });
  assert.deepEqual([again.report.kept, again.changed], [2, false]);
});

test('an image that fails to encode loses stale fields and falls back to its original', async () => {
  const root = fixture([
    { type: 'image', src: 'assets/images/bad.jpg', thumb: 'thumbs/images/old', width: 1, height: 1 },
    { type: 'image', src: 'assets/images/good.jpg' },
    { type: 'image', src: 'assets/images/GOOD.png' },
  ]);
  const encode = async (source, outputs) => {
    if (source.endsWith('bad.jpg')) throw new Error('corrupt');
    return fakeEncode(source, outputs);
  };
  const { report } = await generateThumbnails({ root, encode, measure: fakeMeasure });
  const [bad, good, clash] = read(root);
  assert.deepEqual([bad.thumb, bad.width, bad.height], [undefined, undefined, undefined]);
  assert.equal(good.thumb, 'thumbs/images/good');
  assert.equal(clash.thumb, undefined);
  assert.match(report.failed.join('\n'), /bad\.jpg: corrupt/);
  assert.match(report.failed.join('\n'), /GOOD\.png: .*same name/);
});

test('a failed size read keeps copies already on disk', async () => {
  const root = fixture([{ type: 'image', src: 'assets/images/a.jpg' }]);
  await generateThumbnails({ root, encode: fakeEncode, measure: fakeMeasure });
  const { report } = await generateThumbnails({ root, encode: fakeEncode, measure: async () => { throw new Error('no size'); } });
  assert.equal(read(root)[0].thumb, 'thumbs/images/a');
  assert.match(report.failed[0], /existing copies stay in use/);
});

test('refuses to write when content.json changes during the run', async () => {
  const root = fixture([{ type: 'image', src: 'assets/images/a.jpg' }]);
  const edited = JSON.stringify({ items: [{ type: 'image', src: 'assets/images/a.jpg', caption: 'new' }] });
  const encode = async (source, outputs) => {
    fs.writeFileSync(path.join(root, 'content.json'), edited);
    return fakeEncode(source, outputs);
  };
  await assert.rejects(generateThumbnails({ root, encode, measure: fakeMeasure }), /changed while this ran/);
  assert.equal(fs.readFileSync(path.join(root, 'content.json'), 'utf8'), edited);
});

test('without ImageMagick nothing is changed', async () => {
  const root = fixture([{ type: 'image', src: 'assets/images/a.jpg', thumb: 'thumbs/images/a', width: 8, height: 6 }]);
  const before = fs.readFileSync(path.join(root, 'content.json'), 'utf8');
  const savedPath = process.env.PATH;
  process.env.PATH = '';
  try {
    await assert.rejects(generateThumbnails({ root }), /not on PATH; nothing was changed/);
  } finally {
    process.env.PATH = savedPath;
  }
  assert.equal(fs.readFileSync(path.join(root, 'content.json'), 'utf8'), before);
});

let hasMagick = true;
try { execFileSync('magick', ['-version'], { stdio: 'ignore' }); } catch { hasMagick = false; }

test('ImageMagick applies EXIF orientation and never upscales', { skip: !hasMagick && 'magick not installed' }, async () => {
  const root = fixture([{ type: 'image', src: 'assets/images/rotated.jpg' }]);
  fs.mkdirSync(path.join(root, 'assets/images'), { recursive: true });
  // Stored 30x20 with EXIF Orientation 6 (rotate 90°), so it displays 20x30.
  // ImageMagick will not write the tag itself, so the APP1 segment is spliced in.
  const plain = execFileSync('magick', ['-size', '30x20', 'xc:red', 'jpg:-']);
  const exif = Buffer.from('ffe10022457869660000' + '4d4d002a00000008' + '0001' + '011200030000000100060000' + '00000000', 'hex');
  fs.writeFileSync(path.join(root, 'assets/images/rotated.jpg'), Buffer.concat([plain.subarray(0, 2), exif, plain.subarray(2)]));
  await generateThumbnails({ root });
  const [item] = read(root);
  assert.deepEqual([item.width, item.height], [20, 30]);
  assert.ok(fs.existsSync(path.join(root, 'thumbs/images/rotated-400.webp')));
});
