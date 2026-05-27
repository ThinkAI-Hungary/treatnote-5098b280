const puppeteer = require('puppeteer');

(async () => {
  console.log("Launching browser for tab flicker and layout test...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 900 }
  });
  const page = await browser.newPage();

  // Pipe page console logs to terminal
  page.on('console', msg => {
    const text = msg.text();
    // Highlight our custom console logs
    if (text.includes('[DentalChart]') || text.includes('[BridgeOverlay]')) {
      console.log('  [BROWSER LOG]:', text);
    } else {
      console.log('  PAGE LOG:', text);
    }
  });
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
    await new Promise(r => setTimeout(r, 4000));

    console.log("Selecting patient Dr.Prof. Pepszi Béla...");
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr, div, span, td'));
      const pepsziRow = rows.find(r => r.textContent.includes('Pepszi') && r.textContent.includes('Béla'));
      if (pepsziRow) {
        pepsziRow.click();
      } else {
        throw new Error("Could not find Dr.Prof. Pepszi Béla in the patients list");
      }
    });

    console.log("Waiting for Overview tab to load...");
    await new Promise(r => setTimeout(r, 5000));
    console.log("Overview loaded. URL:", page.url());

    // ─── STEP 1: Click Státuszkezelés ───
    console.log("\n--- Transition 1: Clicking Státuszkezelés ---");
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const target = links.find(l => l.textContent.includes('Státuszkezelés'));
      if (target) target.click();
      else throw new Error("Could not find Státuszkezelés link");
    });
    
    // Wait for data load and check overlay lines
    await new Promise(r => setTimeout(r, 5000));
    console.log("Státuszkezelés tab active. URL:", page.url());

    // Click tooth 21 to open the editor panel and verify sizing/scrollbars
    console.log("Clicking tooth 21 to open editor panel...");
    await page.evaluate(() => {
      const tooth = document.querySelector('[aria-label="Fog 21"]');
      if (tooth) tooth.click();
      else console.log("WARNING: Could not find tooth 21 to click");
    });
    await new Promise(r => setTimeout(r, 1000)); // wait for panel render animation

    // Take screenshot of Státuszkezelés with panel
    const statusTabScreenshot = 'C:\\Users\\Zombo\\.gemini\\antigravity-ide\\brain\\fa50c379-e98b-4f2f-829d-e4872553c8b4\\status_tab_with_panel.png';
    await page.screenshot({ path: statusTabScreenshot, fullPage: true });
    console.log("Screenshot saved to:", statusTabScreenshot);

    const checkPanelLayout = await page.evaluate(() => {
      const panel = document.querySelector('div.bg-card.rounded-xl.border');
      if (!panel) return { found: false };
      
      const rect = panel.getBoundingClientRect();
      const healthyBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.includes('Egészséges'));
      
      // Check if panel generates scrollbars
      const hasHorizontalScrollbar = panel.scrollWidth > panel.clientWidth;
      const hasVerticalScrollbar = panel.scrollHeight > panel.clientHeight;

      return {
        found: true,
        width: rect.width,
        height: rect.height,
        hasHorizontalScrollbar,
        hasVerticalScrollbar,
        healthyBtnText: healthyBtn ? healthyBtn.textContent.trim() : null
      };
    });
    console.log("Panel layout details:", JSON.stringify(checkPanelLayout, null, 2));

    // ─── STEP 2: Click Kezelési terv ───
    console.log("\n--- Transition 2: Clicking Kezelési terv ---");
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const target = links.find(l => l.textContent.includes('Kezelési terv'));
      if (target) target.click();
      else throw new Error("Could not find Kezelési terv link");
    });

    await new Promise(r => setTimeout(r, 5000));
    console.log("Kezelési terv tab active. URL:", page.url());
    
    const planTabScreenshot = 'C:\\Users\\Zombo\\.gemini\\antigravity-ide\\brain\\fa50c379-e98b-4f2f-829d-e4872553c8b4\\plan_tab_after.png';
    await page.screenshot({ path: planTabScreenshot, fullPage: true });
    console.log("Screenshot saved to:", planTabScreenshot);

    // ─── STEP 3: Switch back to Státuszkezelés ───
    console.log("\n--- Transition 3: Switching back to Státuszkezelés ---");
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const target = links.find(l => l.textContent.includes('Státuszkezelés'));
      if (target) target.click();
      else throw new Error("Could not find Státuszkezelés link");
    });
    await new Promise(r => setTimeout(r, 3000));
    console.log("Returned to Státuszkezelés. URL:", page.url());

    // Dump lines list to verify connector lines are drawn
    const svgOverlayDetails = await page.evaluate(() => {
      const overlay = document.querySelector('svg.pointer-events-none');
      const lines = Array.from(document.querySelectorAll('svg.pointer-events-none line'));
      const circles = Array.from(document.querySelectorAll('svg.pointer-events-none circle'));
      return {
        hasOverlay: !!overlay,
        overlayWidth: overlay ? overlay.getAttribute('width') : null,
        overlayHeight: overlay ? overlay.getAttribute('height') : null,
        linesCount: lines.length,
        lines: lines.map(l => ({ x1: l.getAttribute('x1'), x2: l.getAttribute('x2'), y1: l.getAttribute('y1'), y2: l.getAttribute('y2'), stroke: l.getAttribute('stroke') })),
        circlesCount: circles.length
      };
    });
    console.log("Overlay lines after transitions:", JSON.stringify(svgOverlayDetails, null, 2));

  } catch (error) {
    console.error("Test encountered an error:", error);
  } finally {
    console.log("Closing browser.");
    await browser.close();
  }
})();
