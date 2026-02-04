# PDF Processing Examples

## Example 1: Extract Text and Analyze Word Count

```javascript
const fs = require('fs');
const pdf = require('pdf-parse');

async function analyzeDocument(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdf(dataBuffer);
  
  const wordCount = data.text.split(/\s+/).length;
  const pageCount = data.numpages;
  
  console.log(`Pages: ${pageCount}`);
  console.log(`Words: ${wordCount}`);
  console.log(`Avg words/page: ${Math.round(wordCount / pageCount)}`);
  
  return {
    text: data.text,
    wordCount,
    pageCount
  };
}

analyzeDocument('report.pdf');
```

## Example 2: Generate Invoice PDF

```javascript
const PDFDocument = require('pdfkit');
const fs = require('fs');

function generateInvoice(invoiceData, outputPath) {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(outputPath));
  
  // Header
  doc.fontSize(20).text('INVOICE', { align: 'center' });
  doc.moveDown();
  
  // Invoice details
  doc.fontSize(10);
  doc.text(`Invoice #: ${invoiceData.number}`, 50, 100);
  doc.text(`Date: ${invoiceData.date}`, 50, 115);
  doc.text(`Due: ${invoiceData.dueDate}`, 50, 130);
  
  // Bill to
  doc.text(`Bill To:`, 50, 160);
  doc.text(invoiceData.billTo.name, 50, 175);
  doc.text(invoiceData.billTo.address, 50, 190);
  
  // Items table
  const tableTop = 250;
  doc.text('Description', 50, tableTop);
  doc.text('Qty', 300, tableTop);
  doc.text('Price', 400, tableTop);
  doc.text('Total', 480, tableTop);
  
  doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
  
  let y = tableTop + 30;
  invoiceData.items.forEach(item => {
    doc.text(item.description, 50, y);
    doc.text(item.quantity.toString(), 300, y);
    doc.text(`$${item.price.toFixed(2)}`, 400, y);
    doc.text(`$${(item.quantity * item.price).toFixed(2)}`, 480, y);
    y += 25;
  });
  
  // Total
  doc.moveTo(50, y).lineTo(550, y).stroke();
  y += 15;
  doc.fontSize(12).text('Total:', 400, y);
  doc.text(`$${invoiceData.total.toFixed(2)}`, 480, y);
  
  doc.end();
}

// Usage
const invoice = {
  number: 'INV-001',
  date: '2024-02-03',
  dueDate: '2024-03-03',
  billTo: {
    name: 'Acme Corp',
    address: '123 Main St, City, State 12345'
  },
  items: [
    { description: 'Consulting Services', quantity: 10, price: 150 },
    { description: 'Software License', quantity: 1, price: 500 }
  ],
  total: 2000
};

generateInvoice(invoice, 'invoice.pdf');
```

## Example 3: Merge Multiple PDFs

```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

async function mergePDFs(inputPaths, outputPath) {
  const mergedPdf = await PDFDocument.create();
  
  for (const path of inputPaths) {
    const pdfBytes = await fs.readFile(path);
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  
  const mergedPdfBytes = await mergedPdf.save();
  await fs.writeFile(outputPath, mergedPdfBytes);
  
  console.log(`Merged ${inputPaths.length} PDFs into ${outputPath}`);
}

// Usage
mergePDFs(['doc1.pdf', 'doc2.pdf', 'doc3.pdf'], 'combined.pdf');
```

## Example 4: Split PDF into Individual Pages

```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

async function splitPDF(inputPath, outputDir) {
  const pdfBytes = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  
  await fs.mkdir(outputDir, { recursive: true });
  
  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);
    
    const pdfBytes = await newPdf.save();
    const outputPath = `${outputDir}/page_${i + 1}.pdf`;
    await fs.writeFile(outputPath, pdfBytes);
    console.log(`Created ${outputPath}`);
  }
}

// Usage
splitPDF('document.pdf', 'output_pages');
```

## Example 5: Add Watermark to PDF

```javascript
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs').promises;

async function addWatermark(inputPath, outputPath, watermarkText) {
  const existingPdfBytes = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  
  pages.forEach(page => {
    const { width, height } = page.getSize();
    
    page.drawText(watermarkText, {
      x: width / 2 - 100,
      y: height / 2,
      size: 50,
      color: rgb(0.95, 0.95, 0.95),
      rotate: { angle: 45, type: 'degrees' },
      opacity: 0.3
    });
  });
  
  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);
  console.log(`Watermarked PDF saved to ${outputPath}`);
}

// Usage
addWatermark('document.pdf', 'watermarked.pdf', 'CONFIDENTIAL');
```

## Example 6: Visual Validation with Poppler

```bash
#!/bin/bash
# Save as: validate_pdf_visual.sh

PDF_FILE="$1"
OUTPUT_DIR="tmp/pdfs/preview"

if [ ! -f "$PDF_FILE" ]; then
  echo "Error: PDF file not found: $PDF_FILE"
  exit 1
fi

# Check if pdftoppm is available
if ! command -v pdftoppm &> /dev/null; then
  echo "Error: pdftoppm not found. Install with:"
  echo "  macOS: brew install poppler"
  echo "  Linux: sudo apt-get install poppler-utils"
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Render all pages to PNG
echo "Rendering $PDF_FILE to PNG..."
pdftoppm -png "$PDF_FILE" "$OUTPUT_DIR/page"

# List generated files
echo "Generated preview images:"
ls -lh "$OUTPUT_DIR"/*.png

echo ""
echo "Review each image for:"
echo "  - Clipped or overlapping text"
echo "  - Missing images or graphics"
echo "  - Incorrect alignment or spacing"
echo "  - Unreadable fonts or glyphs"
```

## Common Pitfalls and Solutions

### Issue: Text Extraction Order Wrong
**Problem**: Multi-column PDFs extract text in wrong order
**Solution**: Use pdfplumber with layout awareness
```javascript
const pdfplumber = require('pdfplumber'); // Note: Not available in npm, use pdf-parse

// With pdf-parse, text order is best-effort
// For precise column extraction, consider:
// 1. Python pdfplumber for complex layouts
// 2. Manual post-processing based on document structure
```

### Issue: Generated PDF Fonts Look Bad
**Problem**: Default fonts are basic
**Solution**: Use custom fonts
```javascript
const doc = new PDFDocument();
doc.registerFont('CustomFont', 'path/to/font.ttf');
doc.font('CustomFont').text('Better looking text');
```

### Issue: Images Not Appearing in PDF
**Problem**: Image paths wrong or format unsupported
**Solution**: Verify paths and use supported formats
```javascript
const fs = require('fs');

const imagePath = 'logo.png';
if (!fs.existsSync(imagePath)) {
  console.error(`Image not found: ${imagePath}`);
} else {
  doc.image(imagePath, 50, 50, { width: 100 });
}
```

### Issue: Memory Issues with Large PDFs
**Problem**: Loading huge PDFs consumes too much memory
**Solution**: Process in chunks or use streaming
```javascript
// For pdf-lib, load incrementally
const pdfDoc = await PDFDocument.load(pdfBytes, { 
  updateMetadata: false,
  ignoreEncryption: true 
});

// For pdf-parse, limit pages
const data = await pdf(dataBuffer, { max: 10 }); // First 10 pages only
```
