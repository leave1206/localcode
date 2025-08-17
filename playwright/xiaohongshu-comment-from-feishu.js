const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  // 1. 启动浏览器并加载小红书cookie
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const context = await browser.newContext({ storageState: 'playwright/xiaohongshu-auth.json' });
  const page = await context.newPage();

  // 2. 直接打开飞书表格页面（无需手动登录）
  await page.goto('https://ezffb29lzx.feishu.cn/sheets/JBeMshWjahOSPXtKRYwcOgKlnVe?sheet=I4K7v0');
  await page.waitForTimeout(5000); // 等待表格加载

  // 3. 读取表格的每一行（适配飞书表格结构）
  const rows = await page.$$eval('div[role="row"]', trs => trs.slice(1).map(tr => {
    const tds = tr.querySelectorAll('div[role="cell"]');
    const urlA = tds[0]?.querySelector('a');
    return {
      url: urlA ? urlA.href : '',
      comment: tds[1]?.innerText.trim() || ''
    };
  }));

  console.log('共读取到', rows.length, '条数据');

  // 4. 依次处理每一行
  for (let i = 0; i < rows.length; i++) {
    const { url, comment } = rows[i];
    if (!url || !comment) continue;
    const notePage = await context.newPage();
    await notePage.goto(url);
    await notePage.waitForTimeout(3000);
    // 等待评论输入框出现
    try {
      const inputSelector = 'textarea, input[placeholder*="评论"], .comment-input textarea';
      await notePage.waitForSelector(inputSelector, { timeout: 15000 });
      await notePage.fill(inputSelector, comment);
      // 查找并点击评论提交按钮
      const submitBtn = await notePage.$('button, .submit-btn, .comment-btn');
      if (submitBtn) {
        await submitBtn.click();
        console.log(`第${i+1}条：已在${url}下评论：${comment}`);
      } else {
        console.log(`第${i+1}条：未找到评论提交按钮，跳过`);
      }
    } catch (e) {
      console.log(`第${i+1}条：评论失败，跳过`);
    }
    await notePage.close();
    await page.waitForTimeout(1000);
  }

  await browser.close();
})(); 