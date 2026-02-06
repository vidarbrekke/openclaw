/**
 * Playwright test: compare chat response retention on proxy (3010) vs gateway (18789).
 * Run: npx playwright test tests/proxy-chat-retention.spec.mjs --project=chromium
 * Prereq: gateway and proxy running, gateway token configured.
 */
import { test, expect } from "@playwright/test";

const PROXY_URL = "http://127.0.0.1:3010";
const GATEWAY_URL = "http://127.0.0.1:18789";

async function sendMessageAndCheckRetention(page, baseUrl, label) {
  const networkLog = [];
  page.on("response", (r) => {
    const url = r.url();
    if (url.includes("chat") || url.includes("completions") || r.request().resourceType() === "websocket") {
      networkLog.push({ url, status: r.status(), type: r.request().resourceType() });
    }
  });

  const startUrl = baseUrl === PROXY_URL ? `${baseUrl}/new` : `${baseUrl}/new`;
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  // Wait for chat input (OpenClaw Control UI)
  const inputSelectors = 'textarea, [contenteditable="true"], [role="textbox"], input[type="text"]';
  await page.waitForSelector(inputSelectors, { timeout: 20000 });
  const inputLocator = page.locator(inputSelectors).first();
  await inputLocator.fill("Say only: ok", { force: true });
  await page.keyboard.press("Enter");

  // Wait for streaming to start/finish
  await page.waitForTimeout(8000);

  // Snapshot DOM for assistant content (broad selectors)
  const bodyText = await page.locator("body").innerText();
  const hasOk = bodyText.toLowerCase().includes("ok");

  // Wait to see if it disappears
  await page.waitForTimeout(5000);
  const bodyTextAfter = await page.locator("body").innerText();
  const retainedOk = bodyTextAfter.toLowerCase().includes("ok");

  return {
    hasResponse: hasOk,
    retained: retainedOk,
    bodySnippet: bodyTextAfter.slice(0, 500),
    networkLog,
  };
}

test.describe("Chat response retention", () => {
  test("gateway (18789) - response retained", async ({ page }) => {
    const result = await sendMessageAndCheckRetention(page, GATEWAY_URL, "gateway");
    console.log("Gateway network:", JSON.stringify(result.networkLog, null, 2));
    expect(result.retained).toBeTruthy();
  });

  test("proxy (3010) - response retained", async ({ page }) => {
    const result = await sendMessageAndCheckRetention(page, PROXY_URL, "proxy");
    console.log("Proxy network:", JSON.stringify(result.networkLog, null, 2));
    expect(result.retained).toBeTruthy();
  });
});
