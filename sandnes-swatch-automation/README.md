# Sandnes Garn Swatch Automation

Automated pipeline to download product swatch images from Sandnes Garn SharePoint and upload to Mother Knitter WooCommerce sites.

## Quick Start

```bash
# 1. Setup (one time)
cp .env.example .env
# Edit .env with your credentials

# 2. Run smoke tests (validates everything works)
npm test

# 3. Run automation (SAFE - always backs up first)
./run-swatch.sh wholesale      # Process wholesale site
./run-swatch.sh prod           # Process production site

# OR using npm
npm run dry-run               # Test wholesale
npm run wholesale             # Production wholesale
npm run prod                  # Production site
```

## Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run smoke tests (must pass before production) |
| `./run-swatch.sh wholesale` | Process wholesale missing swatches |
| `./run-swatch.sh prod` | Process production missing swatches |
| `./run-swatch.sh --dry-run wholesale` | Test download + process only |
| `./run-swatch.sh --skip-auth prod` | Skip fresh auth (faster) |
| `./rollback.sh <tag>` | Rollback to known working version |
| `npm run backup` | Manual backup of current state |

## What It Does

1. **Smoke Tests** - Validates cookies, downloads, ImageMagick before running
2. **Backup** - Snapshot of code + data + cookies before any changes
3. **Fresh Auth** - Opens SharePoint, exports fresh FedAuth cookies
4. **Download** - Uses curl + cookies to fetch images (600KB+ images, not HTML)
5. **Process** - Resize to 80px, convert to WebP
6. **Upload** - SCP to server, `wp media import`, auto-assign to variants

## Results (2026-02-15)

- **Wholesale:** 18 swatches automated (82 → 64 missing)
- **Production:** 11+ swatches automated (2,324 → 2,313 missing)
- **Total:** 29 swatches successfully processed

## Safety Features (Bulletproof)

### 1. Smoke Tests (MUST PASS)
```bash
npm test
```
Validates:
- FedAuth cookies present and valid
- Can download known working file (Feb 14 test file)
- ImageMagick processes images correctly
- All required directories exist

### 2. Automatic Backups
Every run creates a timestamped backup:
```
backups/20260215_160345/
├── automate-swatch-final.js      # Script version
├── missing_swatches_wholesale.csv # Data
├── missing_swatches_prod.csv
├── cookie-header.txt              # Auth cookies
├── .env                           # Config
├── git-commit.txt                 # Git state
└── git-status.txt
```

Keeps last 20 backups auto-cleanup.

### 3. Safe Runner
`./run-swatch.sh` is the ONLY interface:
- Always runs smoke tests first
- Always creates backups
- Validates environment
- Won't run if tests fail (use `--force` for emergency)

### 4. Rollback
```bash
# List available backups/tags
./rollback.sh

# Rollback to backup
./rollback.sh 20260215_160345

# Rollback to git tag
./rollback.sh v1.0.0
```

### 5. Git Version Control

**Never break main.** Use this workflow:

```bash
# Tag working releases
git add .
git commit -m "feat: working swatch pipeline"
git tag v1.0.0
git push origin v1.0.0

# Test improvements on branch
git checkout -b feature/new-color-matching
# ... make changes ...
npm test
./run-swatch.sh wholesale --dry-run
git commit -m "feat: improved color matching"

# Merge when ready
git checkout main
git merge feature/new-color-matching
git tag v1.1.0
```

## Project Structure

```
sandnes-swatch-automation/
├── src/
│   └── automate-swatch-final.js    # Core automation (NEVER EDIT DIRECTLY)
├── test/
│   └── smoke.js                    # Validation suite
├── scripts/
│   ├── backup-state.sh             # Auto-backup
│   ├── openclaw-cookie-header-from-json.sh
│   └── openclaw-download-job.sh
├── backups/                         # Timestamped backups (auto-managed)
├── data/
│   ├── missing_swatches_wholesale.csv
│   └── missing_swatches_prod.csv
├── run-swatch.sh                    # Safe execution wrapper
├── rollback.sh                      # Emergency rollback
├── package.json                     # npm scripts
├── .env.example                     # Template
└── README.md                        # This file
```

## Change Control (CRITICAL)

**Rule:** No direct edits to `automate-swatch-final.js` ever.

**Process:**
1. Create backup: `./scripts/backup-state.sh`
2. Create branch: `git checkout -b feature/improvement`
3. Modify `src/automate-swatch-final.js`
4. Test: `npm test && ./run-swatch.sh wholesale --dry-run`
5. Review changes: `git diff`
6. Commit: `git commit -m "feat: improvement description"`
7. Tag working: `git tag v1.1.0`
8. Push: `git push origin v1.1.0`

**Rollback Plan:**
```bash
# If anything breaks:
./rollback.sh v1.0.0
npm test
./run-swatch.sh wholesale --dry-run
```

## Requirements

- Node.js v18+
- ImageMagick 7 (`magick` command)
- SSH access to WordPress servers
- `.env` with credentials configured

## Documentation

- `docs/SWATCH_RUNBOOK.md` - Quick command reference
- `docs/SANDNES_GARN.md` - SharePoint folder structure
- `CHANGELOG.md` - Version history
- `NOTES.md` - Operational notes and caveats

## Credits

Automated Feb 2026 via OpenClaw agent framework.
