#!/usr/bin/env node
/**
 * Sandnes Garn Swatch Automation - Bulletproof Edition v1.1.0
 * 
 * Features:
 * - Config-driven product mappings (config/products.json)
 * - Multiple subfolder variations support
 * - Robust error handling with detailed logging
 * - Strict validation at every step
 * - Graceful degradation (skip on errors, continue processing)
 * 
 * Safety:
 * - Never modify this file directly on main branch
 * - Always run `npm test` before production
 * - Changes go through: branch → test → review → merge → tag
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const ROOT_DIR = path.resolve(__dirname, '..');
const TMP_DIR = '/tmp/openclaw/downloads';
const COOKIE_FILE = '/tmp/openclaw/jobs/cookie-header.txt';
const COOKIE_JSON = '/tmp/openclaw/jobs/cookies.json';

// Load configuration
let CONFIG_DATA;
try {
  CONFIG_DATA = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'config', 'products.json'), 'utf-8'));
} catch (e) {
  console.error('[FATAL] Cannot load config/products.json:', e.message);
  process.exit(1);
}

const AUTH_URL = CONFIG_DATA.sharepoint.authUrl;
const SHAREPOINT_BASE = CONFIG_DATA.sharepoint.baseUrl;

// Site configurations
const SITE_CONFIG = {
  wholesale: {
    key: 'WHOLESALE_SSH_KEY_PATH',
    user: 'WHOLESALE_SSH_USER',
    host: 'WHOLESALE_SSH_HOST',
    root: 'WHOLESALE_WP_ROOT',
    csv: path.join(ROOT_DIR, 'data', 'missing_swatches_wholesale.csv')
  },
  prod: {
    key: 'PROD_SSH_KEY_PATH',
    user: 'PROD_SSH_USER',
    host: 'PROD_SSH_HOST',
    root: 'PROD_WP_ROOT',
    csv: path.join(ROOT_DIR, 'data', 'missing_swatches_prod.csv')
  }
};

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
let currentLogLevel = LOG_LEVELS.DEBUG;

function log(level, message, data) {
  if (level > currentLogLevel) return;
  
  const prefix = Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === level) || 'INFO';
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  
  if (data) {
    console.log(`[${timestamp}] [${prefix}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [${prefix}] ${message}`);
  }
}

function logError(message, error) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`[${timestamp}] [ERROR] ${message}`, error ? error.message || error : '');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function safeUnlink(filePath) {
  try { 
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (e) { 
    log(LOG_LEVELS.WARN, `Failed to unlink ${filePath}: ${e.message}`);
  }
  return false;
}

function runBin(bin, args, options = {}) {
  try {
    return execFileSync(bin, args, { 
      encoding: 'utf-8', 
      stdio: ['pipe', 'pipe', 'pipe'], 
      timeout: options.timeout || 30000,
      ...options 
    });
  } catch (e) {
    // Re-throw with better message
    throw new Error(`${bin} failed: ${e.message || e}`);
  }
}

function parseCsvLine(line) {
  const result = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    
    if (char === '"' && inQuotes && next === '"') { 
      field += '"'; 
      i++; 
      continue; 
    }
    if (char === '"') { 
      inQuotes = !inQuotes; 
      continue; 
    }
    if (char === ',' && !inQuotes) { 
      result.push(field); 
      field = ''; 
      continue; 
    }
    field += char;
  }
  result.push(field);
  return result.map(v => v.trim());
}

function parseCsv(csvPath) {
  try {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    
    if (!lines.length) {
      log(LOG_LEVELS.WARN, `CSV file empty: ${csvPath}`);
      return [];
    }
    
    const parsed = lines.map(parseCsvLine);
    const headerIdx = parsed.findIndex(cols => {
      const c = cols.map(x => x.toLowerCase());
      return c.includes('product_name') && c.includes('variation_id') && 
             (c.includes('variant_label') || c.includes('variant_value'));
    });
    
    const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
    const headers = headerIdx >= 0 ? parsed[headerIdx].map(h => h.toLowerCase()) : [];
    
    const getIdx = (name, fallback) => { 
      const f = headers.indexOf(name); 
      return f >= 0 ? f : fallback; 
    };
    
    const productIdx = getIdx('product_name', 1);
    const vidIdx = getIdx('variation_id', 2);
    const skuIdx = getIdx('sku', 3);
    const variantIdx = getIdx('variant_label', getIdx('variant_value', 6));
    
    return parsed.slice(startIdx).map(cols => ({
      sku: cols[skuIdx] || '',
      product: cols[productIdx] || '',
      variant: cols[variantIdx] || '',
      vid: cols[vidIdx] || ''
    })).filter(r => r.sku && r.product && r.variant);
    
  } catch (e) {
    logError(`Failed to parse CSV ${csvPath}`, e);
    return [];
  }
}

// ============================================================================
// SHAREPOINT & DOWNLOAD FUNCTIONS
// ============================================================================

function freshAuthenticate() {
  log(LOG_LEVELS.INFO, 'Starting fresh authentication...');
  
  // Stop any existing browser
  try { execSync('openclaw browser stop', { stdio: 'ignore' }); } 
  catch { /* ignore */ }
  
  // Start browser
  log(LOG_LEVELS.INFO, 'Starting OpenClaw browser...');
  execSync('openclaw browser start --browser-profile openclaw', { stdio: 'inherit' });
  
  // Open auth URL
  log(LOG_LEVELS.INFO, `Opening SharePoint auth URL: ${AUTH_URL.split('?')[0]}...`);
  const openResult = execSync(`openclaw browser open "${AUTH_URL}" --browser-profile openclaw --json`, { 
    encoding: 'utf-8' 
  });
  const { targetId } = JSON.parse(openResult);
  
  // Wait for auth
  log(LOG_LEVELS.INFO, 'Waiting 10 seconds for authentication...');
  execSync('sleep 10');
  
  // Export cookies
  log(LOG_LEVELS.INFO, 'Exporting cookies...');
  execSync(`openclaw browser cookies --browser-profile openclaw --target-id ${targetId} --json > ${COOKIE_JSON}`, 
    { encoding: 'utf-8' });
  
  // Convert to header format
  const cookieScript = path.resolve(__dirname, '../../scripts/openclaw-cookie-header-from-json.sh');
  execSync(`${cookieScript} --input ${COOKIE_JSON} --domain sharepoint.com --raw > ${COOKIE_FILE}`);
  
  // Verify
  if (!fs.existsSync(COOKIE_FILE)) {
    throw new Error('Cookie file creation failed');
  }
  
  const cookieSize = fs.statSync(COOKIE_FILE).size;
  const hasFedAuth = fs.readFileSync(COOKIE_FILE, 'utf-8').toLowerCase().includes('fedauth=');
  
  log(LOG_LEVELS.INFO, `Cookie export: ${cookieSize} bytes, FedAuth: ${hasFedAuth ? 'present' : 'MISSING'}`);
  
  if (!hasFedAuth) {
    throw new Error('FedAuth token not found in cookies - authentication may have failed');
  }
  
  return true;
}

