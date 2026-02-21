# GitHub Repository Development & Deployment (Cloud/Linode)

Paste this section into the cloud workspace AGENTS.md to give the main agent
a complete clone → build → deploy → verify workflow.

---

## GitHub Repository Workflow

When asked to clone, update, build, or deploy a GitHub repository:

### 1. Clone / Update

- Clone into `/root/openclaw-stock-home/.openclaw/workspace/repositories/<repo-name>` (create `repositories/` if needed).
- If the repo already exists at that path, `cd` into it and `git pull` instead of re-cloning.
- Use the HTTPS URL the user provides. Server git config rewrites `https://github.com/vidarbrekke/*` to SSH automatically.
- If clone/pull fails with auth error, tell the user exactly what failed and point them to `/root/openclaw-stock-home/.openclaw/workspace/SETUP_GITHUB_ACCESS.md`.

### 2. Branch (for vidarbrekke repos only)

- If the URL starts with `https://github.com/vidarbrekke/`, create a working branch before making changes: `openclaw/<short-task>-<YYYYMMDD-HHMM>`.
- Never push directly to `main` or `master`.
- For non-vidarbrekke repos, work on whatever branch is checked out. Ask before pushing.

### 3. Build

Detect the project type and build accordingly:

| Signal | Type | Build command |
|--------|------|---------------|
| `go.mod` exists | Go | `cd /root/openclaw-stock-home/.openclaw/workspace/repositories/<name> && /usr/local/go/bin/go build -o /root/openclaw-stock-home/.openclaw/workspace/repositories/<name>/bin/<name> ./cmd/<name>/...` (adjust entrypoint if different; check `main.go` or `cmd/` layout) |
| `package.json` exists | Node.js | `cd /root/openclaw-stock-home/.openclaw/workspace/repositories/<name> && npm install && npm run build` |
| `requirements.txt` or `setup.py` | Python | `cd /root/openclaw-stock-home/.openclaw/workspace/repositories/<name> && pip3 install -e .` or `pip3 install -r requirements.txt` |
| `Makefile` exists | Make | `cd /root/openclaw-stock-home/.openclaw/workspace/repositories/<name> && make` |
| `Cargo.toml` exists | Rust | Not currently supported (no Rust toolchain). Tell the user. |

If the build fails, show the exact error output. Do not retry more than once.

### 4. Deploy / Make Available

After a successful build, make the output available to the OpenClaw installation:

**Known deployment targets** (check this list first):

| Repository | Type | Deploy action |
|------------|------|---------------|
| `mcp-motherknitter` | Node.js | Build output is at `build/`. Repo lives at `/root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter`. The mcporter config at `/root/openclaw-stock-home/.openclaw/workspace/config/mcporter.json` references `/root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter/build/index.js`. After `npm run build`, verify: `node /root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter/build/cli.js --help`. |
| `gogcli-enhanced` | Go | Build binary, then: `cp /root/openclaw-stock-home/.openclaw/workspace/repositories/gogcli-enhanced/bin/gogcli-enhanced /usr/local/bin/gogcli-enhanced && chmod +x /usr/local/bin/gogcli-enhanced`. Verify: `gogcli-enhanced --version` or `gogcli-enhanced --help`. |
| `clawd` | Workspace | This is the OpenClaw workspace repo. Clone/pull to `/root/openclaw-stock-home/.openclaw/workspace` (it is already a git repo there). After pull, no build step — files are used directly by OpenClaw. |

**For unknown repos** (not in the table above):
- **Compiled CLI** (Go/Rust/C): build and place binary in `/usr/local/bin/`.
- **Node.js app or library**: keep source in `/root/openclaw-stock-home/.openclaw/workspace/repositories/<name>`, run `npm install && npm run build` if applicable. The usable output is typically the source tree or a `build/`/`dist/` directory, not a binary.
- **Python package**: `pip3 install -e /root/openclaw-stock-home/.openclaw/workspace/repositories/<name>` or `pip3 install -r requirements.txt`.
- **PHP/other**: keep in `/root/openclaw-stock-home/.openclaw/workspace/repositories/<name>` and tell the user the path.
- Always tell the user exactly where the output ended up and how to use it (command, path, or import).

