const PDFDocument = require('pdfkit');
const fs = require('fs');

// Create a new PDF document
const doc = new PDFDocument();
const outputPath = '/Users/vidarbrekke/clawd/poem.pdf';

// Pipe the PDF to a file
doc.pipe(fs.createWriteStream(outputPath));

// Register Times New Roman font (use built-in Times as fallback if needed)
// PDFKit uses Helvetica by default, but we can try to use Times

doc.font('Times-Roman')
   .fontSize(25);

// Write the poem
const poem = `Morning Light

The sun climbs slow above the trees,
Gold spills across the quiet room.
Coffee steams, a soft breeze,
Another day begins to bloom.

Typewriter clicks, the words appear,
Ideas dance on paper white.
No hurry now, no distant fear—
Just morning, simple, pure, and light.

— For Vidar, February 2026`;

doc.text(poem, {
  align: 'left',
  lineGap: 8
});

// Finalize the PDF
doc.end();

console.log(`✓ PDF created: ${outputPath}`);
