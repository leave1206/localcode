const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  let context;
  if (fs.existsSync('playwright/xiaohongshu-auth.json')) {
    // 如果有已保存的 cookie/session，自动加载
    context = await browser.newContext({ storageState: 'playwright/xiaohongshu-auth.json' });
    console.log('已加载 cookie，尝试以已登录状态打开小红书...');
  } else {
    context = await browser.newContext();
    console.log('未检测到 cookie，请手动登录...');
  }
  const page = await context.newPage();
  await page.goto('https://www.xiaohongshu.com/');
  // 保持浏览器窗口10分钟，足够你扫码或输入账号密码
  await page.waitForTimeout(10 * 60 * 1000);
  await browser.close();
})(); 