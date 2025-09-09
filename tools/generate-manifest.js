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
      
      // Determine type and create item
      let type = 'image';
      if (['.mp4', '.webm', '.mov'].includes(ext)) type = 'video';
      if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';
      
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
        trip: trip || undefined
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
  const items = scanDirectory(ASSETS_DIR);
  
  // Sort by date (newest first)
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  const manifest = { items };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`Generated manifest with ${items.length} items`);
  console.log(`Output: ${OUTPUT_FILE}`);
}

if (require.main === module) {
  generateManifest();
}

module.exports = { generateManifest };
