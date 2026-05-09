const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', async (msg) => {
    if (msg.type() === 'error') {
      const args = await Promise.all(msg.args().map(a => a.jsonValue().catch(() => a.toString())));
      console.log('PAGE ERROR LOG:', msg.text(), ...args);
    }
  });
  page.on('pageerror', err => console.log('PAGE UNCAUGHT ERROR:', err.toString()));
  
  await page.goto('http://localhost:8080/dashboard', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    // Click Klinika Admin in the sidebar
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const adminLink = links.find(l => l.textContent.includes('Klinika Admin'));
      if (adminLink) adminLink.click();
    });
  } catch (e) {
    console.log("Failed to click", e);
  }

  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();