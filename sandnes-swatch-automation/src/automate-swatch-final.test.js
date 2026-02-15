const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  cleanValue,
  parseCsvLine,
  parse,
  colorName,
  patterns,
  parseArgs
} = require('./automate-swatch-final');

test('cleanValue trims and strips wrapper quotes', () => {
  assert.equal(cleanValue(' "abc" '), 'abc');
  assert.equal(cleanValue("'abc'"), 'abc');
  assert.equal(cleanValue('  abc  '), 'abc');
});

test('parseCsvLine handles quoted commas and escaped quotes', () => {
  const line = '1,"Double Sunday",123,11935581,,, "2104 ""Blue"" Night",,';
  const cols = parseCsvLine(line);
  assert.equal(cols[1], 'Double Sunday');
  assert.equal(cols[6], '2104 "Blue" Night');
});

test('colorName strips numeric prefix and normalizes spaces', () => {
  assert.equal(colorName('2104 Blue Night'), 'blue-night');
  assert.equal(colorName('Rain Forest'), 'rain-forest');
});

test('patterns includes fuzzy variants', () => {
  const p = patterns('rain-forest');
  assert.ok(p.includes('rain-forest'));
  assert.ok(p.includes('Rain-forest'));
  assert.ok(p.includes('rain_forest'));
  assert.ok(p.includes('rainforest'));
  assert.ok(p.includes('Rainforest'));
  assert.ok(p.includes('Rain'));
});

test('parse reads header-based csv format', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swatch-test-'));
  const csv = path.join(tmp, 'input.csv');
  fs.writeFileSync(
    csv,
    [
      'report generated',
      'id,product_name,variation_id,sku,foo,bar,variant_label,baz,qux',
      '1,"Double Sunday",123,11935581,x,x,"2104 Blue Night",x,x'
    ].join('\n'),
    'utf-8'
  );

  const rows = parse(csv);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    sku: '11935581',
    product: 'Double Sunday',
    variant: '2104 Blue Night',
    vid: '123'
  });
});

test('parseArgs extracts --dry-run and site name', () => {
  assert.deepEqual(parseArgs(['node', 'script.js', '--dry-run', 'wholesale']), { dryRun: true, siteName: 'wholesale' });
  assert.deepEqual(parseArgs(['node', 'script.js', 'prod', '--dry-run']), { dryRun: true, siteName: 'prod' });
  assert.deepEqual(parseArgs(['node', 'script.js', 'wholesale']), { dryRun: false, siteName: 'wholesale' });
  assert.deepEqual(parseArgs(['node', 'script.js']), { dryRun: false, siteName: 'wholesale' });
});
