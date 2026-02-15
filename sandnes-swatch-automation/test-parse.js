#!/usr/bin/env node
// Quick test to see if CSV parsing is now finding all 64 SKUs
const { parse } = require('./src/automate-swatch-final.js');

const rows = parse('data/missing_swatches_wholesale.csv');
console.log(`Found ${rows.length} rows`);
console.log('\nFirst 5 rows:');
rows.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i+1}. SKU=${r.sku}, Product="${r.product}", Variant="${r.variant}"`);
});
