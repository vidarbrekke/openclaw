---
name: pdf-processing
description: >
  Read, create, and manipulate PDF files with reliable formatting and optional
  visual validation. Use when tasks involve reading PDF content, generating PDFs
  programmatically, extracting text/tables, or validating PDF layout and rendering.
  Supports both basic operations (Node.js only) and advanced features (requires
  Poppler for visual checks).
---

# PDF Processing

## When to use
- Read or extract text/tables from existing PDFs
- Generate PDFs programmatically with reliable formatting
- Validate final rendering before delivery (optional: requires Poppler)
- Fill PDF forms or merge documents

## Core vs. Advanced Features

### Core (always available)
- Text extraction and basic analysis (pdf-parse)
- PDF generation (pdfkit)
- Basic manipulation (pdf-lib)

### Advanced (requires system dependencies)
- Visual rendering to PNG for quality validation (Poppler pdftoppm)
- Complex layouts with precise positioning (optional: Python reportlab)

## Workflow

### Basic PDF Tasks
1. Use `pdf-parse` for text extraction from existing PDFs
2. Use `pdfkit` for generating new PDFs with text/images
3. Use `pdf-lib` for merging, splitting, or modifying existing PDFs
4. Save outputs to `tmp/pdfs/` during work; move final files to user-specified location

### Visual Validation (Optional)
1. Check if `pdftoppm` is available: `command -v pdftoppm`
2. If available, render PDF pages to PNG for inspection:
   ```bash
   pdftoppm -png input.pdf output_prefix
   ```
3. Review PNGs for layout issues, clipped text, alignment problems
4. If unavailable, inform user and suggest local review or installation

## Dependencies

### Always install (Node.js)
```bash
npm install pdf-parse pdfkit pdf-lib
```

### Optional (for visual validation)
```bash
# macOS
brew install poppler

# Ubuntu/Debian
sudo apt-get install -y poppler-utils
```

If Poppler isn't available and visual validation is needed, inform the user:
> "Visual validation requires Poppler. Install with: `brew install poppler` (macOS) or `sudo apt-get install poppler-utils` (Linux). Skipping visual checks for now."

## File Conventions
- Intermediate files: `tmp/pdfs/`
- Final outputs: User-specified path or workspace root
- Use descriptive, stable filenames
- Clean up intermediate files after task completion

## Quality Expectations

### Text Content
- Extracted text should be clean and properly ordered
- Preserve paragraph structure when possible
- Handle multi-column layouts correctly

### Generated PDFs
- Consistent typography, spacing, margins
- Section hierarchy should be clear
- No clipped text, overlapping elements, or unreadable glyphs
- Tables and images must be aligned and labeled
- Use standard ASCII characters (avoid Unicode dashes like U+2011)

### Citations
- Embed sources as plain text URLs in the PDF
- For data tables, include a Source column or footer
- Never leave placeholder text like "CITATION NEEDED"

## Common Patterns

### Extract text from PDF
```javascript
const fs = require('fs');
const pdf = require('pdf-parse');

const dataBuffer = fs.readFileSync('document.pdf');
pdf(dataBuffer).then(data => {
  console.log(data.text); // Extracted text
  console.log(data.numpages); // Page count
});
```

### Generate simple PDF
```javascript
const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('output.pdf'));

doc.fontSize(20).text('Title', { align: 'center' });
doc.moveDown();
doc.fontSize(12).text('Body content here...');

doc.end();
```

### Merge multiple PDFs
```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

async function mergePDFs(paths, outputPath) {
  const merged = await PDFDocument.create();
  
  for (const path of paths) {
    const pdf = await PDFDocument.load(await fs.readFile(path));
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(page => merged.addPage(page));
  }
  
  const bytes = await merged.save();
  await fs.writeFile(outputPath, bytes);
}
```

### Visual validation (when Poppler available)
```bash
# Render all pages to PNG
pdftoppm -png document.pdf tmp/pdfs/preview

# This creates preview-1.png, preview-2.png, etc.
# Inspect each PNG for visual defects before delivering
```

## Error Handling

### Missing dependencies
- If Node.js packages missing: Install with `npm install`
- If Poppler missing and visual validation requested: Inform user and skip validation
- If PDF is encrypted: Inform user that password is required

### Rendering issues
- Fonts missing: Use built-in fonts or embed custom fonts
- Images not appearing: Verify image paths and formats
- Text overflow: Adjust page dimensions or text size

## Python Fallback (Advanced Users)

For complex layouts requiring precise positioning, users can optionally use Python:

```bash
# Install Python dependencies
pip install reportlab pdfplumber pypdf

# Generate with reportlab
python -c "
from reportlab.pdfgen import canvas
c = canvas.Canvas('output.pdf')
c.drawString(100, 750, 'Hello World')
c.save()
"
```

Only suggest Python when Node.js libraries cannot achieve the desired layout complexity.

## Final Checklist
- [ ] Text is readable and properly formatted
- [ ] No visual defects (clipped text, overlapping elements)
- [ ] Citations are embedded and human-readable
- [ ] Page numbering and headers/footers work correctly
- [ ] Intermediate files cleaned up
