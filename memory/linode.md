# Linode Server - Memory

## Setup Context

**Date:** 2026-02-18  
**Platform:** Linode.com  
**Purpose:** New Linux VPS server

## Credentials Storage

Credentials should be stored in `~/.linode.env` with the following format:

```bash
# Linode API Token (create at https://cloud.linode.com/profile/tokens)
LINODE_API_TOKEN=your_api_token_here

# SSH Access (if using password or key passphrase)
SSH_HOST=your_server_ip
SSH_USER=your_ssh_user
SSH_PORT=22
SSH_KEY_PATH=~/.ssh/id_rsa_linode

# Optional: Direct root credentials (for initial setup)
ROOT_PASSWORD=your_root_password
```

## Recommended Next Steps

1. User creates `~/.linode.env` with credentials
2. Test SSH connectivity: `ssh user@host`
3. Verify API access: `curl -H "Authorization: Bearer $LINODE_API_TOKEN" https://api.linode.com/v4/linode/instances`

---

*This file is for linode-specific operational memory. Add decisions, configurations, and progress here.*