### 5. Commit & Push (vidarbrekke repos only)

- After making changes, commit with a clear message describing what was done.
- Push the working branch to origin.
- Tell the user the branch name so they can review/merge.

### 6. Safety Rules

- **Never** overwrite a running service's files without building and verifying first.
- **Never** restart the OpenClaw gateway from exec. Config changes hot-reload; binary changes require operator restart via SSH.
- **Back up before replacing**: before overwriting a binary or build output, copy the existing one to `<path>.bak.<timestamp>`.
- If a build produces test failures or warnings, report them before deploying.
- Do not `rm -rf` repo directories. Use `git clean -fd` if cleanup is needed.

### 7. Environment

- **Go**: `/usr/local/go/bin/go` (add to PATH: `export PATH=$PATH:/usr/local/go/bin`)
- **Node.js**: v22 (system), npm 10
- **Python**: 3.12 (system)
- **Make/GCC**: available
- **Rust**: not installed
- **Git auth**: SSH for `github.com/vidarbrekke/*` repos (rewritten from HTTPS). See `/root/openclaw-stock-home/.openclaw/workspace/SETUP_GITHUB_ACCESS.md` if auth fails for private repos.

### 8. Deploying from your machine to the Linode

To upload scripts, skills, and the full workspace so OpenClaw on the Linode finds everything (AGENTS.md, docs, config, memory, etc.):

1. **One-shot (ops + workspace):** From the clawd repo root:
   ```bash
   ./scripts/deploy-ops-consolidation.sh
   ```
   This deploys ops-maintenance.py, skills, systemd units to `/root/openclaw-stock-home/.openclaw/`, then runs `deploy-workspace-to-linode.sh` to rsync the repo into `/root/openclaw-stock-home/.openclaw/workspace/`.

2. **Workspace only** (e.g. after editing AGENTS.md or docs):
   ```bash
   ./scripts/deploy-workspace-to-linode.sh
   ```
   Run from repo root. Does not overwrite `config/mcporter.json` on the server (keeps server paths).

3. **Backup (on the Linode):** The backup script `scripts/backup_enhanced_cloud.sh` runs on the server. Default `OPENCLAW_DIR` is `/root/openclaw-stock-home/.openclaw`.

### 9. Linode config audit (stock-home)

All repo references to the **main** Linode gateway now use `/root/openclaw-stock-home/.openclaw` (config, workspace, scripts, skills, logs, var). Legacy `/root/.openclaw` is only used for **telegram-isolated** and **telegram-vidar-proxy** workspaces (separate trees).

**Verified on server:**

- Gateway systemd unit: `Environment=HOME=/root/openclaw-stock-home` → OpenClaw uses stock-home.
- `openclaw.json`: `agents.defaults.workspace` = `/root/openclaw-stock-home/.openclaw/workspace`.
- `workspace/config/mcporter.json`: motherknitter and playwright args use stock-home paths.
- Ops maintenance service: `ExecStart` points to stock-home script.

**Optional server checks:**

- **skill-scanner:** If it was installed before stock-home, the scan script may still default to `/root/.openclaw/skills`. Either re-run `scripts/skill-scanner-linode/install.sh` from the repo, or add `Environment="OPENCLAW_SKILLS_DIR=/root/openclaw-stock-home/.openclaw/skills"` (and `SKILL_SCANNER_STATE_DIR`) to the skill-scanner.service unit and `daemon-reload`.
- **mcp-motherknitter:** mcporter.json points at `workspace/repositories/mcp-motherknitter/build/index.js`. Clone and build that repo into `workspace/repositories/` if you use motherknitter on the Linode.
- **Playwright MCP:** mcporter references `playwright-mcp` under stock-home; install Playwright MCP there (e.g. `scripts/install-playwright-mcp-linode.sh` with `PLAYWRIGHT_MCP_DIR` set to stock-home path) if you use it.
- **.env:** API keys (Perplexity, Maton, etc.) go in `/root/openclaw-stock-home/.openclaw/.env`; create that file on the server if needed.
- **MCP YAML (Linear etc.):** Put `.mcp/*.mcp.yaml` into `/root/openclaw-stock-home/.openclaw/mcp/` on the server (see LINEAR_LINODE_SETUP.md).
