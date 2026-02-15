# Exec Denylist Approach (Using Allowlist)

## Overview

OpenClaw doesn't have a built-in denylist feature, but we can achieve similar behavior using an **allowlist** with common safe commands. This works like a denylist because:

- ✅ **Safe commands** (in allowlist) run automatically
- ⚠️ **Unknown/dangerous commands** (not in allowlist) require approval
- 🚫 **Destructive commands** can be denied when prompted

## How It Works

### Configuration
- **`security: "allowlist"`** - Only allowlisted commands can run
- **`ask: "on-miss"`** - Prompt when allowlist doesn't match
- **`askFallback: "deny"`** - Block if UI unavailable

### Behavior
1. Commands matching allowlist patterns → **Run automatically** ✅
2. Commands NOT in allowlist → **Prompt for approval** ⚠️
3. You can approve or deny when prompted
4. Approved commands can be added to allowlist for future use

## Current Allowlist Patterns

The configuration includes common safe binary paths:
- `/usr/bin/*` - Standard system binaries
- `/opt/homebrew/bin/*` - Homebrew binaries (macOS)
- `/usr/local/bin/*` - Local binaries
- `/bin/*` - Core system binaries
- `/usr/sbin/*` - System administration binaries
- `**/node_modules/.bin/*` - npm scripts
- `**/venv/bin/*` - Python virtual environments
- `**/.venv/bin/*` - Python virtual environments (alt)

## Destructive Commands That Will Be Blocked

These commands are **NOT** in the allowlist and will require approval:

### File Deletion
- `rm -rf /` or `rm -rf ~` (recursive delete)
- `rm -rf /*` (delete root filesystem)
- Any `rm` with dangerous flags

### Disk Operations
- `dd if=/dev/zero` (disk wiping)
- `mkfs.*` (filesystem formatting)
- `fdisk`, `parted` (partition manipulation)
- `diskutil eraseDisk` (macOS disk formatting)

### User/System Changes
- `passwd`, `chpasswd`, `usermod` (user credential changes)
- `chmod -R 777 /` (permission changes)
- `systemctl disable` (service disabling)
- `crontab -r` (cron deletion)
- `sudo` + destructive operations

### Network/System
- `iptables -F` (firewall rules)
- `shutdown`, `reboot` (system control)
- `killall` with dangerous signals

## Adding Safe Commands

When you approve a command, you can add it to the allowlist:

1. **Via Control UI**: Go to Nodes → Exec approvals → Add pattern
2. **Via CLI**: `openclaw approvals` command
3. **Manually**: Edit `~/.openclaw/exec-approvals.json`

## Limitations

⚠️ **This is not a true denylist** - it's an allowlist approach:
- Commands must be explicitly allowlisted to run automatically
- New commands require approval
- You need to build up the allowlist over time

## Protection Against Regex Workarounds

The allowlist matches **resolved binary paths**, not command strings. This means:
- ✅ `rm -rf /` → Checks if `/usr/bin/rm` is allowlisted (it is)
- ⚠️ But `rm` with dangerous args will still run if `/usr/bin/rm` is allowlisted
- 🚫 However, the approval prompt will show the full command, so you can deny it

**Note**: To truly block dangerous command arguments, you'd need:
1. A custom wrapper script that parses command arguments
2. Or always use `ask: "always"` to review every command (not autonomous)

## Recommended Approach

For maximum protection while maintaining autonomy:

1. **Keep current allowlist** with common safe binaries
2. **Review approval prompts** carefully before approving
3. **Deny destructive commands** when prompted
4. **Add safe commands** to allowlist as you approve them
5. **Consider using `ask: "always"`** for sensitive agents if needed

## Future Enhancement

A true denylist feature would require OpenClaw to support:
- Pattern matching on command arguments (not just binary paths)
- Automatic blocking of commands matching denylist patterns
- Running commands automatically unless they match denylist

This could be requested as a feature enhancement to OpenClaw.
