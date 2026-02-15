#!/usr/bin/env node
// Quick debug to test discovery
const { listSharePointFiles } = require('./src/automate-swatch-final.js');

const cookie = require('fs').readFileSync('/tmp/openclaw/jobs/cookie-header.txt', 'utf-8').trim();

console.log('Testing SharePoint discovery...\n');

const testProducts = [
  { product: "Tynn Silk Mohair", subfolder: "Nøstebilder" },
  { product: "Double Sunday", subfolder: "Nøstebilder" },
  { product: "Alpakka Følgetråd", subfolder: "Nøstebilder (skein pictures)" }
];

for (const { product, subfolder } of testProducts) {
  console.log(`Listing ${product}/${subfolder}...`);
  try {
    const files = listSharePointFiles(product, subfolder, cookie);
    console.log(`  Found ${files.length} files`);
    if (files.length > 0) {
      console.log(`  First 3: ${files.slice(0, 3).join(', ')}`);
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
  console.log('');
}
