#!/usr/bin/env node
/**
 * Sandnes Garn Swatch Automation - Fresh Auth Every Run
 * Re-authenticates with SharePoint before each execution
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const AUTH_URL = 'https://sandnesgarn.sharepoint.com/:f:/s/SandnesGarn/Epxn98W7Lk1LussIYXVmeu0BvGLyiVc-5watfaL4mYjcLg?e=1McFU3';
const COOKIE_FILE = '/tmp/openclaw/jobs/cookie-header.txt';
const COOKIE_JSON = '/tmp/openclaw/jobs/cookies.json';

console.log('\n═════════════════════════════════════════════════════════');
console.log('  STEP 1: Fresh SharePoint Authentication');
console.log('═════════════════════════════════════════════════════════\n');

// Start browser fresh
console.log('Starting browser...');
try { execSync('openclaw browser stop', { stdio: 'ignore' }); } catch {}

const startResult = execSync('openclaw browser start --browser-profile openclaw', { encoding: 'utf-8' });
console.log(startResult);

// Open auth URL
console.log('\nOpening SharePoint folder...');
const openResult = execSync(`openclaw browser open "${AUTH_URL}" --browser-profile openclaw --json`, { encoding: 'utf-8' });
const { targetId } = JSON.parse(openResult);
console.log(`Browser tab opened: ${targetId}\n`);

// Export fresh cookies
console.log('Exporting fresh cookies...');
execSync(`openclaw browser cookies --browser-profile openclaw --target-id ${targetId} --json > ${COOKIE_JSON}`, { encoding: 'utf-8' });

// Convert to header format
const cookieScript = path.resolve(__dirname, '../../scripts/openclaw-cookie-header-from-json.sh');
execSync(`${cookieScript} --input ${COOKIE_JSON} --domain sharepoint.com --raw > ${COOKIE_FILE}`);

// Verify
const cookieSize = fs.statSync(COOKIE_FILE).size;
const cookieContent = fs.readFileSync(COOKIE_FILE, 'utf-8');
const hasFedAuth = cookieContent.includes('FedAuth=');

console.log(`\n✅ Fresh cookies exported:`);
console.log(`   Size: ${cookieSize} bytes`);
console.log(`   FedAuth: ${hasFedAuth ? '✓ present' : '✗ MISSING'}`);

// Quick test
console.log('\nTesting download with fresh cookies...');
const testUrl = 'https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettside%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29/Tynn%20Silk%20Mohair/N%C3%B8stebilder/11935581_Mint_300dpi_Close-up.jpg';
const testOut = '/tmp/openclaw/test-fresh.jpg';

try {
  const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8');
  execSync(`curl -f -s -m 10 -H "Cookie: ${cookie}" "${testUrl}" -o ${testOut}`, { encoding: 'utf-8' });
  const size = fs.statSync(testOut).size;
  
  if (size > 1000) {
    console.log(`✅ Test SUCCESS: ${size} bytes`);
    fs.unlinkSync(testOut);
  } else {
    console.log(`❌ Test failed: only ${size} bytes`);
    process.exit(1);
  }
} catch (err) {
  console.log(`❌ Test failed: ${err.stderr || err.message || 'HTTP error'}`);
  process.exit(1);
}

console.log('\n═════════════════════════════════════════════════════════');
console.log('  STEP 2: Running Swatch Automation');
console.log('═════════════════════════════════════════════════════════\n');

// Parse args
const args = process.argv.slice(2);
const site = args[0] || 'wholesale';

// Run automation with fresh env
const script = path.join(__dirname, 'automate-swatch-final.js');
const env = { ...process.env };

// Load .env
if (fs.existsSync(path.join(__dirname, '../.env'))) {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  });
}

try {
  execSync(`node "${script}" ${site}`, { 
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'inherit'
  });
} catch (err) {
  console.error(`\nAutomation exited with code ${err.status || 1}`);
  process.exit(err.status || 1);
}
