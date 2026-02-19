---
name: linode
description: Linode VPS management via Linode API and SSH. Use when user asks for Linode-specific tasks: server provisioning, configuration, management, or when credentials need to be loaded from ~/.linode.env.

# Linode VPS Management

## Overview

This skill provides Linode API and SSH integration for managing Linux VPS servers hosted on Linode.com.

## Setup

### 1. Credential File

User must create `~/.linode.env` with the following variables:

```bash
# Linode API Token (required for API operations)
export LINODE_API_TOKEN="your_token_here"

# SSH Access (required for remote command execution)
export SSH_HOST="your_server_ip"
export SSH_USER="your_ssh_user"
export SSH_PORT="22"
export SSH_KEY_PATH=""  # Optional: path to SSH private key

# Optional: Direct credentials (only if SSH keys aren't set up yet)
export ROOT_PASSWORD=""  # WARNING: Avoid plain text if possible
```

### 2. Load Credentials

Use the helper script in your workflows:

```bash
source ~/Dev/CursorApps/clawd/scripts/linode-env.sh
```

Or in scripts:

```bash
#!/bin/bash
source ~/.linode.env

# Now LINODE_API_TOKEN, SSH_HOST, SSH_USER are available
```

## Common Tasks

### 1. Check Server Status (via API)

```bash
curl -H "Authorization: Bearer $LINODE_API_TOKEN" \
  https://api.linode.com/v4/linode/instances
```

### 2. SSH to Server

```bash
ssh -p ${SSH_PORT:-22} ${SSH_USER}@${SSH_HOST}
```

### 3. Run Remote Command

```bash
ssh -p ${SSH_PORT:-22} ${SSH_USER}@${SSH_HOST} "command here"
```

### 4. Copy File to Server

```bash
scp -P ${SSH_PORT:-22} local_file ${SSH_USER}@${SSH_HOST}:remote_path
```

### 5. Get Server IP

```bash
curl -s -H "Authorization: Bearer $LINODE_API_TOKEN" \
  "https://api.linode.com/v4/linode/instances" | jq '.data[].ipv4[0]'
```

## Security Best Practices

1. Use SSH keys instead of passwords
2. Store API tokens in `~/.linode.env` with `600` permissions
3. Never commit `.env` files to git
4. Rotate API tokens periodically
5. Use separate tokens for different purposes (read-only vs full access)

## Troubleshooting

### "LINODE_API_TOKEN not set"
- Ensure `~/.linode.env` exists and is properly sourced
- Check that `LINODE_API_TOKEN` is exported

### SSH connection refused
- Verify server is running: `curl .../linode/instances`
- Check firewall rules in Linode Cloud Console
- Confirm SSH user and IP are correct

### Permission denied
- Verify SSH key is added to `~/.ssh/authorized_keys` on server
- Check file permissions on local key (`600`)

## Notes

- This skill assumes the user has root or sudo access on the Linode instance
- For initial setup, SSH password authentication may be required until SSH keys are configured
- Linode API rate limits apply (check headers in response)
