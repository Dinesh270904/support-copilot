// Renders the two sketches in this folder to ../architecture.png and ../question-flow.png.
//   cd docs/diagrams && npm install && npx playwright install chromium && npm run render
// Set CHROME_PATH to use a specific Chromium/Chrome binary instead of Playwright's.
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  for (const [d, out, h] of [['arch', 'architecture', 1075], ['flow', 'question-flow', 650]]) {
    const page = await browser.newPage({ viewport: { width: 1800, height: h }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(__dirname, 'page.html') + '?d=' + d);
    await page.waitForFunction(() => document.title === 'ready');
    await page.waitForTimeout(500);
    await page.locator('#s').screenshot({ path: path.join(__dirname, '..', out + '.png') });
    console.log('wrote docs/' + out + '.png');
    await page.close();
  }
  await browser.close();
})();