function downloadWithCurl(url, outputPath, cookieFile) {
  try {
    if (!fs.existsSync(cookieFile)) {
      logError('Cookie file not found', new Error(cookieFile));
      return false;
    }
    
    const cookie = fs.readFileSync(cookieFile, 'utf-8');
    const cmd = `curl -f -s -L -m 30 -H "Cookie: ${cookie}" "${url}" -o "${outputPath}"`;
    
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 35000 });
    
    if (!fs.existsSync(outputPath)) {
      log(LOG_LEVELS.DEBUG, `Download failed: file not created`);
      return false;
    }
    
    const size = fs.statSync(outputPath).size;
    if (size < CONFIG_DATA.processing.minFileSize) {
      // Likely HTML error page
      const preview = fs.readFileSync(outputPath, 'utf-8').slice(0, 100);
      log(LOG_LEVELS.WARN, `Downloaded file too small (${size} bytes), likely error page: ${preview}...`);
      safeUnlink(outputPath);
      return false;
    }
    
    // Validate it's an image
    const header = fs.readFileSync(outputPath).slice(0, 4);
    const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
    const isPNG = header.toString('ascii', 0, 4) === '\x89PNG';
    
    if (!isJPEG && !isPNG) {
      log(LOG_LEVELS.WARN, `File is not a valid image (header: ${header.toString('hex')})`);
      safeUnlink(outputPath);
      return false;
    }
    
    return true;
    
  } catch (e) {
    log(LOG_LEVELS.DEBUG, `Download error: ${e.message}`);
    safeUnlink(outputPath);
    return false;
  }
}

