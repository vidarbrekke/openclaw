# Spreadsheet Processing Examples

## Example 1: Sales Report with Formulas

```javascript
const ExcelJS = require('exceljs');

async function createSalesReport(salesData, outputPath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sales Report');
  
  // Set column definitions
  sheet.columns = [
    { header: 'Product', key: 'product', width: 20 },
    { header: 'Units Sold', key: 'units', width: 12 },
    { header: 'Price per Unit', key: 'price', width: 15 },
    { header: 'Total Revenue', key: 'revenue', width: 15 },
    { header: 'Commission (5%)', key: 'commission', width: 15 }
  ];
  
  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Add data rows with formulas
  let row = 2;
  salesData.forEach(item => {
    sheet.addRow({
      product: item.product,
      units: item.units,
      price: item.price
    });
    
    // Total Revenue = Units * Price
    sheet.getCell(`D${row}`).value = { formula: `B${row}*C${row}` };
    sheet.getCell(`D${row}`).numFmt = '$#,##0.00';
    
    // Commission = Revenue * 5%
    sheet.getCell(`E${row}`).value = { formula: `D${row}*0.05` };
    sheet.getCell(`E${row}`).numFmt = '$#,##0.00';
    
    row++;
  });
  
  // Add totals row
  const totalRow = row;
  sheet.getCell(`A${totalRow}`).value = 'TOTAL';
  sheet.getCell(`A${totalRow}`).font = { bold: true };
  
  sheet.getCell(`D${totalRow}`).value = { formula: `SUM(D2:D${totalRow - 1})` };
  sheet.getCell(`D${totalRow}`).numFmt = '$#,##0.00';
  sheet.getCell(`D${totalRow}`).font = { bold: true };
  
  sheet.getCell(`E${totalRow}`).value = { formula: `SUM(E2:E${totalRow - 1})` };
  sheet.getCell(`E${totalRow}`).numFmt = '$#,##0.00';
  sheet.getCell(`E${totalRow}`).font = { bold: true };
  
  // Add border above totals
  ['A', 'B', 'C', 'D', 'E'].forEach(col => {
    sheet.getCell(`${col}${totalRow}`).border = {
      top: { style: 'thick' }
    };
  });
  
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Report saved to ${outputPath}`);
}

// Usage
const salesData = [
  { product: 'Widget A', units: 100, price: 25.00 },
  { product: 'Widget B', units: 75, price: 40.00 },
  { product: 'Gadget X', units: 50, price: 120.00 }
];

createSalesReport(salesData, 'sales_report.xlsx');
```

## Example 2: Financial Model with Color Coding

```javascript
const ExcelJS = require('exceljs');

