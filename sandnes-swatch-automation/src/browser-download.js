#!/usr/bin/env node
/**
 * Browser-based file downloader using Playwright CDP
 * Connects to the authenticated OpenClaw browser session
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CDP_URL = 'http://127.0.0.1:18800';
const DOWNLOADS_DIR = '/tmp/openclaw/downloads';

async function browserDownload(fileUrl, outputPath, timeoutMs = 60000) {
  let browser = null;
  let page = null;
  
  try {
    // Connect to OpenClaw's authenticated browser
    browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0] || await browser.newContext();
    
    page = await context.newPage();
    
    // Navigate to the file URL - browser is already authenticated
    // SharePoint will either:
    // 1. Show the image directly (we can screenshot/save)
    // 2. Trigger a download
    
    await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: timeoutMs });
    
    // Check if we got an image response
    const img = page.locator('img').first();
    const hasImg = await img.isVisible().catch(() => false);
    
    if (hasImg) {
      // Save the image directly
      const src = await img.getAttribute('src');
      if (src && src.startsWith('data:')) {
        // Data URL - decode and save
        const base64 = src.split(',')[1];
        fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
      } else if (src) {
        // Fetch via page context with auth
        const response = await page.evaluate(async (url) => {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const blob = await r.blob();
          return URL.createObjectURL(blob);
        }, src);
        
        // Download the blob URL
        await page.evaluate((blobUrl, outPath) => {
          return new Promise((resolve) => {
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = outPath.split('/').pop();
            a.click();
            setTimeout(resolve, 1000);
          });
        }, response, outputPath);
        
        // Wait for download
        await page.waitForTimeout(2000);
      }
    }
    
    // Alternative: Check for download attribute on page
    const downloadLinks = await page.locator('a[download]').all();
    for (const link of downloadLinks) {
      const href = await link.getAttribute('href');
      if (href && href.includes('.jpg')) {
        await link.click();
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    // Verify file was downloaded
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      return stats.size > 0;
    }
    
    return false;
  } catch (error) {
    console.error(`Browser download failed: ${error.message}`);
    return false;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// CLI usage
if (require.main === module) {
  const [url, output] = process.argv.slice(2);
  if (!url || !output) {
    console.error('Usage: node browser-download.js <url> <output-path>');
    process.exit(1);
  }
  
  browserDownload(url, output)
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { browserDownload };
