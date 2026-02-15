#!/usr/bin/env node
/**
 * Find swatch files on SharePoint by SKU only (ignore color names)
 * Uses browser to list folder contents and search by SKU prefix
 */

const fs = require('fs');
const { execSync } = require('child_process');

const PRODUCTS = {
  "Sandnes Garn Tynn Silk Mohair": "Tynn Silk Mohair",
  "Børstet (Brushed) Alpakka": "Børstet Alpakka",
  "Double Sunday": "Double Sunday",
  "Peer Gynt": "Peer Gynt",
  "Sandnes Garn | SUNDAY": "Double Sunday",
  "Tynn Line": "Line",
  "Sandnes Garn POPPY": "POPPY",
  "Sandnes Garn BALLERINA CHUNKY MOHAIR": "Ballerina Chunky Mohair",
  "Alpakka Følgetråd (lace weight)": "Alpakka Følgetråd"
};

const SUBFOLDERS = { "Alpakka Følgetråd": "Nøstebilder (skein pictures)" };

// Parse CSV
function parseCSV(file) {
  const lines = fs.readFileSync(file, 'utf-8').split('\n').slice(3);
  return lines.map(line => {
    const m = line.match(/^(\d+),"([^"]+)",(\d*),(\d*)/);
    return m && m[3] && m[4] ? { product: m[2], sku: m[4] } : null;
  }).filter(Boolean);
}

// Get folder URL for product
function getFolderURL(product) {
  const folder = PRODUCTS[product];
  if (!folder) return null;
  
  const subfolder = SUBFOLDERS[folder] || "Nøstebilder";
  const base = "https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettsite%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29";
  
  if (!subfolder) return `${base}/${encodeURIComponent(folder)}`;
  return `${base}/${encodeURIComponent(folder)}/${encodeURIComponent(subfolder)}`;
}

// Group SKUs by product folder
const rows = parseCSV(process.argv[2] || 'data/missing_swatches_wholesale.csv');
const byProduct = {};

rows.forEach(r => {
  const url = getFolderURL(r.product);
  if (!url) return;
  if (!byProduct[url]) byProduct[url] = [];
  byProduct[url].push(r.sku);
});

console.log('SKUs grouped by SharePoint folder:\n');
Object.entries(byProduct).forEach(([url, skus]) => {
  console.log(`${url}`);
  console.log(`  SKUs: ${skus.join(', ')}`);
  console.log(``);
});

console.log('\nNext step: Use browser to navigate to each folder, snapshot to list files,');
console.log('then search for files matching {SKU}_*_300dpi_Close-up.jpg');
