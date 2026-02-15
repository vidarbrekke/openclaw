# Sandnes Garn Swatch Download Workflow

⚠️ **DEPRECATED** - This document is kept for historical reference only.

**Use instead:** `SWATCH_AUTOMATION_MASTER.md` (single source of truth)

---

## Overview

This document describes the complete process for identifying missing product swatches on the Mother Knitter WooCommerce site and downloading the corresponding images from the Sandnes Garn SharePoint archive.

## Task Goal

Find and download missing color variant swatch images by:
1. Identifying which variants are missing swatches on the WooCommerce site
2. Locating the corresponding image files in the Sandnes Garn SharePoint archive
3. Downloading the correct "Close-up" images for each missing variant

---

## Part 1: Identifying Missing Swatches on WooCommerce

### Understanding WooCommerce Swatch Display

**Location:** https://motherknitter.com/category/yarn-brand/sandnes-garn/ (category page)

Each product page shows color variants as circular swatches with hover metadata showing the variant name.

**Two states:**
1. **Swatch present:** Button shows `"Select [variant code] [variant name]"` (e.g., `"Select 9564 Matcha"`)
2. **Swatch missing:** Button shows only `"[variant code] [variant name]"` without "Select" prefix (e.g., `"9564 Matcha"`)

### Process to Identify Missing Swatches

1. **Navigate to product page** (e.g., `https://motherknitter.com/shop/kos/`)
2. **Take a snapshot** to get interactive elements
3. **Scan button elements** for variant swatches
4. **Identify pattern:**
   - Buttons WITH "Select" prefix = swatch exists ✅
   - Buttons WITHOUT "Select" prefix = swatch missing ❌
5. **Extract variant codes** from missing swatches (e.g., "9564" from "9564 Matcha")

### Example Snapshot Analysis

```javascript
// Swatch EXISTS:
button "Select 9523 Lime Punch" [ref=e64]  // ✅ Has swatch

// Swatch MISSING:
button "9564 Matcha" [ref=e65]  // ❌ No swatch
```

---

## Part 2: SharePoint File Structure & Naming Convention

### SharePoint Navigation Hierarchy

```
Root URL: https://sandnesgarn.sharepoint.com/:f:/s/SandnesGarn/Epxn98W7Lk1LussIYXVmeu0BvGLyiVc-5watfaL4mYjcLg?e=1McFU3

└── Forhandler Arkiv (Dealer Archive)
    └── Nettside forhandler arkiv (Website dealer archive)
        └── Bildearkiv (picture archive)
            └── Garn (yarn)
                ├── Kos/
                │   └── Nøstebilder/  ← Swatch images here
                ├── Double Sunday/
                │   └── Nøstebilder/  ← Swatch images here
                ├── Line/
                │   └── Nøstebilder/
                └── [other yarn products...]
```

### File Naming Pattern

**Format:** `[prefix][variant_code]_[name]_300dpi_[type].jpg`

**Components:**
- **Prefix:** Product-specific (e.g., `1196` for Kos, `1115` for Double Sunday)
- **Variant code:** Last 4 digits match the WooCommerce variant code
- **Name:** Color name in Norwegian/English
- **Type:** Either `Close-up` (swatch) or `Noste` (full skein)

**Examples:**
```
Kos variant 9564:
- 11969564_Matcha_300dpi_Close-up.jpg  ← DOWNLOAD THIS (swatch)
- 11969564_Matcha_300dpi_Noste.jpg     ← Skip (full skein)

Double Sunday variant 4353:
- 11154353_rustic_rose_300dpi_Close-up.jpg  ← DOWNLOAD THIS
- 11154353_rustic_rose_300dpi_noste.jpg     ← Skip
```

**Critical Rule:** Always download the `*_Close-up.jpg` file, NOT the `*_Noste.jpg` file.

---

## Part 3: Browser Automation Best Practices

### Browser Service Configuration

**ALWAYS follow these rules:**

1. **Check browser status first:**
   ```javascript
   browser({ action: "status" })
   ```

2. **Start browser with correct profile:**
   ```javascript
   browser({ action: "start", profile: "openclaw" })
   ```

3. **Include profile in EVERY action:**
   ```javascript
   browser({ 
     action: "open", 
     profile: "openclaw",  // ← CRITICAL
     targetUrl: "..." 
   })
   
   browser({ 
     action: "snapshot", 
     profile: "openclaw",  // ← CRITICAL
     targetId: "...",
     interactive: true
   })
   
   browser({ 
     action: "act", 
     profile: "openclaw",  // ← CRITICAL
     targetId: "...",
     request: {...}
   })
   ```

