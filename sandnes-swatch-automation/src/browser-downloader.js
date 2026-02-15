#!/usr/bin/env node
/*
 * Browser-based downloader using Playwright to connect to authenticated OpenClaw browser
 */
const { chromium } = require('playwright');

const CDP_URL = 'http://127.0.0.1:18800';

async function browserDownload(url, outputPath, timeoutMs = 30000) {
  const fs = require('fs');
  let browser = null;
  let page = null;
  
  try {
    // Connect to OpenClaw's authenticated browser
    browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];
    page = await context.newPage();
    
    // Navigate and capture the response
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    
    if (!response) {
      return { success: false, error: 'No response' };
    }
    
    const status = response.status();
    
    // If 200, save the body
    if (status === 200) {
      const body = await response.body();
      
      // Check if it's actually an image (not HTML error page)
      const isImage = body.length > 1000; // Images should be larger
      
      if (isImage) {
        fs.writeFileSync(outputPath, body);
        return { success: true, size: body.length };
      } else {
        return { success: false, error: 'Too small, likely not an image' };
      }
    }
    
    return { success: false, error: `HTTP ${status}` };
    
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { browserDownload };

// CLI usage
if (require.main === module) {
  const [url, output] = process.argv.slice(2);
  if (!url || !output) {
    console.error('Usage: node browser-downloader.js <url> <output-path>');
    process.exit(1);
  }
  
  browserDownload(url, output)
    .then(result => {
      if (result.success) {
        console.log(`HTTP: 200, Size: ${result.size}`);
        process.exit(0);
      } else {
        console.log(`Failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(err => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
