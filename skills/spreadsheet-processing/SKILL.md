---
name: spreadsheet-processing
description: >
  Create, edit, analyze, and format spreadsheets (.xlsx, .csv, .tsv) using
  JavaScript libraries. Use when working with Excel files, tabular data, formulas,
  charts, or data analysis tasks. Supports reading, writing, formatting, and
  preserving existing spreadsheet structures.
---

# Spreadsheet Processing

## When to Use
- Build new workbooks with formulas, formatting, and structured layouts
- Read or analyze tabular data (filter, aggregate, compute metrics)
- Modify existing workbooks without breaking formulas or references
- Create charts, pivot tables, or visualizations
- Convert between formats (CSV ↔ XLSX)

## Core Library: ExcelJS

Primary tool: `exceljs` - full-featured Excel library for Node.js

```bash
npm install exceljs
```

### Why ExcelJS
- Native JavaScript (no Python required)
- Supports formulas, formatting, charts
- Preserves existing workbook structure
- Handles large files efficiently
- Active maintenance and good documentation

## Workflow

### Creating New Workbooks
1. Initialize workbook with `new ExcelJS.Workbook()`
2. Add worksheets and structure data
3. Apply formatting and formulas
4. Add charts if needed
5. Save to `.xlsx` format

### Reading Existing Workbooks
1. Load workbook from file
2. Access worksheets by name or index
3. Iterate rows/columns to extract data
4. Preserve formulas and formatting when modifying
5. Save back to original file or new location

### Data Analysis
1. Load data (from .xlsx or .csv)
2. Process with JavaScript (array methods, aggregations)
3. Generate summary tables or metrics
4. Export results to new worksheet or file

## File Conventions
- Intermediate files: `tmp/spreadsheets/`
- Final outputs: User-specified path or workspace root
- Use descriptive filenames
- Clean up intermediate files after completion

## Common Patterns

### Create Basic Workbook
```javascript
const ExcelJS = require('exceljs');

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Sales Data');

// Add headers
sheet.columns = [
  { header: 'Date', key: 'date', width: 15 },
  { header: 'Product', key: 'product', width: 20 },
  { header: 'Quantity', key: 'quantity', width: 12 },
  { header: 'Revenue', key: 'revenue', width: 15 }
];

// Add data rows
sheet.addRow({ date: '2024-01-01', product: 'Widget', quantity: 10, revenue: 100 });
sheet.addRow({ date: '2024-01-02', product: 'Gadget', quantity: 5, revenue: 250 });

// Save
await workbook.xlsx.writeFile('sales.xlsx');
```

### Add Formulas
```javascript
// Simple formula
sheet.getCell('E2').value = { formula: 'C2*D2', result: 1000 };

// Sum range
sheet.getCell('E10').value = { formula: 'SUM(E2:E9)' };

// Reference another sheet
sheet.getCell('B5').value = { formula: 'Sheet2!A1*2' };

// Absolute reference
sheet.getCell('C3').value = { formula: 'A3*$B$1' };
```

### Apply Formatting
```javascript
// Cell formatting
const cell = sheet.getCell('A1');
cell.font = { name: 'Arial', size: 14, bold: true };
cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
cell.alignment = { vertical: 'middle', horizontal: 'center' };

// Number formatting
sheet.getCell('D2').numFmt = '$#,##0.00'; // Currency
sheet.getCell('E2').numFmt = '0.0%';      // Percentage
sheet.getCell('F2').numFmt = 'yyyy-mm-dd'; // Date

// Borders
sheet.getCell('A1').border = {
  top: { style: 'thin' },
  bottom: { style: 'thick' }
};
```

### Read Existing Workbook
```javascript
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('data.xlsx');

const sheet = workbook.getWorksheet('Sheet1');

// Iterate rows
sheet.eachRow((row, rowNumber) => {
  console.log(`Row ${rowNumber}: ${row.values}`);
});

// Access specific cell
const value = sheet.getCell('B5').value;

// Get formula
const formula = sheet.getCell('C10').formula;
```

### CSV Operations
```javascript
// Read CSV
const workbook = new ExcelJS.Workbook();
await workbook.csv.readFile('data.csv');

// Write CSV
await workbook.csv.writeFile('output.csv');

// CSV with options
await workbook.csv.writeFile('output.csv', {
  delimiter: '\t',    // TSV
  quoteChar: '"',
  includeEmptyRows: false
});
```

### Create Charts (Basic)
```javascript
// Add a chart to the worksheet
const chart = sheet.addChart({
  type: 'bar',
  title: { text: 'Sales by Product' },
  categories: 'Sheet1!$A$2:$A$10',
  values: 'Sheet1!$D$2:$D$10',
  position: { x: 400, y: 50 }
});
```

Note: ExcelJS chart support is limited. For complex charts, consider generating data and letting user create chart in Excel, or use an alternative approach.

## Formula Best Practices

### Use Formulas, Not Hardcoded Values
```javascript
// Bad: Hardcoding result
sheet.getCell('E2').value = 1250;

// Good: Using formula
sheet.getCell('E2').value = { formula: 'C2*D2' };
```

### Keep Formulas Simple
```javascript
// Bad: Complex nested formula
{ formula: 'IF(AND(A1>0,B1<100),SUM(C1:D1)*0.9,IF(A1=0,0,SUM(C1:D1)))' }

// Good: Use helper cells
sheet.getCell('F1').value = { formula: 'A1>0' };
sheet.getCell('F2').value = { formula: 'B1<100' };
sheet.getCell('F3').value = { formula: 'IF(AND(F1,F2),SUM(C1:D1)*0.9,IF(A1=0,0,SUM(C1:D1)))' };
```

