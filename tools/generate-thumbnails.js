#!/usr/bin/env node
'use strict';

// Display-sized WebP copies of every image in content.json. A card is at most a
// few hundred pixels wide, and the camera originals are 2-4 MB each.
//
// For each image item this writes thumbs/<path below assets/>-400.webp and
// -800.webp, then records three fields on the item: `thumb`, the path both
// copies share, and `width`/`height`, the 800 copy's pixel size, which gives
// the <img> its aspect ratio before it loads. scripts/app.js uses the copies
// only when all three are present, so an image added without running this tool
// still shows, from its original. Originals are never modified.
//
// The copies live outside assets/ because tools/generate-manifest.js turns every
// image under assets/ into a card. Existing copies are kept; pass --force to
// re-encode them. Requires ImageMagick 7 (`magick`) built with WebP support.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { readExistingManifest, writeManifestSafely } = require('./generate-manifest.js');

const ROOT = path.join(__dirname, '..');
const WIDTHS = [400, 800];
const QUALITY = '70';
const THUMB_FIELDS = ['thumb', 'width', 'height'];

// 'assets/images/Paris/IMG_1.JPG' -> 'thumbs/images/Paris/IMG_1'
function thumbStem(src) {
  const rel = src.replace(/^assets\//, '');
  return `thumbs/${rel.slice(0, rel.length - path.posix.extname(rel).length)}`;
}

function magick(args) {
  return new Promise((resolve, reject) => {
    execFile('magick', args, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split('\n')[0]));
      else resolve(stdout);
    });
  });
}

// One decode per photo, both sizes from it. `-define jpeg:size` would decode
// faster but lets libjpeg upscale a small photo up to 2x, so it is not used.
// Orientation is applied to the pixels because the EXIF tag is removed; the
// colour profile is kept.
async function encodeWithMagick(source, outputs) {
  const temps = outputs.map(file => `${file}.tmp`);
  const args = ['-limit', 'thread', '1', source,
    '-auto-orient', '+profile', '!icc,*', '-quality', QUALITY];
  for (let i = WIDTHS.length - 1; i > 0; i--) {
    args.push('(', '+clone', '-resize', `${WIDTHS[i]}x>`, '-write', `webp:${temps[i]}`, '+delete', ')');
  }
  args.push('-resize', `${WIDTHS[0]}x>`, `webp:${temps[0]}`);
  fs.mkdirSync(path.dirname(outputs[0]), { recursive: true });
  try {
    await magick(args);
    temps.forEach((temp, i) => fs.renameSync(temp, outputs[i]));
  } finally {
    temps.forEach(temp => fs.rmSync(temp, { force: true }));
  }
}

async function measureWithMagick(file) {
  const [width, height] = (await magick(['identify', '-ping', '-format', '%w %h', file])).split(' ').map(Number);
  if (!(width > 0 && height > 0)) throw new Error(`could not read the size of ${file}`);
  return { width, height };
}

async function runPool(jobs, limit, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) await worker(jobs[next++]);
  });
  await Promise.all(lanes);
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
  });
}

async function generateThumbnails({
  root = ROOT,
  manifestFile = path.join(root, 'content.json'),
  force = false,
  encode = encodeWithMagick,
  measure = measureWithMagick,
  limit = os.availableParallelism ? os.availableParallelism() : os.cpus().length,
} = {}) {
  // Without the encoder every size read fails, and every image would lose its
  // copies in one run. Stop before anything is touched instead.
  if (encode === encodeWithMagick || measure === measureWithMagick) {
    try {
      await magick(['-version']);
    } catch (error) {
      throw new Error('ImageMagick 7 (`magick`) is not on PATH; nothing was changed');
    }
  }

  if (!fs.existsSync(manifestFile)) {
    throw new Error(`${manifestFile} does not exist; run tools/generate-manifest.js first`);
  }
  const startText = fs.readFileSync(manifestFile, 'utf8');
  const manifest = readExistingManifest(manifestFile);
  const before = JSON.stringify(manifest, null, 2);
  const report = { made: 0, kept: 0, failed: [], unused: [] };

  const jobs = [];
  const stems = new Set();
  for (const item of manifest.items) {
    if (item.type !== 'image') continue;
    const stem = thumbStem(item.src);
    // Case-insensitive: on macOS and Windows IMG_1.JPG and img_1.png would
    // write the same files, and GitHub Pages would then serve only one.
    if (stems.has(stem.toLowerCase())) {
      THUMB_FIELDS.forEach(field => delete item[field]);
      report.failed.push(`${item.src}: another image in this folder has the same name apart from extension or case; it shows its original`);
      continue;
    }
    stems.add(stem.toLowerCase());
    jobs.push({ item, stem, outputs: WIDTHS.map(w => path.join(root, `${stem}-${w}.webp`)) });
  }

  await runPool(jobs, limit, async ({ item, stem, outputs }) => {
    try {
      if (force || !outputs.every(file => fs.existsSync(file))) {
        await encode(path.join(root, item.src), outputs);
        report.made++;
      } else {
        report.kept++;
      }
      const { width, height } = await measure(outputs[outputs.length - 1]);
      Object.assign(item, { thumb: stem, width, height });
    } catch (error) {
      // Copies already recorded for this path, and still on disk, still match
      // their recorded size, so keep showing them.
      if (item.thumb === stem && outputs.every(file => fs.existsSync(file))) {
        report.failed.push(`${item.src}: ${error.message} (its existing copies stay in use)`);
      } else {
        THUMB_FIELDS.forEach(field => delete item[field]);
        report.failed.push(`${item.src}: ${error.message} (it shows its original)`);
      }
    }
  });

  const expected = new Set(jobs.flatMap(job => job.outputs.map(file => path.relative(root, file))));
  report.unused = listFiles(path.join(root, 'thumbs'))
    .map(file => path.join('thumbs', file))
    .filter(file => !expected.has(file));

  const after = JSON.stringify(manifest, null, 2);
  // A caption edited, or the manifest regenerated, while this ran would be
  // overwritten. Finished copies are kept, so running again is quick.
  if (fs.readFileSync(manifestFile, 'utf8') !== startText) {
    throw new Error(`${manifestFile} changed while this ran, so it was not written; run again`);
  }
  if (after !== before) writeManifestSafely(manifestFile, after);
  return { report, changed: after !== before };
}

async function runCli(argv) {
  try {
    const { report, changed } = await generateThumbnails({ force: argv.includes('--force') });
    console.log(`Thumbnails: ${report.made} encoded, ${report.kept} already present.`);
    console.log(changed ? 'Updated content.json.' : 'content.json unchanged.');
    if (report.failed.length) {
      console.log(`${report.failed.length} image(s) failed:`);
      report.failed.forEach(line => console.log(`  ! ${line}`));
      process.exitCode = 1;
    }
    if (report.unused.length) {
      console.log(`${report.unused.length} file(s) in thumbs/ belong to no image in content.json:`);
      report.unused.forEach(file => console.log(`  - ${file}`));
    }
  } catch (error) {
    console.error(`generate-thumbnails failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2));
}

module.exports = { generateThumbnails, thumbStem, WIDTHS };
