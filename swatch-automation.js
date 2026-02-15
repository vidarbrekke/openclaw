#!/usr/bin/env node
/**
 * Sandnes Garn Swatch Automation
 * 
 * Downloads missing swatches from SharePoint, processes them,
 * and uploads to WordPress media library for variant assignment.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  workspaceRoot: '/Users/vidarbrekke/Dev/CursorApps/clawd',
  downloadsDir: '/Users/vidarbrekke/Downloads',
  tmpDir: '/tmp',
  imageWidth: 80,
  webpQuality: 90,
};

// Product name mapping: WooCommerce → SharePoint folder
const PRODUCT_MAP = {
  // Line products
  'Tynn Line': 'Line',
  
  // Double Sunday variants
  'Double Sunday': 'Double Sunday',
  'Sandnes Garn x PetiteKnit DOUBLE SUNDAY': 'Double Sunday (PetiteKnit)',
  'Sandnes Garn | SUNDAY': 'Double Sunday',
  
  // Kos
  'Kos': 'Kos',
  
  // Silk Mohair
  'Sandnes Garn Tynn Silk Mohair': 'Primo Tynn Silk Mohair',
  
  // Alpakka variants
  'Alpakka': 'Alpakka',
  'Alpakka Ull': 'Alpakka Ull',
  'Alpakka Silke': 'Alpakka Silke',
  'Alpakka Følgetråd (lace weight)': 'Alpakka Følgetråd',
  'Børstet (Brushed) Alpakka': 'Børstet Alpakka',
  'Mini Alpakka': 'Mini Alpakka',
  
  // Peer Gynt variants
  'Peer Gynt': 'Peer Gynt',
  'Tynn Peer Gynt [Fingering weight': 'Peer Gynt',
  
  // Merino
  'Merinoull': 'Merinoull',
  'Merinoull (Merino Wool) on Sale': 'Merinoull',
  'Tynn Merinoull (Thin Merino Wool)': 'KlompeLOMPE Tynn Merinoull',
  
  // Other yarns
  'Babyull Lanett': 'Babyull Lanett',
  'Sandnes Garn BALLERINA CHUNKY MOHAIR': 'Ballerina Chunky Mohair',
  'Sandnes Garn POPPY': 'POPPY',
  'Duo': 'Duo',
  
  // On sale variants (map to base product)
  'Alpakka On Sale': 'Alpakka',
  'Duo on Sale': 'Duo',
  'Peer Gynt on Sale1': 'Peer Gynt',
  'Peer Gynt TEST': 'Peer Gynt',
};

// ============================================================================
// Utilities
// ============================================================================

function loadEnv() {
  const envPath = path.join(CONFIG.workspaceRoot, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      if (key && value) {
        env[key.trim()] = value.trim();
      }
    }
  });
  
  return env;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  
  // Find the header row (contains "product_id,product_name")
  let headerIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('product_id') && lines[i].includes('product_name')) {
      headerIndex = i;
      break;
    }
  }
  
  const headers = lines[headerIndex].split(',').map(h => h.replace(/"/g, '').trim());
  
  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
    const row = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].replace(/"/g, '').trim() : '';
    });
    
    rows.push(row);
  }
  
  return rows;
}

function extractVariantCode(sku) {
  // Last 4 digits of SKU
  return sku.slice(-4);
}

function shouldSkipRow(row, log) {
  if (!row.variation_id) {
    log.skipped.push({ sku: row.sku, reason: 'Empty variation_id (product-level entry)' });
    return true;
  }
  
  if (!row.sku) {
    log.skipped.push({ product: row.product_name, reason: 'Empty SKU (orphan entry)' });
    return true;
  }
  
  if (!PRODUCT_MAP[row.product_name]) {
    log.skipped.push({ 
      sku: row.sku, 
      product: row.product_name,
      reason: 'Unknown SharePoint folder mapping' 
    });
    return true;
  }
  
  return false;
}

// ============================================================================
// Image Processing
// ============================================================================

function findDownloadedFile(variantCode) {
  const files = fs.readdirSync(CONFIG.downloadsDir);
  
  // Look for: *[variant-code]*Close-up.jpg
  const pattern = new RegExp(`${variantCode}.*Close-up\\.jpg$`, 'i');
  const found = files.find(f => pattern.test(f));
  
  if (found) {
    return path.join(CONFIG.downloadsDir, found);
  }
  
  return null;
}

function resizeAndConvert(inputPath, outputPath) {
  // Two-step process: sips to resize, cwebp to convert
  
  // Check tools
  try {
    execSync('which sips', { stdio: 'ignore' });
    execSync('which cwebp', { stdio: 'ignore' });
  } catch (e) {
    throw new Error('Required tools not found. Install: brew install webp');
  }
  
  // Step 1: Resize with sips to temp PNG
  const tmpPng = outputPath.replace('.webp', '_tmp.png');
  const resizeCmd = `sips -s format png -Z ${CONFIG.imageWidth} "${inputPath}" --out "${tmpPng}"`;
  execSync(resizeCmd, { stdio: 'pipe' });
  
  if (!fs.existsSync(tmpPng)) {
    throw new Error(`Failed to resize image`);
  }
  
  // Step 2: Convert PNG to WebP with cwebp
  const convertCmd = `cwebp -q ${CONFIG.webpQuality} "${tmpPng}" -o "${outputPath}"`;
  execSync(convertCmd, { stdio: 'pipe' });
  
  // Clean up temp PNG
  fs.unlinkSync(tmpPng);
  
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Failed to create ${outputPath}`);
  }
  
  return outputPath;
}

// ============================================================================
// WordPress Upload
// ============================================================================

function uploadToWordPress(localFilePath, sku, env, site = 'prod') {
  const prefix = site === 'prod' ? 'PROD' : 'WHOLESALE';
  const wpUrl = env[`${prefix}_WP_URL`];
  const wpUser = env[`${prefix}_WP_USER`];
  const wpAppPassword = env[`${prefix}_WP_APP_PASSWORD`];
  
  const filename = path.basename(localFilePath);
  
  // Validate credentials
  if (!wpUser || !wpAppPassword || wpUser.includes('your_wp_username') || wpAppPassword.includes('xxxx')) {
    throw new Error(`WordPress credentials not configured in .env for ${prefix}`);
  }
  
  try {
    console.log(`  → Uploading ${filename} to ${site} via REST API...`);
    
    // Create Basic Auth header
    const auth = Buffer.from(`${wpUser}:${wpAppPassword}`).toString('base64');
    
    // Upload using curl (same as developer's approach)
    const curlCmd = `curl -sS -X POST "${wpUrl}/wp-json/wp/v2/media" \
      -H "Authorization: Basic ${auth}" \
      -H "Content-Disposition: attachment; filename=\\"${filename}\\"" \
      -H "Content-Type: image/webp" \
      --data-binary @"${localFilePath}"`;
    
    const output = execSync(curlCmd, { encoding: 'utf8' });
    
    // Parse JSON response
    let response;
    try {
      response = JSON.parse(output);
    } catch (e) {
      throw new Error(`Failed to parse WordPress response: ${output.substring(0, 200)}`);
    }
    
    // Check for errors
    if (response.code && response.message) {
      throw new Error(`WordPress API error: ${response.code} - ${response.message}`);
    }
    
    const attachmentId = response.id;
    if (!attachmentId) {
      throw new Error(`No attachment ID in response: ${JSON.stringify(response).substring(0, 200)}`);
    }
    
    console.log(`  ✓ Uploaded! Attachment ID: ${attachmentId}`);
    console.log(`  ✓ URL: ${response.source_url || response.guid?.rendered || 'N/A'}`);
    
    return attachmentId;
    
  } catch (error) {
    console.error(`  ✗ Upload failed:`, error.message);
    throw error;
  }
}

// ============================================================================
// Main Process
// ============================================================================

async function processSwatch(row, env, site, log) {
  const sku = row.sku;
  const variantCode = extractVariantCode(sku);
  const productName = row.product_name;
  const variantValue = row.variant_value;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Processing: ${productName} - ${variantValue}`);
  console.log(`SKU: ${sku} | Variant Code: ${variantCode}`);
  
  try {
    // 1. Find downloaded SharePoint file
    const downloadedFile = findDownloadedFile(variantCode);
    if (!downloadedFile) {
      console.log(`  ⚠ SKIP: File not found in Downloads for variant ${variantCode}`);
      log.skipped.push({ 
        sku, 
        product: productName, 
        variant: variantValue,
        reason: 'File not found in Downloads' 
      });
      return;
    }
    
    console.log(`  ✓ Found: ${path.basename(downloadedFile)}`);
    
    // 2. Resize and convert to webp
    const outputFilename = `${sku}_${variantValue.replace(/[^a-zA-Z0-9]/g, '-')}_swatch.webp`;
    const outputPath = path.join(CONFIG.workspaceRoot, outputFilename);
    
    console.log(`  → Resizing to ${CONFIG.imageWidth}px and converting to .webp...`);
    resizeAndConvert(downloadedFile, outputPath);
    console.log(`  ✓ Created: ${outputFilename}`);
    
    // 3. Upload to WordPress
    const attachmentId = uploadToWordPress(outputPath, sku, env, site);
    
    // 4. Clean up local processed file
    fs.unlinkSync(outputPath);
    
    // 5. Log success
    log.processed.push({
      sku,
      product: productName,
      variant: variantValue,
      file: outputFilename,
      attachmentId,
      status: 'success'
    });
    
  } catch (error) {
    console.error(`  ✗ FAILED:`, error.message);
    log.failed.push({
      sku,
      product: productName,
      variant: variantValue,
      error: error.message
    });
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('🎨 Sandnes Garn Swatch Automation\n');
  
  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const site = args.includes('--wholesale') ? 'wholesale' : 'prod';
  const testMode = args.includes('--test');
  
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Site: ${site === 'prod' ? 'motherknitter.com' : 'wholesale.motherknitter.com'}`);
  console.log(`Test: ${testMode ? 'YES (first row only)' : 'NO'}\n`);
  
  // Load environment
  const env = loadEnv();
  
  // Load missing swatches CSV
  const csvPath = path.join(CONFIG.workspaceRoot, `missing_swatches_${site}.csv`);
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.log(`\nRun this first to generate CSV:\n`);
    const prefix = site === 'prod' ? 'PROD' : 'WHOLESALE';
    console.log(`ssh -i "$${prefix}_SSH_KEY_PATH" "$${prefix}_SSH_USER@$${prefix}_SSH_HOST" \\`);
    console.log(`  "cd $${prefix}_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv" \\`);
    console.log(`  > missing_swatches_${site}.csv\n`);
    process.exit(1);
  }
  
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(csvText);
  
  console.log(`📋 Found ${rows.length} rows in CSV\n`);
  
  // Initialize log
  const log = {
    processed: [],
    skipped: [],
    failed: [],
    timestamp: new Date().toISOString(),
    site
  };
  
  // Filter valid rows
  const validRows = rows.filter(row => !shouldSkipRow(row, log));
  console.log(`✓ Valid rows: ${validRows.length}`);
  console.log(`⊘ Skipped rows: ${log.skipped.length}\n`);
  
  if (log.skipped.length > 0) {
    console.log(`Skipped reasons:`);
    log.skipped.forEach(s => console.log(`  - ${s.reason}: ${s.sku || s.product}`));
    console.log('');
  }
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No uploads will be performed\n');
    console.log(`Would process ${validRows.length} swatches:\n`);
    validRows.slice(0, 10).forEach(row => {
      console.log(`  • ${row.product_name} - ${row.variant_value} (SKU: ${row.sku})`);
    });
    if (validRows.length > 10) {
      console.log(`  ... and ${validRows.length - 10} more`);
    }
    return;
  }
  
  // Test mode: process only first row
  const rowsToProcess = testMode ? validRows.slice(0, 1) : validRows;
  
  console.log(`🚀 Processing ${rowsToProcess.length} swatch(es)...\n`);
  
  // Process each row
  for (const row of rowsToProcess) {
    await processSwatch(row, env, site, log);
  }
  
  // Save processing log
  const logPath = path.join(CONFIG.workspaceRoot, `swatch_processing_${site}_${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  
  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log(`  ✓ Processed: ${log.processed.length}`);
  console.log(`  ⊘ Skipped:   ${log.skipped.length}`);
  console.log(`  ✗ Failed:    ${log.failed.length}`);
  console.log(`\n📝 Log saved: ${path.basename(logPath)}`);
  
  if (log.processed.length > 0 && !testMode) {
    console.log('\n🎯 Next step: Run --apply to assign swatches');
    const prefix = site === 'prod' ? 'PROD' : 'WHOLESALE';
    console.log(`\nssh -i "$${prefix}_SSH_KEY_PATH" "$${prefix}_SSH_USER@$${prefix}_SSH_HOST" \\`);
    console.log(`  "cd $${prefix}_WP_ROOT && wp mk-attr swatch_missing_candidates --apply"\n`);
  }
}

// ============================================================================
// Run
// ============================================================================

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
