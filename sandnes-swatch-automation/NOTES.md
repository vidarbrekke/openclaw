# Project Notes - Sandnes Swatch Automation

## Project Overview
Automated swatch image pipeline for Mother Knitter WooCommerce sites, downloading from Sandnes Garn SharePoint.

## Key Insights

### SharePoint Folder Structure (NOT uniform!)
```
Tynn Silk Mohair/Nøstebilder/           ← No "Primo", no parentheses
Børstet Alpakka/Nøstebilder/            ← No parentheses
Peer Gynt/Nøstebilder/                  ← No parentheses
Double Sunday/Nøstebilder/              ← No parentheses
Alpakka Følgetråd/Nøstebilder (skein pictures)/  ← EXCEPTION: has parentheses
POPPY/Nøstebilder/
Ballerina Chunky Mohair/Nøstebilder/
```

### Color Name Fuzzy Matching (Critical)
SharePoint filenames don't match WooCommerce variant names:
- "Mint Green" → "Mint" (first word only)
- "Rain Forest" → "Rainforest" (combined, no space)
- "Rustic Rose" → "rustic_rose" (underscored)
- "Tutti Frutti Sunshine" → "tutti-frutti-sunshine" (hyphenated)

**Pattern**: Try first word, last word, combined, various delimiters, case variations.

### Server Differences
**Wholesale:**
- uploads folder owned by SSH user (`wholesale`)
- Direct wp media import works

**Production:**
- uploads folder owned by `www-data` (web server)
- Requires `sudo chown motherknitter:www-data` + `chmod 775`
- Sudo password: (stored in parent workspace .env)

## Future Runs

When Sandnes Garn uploads new images to SharePoint:

```bash
./run-swatch.sh wholesale
./run-swatch.sh prod
```

Script auto-discovers available files and skips already-assigned swatches.

## Remaining Missing (as of 2026-02-15)

**64 wholesale + 2,313 production** variants still missing swatches.

Most are:
1. Pattern/kit products (no color variants, don't need swatches)
2. New Spring 2026 colors not yet photographed by Sandnes Garn

Re-run automation when Sandnes Garn uploads new batches.
