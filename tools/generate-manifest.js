#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OUTPUT_FILE = path.join(__dirname, '..', 'content.json');

const DEFAULT_DATE = '2021-09-11';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];
const POSTER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const POSTER_SUFFIX = '_poster';
const DATE_PATTERN = /(\d{4})-(\d{2})-(\d{2})/;
// What remains of a camera filename once the date is removed, e.g. '16-52-07'.
// A trailing '-1' is a duplicate-export marker, not part of the time.
const TIME_PATTERN = /^(\d{2})-(\d{2})(?:-(\d{2}))?(?:-(\d+))?$/;
// '#' and '?' terminate a URL path in the browser, so such names cannot be fetched.
const URL_UNSAFE_PATTERN = /[#?]/;

function isCalendarDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;
}

function dateFromBaseName(baseName, relPath, warnings) {
  const match = baseName.match(DATE_PATTERN);
  if (!match) return DEFAULT_DATE;

  const [text, year, month, day] = match;
  if (!isCalendarDate(Number(year), Number(month), Number(day))) {
    warnings.push(`${relPath}: "${text}" is not a real calendar date; using ${DEFAULT_DATE}`);
    return DEFAULT_DATE;
  }
  return text;
}

// Built by hand rather than with toLocaleTimeString, so output does not vary by machine locale.
function readableTime(hours, minutes) {
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function captionFromBaseName(baseName) {
  const remainder = baseName.replace(/\d{4}-\d{2}-\d{2}[_-]?/, '');

  // A bare capture time reads better as a clock time than as '16 52 07'.
  const time = remainder.match(TIME_PATTERN);
  if (time) {
    const hours = Number(time[1]);
    const minutes = Number(time[2]);
    if (hours < 24 && minutes < 60) return readableTime(hours, minutes);
  }

  return remainder.replace(/[_-]/g, ' ').trim() || 'Memory';
}

function mediaTypeFor(ext) {
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return null;
}

function toUrlPath(segments) {
  return segments.filter(Boolean).join('/');
}

function segmentsOf(relativeDir) {
  return relativeDir.split(path.sep).filter(Boolean);
}

// The first segment is the media bucket ('images', 'videos'); anything deeper is a trip.
function tripFromRelativeDir(relativeDir) {
  const segments = segmentsOf(relativeDir);
  if (segments.length < 2) return null;
  return segments.slice(1).join('/');
}

function findPoster(dir, relativeDir, baseName) {
  for (const ext of POSTER_EXTENSIONS) {
    const posterName = `${baseName}${POSTER_SUFFIX}${ext}`;
    if (fs.existsSync(path.join(dir, posterName))) {
      return toUrlPath(['assets', ...segmentsOf(relativeDir), posterName]);
    }
  }
  return null;
}

function scanDirectory(dir, relativeDir, report) {
  const items = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  // Sort by name so repeated runs traverse in the same order on any filesystem.
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      items.push(...scanDirectory(fullPath, relativePath, report));
      continue;
    }

    if (!entry.isFile()) {
      report.skipped.push(`${relativePath} (not a regular file)`);
      continue;
    }

    const actualExt = path.extname(entry.name);
    const ext = actualExt.toLowerCase();
    const type = mediaTypeFor(ext);

    if (!type) {
      report.skipped.push(`${relativePath} (unsupported extension "${ext || 'none'}")`);
      continue;
    }

    if (URL_UNSAFE_PATTERN.test(entry.name)) {
      report.warnings.push(`${relativePath}: name contains "#" or "?" and cannot be fetched as a URL; rename it`);
      report.skipped.push(`${relativePath} (unsafe URL characters)`);
      continue;
    }

    // Strip the extension as spelled on disk; a lowercased suffix would not match "PHOTO.JPG".
    const baseName = path.basename(entry.name, actualExt);

    // Poster images belong to their video, not to a card of their own.
    if (baseName.endsWith(POSTER_SUFFIX)) continue;

    const trip = tripFromRelativeDir(relativeDir);

    const item = {
      id: baseName.replace(/[^a-zA-Z0-9]/g, '_'),
      type,
      src: toUrlPath(['assets', ...segmentsOf(relativePath)]),
      date: dateFromBaseName(baseName, relativePath, report.warnings),
      caption: captionFromBaseName(baseName),
      trip: trip || undefined,
      // Add file size info for optimization hints
      fileSize: fs.statSync(fullPath).size
    };

    if (type === 'video') {
      const poster = findPoster(dir, relativeDir, baseName);
      if (poster) item.poster = poster;
    }

    items.push(item);
  }

  return items;
}

function sortValue(item) {
  if (!item.date) return -Infinity;
  const match = item.date.match(DATE_PATTERN);
  if (!match) return -Infinity;

  const [, year, month, day] = match;
  if (!isCalendarDate(Number(year), Number(month), Number(day))) return -Infinity;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

// A total order: undated items sort first, and ties keep their input order.
function sortByDate(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => sortValue(a.item) - sortValue(b.item) || a.index - b.index)
    .map(entry => entry.item);
}

function buildManifest(assetsDir, outputFile) {
  const report = { warnings: [], skipped: [] };

  let existingPoems = [];
  if (fs.existsSync(outputFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      existingPoems = existing.items.filter(item => item.type === 'poem');
    } catch (e) {
      report.warnings.push('Could not load existing manifest, starting fresh');
    }
  }

  const media = scanDirectory(assetsDir, '', report);
  const manifest = { items: sortByDate([...existingPoems, ...media]) };

  return { manifest, report, poemCount: existingPoems.length, mediaCount: media.length };
}

function generateManifest() {
  console.log('Scanning assets directory...');

  const { manifest, report, poemCount, mediaCount } = buildManifest(ASSETS_DIR, OUTPUT_FILE);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`Generated manifest with ${manifest.items.length} items (${poemCount} poems + ${mediaCount} media)`);

  if (report.skipped.length > 0) {
    console.log(`Skipped ${report.skipped.length} file(s) not treated as media:`);
    report.skipped.forEach(entry => console.log(`  - ${entry}`));
  }

  if (report.warnings.length > 0) {
    console.log(`${report.warnings.length} warning(s):`);
    report.warnings.forEach(entry => console.log(`  ! ${entry}`));
  }

  const mediaItems = manifest.items.filter(item => item.type !== 'poem');
  const totalSize = mediaItems.reduce((sum, item) => sum + (item.fileSize || 0), 0);
  const avgSize = mediaItems.length > 0 ? totalSize / mediaItems.length : 0;
  const largeImages = mediaItems.filter(item => item.fileSize > 1000000); // > 1MB

  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Average size: ${(avgSize / 1024).toFixed(0)} KB`);

  if (largeImages.length > 0) {
    console.log(`⚠️  ${largeImages.length} large images (>1MB):`);
    largeImages.forEach(item => {
      console.log(`  - ${item.src}: ${(item.fileSize / 1024 / 1024).toFixed(2)} MB`);
    });
    console.log('Consider compressing these images for better performance.');
  }

  console.log(`Output: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  generateManifest();
}

module.exports = { generateManifest, buildManifest, scanDirectory };