**Why:** The browser service maintains persistent profile state. Without explicit `profile` in each action, it may default to `profile="chrome"` (extension relay mode) and fail.

### SharePoint Infinite Scroll

SharePoint uses **infinite scroll** to load files progressively. Files are NOT all visible on initial page load.

**Problem:** If you need variant `9564` but only see files `1012-3xxx`, the later files haven't loaded yet.

**Solution:** Scroll down multiple times to trigger content loading:

```javascript
// Scroll down 5-10 times to load more files
for (let i = 0; i < 6; i++) {
  browser({ 
    action: "act", 
    profile: "openclaw",
    targetId: "...",
    request: { kind: "press", key: "PageDown" }
  })
}

// Then take a snapshot to see loaded files
browser({ action: "snapshot", profile: "openclaw", targetId: "...", interactive: true })
```

**Pattern:** Keep scrolling until you see filenames approaching your target variant code.

---

## Part 4: Step-by-Step Execution

### Phase 1: Identify Missing Swatches

1. **Open product page:**
   ```javascript
   browser({ 
     action: "open", 
     profile: "openclaw",
     targetUrl: "https://motherknitter.com/shop/[product-name]/"
   })
   ```

2. **Take snapshot:**
   ```javascript
   browser({ 
     action: "snapshot", 
     profile: "openclaw",
     targetId: "[from-open-response]",
     interactive: true
   })
   ```

3. **Analyze buttons** in snapshot output
4. **Record missing variants** (those without "Select" prefix)

### Phase 2: Navigate to SharePoint Product Folder

1. **Open root SharePoint URL**
2. **Navigate:** Root → Garn (yarn) → [Product Name] → Nøstebilder
3. **Take snapshot at each level** to get navigation buttons

**Example for Kos:**
```javascript
// 1. Open root
browser({ action: "open", profile: "openclaw", targetUrl: "[root-url]" })

// 2. Snapshot and click "Garn (yarn)"
browser({ action: "snapshot", profile: "openclaw", ... })
browser({ action: "act", profile: "openclaw", request: { kind: "click", ref: "e46" } })

// 3. Snapshot and click "Kos"
browser({ action: "snapshot", profile: "openclaw", ... })
browser({ action: "act", profile: "openclaw", request: { kind: "click", ref: "e79" } })

// 4. Snapshot and click "Nøstebilder"
browser({ action: "snapshot", profile: "openclaw", ... })
browser({ action: "act", profile: "openclaw", request: { kind: "click", ref: "e33" } })
```

### Phase 3: Locate and Download Files

1. **Scroll to load files** (if needed):
   ```javascript
   // Scroll 5-10 times
   browser({ action: "act", profile: "openclaw", request: { kind: "press", key: "PageDown" } })
   // Repeat...
   ```

2. **Take snapshot** to see file list

3. **Find target file** matching pattern:
   ```
   [prefix][variant-code]_*_Close-up.jpg
   ```

4. **Click the filename button** (NOT checkbox) to select:
   ```javascript
   browser({ action: "act", profile: "openclaw", request: { kind: "click", ref: "e193" } })
   ```

5. **Press Escape** if preview opens:
   ```javascript
   browser({ action: "act", profile: "openclaw", request: { kind: "press", key: "Escape" } })
   ```

6. **Take snapshot** to confirm selection (checkbox should show `[checked]`)

7. **Click Download:**
   ```javascript
   browser({ action: "act", profile: "openclaw", request: { kind: "click", ref: "e11" } })
   ```

8. **Verify download:**
   ```bash
   sleep 2 && ls -lth ~/Downloads | grep -i "[variant-name]"
   ```

### Phase 4: Repeat for Each Missing Swatch

For each additional missing variant:
- Click the next target file button
- Press Escape if needed
- Snapshot to confirm selection
- Click Download
- Verify

**Note:** You can stay in the same SharePoint folder to download multiple files from the same product.

---

## Part 5: Common Issues & Solutions

### Issue 1: "Chrome extension relay" Error

**Symptom:**
```
Error: Chrome extension relay is running, but no tab is connected
```

**Cause:** Browser service is in wrong profile mode or not started.

