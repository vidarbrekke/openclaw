#!/usr/bin/env node
/**
 * Sandnes Garn Swatch Automation - Working Cookie + CURL Method
 * Based on Feb 14 successful downloads
 */
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TMP_DIR = '/tmp/openclaw/downloads';
const COOKIE_FILE = '/tmp/openclaw/jobs/cookie-header.txt';
const COOKIE_JSON = '/tmp/openclaw/jobs/cookies.json';
const AUTH_URL = 'https://sandnesgarn.sharepoint.com/:f:/s/SandnesGarn/Epxn98W7Lk1LussIYXVmeu0BvGLyiVc-5watfaL4mYjcLg?e=1McFU3';

const CONFIG = {
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

const PRODUCTS = {
  "Sandnes Garn Tynn Silk Mohair": "Tynn Silk Mohair",
  "Alpakka Følgetråd (lace weight)": "Alpakka Følgetråd",
  "Børstet (Brushed) Alpakka": "Børstet Alpakka",
  "Double Sunday": "Double Sunday",
  "Peer Gynt": "Peer Gynt",
  "Sandnes Garn | SUNDAY": "Double Sunday",
  "Sandnes Garn x PetiteKnit DOUBLE SUNDAY": "Double Sunday (PetiteKnit)",
  "Tynn Line": "Line",
  "Tynn Peer Gynt [Fingering weight, 100% Norwegian Wool non-superwash]": "Peer Gynt",
  "Sandnes Garn POPPY": "POPPY",
  "Sandnes Garn BALLERINA CHUNKY MOHAIR": "Ballerina Chunky Mohair"
};

const SUBFOLDERS = { "Alpakka Følgetråd": "Nøstebilder (skein pictures)" };

// Step 1: Fresh Authentication
function freshAuthenticate() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('STEP 1: Fresh SharePoint Authentication');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Stop any existing browser
  try { execSync('openclaw browser stop', { stdio: 'ignore' }); } catch {}
  
  // Start browser
  execSync('openclaw browser start --browser-profile openclaw', { stdio: 'inherit' });
  console.log('Browser started\n');
  
  // Open the auth URL
  console.log('Opening SharePoint auth folder...');
  const openResult = execSync(`openclaw browser open "${AUTH_URL}" --browser-profile openclaw --json`, { encoding: 'utf-8' });
  const { targetId } = JSON.parse(openResult);
  console.log(`Tab opened: ${targetId}`);
  
  // Wait for user interaction
  console.log('\n⚠️ IMPORTANT: Make sure you are signed in to SharePoint!');
  console.log('   Wait 10 seconds for auth to complete...\n');
  execSync('sleep 10');
  
  // Export fresh cookies
  console.log('Exporting fresh cookies...');
  execSync(`openclaw browser cookies --browser-profile openclaw --target-id ${targetId} --json > ${COOKIE_JSON}`, { encoding: 'utf-8' });
  
  // Convert to header
  const cookieScript = path.resolve(__dirname, '../../scripts/openclaw-cookie-header-from-json.sh');
  execSync(`${cookieScript} --input ${COOKIE_JSON} --domain sharepoint.com --raw > ${COOKIE_FILE}`);
  
  // Verify
  const cookieSize = fs.statSync(COOKIE_FILE).size;
  const hasFedAuth = fs.readFileSync(COOKIE_FILE, 'utf-8').includes('FedAuth=');
  
  console.log(`\n✅ Fresh cookies exported:`);
  console.log(`   Size: ${cookieSize} bytes`);
  console.log(`   FedAuth: ${hasFedAuth ? '✓ present' : '✗ MISSING'}`);
  
  return hasFedAuth;
}

