# PDF Processing Skill

PDF processing skill with a hybrid dependency approach.

## Strategy: Hybrid with Optional Features

This skill uses a tiered approach:
- **Core functionality**: Works with npm packages only (pdf-parse, pdfkit, pdf-lib)
- **Advanced features**: Optional visual rendering with Poppler for quality validation

## Implementation Notes

- Primary language: JavaScript/Node.js
- PDF generation: pdfkit
- Text extraction: pdf-parse
- Manipulation: pdf-lib
- Visual validation: Poppler (optional)

## Installation

### Always Required
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

## Design Principles (DRY, YAGNI, Scalability)

- **DRY**: Reuses proven workflows adapted to the JavaScript ecosystem
- **YAGNI**: System dependencies only installed when visual validation needed
- **Complexity**: Medium (handles both basic and advanced cases with clear fallbacks)
- **Scalability**: High (starts simple, grows with user needs)

## Usage

See `SKILL.md` for full instructions and `examples.md` for runnable code.

Quick example:
```javascript
const pdf = require('pdf-parse');
const fs = require('fs');

const dataBuffer = fs.readFileSync('document.pdf');
pdf(dataBuffer).then(data => {
  console.log(data.text); // Extracted text
});
```
