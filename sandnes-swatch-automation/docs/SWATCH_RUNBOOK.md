# Swatch Runbook (DRY/YAGNI)

## 1) Load env

```bash
cd /Users/vidarbrekke/Dev/CursorApps/clawd/sandnes-swatch-automation
source .env
```

Required env vars:
- `WHOLESALE_SSH_KEY_PATH`, `WHOLESALE_SSH_USER`, `WHOLESALE_SSH_HOST`, `WHOLESALE_WP_ROOT`
- `PROD_SSH_KEY_PATH`, `PROD_SSH_USER`, `PROD_SSH_HOST`, `PROD_WP_ROOT`
- Optional: `SWATCH_COOKIE_FILE` (defaults to `/tmp/openclaw/jobs/cookie-header.txt`)

## 2) Export missing-swatch CSV (dry-run data)

```bash
# Production
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv"

# Wholesale
ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" \
  "cd $WHOLESALE_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv"
```

Save output to `data/missing_swatches_prod.csv` or `data/missing_swatches_wholesale.csv` as needed.

## 2b) Script dry-run (no uploads/SSH)

```bash
./run-swatch.sh --dry-run wholesale
./run-swatch.sh prod --dry-run
```

Runs full pipeline (download from SharePoint + ImageMagick) but skips `scp`, `wp media import`, and `--apply`.

## 3) Apply

```bash
# Production
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp mk-attr swatch_missing_candidates --apply"

# Wholesale
ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" \
  "cd $WHOLESALE_WP_ROOT && wp mk-attr swatch_missing_candidates --apply"
```

## 4) Debug one SKU

```bash
SKU=11935581

# Get variation ID
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp post list --post_type=product_variation --meta_key=_sku --meta_value=$SKU --field=ID"

# Get parent ID
VID=<variation_id>
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp post get $VID --field=post_parent"

# Inspect swatch options
PID=<parent_id>
ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp post meta get $PID _swatch_type_options"
```

Notes:
- `--apply` only updates rows with a found `candidate_id`.
- Keep `.env` private and out of Git.
