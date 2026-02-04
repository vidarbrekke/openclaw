# Screenshot Capture Skill

Screenshot capture workflow for OpenClaw.

## Strategy: Hybrid Automation + OS Fallback

This skill uses the right tool for each job:
- **Browser automation**: For browser/web app screenshots
- **OS commands**: For desktop/system screenshots when needed

## Prerequisites

- **Browser automation**: Playwright CLI (optional but recommended)
- **OS screenshot tools**: Built-in on macOS/Windows; install on Linux if needed

### Install Playwright (optional)
```bash
npm install -D playwright
```

Install browsers:
```bash
npx playwright install chromium
```

### Linux screenshot tools (install one)
```bash
sudo apt-get install -y scrot
# or
sudo apt-get install -y gnome-screenshot
# or
sudo apt-get install -y imagemagick
```

## Design Principles (DRY, YAGNI, Scalability)

- **DRY**: Single decision logic in SKILL.md, no duplicate scripts
- **YAGNI**: No script files (agent constructs commands on-demand)
- **Complexity**: Medium (requires smart routing between automation and OS)
- **Scalability**: High (uses standard tools)

## Usage

See `SKILL.md` for full instructions.

Quick examples:

### Browser Screenshot (Playwright)
```bash
npx playwright screenshot https://example.com --path output.png --browser=chromium
```

### Desktop Screenshot (macOS)
```bash
screencapture -x ~/Desktop/screenshot.png
```

### Desktop Screenshot (Linux)
```bash
scrot output.png
```

## Tool Selection Logic

1. **Browser/web app?** → Use browser automation (Playwright)
2. **Desktop app/full screen?** → Use OS commands
3. **Not sure?** → Try automation first, fall back to OS
