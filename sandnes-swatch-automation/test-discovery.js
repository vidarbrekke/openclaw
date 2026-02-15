#!/usr/bin/env node
// Standalone discovery test
const { execFileSync } = require('child_process');

const COOKIE_FILE = '/tmp/openclaw/jobs/cookie-header.txt';
const cookie = require('fs').readFileSync(COOKIE_FILE, 'utf-8').trim();

function runBin(bin, args, options = {}) {
  return execFileSync(bin, args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options
  });
}

function url(product, subfolder) {
  const base = "https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettsite%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29";
  return subfolder ? 
    `${base}/${encodeURIComponent(product)}/${encodeURIComponent(subfolder)}/` : 
    `${base}/${encodeURIComponent(product)}/`;
}

function listViaPropfind(product, subfolder, cookie) {
  const folderUrl = url(product, subfolder);
  try {
    const response = runBin('curl', [
      '-f', '-s', '-m', '15',
      '-X', 'PROPFIND',
      '-H', `Cookie: ${cookie}`,
      '-H', 'Depth: 1',
      folderUrl
    ]);
    
    // Extract .jpg filenames from WebDAV XML
    const matches = response.match(/href="([^"]*\.jpg)"/gi) || [];
    return matches.map(m => {
      const href = m.match(/href="([^"]+)"/)[1];
      return decodeURIComponent(href.split('/').pop());
    });
  } catch (e) {
    console.log(`  curl error: ${e.status || 'unknown'}`);
    return [];
  }
}

// Test 5 products
const tests = [
  { product: "Tynn Silk Mohair", subfolder: "Nøstebilder" },
  { product: "Double Sunday", subfolder: "Nøstebilder" },
  { product: "Alpakka Følgetråd", subfolder: "Nøstebilder (skein pictures)" },
  { product: "Peer Gynt", subfolder: "Nøstebilder" },
  { product: "Børstet Alpakka", subfolder: "Nøstebilder" }
];

console.log('Testing PROPFIND file discovery...\n');
let totalFiles = 0;

for (const { product, subfolder } of tests) {
  process.stdout.write(`${product}/${subfolder}: `);
  try {
    const files = listViaPropfind(product, subfolder, cookie);
    console.log(`${files.length} files`);
    if (files.length > 0) {
      console.log(`  Sample: ${files.slice(0, 2).join(', ')}`);
      totalFiles += files.length;
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}

console.log(`\nTotal files discovered: ${totalFiles}`);