async function createFinancialModel(outputPath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Financial Model');
  
  // Hide gridlines for cleaner look
  sheet.views = [{ showGridLines: false }];
  
  // Assumptions section (blue = inputs)
  sheet.mergeCells('A1:C1');
  const header = sheet.getCell('A1');
  header.value = 'ASSUMPTIONS';
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Input cells (blue text)
  sheet.getCell('A3').value = 'Initial Investment';
  sheet.getCell('B3').value = 100000;
  sheet.getCell('B3').font = { color: { argb: 'FF4472C4' } };
  sheet.getCell('B3').numFmt = '$#,##0';
  
  sheet.getCell('A4').value = 'Annual Growth Rate';
  sheet.getCell('B4').value = 0.15;
  sheet.getCell('B4').font = { color: { argb: 'FF4472C4' } };
  sheet.getCell('B4').numFmt = '0.0%';
  
  sheet.getCell('A5').value = 'Years';
  sheet.getCell('B5').value = 5;
  sheet.getCell('B5').font = { color: { argb: 'FF4472C4' } };
  
  // Projections section
  sheet.mergeCells('A7:C7');
  const projHeader = sheet.getCell('A7');
  projHeader.value = 'PROJECTIONS';
  projHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  projHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  projHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Year headers
  sheet.getCell('A9').value = 'Year';
  sheet.getCell('B9').value = 'Value';
  sheet.getCell('C9').value = 'Growth';
  sheet.getRow(9).font = { bold: true };
  
  // Calculated values (black = formulas)
  for (let year = 0; year <= 5; year++) {
    const row = 10 + year;
    sheet.getCell(`A${row}`).value = year;
    
    if (year === 0) {
      sheet.getCell(`B${row}`).value = { formula: '$B$3' };
    } else {
      sheet.getCell(`B${row}`).value = { 
        formula: `B${row - 1}*(1+$B$4)` 
      };
    }
    sheet.getCell(`B${row}`).numFmt = '$#,##0';
    
    if (year > 0) {
      sheet.getCell(`C${row}`).value = { 
        formula: `B${row}-B${row - 1}` 
      };
      sheet.getCell(`C${row}`).numFmt = '$#,##0';
    }
  }
  
  // Summary section (teal = KPIs)
  sheet.mergeCells('A17:C17');
  const summaryHeader = sheet.getCell('A17');
  summaryHeader.value = 'SUMMARY';
  summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
  summaryHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  
  sheet.getCell('A19').value = 'Final Value';
  sheet.getCell('B19').value = { formula: 'B15' };
  sheet.getCell('B19').numFmt = '$#,##0';
  sheet.getCell('B19').font = { bold: true, color: { argb: 'FF5B9BD5' } };
  
  sheet.getCell('A20').value = 'Total Growth';
  sheet.getCell('B20').value = { formula: 'B15-B10' };
  sheet.getCell('B20').numFmt = '$#,##0';
  sheet.getCell('B20').font = { bold: true, color: { argb: 'FF5B9BD5' } };
  
  // Set column widths
  sheet.getColumn('A').width = 20;
  sheet.getColumn('B').width = 15;
  sheet.getColumn('C').width = 15;
  
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Financial model saved to ${outputPath}`);
}

createFinancialModel('financial_model.xlsx');
```

## Example 3: Data Analysis - Pivot Summary

```javascript
const ExcelJS = require('exceljs');

async function createPivotSummary(inputPath, outputPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);
  const dataSheet = workbook.getWorksheet('Sales Data');
  
  // Extract data
  const data = [];
  dataSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    data.push({
      region: row.getCell(1).value,
      product: row.getCell(2).value,
      revenue: row.getCell(3).value
    });
  });
  
  // Create pivot by region
  const pivotByRegion = {};
  data.forEach(row => {
    if (!pivotByRegion[row.region]) {
      pivotByRegion[row.region] = 0;
    }
    pivotByRegion[row.region] += row.revenue;
  });
  
  // Create pivot by product
  const pivotByProduct = {};
  data.forEach(row => {
    if (!pivotByProduct[row.product]) {
      pivotByProduct[row.product] = 0;
    }
    pivotByProduct[row.product] += row.revenue;
  });
  
  // Write pivot sheets
  const regionSheet = workbook.addWorksheet('By Region');
  regionSheet.columns = [
    { header: 'Region', key: 'region', width: 20 },
    { header: 'Total Revenue', key: 'revenue', width: 15 }
  ];
  
  Object.entries(pivotByRegion).forEach(([region, revenue]) => {
    regionSheet.addRow({ region, revenue });
    const lastRow = regionSheet.lastRow;
    lastRow.getCell(2).numFmt = '$#,##0.00';
  });
  
  const productSheet = workbook.addWorksheet('By Product');
  productSheet.columns = [
    { header: 'Product', key: 'product', width: 20 },
    { header: 'Total Revenue', key: 'revenue', width: 15 }
  ];
  
  Object.entries(pivotByProduct).forEach(([product, revenue]) => {
    productSheet.addRow({ product, revenue });
    const lastRow = productSheet.lastRow;
    lastRow.getCell(2).numFmt = '$#,##0.00';
  });
  
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Pivot summary saved to ${outputPath}`);
}

createPivotSummary('sales_data.xlsx', 'pivot_summary.xlsx');
```

## Example 4: CSV to Excel with Formatting

```javascript
const ExcelJS = require('exceljs');

async function csvToExcelWithFormatting(csvPath, outputPath) {
  const workbook = new ExcelJS.Workbook();
  
  // Read CSV
  await workbook.csv.readFile(csvPath);
  const sheet = workbook.worksheets[0];
  
  // Apply formatting to header row
  const headerRow = sheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  
  // Auto-fit columns
  sheet.columns.forEach((column, idx) => {
    let maxLength = 10;
    column.eachCell({ includeEmpty: false }, cell => {
      const length = cell.value ? cell.value.toString().length : 10;
      if (length > maxLength) maxLength = length;
    });
    column.width = Math.min(maxLength + 2, 50);
  });
  
  // Apply number formatting to numeric columns
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    row.eachCell((cell, colNumber) => {
      if (typeof cell.value === 'number') {
        // Guess format based on value
        if (cell.value % 1 === 0) {
          cell.numFmt = '#,##0'; // Integer
        } else {
          cell.numFmt = '#,##0.00'; // Decimal
        }
      }
    });
  });
  
  // Add filters
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: sheet.rowCount, column: sheet.columnCount }
  };
  
  // Freeze header row
  sheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1 }
  ];
  
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Formatted Excel file saved to ${outputPath}`);
}

csvToExcelWithFormatting('data.csv', 'formatted_data.xlsx');
```

