#!/usr/bin/env node
/**
 * Comprehensive Smoke Test for Swatch Automation
 * MUST pass before any production run
 * 
 * Tests:
 * 1. Cookie validation (FedAuth presence)
 * 2. SharePoint connectivity (download known working file)
 * 3. ImageMagick processing
 * 4. Directory structure
 * 5. Environment configuration
 * 6. CSV file presence
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COOKIE_FILE = '/tmp/openclaw/jobs/cookie-header.txt';
const TMP_DIR = '/tmp/openclaw/downloads';
const JOBS_DIR = '/tmp/openclaw/jobs';
const ROOT_DIR = path.resolve(__dirname, '..');

// Known working file from Feb 14 (verified download)
const TEST_URL = 'https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettsite%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29/Alpakka%20F%C3%B8lgetr%C3%A5d/N%C3%B8stebilder%20%28skein%20pictures%29/11557911_Mint-green_300dpi_Close-up.jpg';

let failures = 0;
let warnings = 0;

function test(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message}`);
    failures++;
  }
}

function warn(name, fn) {
  try {
    fn();
  } catch (e) {
    console.warn(`  ⚠️  ${name}: ${e.message}`);
    warnings++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log(' SMOKE TEST - Swatch Automation Validation');
console.log('═══════════════════════════════════════════════════════════\n');

// Test 1: Cookie file validation
console.log('Test 1: Cookie file validation');
test('Cookie file exists', () => {
  assert(fs.existsSync(COOKIE_FILE), `Cookie file not found at ${COOKIE_FILE}`);
  const stats = fs.statSync(COOKIE_FILE);
  assert(stats.size > 100, `Cookie file too small (${stats.size} bytes), likely invalid`);
  
  // Check freshness (< 1 hour old)
  const ageMinutes = (Date.now() - stats.mtime.getTime()) / 1000 / 60;
  if (ageMinutes > 60) {
    console.warn(`  ⚠️  Cookies are ${Math.round(ageMinutes)} minutes old (> 60 min, may need refresh)`);
    warnings++;
  }
});

test('FedAuth token present', () => {
  const content = fs.readFileSync(COOKIE_FILE, 'utf-8');
  assert(content.toLowerCase().includes('fedauth='), 'Missing FedAuth token in cookies');
});
test('rtFa token present', () => {
  const content = fs.readFileSync(COOKIE_FILE, 'utf-8');
  assert(content.toLowerCase().includes('rtfa='), 'Missing rtFa token in cookies');
});

// Test 2: SharePoint connectivity
console.log('\nTest 2: SharePoint connectivity');
test('Can download known working file', () => {
  const testOut = path.join(TMP_DIR, 'smoke-test.jpg');
  try {
    try { fs.unlinkSync(testOut); } catch {}
    
    const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8');
    const cmd = `curl -f -s -L -m 30 -H "Cookie: ${cookie}" "${TEST_URL}" -o "${testOut}"`;
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 35000 });
    
    assert(fs.existsSync(testOut), 'Download failed - file not created');
    const size = fs.statSync(testOut).size;
    assert(size > 1000, `File too small (${size} bytes), likely HTML error page (cookies expired?)`);
    assert(size > 500000, `File smaller than expected (${size} bytes), may not be full image`);
    
    // Check it's actually an image
    const header = fs.readFileSync(testOut).slice(0, 4);
    const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
    const isPNG = header.toString('ascii', 0, 4) === '\x89PNG';
    assert(isJPEG || isPNG, `File is not a valid image (JPEG/PNG) - header: ${header.toString('hex')}`);
    
    console.log(`  ✅ Downloaded valid image (${(size/1024).toFixed(0)} KB)`);
    
    // Test 3: ImageMagick processing
    console.log('\nTest 3: ImageMagick processing');
    const webpOut = testOut.replace('.jpg', '.webp');
    try {
      execSync(`magick "${testOut}" -resize 80x -quality 90 "${webpOut}"`, { 
        encoding: 'utf-8', 
        stdio: 'pipe',
        timeout: 10000 
      });
      
      assert(fs.existsSync(webpOut), 'ImageMagick conversion failed - file not created');
      const webpSize = fs.statSync(webpOut).size;
      assert(webpSize > 1000, `WebP file too small (${webpSize} bytes), conversion may have failed`);
      
      console.log(`  ✅ ImageMagick processing succeeded (${(webpSize/1024).toFixed(0)} KB WebP)`);
      
      fs.unlinkSync(webpOut);
    } catch (e) {
      throw new Error(`ImageMagick processing failed: ${e.message}`);
    }
    
    fs.unlinkSync(testOut);
  } catch (e) {
    // Cleanup on error
    try { fs.unlinkSync(testOut); } catch {}
    throw e;
  }
});

// Test 4: Directory structure
console.log('\nTest 4: Directory structure');
const requiredDirs = [
  [TMP_DIR, 'Downloads directory'],
  [JOBS_DIR, 'Jobs directory'],
  [path.join(ROOT_DIR, 'data'), 'Data directory'],
  [path.join(ROOT_DIR, 'src'), 'Source directory'],
  [path.join(ROOT_DIR, 'scripts'), 'Scripts directory']
];

for (const [dir, name] of requiredDirs) {
  test(`${name} exists`, () => {
    assert(fs.existsSync(dir), `Missing directory: ${dir}`);
  });
}

// Test 5: Environment configuration
console.log('\nTest 5: Environment configuration');
const requiredEnv = [
  'WHOLESALE_SSH_KEY_PATH',
  'WHOLESALE_SSH_USER',
  'WHOLESALE_SSH_HOST',
  'WHOLESALE_WP_ROOT',
  'PROD_SSH_KEY_PATH',
  'PROD_SSH_USER',
  'PROD_SSH_HOST',
  'PROD_WP_ROOT'
];

let envWarnings = 0;
for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.warn(`  ⚠️  Missing env var: ${env}`);
    envWarnings++;
  }
}
if (envWarnings === 0) {
  console.log('  ✅ All required environment variables set');
} else if (envWarnings < 4) {
  console.log(`  ⚠️  ${envWarnings} missing env vars (may affect some sites)`);
  warnings += envWarnings;
} else {
  console.error(`  ❌ ${envWarnings} missing env vars (critical failure)`);
  failures += 1;
}

// Test 6: CSV files present
console.log('\nTest 6: CSV data files');
let csvErrors = 0;
const wholesaleCsv = path.join(ROOT_DIR, 'data', 'missing_swatches_wholesale.csv');
const prodCsv = path.join(ROOT_DIR, 'data', 'missing_swatches_prod.csv');

if (!fs.existsSync(wholesaleCsv)) {
  console.warn(`  ⚠️  Missing wholesale CSV: ${wholesaleCsv}`);
  console.warn('      Run from WordPress: wp mk-attr swatch_missing_candidates --format=csv');
  csvErrors++;
  warnings++;
} else {
  const lines = fs.readFileSync(wholesaleCsv, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length < 2) {
    console.warn(`  ⚠️  Wholesale CSV has ${lines.length} lines (may be empty)`);
    warnings++;
  } else {
    console.log(`  ✅ Wholesale CSV: ${lines.length - 1} SKUs`);
  }
}

if (!fs.existsSync(prodCsv)) {
  console.warn(`  ⚠️  Missing production CSV: ${prodCsv}`);
  console.warn('      Run from WordPress: wp mk-attr swatch_missing_candidates --format=csv');
  csvErrors++;
  warnings++;
} else {
  const lines = fs.readFileSync(prodCsv, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length < 2) {
    console.warn(`  ⚠️  Production CSV has ${lines.length} lines (may be empty)`);
    warnings++;
  } else {
    console.log(`  ✅ Production CSV: ${lines.length - 1} SKUs`);
  }
}

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
if (failures === 0 && warnings === 0) {
  console.log('✅ ALL TESTS PASSED - Pipeline is ready');
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
} else if (failures === 0) {
  console.log(`⚠️  TESTS PASSED WITH ${warnings} WARNING(S)`);
  console.log('   You can proceed, but review warnings above');
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
} else {
  console.log(`❌ ${failures} CRITICAL FAILURE(S) - Do not run production`);
  if (warnings > 0) {
    console.log(`   Plus ${warnings} warning(s)`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(1);
}