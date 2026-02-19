# Linode Server - Security Setup Complete ✅

**Date:** 2026-02-18  
**Server:** Linode ubuntu-eu-west (45.79.135.101)

## Completed Security Measures

### 1. SSH Hardening ✅
- Password authentication disabled
- Root login only with SSH key
- SSH key generated at `~/.ssh/id_ed25519_linode`
- Accessible from Mac at: `ssh -i ~/.ssh/id_ed25519_linode root@45.79.135.101`

### 2. Firewall (UFW) ✅
- Default incoming: DENY
- Default outgoing: ALLOW
- Port 22/TCP (SSH) allowed

### 3. Fail2ban ✅
- Installed and enabled
- SSH brute-force protection (3 attempts, 1h ban)
- Auto-start on boot

### 4. Unattended Upgrades ✅
- Enabled for security/updates
- Auto-reboot if needed (2:00 AM)
- Email reports to root@localhost

## OpenClaw Installation Notes

When you're ready to install OpenClaw on this server:
1. Run `openclaw gateway start` (opens port 8080 by default)
2. You may need to allow that port in UFW: `ufw allow 8080/tcp`
3. Or configure OpenClaw to use a different port via config

---

**Next steps (optional):**
- Test OpenClaw installation
- Configure monitoring/alerting
- Set up cron jobs for periodic security checks
