# OpenClaw Skills - Installation Guide

Four production-ready skills now available in `/Users/vidarbrekke/clawd/skills/`:

## 📦 Available Skills

1. **pdf-processing** - Read, create, and validate PDF files
2. **screenshot-capture** - Browser and desktop screenshot capture
3. **spreadsheet-processing** - Excel/CSV file handling
4. **create-plan** - Context-aware planning workflow

## 🚀 Quick Install

### 1. PDF Processing

```bash
cd ~/clawd
npm install pdf-parse pdfkit pdf-lib
```

**Optional** - Visual validation:
```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt-get install -y poppler-utils

# Windows
choco install poppler
```

### 2. Screenshot Capture

**Optional** - Browser automation:
```bash
cd ~/clawd
npm install -D playwright
npx playwright install chromium
```

**Linux only** - Install a screenshot tool (if not present):
```bash
# Ubuntu/Debian (choose one)
sudo apt-get install -y scrot
# or
sudo apt-get install -y gnome-screenshot
# or
sudo apt-get install -y imagemagick

# Fedora/RHEL (choose one)
sudo dnf install -y scrot
# or
sudo dnf install -y gnome-screenshot
# or
sudo dnf install -y ImageMagick
```

### 3. Spreadsheet Processing

```bash
cd ~/clawd
npm install exceljs
```

### 4. Create Plan

No installation required - it's a workflow guidance skill.

## 📋 All-in-One Install

Install all npm dependencies at once:

```bash
cd ~/clawd
npm install pdf-parse pdfkit pdf-lib exceljs
npm install -D playwright
npx playwright install chromium
```

System dependencies (optional):
```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt-get install -y poppler-utils scrot
```

## 🧪 Verify Installation

Test each skill:

### PDF Processing
```javascript
const pdf = require('pdf-parse');
console.log('pdf-parse:', pdf ? '✓' : '✗');

const PDFDocument = require('pdfkit');
console.log('pdfkit:', PDFDocument ? '✓' : '✗');

const { PDFDocument: PDFLib } = require('pdf-lib');
console.log('pdf-lib:', PDFLib ? '✓' : '✗');
```

### Screenshot Capture
```bash
# Browser automation
npx playwright --version

# macOS
which screencapture

# Linux
which scrot || which gnome-screenshot || which import
```

### Spreadsheet Processing
```javascript
const ExcelJS = require('exceljs');
console.log('exceljs:', ExcelJS ? '✓' : '✗');
```

## 📖 Usage

Reference skills in OpenClaw:
- `@pdf-processing`
- `@screenshot-capture`
- `@spreadsheet-processing`
- `@create-plan`

Or mention tasks naturally:
- "Extract text from this PDF"
- "Take a screenshot of this page"
- "Create an Excel file with sales data"
- "Create a plan for adding authentication"

## 📚 Documentation

- `SKILL_CONVERSION_PROJECT.md` - Main overview
- `docs/SKILL_QUICK_REFERENCE.md` - Quick start guide with examples
- Each skill has its own `SKILL.md`, `README.md`, and `examples.md` (when applicable)

## 🔧 Troubleshooting

**"Cannot find module 'pdf-parse'"**
```bash
npm install pdf-parse pdfkit pdf-lib
```

**"pdftoppm: command not found"** (optional, only needed for PDF visual validation)
```bash
brew install poppler  # macOS
sudo apt-get install poppler-utils  # Linux
```

**"Cannot find module 'exceljs'"**
```bash
npm install exceljs
```

**Playwright browser not found**
```bash
npx playwright install chromium
```

**Screenshot permission denied (macOS)**
- Go to System Preferences → Security & Privacy → Screen Recording
- Enable permission for your terminal or the OpenClaw app

## 📍 Skill Locations

Skills are available in two locations:

1. **Development/testing**: `~/.cursor/skills/` (original copies)
2. **OpenClaw production**: `/Users/vidarbrekke/clawd/skills/` (active copies)

To update skills, edit in either location and sync as needed.

---

**Status**: ✅ All skills installed and ready to use
