const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER_ERROR:', msg.text());
        }
    });

    page.on('pageerror', error => {
        console.log('PAGE_EXCEPTION:', error.message);
    });

    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
        // Wait an extra 2 seconds for any delayed renders
        await new Promise(r => setTimeout(r, 2000));

        // Check if #root is empty (white screen)
        const rootHtml = await page.$eval('#root', el => el.innerHTML).catch(() => 'NO_ROOT');
        if (!rootHtml || rootHtml.trim() === '') {
            console.log('WHITE_SCREEN_DETECTED: #root is empty.');
        } else {
            console.log('ROOT_HAS_CONTENT:', rootHtml.substring(0, 100));
        }
    } catch (e) {
        console.log('PUPPETEER_NAV_ERROR:', e.message);
    }

    await browser.close();
})();
