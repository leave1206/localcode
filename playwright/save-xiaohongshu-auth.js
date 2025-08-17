const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.xiaohongshu.com/explore');
  console.log('请手动登录小红书，登录完成后回到终端按回车...');
  process.stdin.once('data', async () => {
    await context.storageState({ path: 'playwright/xiaohongshu-auth.json' });
    console.log('登录状态已保存，下次将自动登录！');
    await browser.close();
    process.exit(0);
  });
})(); 