**Solution:**
1. Check status: `browser({ action: "status" })`
2. Stop: `browser({ action: "stop" })`
3. Start with profile: `browser({ action: "start", profile: "openclaw" })`
4. Always include `profile: "openclaw"` in every action

### Issue 2: Element Not Found

**Symptom:**
```
Error: Element "e88" not found or not visible
```

**Cause:** SharePoint page scrolled or updated, refs changed.

**Solution:** Take a fresh snapshot before clicking.

### Issue 3: Target File Not Found

**Symptom:** Can't find file with variant code in snapshot.

**Cause:** Infinite scroll hasn't loaded that section yet.

**Solution:** 
1. Scroll down more (5-10 PageDown presses)
2. Take new snapshot
3. Look for files approaching your target variant code
4. Continue scrolling if needed

### Issue 4: Preview Opens Instead of Selecting

**Symptom:** Clicking filename opens preview modal, not checkbox.

**Cause:** Clicked the filename button instead of staying on the page.

**Solution:**
1. Press Escape to close preview
2. File should now be selected
3. Take snapshot to verify checkbox is checked
4. Click Download

---

## Part 6: Verification & Delivery

### Downloaded Files Checklist

For each missing variant, verify:
- ✅ File downloaded to `~/Downloads`
- ✅ Filename matches pattern: `*[variant-code]*_Close-up.jpg`
- ✅ File size is reasonable (typically 500KB-800KB)
- ✅ NOT the `*_Noste.jpg` version

### Example Output

```bash
$ ls -lth ~/Downloads | head -5

-rw-r--r--  804K  11969564_Matcha_300dpi_Close-up.jpg
-rw-r--r--  744K  11154353_rustic_rose_300dpi_Close-up.jpg
-rw-r--r--  643K  11155223_Lavender_300dpi_Close-up.jpg
-rw-r--r--  574K  11157911_mint-green_300dpi_Close-up.jpg
```

### Final Report Format

Provide a summary:

```markdown
## Missing Swatches Downloaded

### Kos:
- ✅ 9564 Matcha - `11969564_Matcha_300dpi_Close-up.jpg` (804KB)

### Double Sunday:
- ✅ 4353 Rustic Rose - `11154353_rustic_rose_300dpi_Close-up.jpg` (744KB)
- ✅ 5223 Lavender - `11155223_Lavender_300dpi_Close-up.jpg` (643KB)
- ✅ 7911 Mint Green - `11157911_mint-green_300dpi_Close-up.jpg` (574KB)

All files ready in ~/Downloads for upload to WooCommerce.
```

---

## Part 7: Quick Reference Commands

### Browser Control Pattern
```javascript
// 1. Status check
browser({ action: "status" })

// 2. Start
browser({ action: "start", profile: "openclaw" })

// 3. Open URL
browser({ action: "open", profile: "openclaw", targetUrl: "..." })

// 4. Snapshot
browser({ action: "snapshot", profile: "openclaw", targetId: "...", interactive: true })

// 5. Click element
browser({ action: "act", profile: "openclaw", targetId: "...", request: { kind: "click", ref: "eXX" } })

// 6. Scroll
browser({ action: "act", profile: "openclaw", targetId: "...", request: { kind: "press", key: "PageDown" } })

// 7. Escape preview
browser({ action: "act", profile: "openclaw", targetId: "...", request: { kind: "press", key: "Escape" } })
```

### Key SharePoint URLs
```
Root: https://sandnesgarn.sharepoint.com/:f:/s/SandnesGarn/Epxn98W7Lk1LussIYXVmeu0BvGLyiVc-5watfaL4mYjcLg?e=1McFU3

Garn direct: [Navigate from root > Click "Garn (yarn)"]
```

### File Verification
```bash
ls -lth ~/Downloads | grep -i "close-up"
```

---

## Part 8: Product-Specific Prefixes

When searching for files, know the prefix for each product:

| Product | File Prefix | Example |
|---------|-------------|---------|
| Kos | 1196 | 11969564_Matcha... |
| Double Sunday | 1115 | 11154353_rustic_rose... |
| Line | [TBD] | [TBD] |
| Alpakka | [TBD] | [TBD] |

**Pattern:** Prefix is `11` + `[product-code]` + `[variant-code]`

Full file: `11[product][variant]_[name]_300dpi_Close-up.jpg`

---

## Summary Workflow

