const { chromium } = require('playwright');

const CDP_URL = 'http://127.0.0.1:18800';
const fileUrl = process.argv[2];
const outputPath = process.argv[3];

async function download() {
  console.log(`Connecting to ${CDP_URL}...`);
  const browser = await chromium.connectOverCDP(CDP_URL);
  console.log('Connected to browser');
  
  const context = browser.contexts()[0];
  const page = await context.newPage();
  
  console.log(`Navigating to ${fileUrl}...`);
  const response = await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
  
  console.log(`Response URL: ${response.url()}`);
  console.log(`Status: ${response.status()}`);
  
  if (response.status() === 200) {
    const body = await response.body();
    require('fs').writeFileSync(outputPath, body);
    console.log(`Downloaded ${body.length} bytes to ${outputPath}`);
    await browser.close();
    return true;
  }
  
  await browser.close();
  return false;
}

download().then(ok => process.exit(ok ? 0 : 1)).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
