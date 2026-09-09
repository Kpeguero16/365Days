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

const ITEM_TYPES = ['image', 'video', 'poem'];
const EDITORIAL_STRING_FIELDS = ['id', 'caption', 'trip', 'poster', 'title', 'text'];
// The order these appear in every written item.
const KNOWN_ITEM_KEYS = ['id', 'type', 'src', 'date', 'caption', 'trip', 'fileSize', 'poster'];
// Refreshed from disk on every run; everything else is the owner's to keep.
const SCANNER_OWNED_KEYS = ['type', 'src', 'fileSize'];

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

// A total order. Undated items sort first, and ties keep their input rank.
// Never subtract the sort values: -Infinity minus -Infinity is NaN.
function compareEntries(a, b) {
  const left = sortValue(a.item);
  const right = sortValue(b.item);
  if (left !== right) return left < right ? -1 : 1;
  return a.rank - b.rank;
}

class ManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManifestError';
  }
}

// Take only the numbers out of a parser message. The message text itself can
// quote the document, which would put personal content into the logs.
function parseLocation(message) {
  const lineColumn = /line (\d+) column (\d+)/.exec(message);
  if (lineColumn) return `line ${lineColumn[1]}, column ${lineColumn[2]}`;

  const position = /position (\d+)/.exec(message);
  if (position) return `byte offset ${position[1]}`;

  return 'an unknown location';
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return isCalendarDate(year, month, day);
}

function describeItem(item, index) {
  return typeof item === 'object' && item !== null && typeof item.src === 'string' && item.src
    ? `item ${index} (${item.src})`
    : `item ${index}`;
}

function validateExisting(root, outputFile) {
  if (!isPlainObject(root)) {
    throw new ManifestError(`${outputFile}: the root value must be a JSON object with an "items" array.`);
  }
  if (!Array.isArray(root.items)) {
    throw new ManifestError(`${outputFile}: the root object has no "items" array.`);
  }

  const seen = new Set();
  root.items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      throw new ManifestError(`${outputFile}: ${describeItem(item, index)} is not an object.`);
    }
    if (!ITEM_TYPES.includes(item.type)) {
      throw new ManifestError(
        `${outputFile}: ${describeItem(item, index)} has an unsupported type. Expected one of ${ITEM_TYPES.join(', ')}.`);
    }

    for (const field of EDITORIAL_STRING_FIELDS) {
      if (item[field] !== undefined && typeof item[field] !== 'string') {
        throw new ManifestError(`${outputFile}: ${describeItem(item, index)} has a non-string "${field}".`);
      }
    }
    if (item.date !== undefined && !isValidDateString(item.date)) {
      throw new ManifestError(
        `${outputFile}: ${describeItem(item, index)} has a "date" that is not a real YYYY-MM-DD calendar date.`);
    }

    if (item.type === 'poem') return;

    if (typeof item.src !== 'string' || item.src === '') {
      throw new ManifestError(`${outputFile}: ${describeItem(item, index)} has no usable "src".`);
    }
    if (seen.has(item.src)) {
      throw new ManifestError(`${outputFile}: "${item.src}" appears more than once in "items".`);
    }
    seen.add(item.src);
  });

  return root;
}