## Example 5: Multi-Sheet Workbook with References

```javascript
const ExcelJS = require('exceljs');

async function createMultiSheetWorkbook(outputPath) {
  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Data
  const dataSheet = workbook.addWorksheet('Data');
  dataSheet.columns = [
    { header: 'Month', key: 'month', width: 15 },
    { header: 'Revenue', key: 'revenue', width: 15 },
    { header: 'Expenses', key: 'expenses', width: 15 }
  ];
  
  dataSheet.addRow({ month: 'January', revenue: 10000, expenses: 7000 });
  dataSheet.addRow({ month: 'February', revenue: 12000, expenses: 7500 });
  dataSheet.addRow({ month: 'March', revenue: 11000, expenses: 7200 });
  
  // Format numbers
  for (let row = 2; row <= 4; row++) {
    dataSheet.getCell(`B${row}`).numFmt = '$#,##0';
    dataSheet.getCell(`C${row}`).numFmt = '$#,##0';
  }
  
  // Sheet 2: Summary (references Data sheet)
  const summarySheet = workbook.addWorksheet('Summary');
  
  summarySheet.getCell('A1').value = 'Total Revenue';
  summarySheet.getCell('B1').value = { formula: 'SUM(Data!B2:B4)' };
  summarySheet.getCell('B1').numFmt = '$#,##0';
  
  summarySheet.getCell('A2').value = 'Total Expenses';
  summarySheet.getCell('B2').value = { formula: 'SUM(Data!C2:C4)' };
  summarySheet.getCell('B2').numFmt = '$#,##0';
  
  summarySheet.getCell('A3').value = 'Net Profit';
  summarySheet.getCell('B3').value = { formula: 'B1-B2' };
  summarySheet.getCell('B3').numFmt = '$#,##0';
  summarySheet.getCell('B3').font = { bold: true };
  
  summarySheet.getCell('A4').value = 'Profit Margin';
  summarySheet.getCell('B4').value = { formula: 'B3/B1' };
  summarySheet.getCell('B4').numFmt = '0.0%';
  
  summarySheet.getColumn('A').width = 20;
  summarySheet.getColumn('B').width = 15;
  
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Multi-sheet workbook saved to ${outputPath}`);
}

createMultiSheetWorkbook('multi_sheet.xlsx');
```

## Example 6: Conditional Formatting (Manual Simulation)

```javascript
const ExcelJS = require('exceljs');

async function applyConditionalFormatting(outputPath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sales Performance');
  
  sheet.columns = [
    { header: 'Salesperson', key: 'name', width: 20 },
    { header: 'Sales', key: 'sales', width: 15 },
    { header: 'Target', key: 'target', width: 15 },
    { header: 'Performance', key: 'performance', width: 15 }
  ];
  
  const data = [
    { name: 'Alice', sales: 95000, target: 100000 },
    { name: 'Bob', sales: 110000, target: 100000 },
    { name: 'Charlie', sales: 75000, target: 100000 }
  ];
  
  data.forEach(person => {
    const row = sheet.addRow(person);
    const performance = person.sales / person.target;
    
    // Performance formula
    const perfCell = row.getCell(4);
    perfCell.value = { formula: `B${row.number}/C${row.number}` };
    perfCell.numFmt = '0.0%';
    
    // Apply color based on performance
    if (performance >= 1.0) {
      perfCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF70AD47' } // Green
      };
      perfCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (performance >= 0.8) {
      perfCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC000' } // Orange
      };
    } else {
      perfCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' } // Red
      };
      perfCell.font = { color: { argb: 'FFFFFFFF' } };
    }
    
    // Format sales and target
    row.getCell(2).numFmt = '$#,##0';
    row.getCell(3).numFmt = '$#,##0';
  });
  
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Conditional formatting applied to ${outputPath}`);
}

applyConditionalFormatting('performance.xlsx');
```