### Prefer Cell References Over Magic Numbers
```javascript
// Bad
{ formula: 'H6*1.04' }

// Good: Put 1.04 in a cell (e.g., B3) and reference it
{ formula: 'H6*(1+$B$3)' }
```

### Guard Against Errors
```javascript
// Protect against division by zero
{ formula: 'IFERROR(A1/B1, 0)' }

// Protect against missing data
{ formula: 'IF(ISBLANK(A1), "N/A", A1*2)' }
```

## Formatting Requirements

### Existing Workbooks
- Preserve existing styles exactly
- Match formatting for newly filled cells
- Don't remove or change existing borders, colors, fonts

### New Workbooks
- Use appropriate number formats (dates as dates, currency with symbols)
- Headers distinct from data (bold, colored background)
- Consistent spacing and readable column widths
- Avoid borders on every cell (use selective borders for structure)
- Ensure text doesn't overflow into adjacent cells

## Color Conventions

When no specific style guidance provided:

| Color | Purpose | Example Use |
|-------|---------|-------------|
| Blue (#4472C4) | User input | Editable fields |
| Black | Formulas/derived | Calculated values |
| Green (#70AD47) | Linked/imported | External data |
| Gray (#7F7F7F) | Constants | Fixed parameters |
| Orange (#ED7D31) | Review/caution | Needs verification |
| Light Red (#FFB3BA) | Error/flag | Out of range values |
| Purple (#9F5F9F) | Control/logic | Settings or switches |
| Teal (#5B9BD5) | Key KPIs | Dashboard metrics |

## Finance-Specific Requirements

When working on financial models:

### Number Formatting
- Format zeros as "-" (em dash)
- Negative numbers: red color, in parentheses
- Always specify units in headers ("Revenue ($mm)", "Growth (%)")

```javascript
// Format as accounting with dash for zero
cell.numFmt = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"_);_(@_)';

// Negative numbers in red
cell.font = { color: { argb: 'FFFF0000' } };
```

### Citation Requirements
- Cite sources in cell comments for raw inputs
- For web-sourced data, include Source column with URLs
- Never leave placeholder text like "Source TBD"

```javascript
// Add comment to cell
sheet.getCell('B2').note = 'Source: Bloomberg, Jan 2024';
```

### Investment Banking Layouts
- Totals sum the range directly above
- Hide gridlines: `sheet.views = [{ showGridLines: false }]`
- Section headers: merged cells, dark fill, white text
- Column labels right-aligned for numbers, left-aligned for text
- Indent submetrics under parent line items

```javascript
// Merge cells for section header
sheet.mergeCells('A1:D1');
const header = sheet.getCell('A1');
header.value = 'Income Statement';
header.font = { color: { argb: 'FFFFFFFF' }, bold: true };
header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

// Hide gridlines
sheet.views = [{ showGridLines: false }];

// Border above totals row
const totalRow = sheet.getRow(10);
totalRow.eachCell(cell => {
  cell.border = { top: { style: 'thin' } };
});
```

## Data Analysis Patterns

### Filter and Aggregate
```javascript
const data = [];
sheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return; // Skip header
  data.push({
    product: row.getCell(1).value,
    revenue: row.getCell(2).value
  });
});

// Aggregate
const totalRevenue = data.reduce((sum, row) => sum + row.revenue, 0);
const avgRevenue = totalRevenue / data.length;

// Filter
const highPerformers = data.filter(row => row.revenue > 1000);
```

### Pivot Table (Manual)
```javascript
const pivot = {};
sheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const category = row.getCell(1).value;
  const value = row.getCell(2).value;
  
  if (!pivot[category]) pivot[category] = 0;
  pivot[category] += value;
});

// Write pivot to new sheet
const pivotSheet = workbook.addWorksheet('Pivot');
pivotSheet.addRow(['Category', 'Total']);
Object.entries(pivot).forEach(([category, total]) => {
  pivotSheet.addRow([category, total]);
});
```

## Error Handling

### Common Issues
- File not found: Check path and existence before reading
- Formula errors: Use IFERROR or IFNA to handle
- Encoding issues: Specify encoding when reading CSV
- Memory issues: For very large files, process in chunks

### ExcelJS Limitations
- Cannot evaluate formulas (results calculate when opened in Excel)
- Limited chart support compared to Excel's native capabilities
- Some advanced Excel features (VBA, pivot tables) not supported

When these limitations are hit, inform user and suggest alternatives:
- Open file in Excel to evaluate formulas
- Create data structure that user can chart manually
- Use Python (openpyxl/pandas) for advanced features if needed

## Python Fallback (Advanced Users Only)

For tasks beyond ExcelJS capabilities (complex pivot tables, advanced charts):

```bash
pip install openpyxl pandas

# Python pivot table
python -c "
import pandas as pd
df = pd.read_excel('data.xlsx')
pivot = df.pivot_table(values='Revenue', index='Product', aggfunc='sum')
pivot.to_excel('pivot.xlsx')
"
```

Only suggest Python when JavaScript approach is insufficient.

## Final Checklist
- [ ] Formulas use cell references, not hardcoded values
- [ ] Number formats appropriate (currency, dates, percentages)
- [ ] Headers distinct from data (formatting)
- [ ] No visual defects (overlapping text, unreadable cells)
- [ ] Citations embedded where required
- [ ] Existing formatting preserved (if modifying existing file)
- [ ] Intermediate files cleaned up