function readExistingManifest(outputFile) {
  if (!fs.existsSync(outputFile)) return null;

  let text;
  try {
    text = fs.readFileSync(outputFile, 'utf8');
  } catch (error) {
    throw new ManifestError(`${outputFile}: could not be read (${error.code || 'unknown error'}).`);
  }

  if (text.trim() === '') {
    throw new ManifestError(`${outputFile}: the file is empty. Delete it to start fresh, or restore it from git.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ManifestError(`${outputFile}: invalid JSON at ${parseLocation(error.message)}.`);
  }

  return validateExisting(parsed, outputFile);
}

// Scanned src, type and file size win. Every other existing property is kept.
function mergeMedia(existing, scanned, outputFile, index) {
  if (existing.type !== scanned.type) {
    throw new ManifestError(
      `${outputFile}: ${describeItem(existing, index)} is recorded as "${existing.type}" but the file on disk is "${scanned.type}".`);
  }

  const merged = {};
  for (const key of KNOWN_ITEM_KEYS) {
    if (SCANNER_OWNED_KEYS.includes(key)) {
      if (scanned[key] !== undefined) merged[key] = scanned[key];
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(existing, key)) merged[key] = existing[key];
    else if (scanned[key] !== undefined) merged[key] = scanned[key];
  }

  for (const key of Object.keys(existing)) {
    if (!KNOWN_ITEM_KEYS.includes(key)) merged[key] = existing[key];
  }

  return merged;
}

// An authored poster is kept even when it cannot be resolved, but say so:
// a stale poster path is a 404 in the browser and is otherwise invisible.
function warnAboutMissingPoster(item, assetsDir, report) {
  if (!item.poster) return;
  const full = path.join(assetsDir, '..', item.poster);
  if (!fs.existsSync(full)) {
    report.warnings.push(`${item.src}: poster "${item.poster}" does not exist on disk`);
  }
}

function basenameOf(src) {
  return src.split('/').pop();
}

// Two passes: exact src, then unambiguous basename so a moved or renamed file
// keeps its metadata. Anything still unmatched is dropped and reported, never
// turned into an error the owner has to fix by hand.
function reconcile(existingItems, scanned, outputFile, report) {
  const existingMedia = existingItems.filter(item => item.type !== 'poem');

  // A scan that finds nothing, against a manifest that has media, is almost
  // always the wrong directory or a drive that is not mounted -- not the owner
  // deleting their whole collection. Refuse rather than drop every entry.
  if (scanned.length === 0 && existingMedia.length > 0) {
    throw new ManifestError(
      `no media found while ${existingMedia.length} entries are recorded in ${outputFile}. ` +
      'Check that the assets directory is the right one and is readable. ' +
      'Nothing was changed.');
  }

  const scannedBySrc = new Map(scanned.map(item => [item.src, item]));
  const claimed = new Set();
  const entries = [];
  const unresolved = [];

  existingItems.forEach((item, index) => {
    if (item.type === 'poem') {
      entries.push({ item, rank: index });
      return;
    }

    const exact = scannedBySrc.get(item.src);
    if (exact) {
      claimed.add(exact.src);
      entries.push({ item: mergeMedia(item, exact, outputFile, index), rank: index });
      return;
    }

    unresolved.push({ item, index });
  });

  const candidatesByName = new Map();
  for (const item of scanned) {
    if (claimed.has(item.src)) continue;
    const name = basenameOf(item.src);
    if (!candidatesByName.has(name)) candidatesByName.set(name, []);
    candidatesByName.get(name).push(item);
  }

  const unresolvedByName = new Map();
  for (const entry of unresolved) {
    const name = basenameOf(entry.item.src);
    if (!unresolvedByName.has(name)) unresolvedByName.set(name, []);
    unresolvedByName.get(name).push(entry);
  }

  for (const { item, index } of unresolved) {
    const name = basenameOf(item.src);
    const candidates = candidatesByName.get(name) || [];
    const claimants = unresolvedByName.get(name) || [];

    if (candidates.length === 1 && claimants.length === 1) {
      const match = candidates[0];
      claimed.add(match.src);
      report.recovered.push(`${item.src} -> ${match.src}`);
      entries.push({ item: mergeMedia(item, match, outputFile, index), rank: index });
      continue;
    }

    report.dropped.push(candidates.length === 0
      ? `${item.src} (no matching file on disk)`
      : `${item.src} (ambiguous: ${candidates.length} unmatched files are named ${name})`);
  }

  const offset = existingItems.length;
  scanned.forEach((item, scanIndex) => {
    if (claimed.has(item.src)) return;
    entries.push({ item, rank: offset + scanIndex });
  });

  return entries.sort(compareEntries).map(entry => entry.item);
}

function buildRoot(existingRoot, items) {
  if (!existingRoot) return { items };

  const root = {};
  for (const key of Object.keys(existingRoot)) {
    root[key] = key === 'items' ? items : existingRoot[key];
  }
  if (!('items' in root)) root.items = items;
  return root;
}

function buildManifest(assetsDir, outputFile) {
  const report = { warnings: [], skipped: [], recovered: [], dropped: [] };

  const existingRoot = readExistingManifest(outputFile);
  const existingItems = existingRoot ? existingRoot.items : [];

  const scanned = scanDirectory(assetsDir, '', report);
  const items = reconcile(existingItems, scanned, outputFile, report);
  items.forEach(item => warnAboutMissingPoster(item, assetsDir, report));

  return {
    manifest: buildRoot(existingRoot, items),
    report,
    poemCount: items.filter(item => item.type === 'poem').length,
    mediaCount: items.filter(item => item.type !== 'poem').length
  };
}

// Serialize first, then replace by rename, so a failure cannot truncate the
// existing manifest. A successful rename is the commit point.
function writeManifestSafely(outputFile, text) {
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempFile = path.join(path.dirname(outputFile), `${path.basename(outputFile)}.tmp-${unique}`);

  let handle;
  try {
    handle = fs.openSync(tempFile, 'wx');
    fs.writeSync(handle, text);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(tempFile, outputFile);
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch (ignored) { /* the original error matters more */ }
    }
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (cleanupError) {
      error.message += ` (a temporary file was left at ${tempFile})`;
    }
    throw error;
  }
}

function generateManifest(assetsDir = ASSETS_DIR, outputFile = OUTPUT_FILE) {
  console.log('Scanning assets directory...');

  const result = buildManifest(assetsDir, outputFile);
  const { manifest, report, poemCount, mediaCount } = result;

  writeManifestSafely(outputFile, JSON.stringify(manifest, null, 2));
  console.log(`Generated manifest with ${manifest.items.length} items (${poemCount} poems + ${mediaCount} media)`);

  if (report.recovered.length > 0) {
    console.log(`Followed ${report.recovered.length} moved or renamed file(s):`);
    report.recovered.forEach(entry => console.log(`  ~ ${entry}`));
  }

  if (report.dropped.length > 0) {
    console.log(`Dropped ${report.dropped.length} entr(y/ies) with no matching file:`);
    report.dropped.forEach(entry => console.log(`  x ${entry}`));
    console.log('  Review with: git diff content.json');
  }

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
    console.log(`\u26a0\ufe0f  ${largeImages.length} large images (>1MB):`);
    largeImages.forEach(item => {
      console.log(`  - ${item.src}: ${(item.fileSize / 1024 / 1024).toFixed(2)} MB`);
    });
    console.log('Consider compressing these images for better performance.');
  }

  console.log(`Output: ${outputFile}`);
  return result;
}

function runCli(argv) {
  const assetsDir = argv[0] ? path.resolve(argv[0]) : ASSETS_DIR;
  const outputFile = argv[1] ? path.resolve(argv[1]) : OUTPUT_FILE;

  try {
    generateManifest(assetsDir, outputFile);
  } catch (error) {
    console.error(`generate-manifest failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2));
}

module.exports = { generateManifest, buildManifest, scanDirectory, ManifestError };
