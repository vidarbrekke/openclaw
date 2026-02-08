# WP Chat

**Repository:** https://github.com/vidarbrekke/wpchat
**Type:** WooCommerce RAG chatbot plugin
**Status:** Pre-monetization
**Goal:** Integrate with store and sell as plugin; serve as customer support Q&A interface for staff

---

<quick_reference>
- **Platform:** WordPress + WooCommerce plugin
- **Architecture:** Intent Classification → Hybrid Search (keyword + vector) → LLM Context Assembly
- **Prefix:** `Wcac_` (classes), `wcac_` (functions/hooks)
- **Text domain:** `wpchat`
- **Testing:** Staging server only — no local WordPress
</quick_reference>

<constraints>
- DO NOT hardcode site-specific terms (yarn, knitting, patterns) — plugin is vertical-agnostic
- DO NOT edit WordPress/WooCommerce core — extend via plugin hooks only
- DO NOT assume local WordPress exists — all testing via SSH to staging
- DO NOT "improve" working code while fixing a bug — separate tasks
- DO NOT skip security: sanitize input, escape output, nonce + capability checks
</constraints>

---

## WordPress/WooCommerce Rules

**See:** [shared/wordpress-rules.md](../../shared/wordpress-rules.md)

All code must follow the shared WordPress/WooCommerce development rules.

---

## Key Files

| File | Purpose | When to Modify |
|------|---------|----------------|
| `public/class-wcac-public.php` | AJAX entry, PII redaction, orchestration | Entry point changes |
| `includes/retrieval/class-wcac-content-retriever.php` | Main search pipeline | Search logic |
| `includes/intent/class-wcac-intent-taxonomy.php` | Query intent classification | Intent detection |
| `includes/knowledge/class-wcac-static-knowledge.php` | Authoritative guidance layer | Policy/nav guidance |
| `includes/retrieval/class-wcac-score-engine.php` | Score weights and fusion | Ranking changes |
| `includes/retrieval/scorers/*.php` | Individual scoring components | Field-specific scoring |

---

## Pitfalls (Real Production Bugs)

### 1. VERTICAL-AGNOSTIC — No Hardcoded Terms
```php
// ❌ NEVER
if (strpos($query, 'yarn') !== false) { ... }
$categories = ['sweaters', 'scarves', 'hats'];

// ✅ Pull from admin settings or use generic terms
$categories = get_option('wcac_product_categories', []);
```

**Why:** This plugin sells to ANY industry. Test-site terms break other stores.

### 2. Signal Detection Order Matters
```php
// ❌ Generic checks before specific ones
if (strpos($query, 'free') !== false) {
    $signals['is_sale_query'] = true; // Triggers first!
}

// ✅ Specific checks FIRST, with guards
if (preg_match('/\b(looking for|show me)\s+.*products\b/i', $query)) {
    $signals['is_product_query'] = true;
}
if (empty($signals['is_product_query']) && strpos($query, 'free') !== false) {
    $signals['is_sale_query'] = true;
}
```

### 3. AJAX Testing Requires HTTP Requests
```php
// ❌ Direct method call fails with -1
$_POST = ['message' => $query];
$public->handle_send_message_ajax();

// ✅ Use wp_remote_post with nonce
$response = wp_remote_post($ajax_url, [
    'body' => [
        'action' => 'wcac_send_message',
        'message' => $query,
        'nonce' => wp_create_nonce('wcac_chatbot_nonce'),
    ],
]);
```

### 4. Environment Variables Need Export
```bash
# ❌ Variables not exported to subprocesses
STAGING_HOST=example.com
./script.sh  # Can't see STAGING_HOST

# ✅ Export them
export STAGING_HOST=example.com
./script.sh
```

---

## Static Knowledge Entry Pattern

```php
[
    'id' => 'nav_shopping_cart',
    'title' => 'Shopping Cart Navigation',
    'content' => 'Your cart is accessible via the cart icon...',
    'keywords' => ['cart', 'basket', 'shopping cart'],
    'intents' => ['cart_query'],
    'active' => true,  // false = draft/seed template
]
```

Only ACTIVE entries are used in retrieval.
