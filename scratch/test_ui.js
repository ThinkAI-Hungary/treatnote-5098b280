const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 900 }
  });
  const page = await browser.newPage();

  // Pipe page console logs to terminal
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  try {
    console.log("Navigating to http://localhost:8080/auth ...");
    await page.goto('http://localhost:8080/auth', { waitUntil: 'networkidle0' });

    console.log("Logging in...");
    await page.waitForSelector('#email');
    await page.type('#email', 'zsolt@gmail.com');
    await page.type('#password', 'Zsolt123');
    
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);

    console.log("Logged in successfully. Current URL:", page.url());

    console.log("Waiting for Patients link to appear in sidebar...");
    await page.waitForFunction(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.some(l => l.href.includes('/patients') || l.textContent.includes('Páciensek'));
    }, { timeout: 10000 });

    console.log("Navigating to Patients page...");
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const patientsLink = links.find(l => l.href.includes('/patients') || l.textContent.includes('Páciensek'));
      if (patientsLink) {
        patientsLink.click();
      } else {
        throw new Error("Could not find Patients link in sidebar");
      }
    });

    console.log("Waiting for patient list to load...");
    await page.waitForTimeout ? await page.waitForTimeout(3000) : await new Promise(r => setTimeout(r, 3000));

    console.log("Selecting patient Dr.Prof. Pepszi Béla...");
    await page.evaluate(() => {
      // Find patient in list
      const rows = Array.from(document.querySelectorAll('tr, div, span, td'));
      const pepsziRow = rows.find(r => r.textContent.includes('Pepszi') && r.textContent.includes('Béla'));
      if (pepsziRow) {
        pepsziRow.click();
      } else {
        throw new Error("Could not find Dr.Prof. Pepszi Béla in the patients list");
      }
    });

    console.log("Waiting for patient detail and dental chart to load...");
    await page.waitForTimeout ? await page.waitForTimeout(8000) : await new Promise(r => setTimeout(r, 8000));

    console.log("Current URL:", page.url());

    console.log("Waiting for tooth 11 button to appear...");
    await page.waitForSelector('[aria-label="Fog 11"]');
    console.log("Clicking tooth 11...");
    await page.click('[aria-label="Fog 11"]');
    console.log("Waiting 3 seconds for editor panel and details to render...");
    await page.waitForTimeout ? await page.waitForTimeout(3000) : await new Promise(r => setTimeout(r, 3000));

    // Capture screenshot
    const screenshotPath = 'C:\\Users\\Zombo\\.gemini\\antigravity-ide\\brain\\bba83a7e-8f98-4cfd-9eb2-4e62bd914244\\pepszi_chart_after.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log("Screenshot saved to:", screenshotPath);

    // Dump positions and dimensions computed by the code
    const elementDetails = await page.evaluate(() => {
      const overlay = document.querySelector('svg.pointer-events-none');
      const lines = Array.from(document.querySelectorAll('svg.pointer-events-none line'));
      const circles = Array.from(document.querySelectorAll('svg.pointer-events-none circle'));
      return {
        hasOverlay: !!overlay,
        overlayWidth: overlay ? overlay.getAttribute('width') : null,
        overlayHeight: overlay ? overlay.getAttribute('height') : null,
        linesCount: lines.length,
        lines: lines.map(l => ({ x1: l.getAttribute('x1'), x2: l.getAttribute('x2'), y1: l.getAttribute('y1'), y2: l.getAttribute('y2'), stroke: l.getAttribute('stroke') })),
        circles: circles.map(c => ({ cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), r: c.getAttribute('r'), fill: c.getAttribute('fill') }))
      };
    });
    console.log("UI Elements details:", JSON.stringify(elementDetails, null, 2));

  } catch (error) {
    console.error("Test encountered an error:", error);
  } finally {
    console.log("Closing browser.");
    await browser.close();
  }
})();
