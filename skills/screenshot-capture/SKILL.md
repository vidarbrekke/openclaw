---
name: screenshot-capture
description: >
  Capture screenshots of browser content, desktop applications, or system screens.
  Use when the user asks for screenshots, screen captures, or visual inspection of
  UI. Prefer browser automation for web/app screenshots; fall back to OS commands
  for full desktop captures.
---

# Screenshot Capture

## When to Use
- User explicitly requests a screenshot or screen capture
- Visual inspection needed for debugging UI issues
- Comparing design mockups with implemented UI
- Capturing browser content, desktop apps, or full system screens

## Tool Selection Strategy

### Prefer Browser Automation (if available)
- Browser pages and web apps
- Electron apps accessible via browser automation
- Specific elements or regions within web pages
- Any task where you need to interact before capturing

### Use OS Commands
- Full desktop screenshots (all screens)
- Specific desktop application windows (not web-based)
- System-level captures when browser automation cannot access the target
- Region captures of non-browser content

## Save Location Rules

1. **User specifies path**: Save to that exact path
2. **User requests "a screenshot"**: Save to OS default screenshot location
3. **Agent needs inspection**: Save to `tmp/screenshots/`

## Browser Automation Approach

### Browser/Page Screenshots

**Use the `browser` tool** (preferred - follows routing policy):
- Default to agent-browser for screenshots/PDF/video
- Only falls back to Playwright MCP on failures

```bash
# Browser automation via OpenClaw tools (respects router policy)
# The browser skill will route to appropriate backend
```

**Direct Playwright (fallback only)**:
```bash
# If browser tool unavailable, use npx playwright directly
npx playwright screenshot https://example.com --path output.png --browser=chromium --full-page
```

### Element Screenshots
Use browser automation tools to:
1. Navigate to the target page with `browser` tool
2. Select the element by selector
3. Capture screenshot of that element only

### Before/After Comparisons
When comparing design vs. implementation:
1. Capture design mockup (exported from design tool or provided by user)
2. Capture live implementation via browser automation
3. Save both to temp directory
4. Display paths for user review

## OS-Level Screenshots

### macOS Commands

```bash
# Full screen (all displays) - saves to Desktop
screencapture -x ~/Desktop/screenshot.png

# Interactive window selection (user clicks)
screencapture -x -i output.png

# Specific window by ID
screencapture -x -l [WINDOW_ID] output.png

# Region (x, y, width, height)
screencapture -x -R 100,200,800,600 output.png
```

**macOS Permissions**: Screen Recording permission required for window/app capture. If denied, user must enable in System Preferences > Security & Privacy > Screen Recording.

### Linux Commands

Use first available tool: `scrot`, `gnome-screenshot`, or ImageMagick `import`

```bash
# Check availability
command -v scrot || command -v gnome-screenshot || command -v import

# Full screen (scrot)
scrot output.png

# Full screen (gnome-screenshot)
gnome-screenshot -f output.png

# Active window (scrot)
scrot -u output.png

# Region (scrot)
scrot -a 100,200,800,600 output.png

# Region (ImageMagick)
import -window root -crop 800x600+100+200 output.png
```

If none available, inform user:
> "Screenshot tools not found. Install one of: scrot, gnome-screenshot, or imagemagick"

### Windows Commands

```powershell
# Full screen
powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds | % { $bmp = New-Object System.Drawing.Bitmap($_.Width, $_.Height); [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($_.X, $_.Y, 0, 0, $bmp.Size); $bmp.Save('output.png'); $bmp.Dispose() }"

# Shorter: Use Snipping Tool (Windows 10+)
# Not automatable - suggest user runs manually if needed
```

For Windows, consider suggesting the user manually use Snipping Tool or Snip & Sketch for interactive captures.

## Workflow Examples

### Example 1: "Take a screenshot of this page"
1. Check if current context is a browser (automation available)
2. Use browser automation to screenshot current page
3. Save to `tmp/screenshots/page.png`
4. Display path to user

### Example 2: "Capture my entire desktop"
1. Detect OS (macOS/Linux/Windows)
2. Use appropriate OS command for full screen
3. Save to OS default location
4. Display path to user

### Example 3: "Compare the design mockup with the implemented app"
1. Capture design mockup (exported or provided by user)
2. Navigate to implemented app with browser automation
3. Capture app screenshot
4. Save both to `tmp/screenshots/comparison/`
5. Display both paths for side-by-side review

### Example 4: "Screenshot the login button"
1. Navigate to page with browser automation
2. Use element selector to find button
3. Capture screenshot of element only
4. Save to user-specified path

## Multi-Display Behavior

### macOS
- Full-screen capture creates one file per display
- Files named with `-d1`, `-d2` suffixes
- Display each path to user sequentially

### Linux
- Full-screen capture includes all monitors in one virtual desktop image
- Use region capture to isolate specific monitor if needed

### Windows
- Similar to Linux (virtual desktop spans all monitors)
- Use region coordinates to capture specific monitor

## Error Handling

### Browser Automation Issues
- Browser not available: Fall back to OS commands or inform user
- Page navigation timeout: Increase timeout or check URL
- Element not found: Verify selector or capture full page instead

### macOS Permissions
- "screen capture checks are blocked": User needs to enable Screen Recording permission
- Guide user: System Preferences > Security & Privacy > Screen Recording > Enable for the terminal or OpenClaw app

### Linux Missing Tools
- Check each tool with `command -v [tool]`
- Inform user which tools are available and how to install missing ones

### Windows PowerShell
- Script execution policy: May need `-ExecutionPolicy Bypass`
- Permissions: May require elevated prompt for some operations

## File Cleanup
- Agent inspection screenshots: Delete from `tmp/screenshots/` after use
- User-requested screenshots: Keep at specified location
- Comparison screenshots: Keep until user confirms done, then clean up

## Quality Checks
- Verify screenshot saved successfully (check file exists and size > 0)
- For element screenshots, ensure element is visible (not scrolled out of view)
- For full-page screenshots, verify entire page captured (not just viewport)
