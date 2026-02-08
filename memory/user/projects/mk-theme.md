# MK Theme

**Repository:** https://github.com/vidarbrekke/mk-theme
**Live URL:** motherknitter.com
**Type:** WordPress/WooCommerce theme

---

<quick_reference>
- **Platform:** WordPress + WooCommerce
- **Prefix:** `mk_` or `mktheme_`
- **Text domain:** `mk-theme`
- **Sites:** motherknitter.com, wholesale.motherknitter.com, staging.motherknitter.com
</quick_reference>

<constraints>
- DO NOT edit WordPress/WooCommerce core — extend via child theme + hooks only
- DO NOT use direct DB queries for WC data — use `wc_get_products()` / `WC_Product_Query`
- DO NOT skip security: sanitize input, escape output, nonce + capability checks
</constraints>

---

## WordPress/WooCommerce Rules

**See:** [shared/wordpress-rules.md](../../shared/wordpress-rules.md)

All code must follow the shared WordPress/WooCommerce development rules.

---

## Project-Specific Notes

### Prefixing
- Functions: `mk_` or `mktheme_`
- Hooks: `mk_theme_action_name`
- Options: `mk_theme_option_name`
- Classes: `MK_Theme_Class_Name`

### i18n
All user-visible strings use `mk-theme` text domain:
```php
__('Text', 'mk-theme')
_e('Text', 'mk-theme')
```

### Uninstall
Theme-created data must be removed on deletion:
- Options
- Transients
- Scheduled events
