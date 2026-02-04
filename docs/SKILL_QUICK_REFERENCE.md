# Quick Reference: OpenClaw Skills

This guide shows how to use the OpenClaw skills in this workspace.

---

## 1. PDF Processing

**Location**: OpenClaw skills directory (e.g., `~/.openclaw/skills/pdf-processing/`)

### Quick Start
```bash
npm install pdf-parse pdfkit pdf-lib
```

### Common Tasks

**Extract text from PDF:**
```javascript
const pdf = require('pdf-parse');
const fs = require('fs');

const dataBuffer = fs.readFileSync('document.pdf');
pdf(dataBuffer).then(data => {
  console.log(data.text);
  console.log(`Pages: ${data.numpages}`);
});
```

**Generate PDF:**
```javascript
const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('output.pdf'));
doc.fontSize(20).text('Hello PDF!');
doc.end();
```

**Merge PDFs:**
```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

async function merge(files, output) {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const pdf = await PDFDocument.load(await fs.readFile(file));
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(page => merged.addPage(page));
  }
  await fs.writeFile(output, await merged.save());
}
```

**Visual validation (optional):**
```bash
# Install Poppler first
brew install poppler  # macOS

# Render PDF to PNG
pdftoppm -png document.pdf tmp/preview
```

---

## 2. Screenshot Capture

**Location**: OpenClaw skills directory (e.g., `~/.openclaw/skills/screenshot-capture/`)

### Quick Start
No installation needed for OS screenshots. For browser screenshots, install Playwright CLI.

### Common Tasks

**Browser screenshot (Playwright CLI):**
```bash
npx playwright screenshot https://example.com --path output.png --browser=chromium

# Full page
npx playwright screenshot https://example.com --full-page --path output.png --browser=chromium
```

**Desktop screenshot:**
```bash
# macOS - full screen
screencapture -x screenshot.png

# macOS - interactive selection
screencapture -x -i screenshot.png

# macOS - specific region (x,y,width,height)
screencapture -x -R 100,200,800,600 screenshot.png

# Linux
scrot screenshot.png

# Linux - active window
scrot -u screenshot.png
```

**When to use which:**
- Browser/web app → Browser automation (Playwright CLI)
- Desktop app/full screen → OS commands

---

## 3. Spreadsheet Processing

**Location**: OpenClaw skills directory (e.g., `~/.openclaw/skills/spreadsheet-processing/`)

### Quick Start
```bash
npm install exceljs
```

### Common Tasks

**Create workbook:**
```javascript
const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('My Sheet');

sheet.columns = [
  { header: 'Name', key: 'name', width: 20 },
  { header: 'Value', key: 'value', width: 15 }
];

sheet.addRow({ name: 'Item 1', value: 100 });
sheet.addRow({ name: 'Item 2', value: 200 });

await workbook.xlsx.writeFile('output.xlsx');
```

**Add formulas:**
```javascript
// Simple formula
sheet.getCell('C2').value = { formula: 'A2*B2' };

// Sum range
sheet.getCell('C10').value = { formula: 'SUM(C2:C9)' };

// Reference another sheet
sheet.getCell('D5').value = { formula: 'Sheet2!A1*2' };
```

**Format cells:**
```javascript
const cell = sheet.getCell('A1');

// Font
cell.font = { bold: true, size: 14, color: { argb: 'FF4472C4' } };

// Fill
cell.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFF0000' }
};

// Number format
cell.numFmt = '$#,##0.00';  // Currency
cell.numFmt = '0.0%';        // Percentage
cell.numFmt = 'yyyy-mm-dd';  // Date
```

**Read existing file:**
```javascript
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('data.xlsx');

const sheet = workbook.getWorksheet('Sheet1');

sheet.eachRow((row, rowNumber) => {
  console.log(`Row ${rowNumber}: ${row.values}`);
});
```

**CSV operations:**
```javascript
// Read CSV
await workbook.csv.readFile('data.csv');

// Write CSV
await workbook.csv.writeFile('output.csv');

// TSV (tab-separated)
await workbook.csv.writeFile('output.tsv', { delimiter: '\t' });
```

---

## 4. Create Plan

**Location**: OpenClaw skills directory (e.g., `~/.openclaw/skills/create-plan/`)

### Quick Start
No installation needed. Use when you want a plan before implementing.

### Example Prompt
"Create a plan for adding user authentication to this app."

---

## Getting Help

Each skill includes:
- `SKILL.md` - Full instructions and workflows
- `README.md` - Overview and rationale
- `examples.md` - Runnable examples (when applicable)

To trigger a skill in OpenClaw, mention the relevant task:
- "Extract text from this PDF"
- "Take a screenshot of this page"
- "Create an Excel file with sales data"

The agent will automatically apply the appropriate skill.

---

## Tips for Success

### PDF Processing
- Use pdf-parse for text extraction (fast, reliable)
- Use pdfkit for simple documents (invoices, reports)
- Use pdf-lib for PDF manipulation (merge, split, modify)
- Install Poppler only if you need visual validation

### Screenshot Capture
- Always use `--browser=chromium` with Playwright
- For desktop screenshots, check OS-specific syntax
- Save temp screenshots to `tmp/screenshots/` and clean up

### Spreadsheet Processing
- Use formulas instead of hardcoding values
- Apply number formats (currency, dates, percentages)
- ExcelJS doesn't evaluate formulas—Excel will when file is opened
- For complex data science, consider Python (pandas) fallback

---

## Troubleshooting

### "Cannot find module 'pdf-parse'"
```bash
npm install pdf-parse pdfkit pdf-lib
```

### "pdftoppm: command not found"
```bash
# macOS
brew install poppler

# Linux
sudo apt-get install poppler-utils
```

### "Cannot find module 'exceljs'"
```bash
npm install exceljs
```

### Screenshot permission denied (macOS)
Enable Screen Recording permission:
System Preferences → Security & Privacy → Screen Recording → Enable for the terminal or OpenClaw app

### Playwright browser not found
```bash
npx playwright install chromium
```

---

## Next Steps

1. Try each skill with a simple task
2. Review `examples.md` for advanced patterns
3. Customize workflows to your needs
4. Report issues or suggest enhancements

All skills are production-ready and follow DRY, YAGNI, and scalability best practices.