1. **Identify:** Check WooCommerce product pages for swatches without "Select" prefix
2. **Navigate:** SharePoint Root → Garn → Product → Nøstebilder
3. **Scroll:** PageDown 5-10 times to load target files
4. **Locate:** Find `[prefix][variant]_*_Close-up.jpg`
5. **Select:** Click filename (Escape if preview opens)
6. **Download:** Click Download menuitem
7. **Verify:** Check ~/Downloads for correct file
8. **Repeat:** For each missing variant
9. **Report:** List all downloaded files

---

---

## Part 9: WordPress Upload & Assignment (mk-attr Integration)

### Understanding the mk-attr Command

The custom WP-CLI command `wp mk-attr swatch_missing_candidates` handles swatch detection and assignment.

**Matching Logic:**
- Matches by **filename containing full SKU** (not just last 4 digits)
- Uses `strpos(basename(file), $sku)` - substring match
- NOT matched by title/caption/alt metadata
- If multiple files match, prefers smaller width

**Workflow:**
```bash
# 1. Dry-run to see what's missing
wp mk-attr swatch_missing_candidates --format=csv

# 2. After images uploaded, dry-run again to see candidates
wp mk-attr swatch_missing_candidates --format=csv

# 3. Apply assignments
wp mk-attr swatch_missing_candidates --apply
```

### Filename Convention (CRITICAL)

**Required:** Filename MUST contain the **full SKU** as a substring.

**Good examples:**
- `11935581_blue-depth_swatch.webp` ✅
- `thumb_11935581_blue-depth_80px.webp` ✅
- `11935581.webp` ✅

**Bad examples:**
- `5581_blue-depth.webp` ❌ (only last 4 digits)
- `blue-depth-swatch.webp` ❌ (no SKU at all)

**Recommended pattern:**
```
[SKU]_[variant-name]_swatch.webp
```

Example: `31189564_Matcha_swatch.webp`

### SKU Extraction from CSV

**CSV columns:**
```csv
product_id,product_name,variation_id,sku,attribute,variant_value,candidate_id,candidate_file
2600,"Tynn Line",101418,31189564,"TL Colors","9564 Matcha",,
```

**Key fields:**
- `sku`: Full SKU (e.g., `31189564`)
- `variant_value`: Color code + name (e.g., `"9564 Matcha"`)
- `candidate_id`: Empty until image uploaded
- `variation_id`: Empty = skip (product-level, needs manual handling)

**Extract variant code:** Last 4 digits of SKU
```
SKU: 31189564 → variant code: 9564
SKU: 11934353 → variant code: 4353
```

### Image Upload via SSH + WP-CLI

```bash
# 1. Upload local file to server tmp directory
scp -i "$PROD_SSH_KEY_PATH" \
  /local/path/31189564_Matcha_swatch.webp \
  "$PROD_SSH_USER@$PROD_SSH_HOST:/tmp/"

# 2. Import to WordPress media library
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp media import /tmp/31189564_Matcha_swatch.webp \
   --title='SKU 31189564' --porcelain"

# Returns: attachment_id (e.g., 12345)

# 3. Clean up tmp file
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "rm /tmp/31189564_Matcha_swatch.webp"
```

### Image Processing Requirements

**Resize:**
- Width: 80px (height auto-proportional)
- Format: .webp
- Quality: 85-90 (good balance)

**Tools:**
```bash
# Using ImageMagick (convert)
convert input.jpg -resize 80x -quality 90 output.webp

# Using sharp (Node.js)
const sharp = require('sharp');
await sharp('input.jpg')
  .resize(80)
  .webp({ quality: 90 })
  .toFile('output.webp');

# Using ffmpeg
ffmpeg -i input.jpg -vf scale=80:-1 -q:v 90 output.webp
```

### Skip Conditions

**Skip rows where:**
1. `variation_id` is empty → product-level entry, not a variant
2. `sku` is empty → orphan entry, cannot match
3. File not found on SharePoint → gracefully log and continue
4. Variant code doesn't match any SharePoint product → log and skip

---

## Part 10: Complete Automation Pipeline

### Stage 1: Identify Missing Swatches

```bash
cd /Users/vidarbrekke/Dev/CursorApps/clawd
source .env

# Get missing swatches CSV
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv" \
  > missing_swatches_prod.csv
```

### Stage 2: Process Each Row

For each CSV row where `variation_id` and `sku` are not empty:

1. **Extract data:**
   - Full SKU (e.g., `31189564`)
   - Variant code (last 4 digits: `9564`)
   - Product name (e.g., `"Tynn Line"`)
   - Variant value (e.g., `"9564 Matcha"`)

