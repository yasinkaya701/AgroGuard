const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: "new"});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
  try {
    await page.goto('http://localhost:3000', {waitUntil: 'networkidle2'});
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) { console.error('Goto error:', e); }
  await browser.close();
})();
