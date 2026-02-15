#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TMP_DIR = '/tmp/openclaw/downloads';
const DEFAULT_COOKIE_FILE = '/tmp/openclaw/jobs/cookie-header.txt';

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

function runBin(bin, args, options = {}) {
  return execFileSync(bin, args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options
  });
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Cleanup should not crash the run.
  }
}

function cleanValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

function requiredEnv(name) {
  const value = cleanValue(process.env[name]);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getSiteConfig(siteName) {
  const site = CONFIG[siteName];
  if (!site) throw new Error(`Unknown site "${siteName}". Use "wholesale" or "prod".`);
  return {
    key: requiredEnv(site.key),
    user: requiredEnv(site.user),
    host: requiredEnv(site.host),
    root: requiredEnv(site.root),
    csv: site.csv
  };
}

function readCookieHeader() {
  const cookieFile = cleanValue(process.env.SWATCH_COOKIE_FILE) || DEFAULT_COOKIE_FILE;
  if (!fs.existsSync(cookieFile)) {
    throw new Error(`Cookie file not found: ${cookieFile}. Set SWATCH_COOKIE_FILE or create the default cookie header file.`);
  }
  const cookie = fs.readFileSync(cookieFile, 'utf-8').trim();
  if (!cookie) throw new Error(`Cookie file is empty: ${cookieFile}`);
  return cookie;
}

function parseCsvLine(line) {
  const result = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
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
  return result.map((v) => v.trim());
}

function parse(csv) {
  const lines = fs
    .readFileSync(csv, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const parsed = lines.map(parseCsvLine);
  const headerIdx = parsed.findIndex((cols) => {
    const c = cols.map((x) => x.toLowerCase());
    return c.includes('product_name') && c.includes('variation_id') && c.includes('variant_label');
  });

  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
  const headers = headerIdx >= 0 ? parsed[headerIdx].map((h) => h.toLowerCase()) : [];
  const idx = (name, fallback) => {
    const found = headers.indexOf(name);
    return found >= 0 ? found : fallback;
  };
  const productIdx = idx('product_name', 1);
  const vidIdx = idx('variation_id', 2);
  const skuIdx = idx('sku', 3);
  const variantIdx = idx('variant_label', 6);

  return parsed
    .slice(startIdx)
    .map((cols) => ({
      sku: cols[skuIdx] || '',
      product: cols[productIdx] || '',
      variant: cols[variantIdx] || '',
      vid: cols[vidIdx] || ''
    }))
    .filter((r) => r.sku && r.vid && r.product && r.variant);
}

function url(product, subfolder, filename) {
  const base = "https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettsite%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29";
  const p = encodeURIComponent(product);
  const f = encodeURIComponent(filename);
  return subfolder ? `${base}/${p}/${encodeURIComponent(subfolder)}/${f}` : `${base}/${p}/${f}`;
}

function colorName(variant) {
  const m = variant.match(/^\d+\s+(.+)$/);
  return (m ? m[1] : variant).toLowerCase().replace(/\s+/g, '-');
}

function patterns(color) {
  const words = color.split('-');
  return [
    color,                                              // mint-green
    color.charAt(0).toUpperCase() + color.slice(1),     // Mint-green
    color.replace(/-/g, '_'),                           // mint_green
    color.replace(/-/g, ''),                            // mintgreen
    (color.charAt(0).toUpperCase() + color.slice(1)).replace(/-/g, ''),  // Mintgreen / Rainforest
    words[0].charAt(0).toUpperCase() + words[0].slice(1)  // Mint (first word only)
  ];
}

function processRow(row, cfg, cookie, tempFiles, dryRun) {
  const product = PRODUCTS[row.product];
  if (!product) return { skip: true };

  const subfolder = SUBFOLDERS[product] || "Nøstebilder";
  const color = colorName(row.variant);

  for (const p of patterns(color)) {
    const file = `${row.sku}_${p}_300dpi_Close-up.jpg`;
    const u = url(product, subfolder, file);
    const out = path.join(TMP_DIR, file);

    try {
      runBin('curl', ['-f', '-s', '-m', '10', '-H', `Cookie: ${cookie}`, u, '-o', out]);
      tempFiles.add(out);
      if (fs.statSync(out).size === 0) { safeUnlink(out); tempFiles.delete(out); continue; }

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

      const remote = `/tmp/${row.sku}_${Date.now()}.webp`;
      runBin('scp', ['-i', cfg.key, swatch, `${cfg.user}@${cfg.host}:${remote}`]);
      const wpCmd = `cd ${cfg.root} && wp media import ${remote} --porcelain && rm ${remote}`;
      const aid = runBin('ssh', ['-i', cfg.key, `${cfg.user}@${cfg.host}`, wpCmd]).trim().split('\n').pop();
      safeUnlink(swatch);
      tempFiles.delete(swatch);

      return { success: true, aid, file };
    } catch (error) {
      // curl -f uses exit code 22 for HTTP errors; keep trying patterns in that case.
      if (error && error.status !== 22) {
        const msg = (error.stderr || error.message || '').toString().trim();
        console.error(`  [warn] ${file}: ${msg || 'command failed'}`);
      }
      safeUnlink(out);
      tempFiles.delete(out);
    }
  }

  return { notfound: true };
}

function parseArgs(argv) {
  const args = (argv || process.argv).slice(2);
  const dryRun = args.includes('--dry-run');
  const siteName = (args.filter((a) => a !== '--dry-run')[0] || 'wholesale').toLowerCase();
  return { dryRun, siteName };
}

function main() {
  const { dryRun, siteName } = parseArgs(process.argv);
  const cfg = getSiteConfig(siteName);
  const cookie = readCookieHeader();
  const tempFiles = new Set();
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const rows = parse(cfg.csv);
  const results = { success: [], notfound: [], skip: [] };

  if (dryRun) {
    console.log('\n[DRY RUN] No uploads or SSH; downloads and local processing only.\n');
  }
  console.log(`\nProcessing ${rows.length} SKUs on ${siteName}...\n`);

  try {
    for (const row of rows) {
      process.stdout.write(`[${row.sku}] `);
      const r = processRow(row, cfg, cookie, tempFiles, dryRun);

      if (r.success) {
        console.log(dryRun ? `OK (would upload) ${r.file}` : `OK ${r.file} -> ID ${r.aid}`);
        results.success.push(row);
      } else if (r.skip) {
        console.log('skip');
        results.skip.push(row);
      } else {
        console.log('not found');
        results.notfound.push(row);
      }
    }

    console.log(`\nOK ${results.success.length} | not found ${results.notfound.length} | skip ${results.skip.length}\n`);

    if (results.success.length > 0 && !dryRun) {
      runBin('ssh', ['-i', cfg.key, `${cfg.user}@${cfg.host}`, `cd ${cfg.root} && wp mk-attr swatch_missing_candidates --apply`]);
      console.log(`OK ${results.success.length} assigned\n`);
    } else if (results.success.length > 0 && dryRun) {
      console.log(`[DRY RUN] Would have uploaded ${results.success.length} and run --apply.\n`);
    }
  } finally {
    for (const file of tempFiles) {
      safeUnlink(file);
    }
  }
}

module.exports = {
  cleanValue,
  parseCsvLine,
  parse,
  colorName,
  patterns,
  getSiteConfig,
  readCookieHeader,
  parseArgs
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[fatal] ${error.message}`);
    process.exit(1);
  }
}
