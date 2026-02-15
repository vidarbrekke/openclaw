# Swatch Automation - Pre-Flight Checklist

## Before Running Automation

### Environment
- [ ] `.env` file exists and loaded (`source .env`)
- [ ] SSH keys exist at paths in env vars
- [ ] SSH keys have correct permissions (600)
- [ ] Can SSH to both servers (`ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST"`)
- [ ] WordPress paths exist and wp-cli works

### Dependencies
- [ ] ImageMagick installed (`convert --version`)
- [ ] Node.js installed (`node --version`)
- [ ] Helper scripts executable (`chmod +x scripts/*.sh`)
- [ ] `/tmp/openclaw/downloads` directory exists

### Browser Session
- [ ] Browser started with openclaw profile (`browser status` shows `running: true`)
- [ ] Authenticated to SharePoint (can navigate folders)
- [ ] Cookies exported and valid (`cat /tmp/openclaw/jobs/cookie-header.txt` has content)

### Test Run
- [ ] Downloaded one test file successfully
- [ ] Processed image to WebP (80px width)
- [ ] Uploaded to WP media library
- [ ] mk-attr found candidate for test SKU
- [ ] mk-attr apply assigned swatch

---

## During Automation

### Monitoring
- [ ] Log file being written (`tail -f automation.log`)
- [ ] Download jobs completing (`ls /tmp/openclaw/jobs/`)
- [ ] Downloaded files have size > 0 (`ls -lh /tmp/openclaw/downloads/`)
- [ ] Processed WebP files created
- [ ] WP media imports returning attachment IDs

### Error Handling
- [ ] Skipped rows logged with reason
- [ ] Failed downloads logged
- [ ] 404s handled gracefully
- [ ] Unmapped products logged

---

## After Automation

### Verification
- [ ] All logs reviewed (`cat automation.log | grep -i error`)
- [ ] Success count matches expected
- [ ] Skip count explained
- [ ] No uncaught errors

### WP Verification
- [ ] mk-attr shows candidates found (`--format=csv` has values in `candidate_id` column)
- [ ] Sample swatches visible in WP admin media library
- [ ] Filenames contain full SKUs

### Apply
- [ ] Dry-run apply shows expected changes
- [ ] Apply completes without errors
- [ ] Re-run mk-attr shows 0 missing (or known skips)

### Cleanup
- [ ] Temp files removed (`rm /tmp/openclaw/downloads/*`)
- [ ] Log files archived
- [ ] Cookie file removed (security)

---

## Rollback Plan

If automation fails catastrophically:

1. **Stop automation** (Ctrl+C)
2. **Review logs** to identify failure point
3. **Document error** in MEMORY.md
4. **Clean up partial uploads** if needed:
   ```bash
   # Get attachment IDs from this run
   # Delete via wp-cli if needed
   ssh ... "cd $WP_ROOT && wp post delete <ID> --force"
   ```
5. **Restore from backup** if database corrupted (unlikely)
6. **Fix root cause** before retry

---

## Success Criteria

### Wholesale Site (89 missing swatches)
- [ ] >80% success rate (71+ swatches assigned)
- [ ] <10% skip rate due to mapping issues
- [ ] 0% failures due to automation bugs

### Production Site
- [ ] Same success rate as wholesale
- [ ] Same or better performance

### Code Quality
- [ ] No hardcoded paths
- [ ] No duplicated logic
- [ ] All magic numbers explained
- [ ] Error messages actionable

---

## Known Acceptable Failures

These are OK to skip (not automation bugs):

1. **Product not in mapping** - Add to map and re-run
2. **Color name mismatch** - Update filename pattern
3. **File not on SharePoint** - Vendor issue, can't fix
4. **SKU not found in WP** - Data integrity issue, manual fix

---

**Read this checklist before EVERY production run**