2. **Map product to SharePoint folder:**
   ```
   "Tynn Line" → "Line"
   "Double Sunday" → "Double Sunday"
   "Kos" → "Kos"
   "Sandnes Garn Tynn Silk Mohair" → "Primo Tynn Silk Mohair"
   ```

3. **Navigate SharePoint:**
   - Root → Garn (yarn) → [Product] → Nøstebilder
   - Scroll until files with variant code are visible
   - Find: `*[variant-code]*_Close-up.jpg`

4. **Download SharePoint image:**
   - Click filename to select
   - Click Download
   - Wait for file in ~/Downloads

5. **Process image:**
   ```bash
   # Original: 11969564_Matcha_300dpi_Close-up.jpg
   # Output:   31189564_Matcha_swatch.webp
   
   convert ~/Downloads/11969564_Matcha_300dpi_Close-up.jpg \
     -resize 80x \
     -quality 90 \
     31189564_Matcha_swatch.webp
   ```

6. **Upload to WordPress:**
   ```bash
   # SCP to server
   scp -i "$PROD_SSH_KEY_PATH" \
     31189564_Matcha_swatch.webp \
     "$PROD_SSH_USER@$PROD_SSH_HOST:/tmp/"
   
   # Import to media library
   ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
     "cd $PROD_WP_ROOT && wp media import /tmp/31189564_Matcha_swatch.webp \
      --title='SKU 31189564' --porcelain && rm /tmp/31189564_Matcha_swatch.webp"
   ```

7. **Clean up local file:**
   ```bash
   rm 31189564_Matcha_swatch.webp
   ```

### Stage 3: Verify Candidates Found

```bash
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv" \
  > missing_swatches_after.csv

# Compare: candidate_id column should now have values
```

### Stage 4: Apply Assignments

```bash
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp mk-attr swatch_missing_candidates --apply"
```

### Stage 5: Final Verification

```bash
# Re-run to confirm nothing is missing
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv"
```

---

## Part 11: Error Handling & Graceful Skips

### Skip These Rows:

```javascript
// Parse CSV row
const row = {
  product_id: "9887",
  product_name: "Tiril Eckhoff...",
  variation_id: "",  // ← EMPTY
  sku: "",           // ← EMPTY
  ...
}

// Skip if:
if (!row.variation_id || !row.sku) {
  console.log(`SKIP: Missing variation_id or SKU for product ${row.product_name}`)
  continue;
}
```

### Skip When File Not Found:

```javascript
// If SharePoint navigation fails or file doesn't exist
if (!foundOnSharePoint) {
  console.log(`SKIP: File not found on SharePoint for SKU ${sku}, variant ${variantCode}`)
  continue;
}
```

### Skip When Product Mapping Unknown:

```javascript
const productMap = {
  "Tynn Line": "Line",
  "Double Sunday": "Double Sunday",
  "Kos": "Kos",
  // ... etc
}

if (!productMap[row.product_name]) {
  console.log(`SKIP: Unknown SharePoint folder mapping for product "${row.product_name}"`)
  continue;
}
```

### Log All Actions:

```javascript
// Create processing log
const log = {
  processed: [],
  skipped: [],
  failed: [],
  uploaded: []
}

// After each row:
log.processed.push({ sku, status: "success|skip|fail", reason: "..." })

// Save to file
fs.writeFileSync('swatch_processing_log.json', JSON.stringify(log, null, 2))
```

---

## Part 12: Product Name to SharePoint Folder Mapping

| WooCommerce Product Name | SharePoint Folder |
|--------------------------|-------------------|
| Tynn Line | Line |
| Double Sunday | Double Sunday |
| Sandnes Garn x PetiteKnit DOUBLE SUNDAY | Double Sunday (PetiteKnit) |
| Kos | Kos |
| Sandnes Garn Tynn Silk Mohair | Primo Tynn Silk Mohair |
| Alpakka | Alpakka |
| Alpakka Ull | Alpakka Ull |
| Peer Gynt | Peer Gynt |
| Merinoull | Merinoull |
| Mini Alpakka | Mini Alpakka |
| Babyull Lanett | Babyull Lanett |

**Update this mapping as new products are encountered.**

---

**Last Updated:** 2026-02-13  
**Tested On:** Kos (1 variant), Double Sunday (3 variants)  
**Success Rate:** 4/4 files downloaded successfully  
**Integration:** Ready for mk-attr command pipeline