function buildUrl(product, subfolder, filename) {
  return subfolder 
    ? `${SHAREPOINT_BASE}/${encodeURIComponent(product)}/${encodeURIComponent(subfolder)}/${encodeURIComponent(filename)}`
    : `${SHAREPOINT_BASE}/${encodeURIComponent(product)}/${encodeURIComponent(filename)}`;
}

function colorName(variant) {
  const m = variant.match(/^\d+\s+(.+)$/);
  return (m ? m[1] : variant).toLowerCase().replace(/\s+/g, '-');
}

// ============================================================================
// COLOR PATTERN GENERATION
// ============================================================================

function generateColorPatterns(color) {
  const words = color.split('-');
  const patterns = new Set();
  
  // Basic variations
  patterns.add(color);  // rustic-rose
  patterns.add(color.charAt(0).toUpperCase() + color.slice(1));  // Rustic-rose
  patterns.add(words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-'));  // Rustic-Rose
  patterns.add(words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(''));  // RusticRose
  patterns.add(color.replace(/-/g, '_'));  // rustic_rose
  patterns.add(color.replace(/-/g, ''));  // rusticrose
  patterns.add(words[0].charAt(0).toUpperCase() + words[0].slice(1));  // Rustic
  
  // Special cases
  if (color.includes('-')) {
    patterns.add(color.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(''));  // RusticRose
  }
  
  return Array.from(patterns);
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

function getProductConfig(productName) {
  // Direct lookup
  if (CONFIG_DATA.products[productName]) {
    return CONFIG_DATA.products[productName];
  }
  
  // Try case-insensitive
  const lowerName = productName.toLowerCase();
  for (const [key, config] of Object.entries(CONFIG_DATA.products)) {
    if (key.toLowerCase() === lowerName) {
      return config;
    }
  }
  
  return null;
}

function processRow(row, cfg, tempFiles, options = {}) {
  const { dryRun = false, verbose = false } = options;
  
  // Get product config
  const productConfig = getProductConfig(row.product);
  if (!productConfig) {
    log(LOG_LEVELS.DEBUG, `[${row.sku}] No product mapping for: ${row.product}`);
    return { skip: true, reason: 'no product mapping', product: row.product };
  }
  
  const sharepointFolder = productConfig.sharepointFolder;
  const subfolderVariations = productConfig.subfolderVariations || ['Nøstebilder'];
  const color = colorName(row.variant);
  const colorPatterns = generateColorPatterns(color);
  
  if (verbose) {
    log(LOG_LEVELS.DEBUG, `[${row.sku}] Product: ${sharepointFolder}, Color: ${color}, Patterns: ${colorPatterns.length}, Subfolders: ${subfolderVariations.length}`);
  }
  
  // Try each subfolder × color pattern combination
  let attempts = 0;
  for (const subfolder of subfolderVariations) {
    for (const colorPattern of colorPatterns) {
      attempts++;
      
      const filename = `${row.sku}_${colorPattern}_300dpi_Close-up.jpg`;
      const url = buildUrl(sharepointFolder, subfolder, filename);
      const outPath = path.join(TMP_DIR, filename);
      
      if (verbose && attempts <= 5) {
        log(LOG_LEVELS.DEBUG, `  Trying [${subfolder}/${filename}]`);
      }
      
      // Download
      if (!downloadWithCurl(url, outPath, COOKIE_FILE)) {
        continue;
      }
      
      // Success - got the image
      const fileSize = fs.statSync(outPath).size;
      log(LOG_LEVELS.INFO, `[${row.sku}] ✓ Found: ${filename} (${Math.round(fileSize/1024)} KB) in [${subfolder}]`);
      
      tempFiles.add(outPath);
      
      try {
        // Process image
        const swatchPath = path.join(TMP_DIR, `${row.sku}_${Date.now()}.webp`);
        runBin('magick', [outPath, '-resize', '80x', '-quality', '90', swatchPath]);
        
        if (!fs.existsSync(swatchPath)) {
          throw new Error('ImageMagick failed to create output');
        }
        
        const webpSize = fs.statSync(swatchPath).size;
        tempFiles.add(swatchPath);
        safeUnlink(outPath);
        tempFiles.delete(outPath);
        
        log(LOG_LEVELS.INFO, `[${row.sku}] ✓ Processed: ${Math.round(webpSize/1024)} KB WebP`);
        
        if (dryRun) {
          // Cleanup and return success (no upload)
          safeUnlink(swatchPath);
          tempFiles.delete(swatchPath);
          return { 
            success: true, 
            dryRun: true, 
            filename, 
            subfolder, 
            attempts,
            sourceSize: fileSize,
            outputSize: webpSize
          };
        }
        
        // Upload
        const remotePath = `/tmp/${row.sku}_${Date.now()}.webp`;
        runBin('scp', ['-i', cfg.key, swatchPath, `${cfg.user}@${cfg.host}:${remotePath}`]);
        
        const wpCmd = `cd ${cfg.root} && wp media import ${remotePath} --porcelain && rm ${remotePath}`;
        const wpOutput = runBin('ssh', ['-i', cfg.key, `${cfg.user}@${cfg.host}`, wpCmd]);
        const attachmentId = wpOutput.trim().split('\n').pop();
        
        // Cleanup
        safeUnlink(swatchPath);
        tempFiles.delete(swatchPath);
        
        log(LOG_LEVELS.INFO, `[${row.sku}] ✓ Uploaded: Attachment ID ${attachmentId}`);
        
        return { 
          success: true, 
          attachmentId, 
          filename, 
          subfolder,
          attempts,
          sourceSize: fileSize,
          outputSize: webpSize
        };
        
      } catch (error) {
        logError(`[${row.sku}] Processing/upload failed`, error);
        safeUnlink(outPath);
        tempFiles.delete(outPath);
        // Continue to next pattern instead of failing entirely
        continue;
      }
    }
  }
  
  // Exhausted all patterns
  return { 
    notfound: true, 
    attempts,
    sku: row.sku,
    product: sharepointFolder,
    color,
    patternsTried: colorPatterns.length,
    subfoldersTried: subfolderVariations.length
  };
}

// ============================================================================
// CLI & MAIN
// ============================================================================

function parseArgs(argv) {
  const args = (argv || process.argv).slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    skipAuth: args.includes('--skip-auth'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    force: args.includes('--force'),
    siteName: args.find(a => !a.startsWith('-')) || 'wholesale'
  };
}

function getSiteConfig(siteName) {
  const site = SITE_CONFIG[siteName];
  if (!site) throw new Error(`Unknown site "${siteName}". Use "wholesale" or "prod".`);
  
  const config = {};
  for (const [key, envVar] of Object.entries(site)) {
    if (key === 'csv') {
      config[key] = envVar;
      continue;
    }
    const value = process.env[envVar];
    if (!value) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
    config[key] = value;
  }
  return config;
}

function main() {
  const args = parseArgs();
  const { dryRun, skipAuth, verbose, force, siteName } = args;
  
  // Validate environment
  let cfg;
  try {
    cfg = getSiteConfig(siteName);
  } catch (e) {
    logError('Configuration error', e);
    process.exit(1);
  }
  
  // Check CSV exists
  if (!fs.existsSync(cfg.csv)) {
    logError(`CSV file not found: ${cfg.csv}`);
    console.error('\nTo generate fresh CSV from WordPress:');
    console.error(`  ssh -i "${cfg.key}" "${cfg.user}@${cfg.host}" "cd ${cfg.root} && wp mk-attr swatch_missing_candidates --format=csv" > ${cfg.csv}`);
    process.exit(1);
  }
  
  // Parse CSV
  const rows = parseCsv(cfg.csv);
  if (!rows.length) {
    logError('No valid rows found in CSV');
    process.exit(1);
  }
  
  log(LOG_LEVELS.INFO, `Loaded ${rows.length} SKUs from ${cfg.csv}`);
  
  // Setup
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const tempFiles = new Set();
  const results = { 
    success: [], 
    notfound: [], 
    skip: [],
    errors: []
  };
  
  // Header
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`Sandnes Garn Swatch Automation v${CONFIG_DATA.version || '1.1.0'}`);
  console.log(`Site: ${siteName} | Dry Run: ${dryRun ? 'YES' : 'NO'}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Authentication
  if (!skipAuth) {
    try {
      freshAuthenticate();
    } catch (e) {
      logError('Authentication failed', e);
      if (!force) {
        console.error('\nUse --force to continue anyway (not recommended)');
        process.exit(1);
      }
    }
  } else {
    if (!fs.existsSync(COOKIE_FILE)) {
      logError('Cookie file not found and --skip-auth specified', new Error(COOKIE_FILE));
      process.exit(1);
    }
    log(LOG_LEVELS.INFO, 'Using existing cookies (--skip-auth)');
  }
  
  // Process rows
  console.log(`Processing ${rows.length} SKUs...\n`);
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;
    
    const result = processRow(row, cfg, tempFiles, { dryRun, verbose });
    
    if (result.success) {
      const suffix = dryRun ? '(dry-run)' : `→ ID ${result.attachmentId}`;
      console.log(`${progress} [${row.sku}] ✓ ${result.filename} ${suffix}`);
      results.success.push({ ...row, ...result });
    } else if (result.skip) {
      if (verbose) {
        console.log(`${progress} [${row.sku}] ⊘ Skip: ${result.reason}`);
      }
      results.skip.push({ ...row, ...result });
    } else if (result.notfound) {
      console.log(`${progress} [${row.sku}] ✗ Not found (${result.attempts} attempts)`);
      results.notfound.push({ ...row, ...result });
    } else {
      console.log(`${progress} [${row.sku}] ⚠ Error: ${result.reason || 'unknown'}`);
      results.errors.push({ ...row, ...result });
    }
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  ✓ Success:     ${results.success.length}`);
  console.log(`  ✗ Not found:   ${results.notfound.length}`);
  console.log(`  ⊘ Skipped:     ${results.skip.length}`);
  if (results.errors.length) {
    console.log(`  ⚠ Errors:      ${results.errors.length}`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  
  // Cleanup
  for (const file of tempFiles) {
    safeUnlink(file);
  }
  
  // Write detailed log
  const logPath = path.join(ROOT_DIR, 'data', `swatch_run_${Date.now()}.json`);
  try {
    fs.writeFileSync(logPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      site: siteName,
      dryRun,
      summary: {
        total: rows.length,
        success: results.success.length,
        notfound: results.notfound.length,
        skip: results.skip.length,
        errors: results.errors.length
      },
      results
    }, null, 2));
    log(LOG_LEVELS.INFO, `\nDetailed log saved: ${logPath}`);
  } catch (e) {
    logError('Failed to write log', e);
  }
  
  // Apply assignments (production only)
  if (!dryRun && results.success.length > 0) {
    console.log('\nApplying swatch assignments to WooCommerce...');
    try {
      const applyCmd = `cd ${cfg.root} && wp mk-attr swatch_missing_candidates --apply`;
      const applyOutput = runBin('ssh', ['-i', cfg.key, `${cfg.user}@${cfg.host}`, applyCmd]);
      console.log(applyOutput);
      console.log(`✓ Assigned ${results.success.length} swatches to product variants`);
    } catch (e) {
      logError('Failed to apply swatch assignments', e);
    }
  }
  
  // Exit code
  const exitCode = results.errors.length > 0 ? 2 : results.success.length > 0 ? 0 : 1;
  process.exit(exitCode);
}

// Run if main module
if (require.main === module) {
  try {
    main();
  } catch (e) {
    logError('Fatal error in main', e);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  parseCsv,
  parseCsvLine,
  generateColorPatterns,
  colorName,
  buildUrl,
  getProductConfig,
  processRow
};