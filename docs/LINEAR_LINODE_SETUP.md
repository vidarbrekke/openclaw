# Linear (Maton gateway) on Linode (clawd cloud)

This mirrors the local Linear integration on the Linode. **You add the Maton API key on the server**; the key is never stored in the repo.

## Prerequisites

- **Maton API key** — Get one at https://maton.ai/settings
- **Linear OAuth** — Manage connections at https://ctrl.maton.ai (create a Linear connection so the gateway can access your workspace)

## 1. Create the MCP config on the Linode

SSH in:

```bash
ssh -i ~/.ssh/id_ed25519_linode root@45.79.135.101
```

Create the MCP directory and the Linear config file:

```bash
mkdir -p /root/openclaw-stock-home/.openclaw/mcp
```

Create `/root/openclaw-stock-home/.openclaw/mcp/linear-api.mcp.yaml` with this content (e.g. `nano /root/.openclaw/mcp/linear-api.mcp.yaml`):

```yaml
name: linear
description: |
  Linear API integration via Maton gateway. Query and manage issues, projects, teams, cycles, and labels using GraphQL.
  Requires MATON_API_KEY environment variable. Get your key at https://maton.ai/settings
version: 1.0.0
config:
  env:
    - name: MATON_API_KEY
      required: true
      description: Maton API key from https://maton.ai/settings
tools:
  - name: linear_graphql
    description: Execute GraphQL queries against Linear API via Maton gateway
    parameters:
      - name: query
        type: string
        required: true
        description: GraphQL query or mutation
      - name: variables
        type: object
        required: false
        description: GraphQL variables
      - name: connection_id
        type: string
        required: false
        description: Maton connection ID (optional, uses default if not specified)
    returns:
      type: object
      description: GraphQL response data
example_queries:
  - name: Get current user
    query: '{ viewer { id name email } }'
  - name: List teams
    query: '{ teams { nodes { id name key } } }'
  - name: List issues
    query: '{ issues(first: 10) { nodes { id identifier title state { name } priority createdAt } pageInfo { hasNextPage endCursor } } }'
  - name: Get issue by ID
    query: '{ issue(id: "MTN-527") { id identifier title description state { name } priority assignee { name } } }'
  - name: Search issues
    query: '{ searchIssues(first: 10, term: "shopify") { nodes { id identifier title } } }'
endpoint:
  url: https://gateway.maton.ai/linear/graphql
  method: POST
  headers:
    Authorization: Bearer ${MATON_API_KEY}
    Content-Type: application/json
notes: |
  Manage your Linear OAuth connections at https://ctrl.maton.ai
  To create a connection:
    curl -X POST https://ctrl.maton.ai/connections \
      -H "Authorization: Bearer $MATON_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"app": "linear"}'
```

**Optional:** Copy from your Mac instead of pasting (from the clawd repo):

```bash
scp -i ~/.ssh/id_ed25519_linode .mcp/linear-api.mcp.yaml root@45.79.135.101:/root/openclaw-stock-home/.openclaw/mcp/
```

The repo’s `.mcp/linear-api.mcp.yaml` is server-agnostic and can be used as-is on the Linode.

## 2. Set the Maton API key on the Linode

OpenClaw loads env vars from `~/.openclaw/.env`. On the Linode stock-home that is `/root/openclaw-stock-home/.openclaw/.env`.

On the Linode:

```bash
echo 'MATON_API_KEY=your-maton-key-here' >> /root/openclaw-stock-home/.openclaw/.env
# Or edit in place:
nano /root/openclaw-stock-home/.openclaw/.env
```

Add a single line (use the same key as on your Mac, or create one at https://maton.ai/settings):

```
MATON_API_KEY=maton_xxxxxxxxxxxxxxxx
```

Keep the file readable only by root:

```bash
chmod 600 /root/openclaw-stock-home/.openclaw/.env
```

## 3. Ensure Linear is connected in Maton

The gateway authenticates to Linear via Maton. Create (or reuse) a Linear connection:

- Open https://ctrl.maton.ai and sign in with your Maton account.
- Add a **Linear** connection and complete the OAuth flow.

Or from a machine that has `MATON_API_KEY` set:

```bash
curl -X POST https://ctrl.maton.ai/connections \
  -H "Authorization: Bearer $MATON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"app": "linear"}'
```

Follow the returned URL to authorize Linear if needed.

## 4. Restart the gateway

So it picks up the new MCP config and env:

```bash
# If using systemd user service (root):
systemctl --user restart openclaw-gateway.service

# Or if you start the gateway manually, stop it and start again after editing .env and adding the MCP file.
```

**Note:** Gateway restarts are operator-only. Do not trigger restart from chat/agent exec (see CLOUD_BOT_SELF_FIX_GUIDE.md).

## 5. Verify

In a session that has access to the Linear MCP tool, ask the agent to list Linear teams or issues. If the gateway fails to load the MCP or Linear calls fail:

- `MATON_API_KEY` is set in `/root/openclaw-stock-home/.openclaw/.env` (no typos, no extra spaces).
- `/root/openclaw-stock-home/.openclaw/mcp/linear-api.mcp.yaml` exists and is valid YAML.
- A Linear connection exists in Maton (https://ctrl.maton.ai).
- Gateway logs: `journalctl --user -u openclaw-gateway.service -f`

If your OpenClaw version registers MCP servers via `openclaw.json` instead of auto-discovering `~/.openclaw/mcp/*.mcp.yaml`, you may need to add a `mcp.servers.linear` entry that points at the Maton gateway (see OpenClaw docs for your version).

## Reference (local vs Linode)

| Item        | Local (Mac)                    | Linode (cloud)                        |
|------------|---------------------------------|----------------------------------------|
| Config     | `.mcp/linear-api.mcp.yaml` (repo) | `/root/openclaw-stock-home/.openclaw/mcp/linear-api.mcp.yaml` |
| API key    | `~/.openclaw/.env` or shell     | `/root/openclaw-stock-home/.openclaw/.env`                 |
| OAuth      | https://ctrl.maton.ai (same)    | Same Maton account / connection        |

You can use the **same** Maton API key and Linear connection for both local and cloud; no need for a second key unless you want separate accounts.
