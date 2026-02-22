# Cloud search routing fix – strategy evaluation

**Problem:** Cloud agent (Linode) uses `web_fetch` for search/comparison/pricing (137 calls in one session) and never uses Perplexity MCP (`exec` + mcporter). It sometimes claims it "doesn't have web search capability" despite instructions.

**Previous attempts (do not repeat):**
- Added "read CLOUD_AGENT_CONTEXT.md" to AGENTS.md step 5 and cwd condition.
- Put web-search rule in CLOUD_AGENT_CONTEXT.md (top line, table, when/when-not).
- Put same rule in AGENTS.md Tools section.
- Made step 5 say "read … first."

**Observed:** Instructions are either not in the injected prompt or the model (Mistral Small) ignores them; tool choice stays web_fetch.

---

## 1. Four strategies

### Strategy A: Config-only – deny `web_fetch` for main

**Approach:** Add `web_fetch` to `main.tools.deny` in `openclaw.json` so the agent cannot call it. Web search is then only possible via `exec` + mcporter (Perplexity MCP).

**Criteria:** (1) **Complexity:** Lowest—one config change; no doc or prompt changes. (2) **DRY:** Single source of truth (config) for "how search works on cloud." (3) **YAGNI:** No new features or files; removes a wrong option. (4) **Scale:** Adding more denied tools (e.g. if another tool is misused) follows the same pattern.

### Strategy B: Single cloud-instructions file

**Approach:** Merge all cloud-specific rules into one short file (e.g. replace CLOUD_AGENT_CONTEXT.md with a minimal "cloud rules" file), ensure it is the only cloud doc, and rely on the gateway/session to inject it first.

**Criteria:** (1) **Complexity:** Medium—consolidation reduces cognitive load but depends on injection. (2) **DRY:** One file for cloud behavior; no duplication with AGENTS.md. (3) **YAGNI:** Removes redundant bullets across AGENTS.md and CLOUD_AGENT_CONTEXT. (4) **Scale:** New cloud rules go in one place; risk is injection still not guaranteed.

### Strategy C: Gateway/system-prompt injection

**Approach:** If OpenClaw supports a per-agent or per-workspace system-prompt fragment (e.g. from a file path in config), set it to a minimal snippet that only states: "For search/comparison/pricing use exec + mcporter Perplexity MCP; never say you can't search."

**Criteria:** (1) **Complexity:** Low if the feature exists; unknown if it doesn’t. (2) **DRY:** One injected snippet; no doc duplication. (3) **YAGNI:** Only the necessary sentence. (4) **Scale:** Grows via config, not doc sprawl. **Blocker:** Current OpenClaw config has no such field in this repo.

### Strategy D: Exec allowlist + mcporter skill

**Approach:** Restrict `exec` to an allowlist that includes only mcporter (and essential commands); add an mcporter skill that defines the exact Perplexity MCP usage so the model must use the skill for search.

**Criteria:** (1) **Complexity:** High—allowlist maintenance and skill authoring. (2) **DRY:** Skill is single definition of "how to search." (3) **YAGNI:** Overkill for "use Perplexity for search"; we don’t need a full skill to fix routing. (4) **Scale:** Good if we later add more exec patterns; heavy for this bug alone.

---

## 2. Comparison and choice

| Strategy | Complexity | DRY | YAGNI | Scale | Guarantees behavior? |
|----------|------------|-----|-------|-------|------------------------|
| A: Deny web_fetch | Lowest | Config = truth | Removes wrong tool | Add deny entries | **Yes** |
| B: Single file | Medium | One cloud doc | Trim redundancy | One file to edit | No (injection unsure) |
| C: Prompt injection | Low if exists | One snippet | Minimal | Config-driven | Yes if feature exists (not in use here) |
| D: Exec allowlist + skill | High | Skill = definition | Unneeded for this fix | Good later | Partially (more moving parts) |

**Best approach:** **Strategy A (deny `web_fetch` for main).** It is the only change that guarantees the agent cannot use web_fetch; it minimizes complexity and respects DRY/YAGNI. We keep the existing docs so the model knows *how* to use exec + mcporter when it no longer has web_fetch as an option. Optional: document the deny in CLOUD_AGENT_CONTEXT.md so restores and upgrades keep the policy explicit.

---

## 3. Implementation

- **Config:** Add `web_fetch` to `agents.list[main].tools.deny` on Linode (alongside existing `web_search`).
- **Doc:** One short note in CLOUD_AGENT_CONTEXT.md (or command card) that cloud main has `web_fetch` denied so search must go through Perplexity MCP; no code change in repo for config (config lives on server; doc is the reference).
- **Verification:** New session; ask for model comparison or "search the web"; confirm tool calls are `exec` (mcporter) and no `web_fetch` in the session log.
