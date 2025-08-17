const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://live.douyin.com/');
  console.log('请手动登录抖音账号，登录完成后回到终端按回车...');
  process.stdin.once('data', async () => {
    await context.storageState({ path: path.resolve(__dirname, 'douyin-auth.json') });
    console.log('登录状态已保存到 douyin-auth.json！');
    await browser.close();
    process.exit(0);
  });
})(); 