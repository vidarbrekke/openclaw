# Spreadsheet Processing Skill

Spreadsheet processing skill using a pure JavaScript approach.

## Strategy: Pure JavaScript (ExcelJS)

This skill uses Node.js native approach:
- **Primary library**: ExcelJS (handles 90% of Excel tasks)
- **No Python required**: JavaScript-first by default
- **Python fallback**: Only mentioned for rare edge cases

## Implementation Notes

- Primary language: JavaScript/Node.js
- Excel library: ExcelJS
- Data analysis: Native JavaScript
- Charts: ExcelJS (limited)
- CSV handling: ExcelJS + Node.js fs

## Installation

```bash
npm install exceljs
```

That's it! No Python, no system dependencies.

## Design Principles (DRY, YAGNI, Scalability)

- **DRY**: Single library (ExcelJS) for all spreadsheet tasks
- **YAGNI**: Only JavaScript—no Python unless explicitly needed
- **Complexity**: Low (one primary tool, clear patterns)
- **Scalability**: Medium (handles most tasks; rare edge cases need Python)

## Usage

See `SKILL.md` for full instructions and `examples.md` for runnable code.

Quick example:
```javascript
const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('My Sheet');

sheet.columns = [
  { header: 'Name', key: 'name', width: 20 },
  { header: 'Score', key: 'score', width: 10 }
];

sheet.addRow({ name: 'Alice', score: 95 });
sheet.addRow({ name: 'Bob', score: 87 });

await workbook.xlsx.writeFile('output.xlsx');
```

## ExcelJS Capabilities

✅ **Supported**:
- Reading/writing .xlsx, .csv
- Formulas (evaluated by Excel when opened)
- Cell formatting (fonts, colors, borders)
- Number formats (currency, dates, percentages)
- Multiple worksheets with cross-sheet references
- Merging cells, freezing panes, filters
- Basic charts

❌ **Not Supported**:
- Formula evaluation (shows formula, Excel calculates result)
- Pivot tables (manual aggregation instead)
- VBA macros
- Complex charts (create data structure for user to chart)

## When to Use Python Fallback

Only suggest Python for:
- Complex pivot tables with multiple dimensions
- Advanced data science (regression, ML)
- Large-scale data processing (millions of rows)

Otherwise, ExcelJS handles everything.
