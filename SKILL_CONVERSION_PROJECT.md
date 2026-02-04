# OpenClaw Skill Suite

A set of production-ready OpenClaw skills for PDF handling, screenshots, spreadsheets, and planning.

## 📦 Skills

1. **PDF Processing**
   - Read, create, and validate PDF files
   - Optional visual validation with Poppler
2. **Screenshot Capture**
   - Browser and desktop screenshot capture
   - Browser automation + OS command fallback
3. **Spreadsheet Processing**
   - Create and analyze Excel/CSV files
   - Pure JavaScript (ExcelJS) approach
4. **Create Plan**
   - Create concise, actionable project plans
   - Context-aware planning guidance

## ✅ Prerequisites

### PDF Processing
```bash
npm install pdf-parse pdfkit pdf-lib
```

Optional visual validation:
```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt-get install -y poppler-utils

# Windows (with Chocolatey)
choco install poppler
```

### Screenshot Capture

Browser automation (optional but recommended):
```bash
npm install -D playwright
npx playwright install chromium
```

Linux screenshot tools (install one):
```bash
# Ubuntu/Debian
sudo apt-get install -y scrot
# or
sudo apt-get install -y gnome-screenshot
# or
sudo apt-get install -y imagemagick

# Fedora/RHEL
sudo dnf install -y scrot
# or
sudo dnf install -y gnome-screenshot
# or
sudo dnf install -y ImageMagick
```

### Spreadsheet Processing
```bash
npm install exceljs
```

### Create Plan
No installation required.

## 📁 Recommended Layout

Place skills in your OpenClaw skills directory:
```
~/.openclaw/skills/
├── pdf-processing/
├── screenshot-capture/
├── spreadsheet-processing/
└── create-plan/
```

## 🎯 Design Principles

- **DRY**: Single source of truth for each workflow
- **YAGNI**: Optional dependencies, minimal overhead
- **Scalable**: Works for small tasks and larger projects
- **Consistent**: Clear templates and predictable outputs

## 🧪 Testing Ideas

- PDF: extract text, generate document, merge PDFs
- Screenshot: capture browser page and desktop window
- Spreadsheet: create workbook, add formulas, export CSV
- Plan: produce a 6–10 item plan for a non-trivial feature

## 📚 Usage

Mention the task in OpenClaw or reference the skill directly:
- `@pdf-processing`
- `@screenshot-capture`
- `@spreadsheet-processing`
- `@create-plan`
