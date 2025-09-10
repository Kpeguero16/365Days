#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OUTPUT_FILE = path.join(__dirname, '..', 'content.json');

function scanDirectory(dir, relativePath = '') {
  const items = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(relativePath, entry.name);
    
    if (entry.isDirectory()) {
      // Skip hidden directories
      if (entry.name.startsWith('.')) continue;
      items.push(...scanDirectory(fullPath, relPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const baseName = path.basename(entry.name, ext);
      
      // Skip audio files - they're not content items
      if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
        continue; // Skip this file
      }
      
      // Determine type and create item
      let type = 'image';
      if (['.mp4', '.webm', '.mov'].includes(ext)) type = 'video';
      
      // Extract date from filename (YYYY-MM-DD pattern)
      const dateMatch = baseName.match(/(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : '2021-09-11';
      
      // Extract trip from directory structure
      const trip = relativePath.includes('/') ? path.dirname(relativePath) : null;
      
      const item = {
        id: baseName.replace(/[^a-zA-Z0-9]/g, '_'),
        type,
        src: `assets/${relPath}`,
        date,
        caption: baseName.replace(/\d{4}-\d{2}-\d{2}[_-]?/, '').replace(/[_-]/g, ' ') || 'Memory',
        trip: trip || undefined,
        // Add file size info for optimization hints
        fileSize: fs.statSync(fullPath).size
      };
      
      if (type === 'video') {
        // Try to find a poster image
        const posterName = baseName + '_poster.jpg';
        const posterPath = path.join(dir, posterName);
        if (fs.existsSync(posterPath)) {
          item.poster = `assets/${path.join(relativePath, '..', posterName)}`;
        }
      }
      
      items.push(item);
    }
  }
  
  return items;
}

function generateManifest() {
  console.log('Scanning assets directory...');
  
  // Load existing manifest to preserve poems
  let existingPoems = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      existingPoems = existing.items.filter(item => item.type === 'poem');
      console.log(`Found ${existingPoems.length} existing poems to preserve`);
    } catch (e) {
      console.log('Could not load existing manifest, starting fresh');
    }
  }
  
  const items = scanDirectory(ASSETS_DIR);
  
  // Add preserved poems to the items
  const allItems = [...existingPoems, ...items];
  
  // Sort by date (oldest first) to keep poems at the beginning of seasons
  allItems.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const manifest = { items: allItems };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`Generated manifest with ${allItems.length} items (${existingPoems.length} poems + ${items.length} media)`);
  
  // Show file size analysis (only for non-poem items)
  const nonPoemItems = allItems.filter(item => item.type !== 'poem');
  const totalSize = nonPoemItems.reduce((sum, item) => sum + (item.fileSize || 0), 0);
  const avgSize = nonPoemItems.length > 0 ? totalSize / nonPoemItems.length : 0;
  const largeImages = nonPoemItems.filter(item => item.fileSize > 1000000); // > 1MB
  
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

module.exports = { generateManifest };
