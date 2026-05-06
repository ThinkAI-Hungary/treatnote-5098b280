const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Intercept all console messages
  page.on('console', async (msg) => {
    const args = await Promise.all(msg.args().map(a => a.jsonValue().catch(() => a.toString())));
    console.log('PAGE LOG:', msg.text(), ...args);
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:8080/klinika-admin?tab=szotar', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();