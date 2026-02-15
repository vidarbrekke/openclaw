# Exec Denylist Strategy

## Problem

OpenClaw's exec approvals system doesn't have a built-in denylist mode. It only supports:
- `deny`: Block all commands
- `allowlist`: Only allowlisted commands can run
- `full`: Allow everything

## Solution: Hybrid Approach

Since you want most commands to run autonomously but block destructive ones, we'll use:

1. **`security: "full"`** - Allow all commands by default
2. **`ask: "on-miss"`** - Prompt when patterns match dangerous commands
3. **Pattern-based blocking** - Use approval system to catch dangerous patterns

However, OpenClaw's approval system doesn't automatically check command patterns against a denylist. The approval prompts are triggered by allowlist misses, not pattern matches.

## Recommended Approach: Allowlist with Safe Defaults

The most practical solution is to use an **allowlist** but populate it with common safe commands, then prompt for anything else. This gives you:

- ✅ Safe commands run automatically
- ✅ Unknown/dangerous commands require approval
- ✅ You can build up the allowlist over time

## Alternative: Custom Script Wrapper

If you need true denylist behavior, you could create a wrapper script that:
1. Checks commands against a denylist pattern file
2. Blocks dangerous commands before they reach OpenClaw
3. Allows everything else

This would require modifying how exec commands are invoked, which may not be straightforward.

## Current Configuration

Your current setup uses `security: "full"` which allows everything. To get denylist-like behavior, you'd need to:

1. Switch to `security: "allowlist"`
2. Build up an allowlist of safe commands
3. Use `ask: "on-miss"` to prompt for new commands
4. Manually approve/deny based on whether they're dangerous

## Destructive Command Patterns to Block

Common destructive commands to watch for:
- `rm -rf /` or `rm -rf ~` (recursive delete)
- `dd if=/dev/zero` (disk wiping)
- `mkfs.*` (filesystem formatting)
- `fdisk`, `parted` (partition manipulation)
- `passwd`, `chpasswd`, `usermod` (user credential changes)
- `chmod -R 777 /` (permission changes)
- `systemctl disable` (service disabling)
- `crontab -r` (cron deletion)
- Commands with `sudo` + destructive operations

## Implementation Options

### Option 1: Use Allowlist (Recommended)
Switch to allowlist mode and build up safe commands over time.

### Option 2: Manual Review
Keep `security: "full"` but set `ask: "always"` to review every command (not autonomous).

### Option 3: Request Feature
OpenClaw could add a `denylist` security mode that:
- Allows all commands by default
- Blocks commands matching denylist patterns
- Prompts for commands matching denylist patterns

Would you like me to implement Option 1 (allowlist with safe defaults)?
