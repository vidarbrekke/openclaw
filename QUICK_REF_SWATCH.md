# Swatch Automation - Quick Reference Card

## One Command Summary

```bash
# Get missing → Download from SharePoint → Process → Upload → Assign
source .env && ./automate-swatch-download.sh wholesale
```

---

## Manual Step-by-Step (if automation fails)

### 1. Get CSV
```bash
ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" \
  "cd $WHOLESALE_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv" \
  > missing.csv
```

### 2. Authenticate SharePoint
```bash
browser({ action: "start", profile: "openclaw" })
browser({ action: "open", profile: "openclaw", 
  targetUrl: "https://sandnesgarn.sharepoint.com/:f:/s/SandnesGarn/..." })
```

### 3. Export Cookies
```bash
openclaw browser --json cookies --browser-profile openclaw --target-id <ID> | \
  ./scripts/openclaw-cookie-header-from-json.sh --stdin --domain sharepoint.com --raw \
  > /tmp/cookies.txt
```

### 4. Download File
```bash
COOKIE=$(cat /tmp/cookies.txt)
./scripts/openclaw-download-job.sh \
  --url "https://sandnesgarn.sharepoint.com/sites/.../11557911_Mint-green_300dpi_Close-up.jpg" \
  --output "/tmp/11557911.jpg" \
  --cookie-header "$COOKIE"
  
./scripts/openclaw-download-job-status.sh --job-id <ID>
```

### 5. Process Image
```bash
convert /tmp/11557911.jpg -resize 80x -quality 90 /tmp/11557911_Mint-green_swatch.webp
```

### 6. Upload
```bash
scp -i "$WHOLESALE_SSH_KEY_PATH" /tmp/11557911_Mint-green_swatch.webp \
  "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST:/tmp/"
  
ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" \
  "cd $WHOLESALE_WP_ROOT && wp media import /tmp/11557911_Mint-green_swatch.webp \
   --title='SKU 11557911' && rm /tmp/11557911_Mint-green_swatch.webp"
```

### 7. Apply
```bash
ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" \
  "cd $WHOLESALE_WP_ROOT && wp mk-attr swatch_missing_candidates --apply"
```

---

## Key Patterns

### SharePoint URL
```
https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/
Nettside%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/
Garn%20%28yarn%29/{PRODUCT}/N%C3%B8stebilder%20%28skein%20pictures%29/{SKU}_{color}_300dpi_Close-up.jpg
```

### Product Mapping
```
"Sandnes Garn Tynn Silk Mohair" → "Primo Tynn Silk Mohair"
"Alpakka Følgetråd (lace weight)" → "Alpakka Følgetråd"
"Double Sunday" → "Double Sunday"
"Tynn Line" → "Line"
```

### Browser Profile Rule
```javascript
// ALWAYS include profile in EVERY call
browser({ action: "...", profile: "openclaw", ... })
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Chrome extension relay" error | Add `profile: "openclaw"` to browser call |
| Download 0 bytes | Check URL encoding, verify cookies valid |
| Gateway timeout | Use `openclaw-download-job.sh` (background) |
| File not found on SharePoint | Check product mapping, try color name variations |
| WP import fails | Verify filename contains full SKU |
| mk-attr doesn't find candidate | Ensure filename has SKU substring |

---

**Full docs:** `SWATCH_AUTOMATION_MASTER.md`  
**Helper scripts:** `scripts/openclaw-*.sh`  
**Environment:** `.env` (not in git)
