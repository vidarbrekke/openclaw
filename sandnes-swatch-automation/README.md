# Sandnes Garn Swatch Automation

Automated pipeline to download product swatch images from Sandnes Garn SharePoint and upload to Mother Knitter WooCommerce sites.

## Quick Start

```bash
# 1. Setup (one time)
cp .env.example .env
# Edit .env with your credentials

# 2. Run automation
./run-swatch.sh wholesale   # or 'prod'

# Dry-run: download + process locally only (no uploads/SSH)
./run-swatch.sh --dry-run wholesale
./run-swatch.sh prod --dry-run
```

## What It Does

1. Fetches missing swatch list from WordPress
2. Downloads matching images from SharePoint (with fuzzy color name matching)
3. Processes images (resize to 80px, convert to WebP)
4. Uploads to WordPress Media Library
5. Auto-assigns swatches to product variants

## Results (2026-02-15)

- **Wholesale:** 18 swatches automated (82 → 64 missing)
- **Production:** 11 swatches automated (2,324 → 2,313 missing)
- **Total:** 29 swatches successfully processed

## Requirements

- Node.js v16+
- ImageMagick 7 (`magick` command)
- SSH access to WordPress servers
- SharePoint authentication cookies

## Documentation

- `docs/SWATCH_RUNBOOK.md` - Quick command reference
- `docs/SANDNES_GARN.md` - SharePoint folder structure
- `NOTES.md` - Operational notes and caveats

## Files

```
src/automate-swatch-final.js    Core automation
src/automate-swatch-final.test.js  Unit tests (node:test)
run-swatch.sh                   Execution wrapper
scripts/                        Download job helpers
docs/                           Essential reference docs
data/                           CSV files & logs (gitignored)
```

## Safety Improvements

- Uses `execFileSync` argument arrays (no shell interpolation for commands)
- Validates required environment variables at startup
- Configurable cookie file path via `SWATCH_COOKIE_FILE`
- Logs non-HTTP failures instead of silently swallowing exceptions
- Cleans up temp files even on partial failure

## Credits

Automated Feb 2026 via OpenClaw agent framework.