// Step 2: Download via curl + cookies (working Feb 14 method)
function downloadWithCurl(url, outputPath, cookieFile) {
  try {
    const cookie = fs.readFileSync(cookieFile, 'utf-8');
    // Use -L for redirects, -f to fail on server errors, timeout 30s
    execSync(`curl -f -s -L -m 30 -H "Cookie: ${cookie}" "${url}" -o "${outputPath}"`, { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Check if we got a real image (not HTML error page)
    if (!fs.existsSync(outputPath)) return false;
    const size = fs.statSync(outputPath).size;
    
    // Must be >1KB (images are 500KB-800KB, error pages are tiny)
    return size > 1000;
  } catch (e) {
    return false;
  }
}

// Color name patterns (for filename guessing)
function patterns(color) {
  const words = color.split('-');
  return [
    color,
    color.charAt(0).toUpperCase() + color.slice(1),
    color.replace(/-/g, '_'),
    color.replace(/-/g, ''),
    (color.charAt(0).toUpperCase() + color.slice(1)).replace(/-/g, ''),
    words[0].charAt(0).toUpperCase() + words[0].slice(1)
  ];
}

function url(product, subfolder, filename) {
  const base = "https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettside%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29";
  return subfolder 
    ? `${base}/${encodeURIComponent(product)}/${encodeURIComponent(subfolder)}/${encodeURIComponent(filename)}`
    : `${base}/${encodeURIComponent(product)}/${encodeURIComponent(filename)}`;
}

function colorName(variant) {
  const m = variant.match(/^\d+\s+(.+)$/);
  return (m ? m[1] : variant).toLowerCase().replace(/\s+/g, '-');
}

function runBin(bin, args, options = {}) {
  return execFileSync(bin, args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
}

function safeUnlink(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

function parseCsvLine(line) {
  const result = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') { field += '"'; i++; continue; }
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(field); field = ''; continue; }
    field += char;
  }
  result.push(field);
  return result.map(v => v.trim());
}

function parse(csv) {
  const lines = fs.readFileSync(csv, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const parsed = lines.map(parseCsvLine);
  const headerIdx = parsed.findIndex(cols => {
    const c = cols.map(x => x.toLowerCase());
    return c.includes('product_name') && c.includes('variation_id') && (c.includes('variant_label') || c.includes('variant_value'));
  });
  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
  const headers = headerIdx >= 0 ? parsed[headerIdx].map(h => h.toLowerCase()) : [];
  const idx = (name, fallback) => { const f = headers.indexOf(name); return f >= 0 ? f : fallback; };
  const productIdx = idx('product_name', 1);
  const vidIdx = idx('variation_id', 2);
  const skuIdx = idx('sku', 3);
  const variantIdx = idx('variant_label', idx('variant_value', 6));
  return parsed.slice(startIdx).map(cols => ({
    sku: cols[skuIdx] || '',
    product: cols[productIdx] || '',
    variant: cols[variantIdx] || '',
    vid: cols[vidIdx] || ''
  })).filter(r => r.sku && r.vid && r.product && r.variant);
}

function getSiteConfig(siteName) {
  const site = CONFIG[siteName];
  if (!site) throw new Error(`Unknown site "${siteName}"`);
  return {
    key: process.env[site.key] || '',
    user: process.env[site.user] || '',
    host: process.env[site.host] || '',
    root: process.env[site.root] || '',
    csv: site.csv
  };
}

function processRow(row, cfg, tempFiles, dryRun) {
  const product = PRODUCTS[row.product];
  if (!product) return { skip: true, reason: 'no product mapping' };
  
  const subfolder = SUBFOLDERS[product] || "Nøstebilder";
  const color = colorName(row.variant);
  
  for (const p of patterns(color)) {
    const file = `${row.sku}_${p}_300dpi_Close-up.jpg`;
    const u = url(product, subfolder, file);
    const out = path.join(TMP_DIR, file);
    
    // Try download with curl + fresh cookies
    const success = downloadWithCurl(u, out, COOKIE_FILE);
    
    if (!success) {
      safeUnlink(out);
      continue;
    }
    
    tempFiles.add(out);
    
    try {
      // Resize and convert
      const swatch = path.join(TMP_DIR, `${row.sku}_${Date.now()}.webp`);
      runBin('magick', [out, '-resize', '80x', '-quality', '90', swatch]);
      tempFiles.add(swatch);
      safeUnlink(out);
      tempFiles.delete(out);
      
      if (dryRun) {
        safeUnlink(swatch);
        tempFiles.delete(swatch);
        return { success: true, aid: '(dry-run)', file };
      }
      
      // Upload to server
      const remote = `/tmp/${row.sku}_${Date.now()}.webp`;
      runBin('scp', ['-i', cfg.key, swatch, `${cfg.user}@${cfg.host}:${remote}`]);
      const wpCmd = `cd ${cfg.root} && wp media import ${remote} --porcelain && rm ${remote}`;
      const aid = runBin('ssh', ['-i', cfg.key, `${cfg.user}@${cfg.host}`, wpCmd]).trim().split('\n').pop();
      safeUnlink(swatch);
      tempFiles.delete(swatch);
      
      return { success: true, aid, file };
    } catch (error) {
      safeUnlink(out);
      tempFiles.delete(out);
    }
  }
  
  return { notfound: true, reason: 'no color pattern matched' };
}

function parseArgs(argv) {
  const args = (argv || process.argv).slice(2);
  const dryRun = args.includes('--dry-run');
  const skipAuth = args.includes('--skip-auth');
  const siteName = (args.filter(a => a !== '--dry-run' && a !== '--skip-auth')[0] || 'wholesale').toLowerCase();
  return { dryRun, skipAuth, siteName };
}

// Main
function main() {
  const { dryRun, skipAuth, siteName } = parseArgs(process.argv);
  const cfg = getSiteConfig(siteName);
  const tempFiles = new Set();
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const rows = parse(cfg.csv);
  const results = { success: [], notfound: [], skip: [] };
  
  if (dryRun) {
    console.log('\n[DRY RUN] Downloads only, no uploads.\n');
  }
  
  // Step 1: Fresh auth unless skipped
  if (!skipAuth) {
    const authOk = freshAuthenticate();
    if (!authOk) {
      console.error('\n❌ Authentication failed');
      process.exit(1);
    }
  } else {
    console.log('\nUsing existing cookies (--skip-auth)\n');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`STEP 2: Processing ${rows.length} SKUs via curl + cookies`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    for (const row of rows) {
      process.stdout.write(`[${row.sku}] `);
      const r = processRow(row, cfg, tempFiles, dryRun);
      
      if (r.success) {
        console.log(dryRun ? `OK (dry-run) ${r.file}` : `OK ${r.file} -> ID ${r.aid}`);
        results.success.push(row);
      } else if (r.skip) {
        console.log(`skip (${r.reason})`);
        results.skip.push(row);
      } else {
        console.log(`not found (${r.reason})`);
        results.notfound.push(row);
      }
    }
    
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`Results: OK ${results.success.length} | Not Found ${results.notfound.length} | Skip ${results.skip.length}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);
    
    if (results.success.length > 0 && !dryRun) {
      console.log('Applying swatch assignments...');
      runBin('ssh', ['-i', cfg.key, `${cfg.user}@${cfg.host}`, `cd ${cfg.root} && wp mk-attr swatch_missing_candidates --apply`]);
      console.log(`✓ ${results.success.length} swatches assigned\n`);
    }
  } finally {
    for (const file of tempFiles) safeUnlink(file);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[fatal] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { parse, parseCsvLine, patterns };
