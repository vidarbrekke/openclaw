#!/usr/bin/env node
/**
 * Smoke Test - Validates the swatch automation pipeline
 * Must pass before any production run
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COOKIE_FILE = '/tmp/openclaw/jobs/cookie-header.txt';
const TMP_DIR = '/tmp/openclaw/downloads';

// Known working file from Feb 14
const TEST_FILE = '11557911_Mint-green_300dpi_Close-up.jpg';
const TEST_URL = `https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettside%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29/Alpakka%20F%C3%B8lgetr%C3%A5d/N%C3%B8stebilder%20%28skein%20pictures%29/${TEST_FILE}`;

console.log('═══════════════════════════════════════════════════════════');
console.log('SMOKE TEST - Validating Swatch Automation Pipeline');
console.log('═══════════════════════════════════════════════════════════\n');

let failures = 0;

// Test 1: Cookie file exists and has FedAuth
console.log('Test 1: Cookie file validation');
if (!fs.existsSync(COOKIE_FILE)) {
  console.log('  ❌ FAIL: Cookie file not found at ' + COOKIE_FILE);
  console.log('      Run: node src/automate-swatch-final.js <site>');
  failures++;
} else {
  const cookieContent = fs.readFileSync(COOKIE_FILE, 'utf-8');
  if (cookieContent.includes('FedAuth=')) {
    console.log('  ✅ PASS: Cookie file exists with FedAuth');
  } else {
    console.log('  ❌ FAIL: Cookie file missing FedAuth token');
    console.log('      Cookies may be expired. Run fresh authentication.');
    failures++;
  }
}

// Test 2: Download known working file
console.log('\nTest 2: Download validation (known working file)');
try {
  const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8');
  const outPath = path.join(TMP_DIR, 'smoke-test-' + TEST_FILE);
  
  // Clean up any previous test file
  try { fs.unlinkSync(outPath); } catch {}
  
  // Download
  execSync(`curl -f -s -L -m 30 -H "Cookie: ${cookie}" "${TEST_URL}" -o "${outPath}"`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Validate
  if (!fs.existsSync(outPath)) {
    console.log('  ❌ FAIL: Download failed - file not created');
    failures++;
  } else {
    const size = fs.statSync(outPath).size;
    if (size < 1000) {
      // Likely HTML error page
      const content = fs.readFileSync(outPath, 'utf-8').slice(0, 100);
      console.log(`  ❌ FAIL: Downloaded file too small (${size} bytes)`);
      console.log(`      Content preview: ${content}...`);
      console.log('      Cookies may be expired or auth failed.');
      failures++;
    } else if (size >= 500000) {
      // Valid image (500KB-1MB typical)
      console.log(`  ✅ PASS: Downloaded valid image (${(size/1024).toFixed(0)} KB)`);
      
      // Test 3: ImageMagick processing
      console.log('\nTest 3: ImageMagick processing');
      try {
        const webpPath = outPath.replace('.jpg', '.webp');
        execSync(`magick "${outPath}" -resize 80x -quality 90 "${webpPath}"`, {
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        
        if (fs.existsSync(webpPath) && fs.statSync(webpPath).size > 1000) {
          console.log(`  ✅ PASS: ImageMagick converted to WebP (${(fs.statSync(webpPath).size/1024).toFixed(0)} KB)`);
          fs.unlinkSync(webpPath);
        } else {
          console.log('  ❌ FAIL: ImageMagick conversion failed');
          failures++;
        }
      } catch (e) {
        console.log('  ❌ FAIL: ImageMagick error - ' + e.message);
        failures++;
      }
    } else {
      console.log(`  ⚠️ WARN: File size unexpected (${size} bytes), but may be valid`);
    }
    
    // Cleanup
    fs.unlinkSync(outPath);
  }
} catch (e) {
  console.log('  ❌ FAIL: Download error - ' + e.message);
  failures++;
}

// Test 4: Required directories
console.log('\nTest 4: Directory structure');
const dirs = [TMP_DIR, '/tmp/openclaw/jobs', path.join(__dirname, '../data')];
for (const dir of dirs) {
  if (fs.existsSync(dir)) {
    console.log(`  ✅ PASS: ${dir}`);
  } else {
    console.log(`  ❌ FAIL: Missing directory ${dir}`);
    failures++;
  }
}

// Test 5: Environment variables (basic check)
console.log('\nTest 5: Environment configuration');
const requiredEnv = ['WHOLESALE_SSH_USER', 'PROD_SSH_USER'];
for (const env of requiredEnv) {
  if (process.env[env]) {
    console.log(`  ✅ PASS: ${env} set`);
  } else {
    console.log(`  ⚠️ WARN: ${env} not set (will fail on actual upload)`);
  }
}

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
if (failures === 0) {
  console.log('✅ ALL TESTS PASSED - Pipeline is ready');
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(0);
} else {
  console.log(`❌ ${failures} TEST(S) FAILED - Do not run production`);
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(1);
}
