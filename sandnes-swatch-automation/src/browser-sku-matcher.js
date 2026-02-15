#!/usr/bin/env node
/**
 * SKU-only matching using browser to list SharePoint files
 * Solves the Norwegian color name problem
 */

const fs = require('fs');

// Parse CSV and group SKUs by product
function groupSKUsByProduct(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(3);
  const byProduct = {};
  
  lines.forEach(line => {
    const m = line.match(/^(\d+),"([^"]+)",(\d+),(\d+)/);
    if (!m || !m[3] || !m[4]) return;
    
    const product = m[2];
    const sku = m[4];
    
    if (!byProduct[product]) byProduct[product] = [];
    byProduct[product].push(sku);
  });
  
  return byProduct;
}

// Extract filenames from browser snapshot (compact or interactive format)
function extractFilenames(snapshotOutput) {
  const filenames = [];
  const lines = snapshotOutput.split('\n');
  
  for (const line of lines) {
    // Match button text containing .jpg filenames
    const m = line.match(/button "(\d{8}_[^"]+_300dpi_Close-up\.jpg)"/);
    if (m) filenames.push(m[1]);
    
    // Also try gridcell format
    const m2 = line.match(/gridcell "(\d{8}_[^"]+_300dpi_Close-up\.jpg)/);
    if (m2) filenames.push(m2[1]);
  }
  
  return [...new Set(filenames)]; // Dedupe
}

// Find matching filename for SKU
function findMatchBySKU(filenames, sku) {
  return filenames.find(f => f.startsWith(sku + '_'));
}

// Example usage:
const csvPath = process.argv[2] || 'data/missing_swatches_wholesale.csv';
const grouped = groupSKUsByProduct(csvPath);

console.log('SKUs grouped by product:\n');
Object.entries(grouped).forEach(([product, skus]) => {
  console.log(`${product}: ${skus.length} SKUs`);
  console.log(`  ${skus.join(', ')}`);
  console.log('');
});

console.log('\n=== Next Steps ===');
console.log('1. For each product, use browser() to navigate to SharePoint folder');
console.log('2. Take snapshot and pipe output to this script');
console.log('3. Script will extract filenames and match by SKU prefix');
console.log('4. Download matched files (SKU is definitive, ignore color name)');
