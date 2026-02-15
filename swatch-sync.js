#!/usr/bin/env node
/**
 * Sandnes Garn Swatch Sync CLI
 * 
 * Standalone automation for swatch management.
 * Modes:
 *   --scan: Get missing swatches from WordPress
 *   --process: Resize, convert, upload existing downloads
 *   --apply: Assign uploaded swatches to variants
 *   --full: Run all steps (scan → process → apply)
 * 
 * Usage:
 *   ./swatch-sync.js --scan [--prod|--wholesale]
 *   ./swatch-sync.js --process [--prod|--wholesale] [--limit=N]
 *   ./swatch-sync.js --apply [--prod|--wholesale]
 *   ./swatch-sync.js --full [--prod|--wholesale]
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
  imageWidth: 80,
  webpQuality: 90,
};

const PRODUCT_MAP = {
  'Tynn Line': 'Line',
  'Double Sunday': 'Double Sunday',
  'Sandnes Garn x PetiteKnit DOUBLE SUNDAY': 'Double Sunday (PetiteKnit)',
  'Sandnes Garn | SUNDAY': 'Double Sunday',
  'Kos': 'Kos',
  'Sandnes Garn Tynn Silk Mohair': 'Primo Tynn Silk Mohair',
  'Alpakka': 'Alpakka',
  'Alpakka Ull': 'Alpakka Ull',
  'Alpakka Silke': 'Alpakka Silke',
  'Alpakka Følgetråd (lace weight)': 'Alpakka Følgetråd',
  'Børstet (Brushed) Alpakka': 'Børstet Alpakka',
  'Mini Alpakka': 'Mini Alpakka',
  'Peer Gynt': 'Peer Gynt',
  'Tynn Peer Gynt [Fingering weight': 'Peer Gynt',
  'Merinoull': 'Merinoull',
  'Merinoull (Merino Wool) on Sale': 'Merinoull',
  'Tynn Merinoull (Thin Merino Wool)': 'KlompeLOMPE Tynn Merinoull',
  'Babyull Lanett': 'Babyull Lanett',
  'Sandnes Garn BALLERINA CHUNKY MOHAIR': 'Ballerina Chunky Mohair',
  'Sandnes Garn POPPY': 'POPPY',
  'Duo': 'Duo',
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
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        env[key.trim()] = valueParts.join('=').replace(/^["']|["']$/g, '').trim();
      }
    }
  });
  
  return env;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  
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
  return sku.slice(-4);
}

function shouldSkipRow(row) {
  if (!row.variation_id) return 'Empty variation_id (product-level entry)';
  if (!row.sku) return 'Empty SKU (orphan entry)';
  if (!PRODUCT_MAP[row.product_name]) return `Unknown product: ${row.product_name}`;
  return null;
}

// ============================================================================
// SharePoint Download Detection
// ============================================================================

function findDownloadedFile(variantCode) {
  const files = fs.readdirSync(CONFIG.downloadsDir);
  const pattern = new RegExp(`${variantCode}.*Close-up\\.jpg$`, 'i');
  const found = files.find(f => pattern.test(f));
  
  if (found) {
    return path.join(CONFIG.downloadsDir, found);
  }
  
  return null;
}

// ============================================================================
// Image Processing
// ============================================================================

function resizeAndConvert(inputPath, outputPath) {
  try {
    execSync('which sips', { stdio: 'ignore' });
    execSync('which cwebp', { stdio: 'ignore' });
  } catch (e) {
    throw new Error('Required tools not found. Install: brew install webp');
  }
  
  const tmpPng = outputPath.replace('.webp', '_tmp.png');
  const resizeCmd = `sips -s format png -Z ${CONFIG.imageWidth} "${inputPath}" --out "${tmpPng}"`;
  execSync(resizeCmd, { stdio: 'pipe' });
  
  if (!fs.existsSync(tmpPng)) {
    throw new Error(`Failed to resize image`);
  }
  
  const convertCmd = `cwebp -q ${CONFIG.webpQuality} "${tmpPng}" -o "${outputPath}"`;
  execSync(convertCmd, { stdio: 'pipe' });
  
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
  
  if (!wpUser || !wpAppPassword || wpUser.includes('your_wp_username') || wpAppPassword.includes('xxxx')) {
    throw new Error(`WordPress credentials not configured in .env for ${prefix}`);
  }
  
  const auth = Buffer.from(`${wpUser}:${wpAppPassword}`).toString('base64');
  
  const curlCmd = `curl -sS -X POST "${wpUrl}/wp-json/wp/v2/media" \
    -H "Authorization: Basic ${auth}" \
    -H "Content-Disposition: attachment; filename=\\"${filename}\\"" \
    -H "Content-Type: image/webp" \
    --data-binary @"${localFilePath}"`;
  
  const output = execSync(curlCmd, { encoding: 'utf8' });
  
  let response;
  try {
    response = JSON.parse(output);
  } catch (e) {
    throw new Error(`Failed to parse WordPress response: ${output.substring(0, 200)}`);
  }
  
  if (response.code && response.message) {
    throw new Error(`WordPress API error: ${response.code} - ${response.message}`);
  }
  
  const attachmentId = response.id;
  if (!attachmentId) {
    throw new Error(`No attachment ID in response`);
  }
  
  return { attachmentId, url: response.source_url };
}

// ============================================================================
// WordPress Commands
// ============================================================================

function runWPCommand(cmd, env, site) {
  const prefix = site === 'prod' ? 'PROD' : 'WHOLESALE';
  const sshHost = env[`${prefix}_SSH_HOST`];
  const sshUser = env[`${prefix}_SSH_USER`];
  const sshKey = env[`${prefix}_SSH_KEY_PATH`];
  const wpRoot = env[`${prefix}_WP_ROOT`];
  
  const fullCmd = `ssh -i "${sshKey}" "${sshUser}@${sshHost}" "cd ${wpRoot} && ${cmd}"`;
  return execSync(fullCmd, { encoding: 'utf8' });
}

// ============================================================================
// Commands
// ============================================================================

function cmdScan(env, site) {
  console.log(`\n🔍 Scanning ${site} for missing swatches...\n`);
  
  const output = runWPCommand('wp mk-attr swatch_missing_candidates --format=csv 2>/dev/null', env, site);
  const csvPath = path.join(CONFIG.workspaceRoot, `missing_swatches_${site}_full.csv`);
  
  fs.writeFileSync(csvPath, output);
  
  const lines = output.split('\n');
  const summary = lines[0];
  const candidates = lines[1];
  
  console.log(`✓ ${summary}`);
  console.log(`✓ ${candidates}`);
  console.log(`\n📄 Saved to: ${path.basename(csvPath)}\n`);
  
  return csvPath;
}

function cmdProcess(env, site, limit = null) {
  console.log(`\n⚙️  Processing swatches for ${site}...\n`);
  
  const csvPath = path.join(CONFIG.workspaceRoot, `missing_swatches_${site}_full.csv`);
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV not found: ${csvPath}`);
    console.log(`\nRun --scan first:\n  ./swatch-sync.js --scan --${site}\n`);
    process.exit(1);
  }
  
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(csvText);
  
  const log = { processed: [], skipped: [], failed: [], notFound: [] };
  
  // Filter and process
  let processed = 0;
  for (const row of rows) {
    const skipReason = shouldSkipRow(row);
    if (skipReason) {
      log.skipped.push({ sku: row.sku, product: row.product_name, reason: skipReason });
      continue;
    }
    
    const variantCode = extractVariantCode(row.sku);
    const downloadedFile = findDownloadedFile(variantCode);
    
    if (!downloadedFile) {
      log.notFound.push({
        sku: row.sku,
        product: row.product_name,
        variant: row.variant_value,
        variantCode,
        sharepointFolder: PRODUCT_MAP[row.product_name]
      });
      continue;
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Processing: ${row.product_name} - ${row.variant_value}`);
    console.log(`SKU: ${row.sku} | Variant Code: ${variantCode}`);
    
    try {
      console.log(`  ✓ Found: ${path.basename(downloadedFile)}`);
      
      // Resize and convert
      const outputFilename = `${row.sku}_${row.variant_value.replace(/[^a-zA-Z0-9]/g, '-')}_swatch.webp`;
      const outputPath = path.join(CONFIG.workspaceRoot, outputFilename);
      
      console.log(`  → Resizing to ${CONFIG.imageWidth}px and converting to .webp...`);
      resizeAndConvert(downloadedFile, outputPath);
      console.log(`  ✓ Created: ${outputFilename}`);
      
      // Upload
      console.log(`  → Uploading to WordPress...`);
      const result = uploadToWordPress(outputPath, row.sku, env, site);
      console.log(`  ✓ Uploaded! Attachment ID: ${result.attachmentId}`);
      console.log(`  ✓ URL: ${result.url}`);
      
      // Clean up
      fs.unlinkSync(outputPath);
      
      log.processed.push({
        sku: row.sku,
        product: row.product_name,
        variant: row.variant_value,
        file: outputFilename,
        attachmentId: result.attachmentId,
        url: result.url
      });
      
      processed++;
      if (limit && processed >= limit) {
        console.log(`\n⚠️  Reached limit of ${limit} uploads. Stopping.`);
        break;
      }
      
    } catch (error) {
      console.error(`  ✗ FAILED:`, error.message);
      log.failed.push({
        sku: row.sku,
        product: row.product_name,
        variant: row.variant_value,
        error: error.message
      });
    }
  }
  
  // Save log
  const logPath = path.join(CONFIG.workspaceRoot, `swatch_log_${site}_${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  
  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log(`  ✓ Processed & uploaded: ${log.processed.length}`);
  console.log(`  ⊘ Skipped (invalid):    ${log.skipped.length}`);
  console.log(`  ⚠️  Files not found:     ${log.notFound.length}`);
  console.log(`  ✗ Failed:               ${log.failed.length}`);
  console.log(`\n📝 Log: ${path.basename(logPath)}`);
  
  // Missing files report
  if (log.notFound.length > 0) {
    const reportPath = path.join(CONFIG.workspaceRoot, `missing_files_${site}.txt`);
    const report = log.notFound.map(item => 
      `${item.product} | ${item.variant} | Variant: ${item.variantCode} | Folder: ${item.sharepointFolder} | SKU: ${item.sku}`
    ).join('\n');
    
    fs.writeFileSync(reportPath, report);
    
    console.log(`\n⚠️  ${log.notFound.length} swatches need SharePoint download`);
    console.log(`📄 List saved to: ${path.basename(reportPath)}\n`);
    console.log(`Next: Download these files from SharePoint using the browser automation.`);
  }
  
  return log;
}

function cmdApply(env, site) {
  console.log(`\n🎯 Applying swatch assignments for ${site}...\n`);
  
  const output = runWPCommand('wp mk-attr swatch_missing_candidates --apply 2>&1', env, site);
  
  console.log(output);
  
  // Extract success message
  const successMatch = output.match(/Applied (\d+) swatch.*?(\d+) product/);
  if (successMatch) {
    console.log(`\n✅ Success: ${successMatch[1]} swatches assigned to ${successMatch[2]} products\n`);
  }
}

function cmdFull(env, site, limit) {
  console.log('\n🚀 Full Pipeline: Scan → Process → Apply\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Step 1: Scan
  cmdScan(env, site);
  
  // Step 2: Process
  const log = cmdProcess(env, site, limit);
  
  // Step 3: Apply (only if we processed something)
  if (log.processed.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    cmdApply(env, site);
  } else {
    console.log('\n⚠️  No swatches were uploaded. Skipping --apply.\n');
  }
}

function showHelp() {
  console.log(`
🎨 Sandnes Garn Swatch Sync

USAGE:
  ./swatch-sync.js <command> [options]

COMMANDS:
  --scan      Get missing swatches CSV from WordPress
  --process   Process downloaded files (resize, convert, upload)
  --apply     Assign uploaded swatches to variants
  --full      Run complete pipeline (scan → process → apply)

OPTIONS:
  --prod         Target production (motherknitter.com) [default]
  --wholesale    Target wholesale site
  --limit=N      Process max N swatches (for testing)

EXAMPLES:
  # Scan production for missing swatches
  ./swatch-sync.js --scan --prod

  # Process first 5 downloaded swatches
  ./swatch-sync.js --process --prod --limit=5
  
  # Assign all uploaded swatches
  ./swatch-sync.js --apply --prod
  
  # Full pipeline (scan, process, apply)
  ./swatch-sync.js --full --prod

WORKFLOW:
  1. Run --scan to get missing swatches list
  2. Download missing files from SharePoint (manual/LLM-assisted)
  3. Run --process to upload downloaded files
  4. Run --apply to assign swatches to variants

  OR use --full to combine scan + process + apply

NOTES:
  - Files must be in ~/Downloads with pattern: *[variant-code]*Close-up.jpg
  - Output filename MUST contain full SKU for WordPress matching
  - Skips products not in SharePoint mapping
  - Credentials in .env (PROD_WP_USER, PROD_WP_APP_PASSWORD)
`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  const site = args.includes('--wholesale') ? 'wholesale' : 'prod';
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  
  const env = loadEnv();
  
  if (args.includes('--scan')) {
    cmdScan(env, site);
  } else if (args.includes('--process')) {
    cmdProcess(env, site, limit);
  } else if (args.includes('--apply')) {
    cmdApply(env, site);
  } else if (args.includes('--full')) {
    cmdFull(env, site, limit);
  } else {
    console.error('❌ Unknown command. Use --help for usage.\n');
    process.exit(1);
  }
}

main();
