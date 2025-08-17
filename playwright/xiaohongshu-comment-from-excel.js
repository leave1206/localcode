const { chromium } = require('playwright');
const xlsx = require('xlsx');
const path = require('path');

(async () => {
  // 1. 读取 Excel 文件
  const workbook = xlsx.readFile(path.resolve(__dirname, './comments.xlsx'));
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  // rows: [ [ 'url', '评论内容' ], [ 'https://...', 'xxx' ], ... ]

  // 2. 启动浏览器并加载小红书cookie
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const context = await browser.newContext({ storageState: 'playwright/xiaohongshu-auth.json' });

  // 3. 依次处理每一行（跳过表头）
  for (let i = 1; i < rows.length; i++) {
    const [url, comment] = rows[i];
    if (!url || !comment) continue;
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForTimeout(3000);
    try {
      // 1. 点击激活评论输入框
      const trigger = await page.$('.not-active.inner-when-not-active');
      if (trigger) {
        await trigger.click();
        await page.waitForTimeout(300);
      }
      // 2. 输入评论内容到 contenteditable p
      const editableSelector = 'p#content-textarea.content-input';
      await page.waitForSelector(editableSelector, { timeout: 10000 });
      const editable = await page.$(editableSelector);
      if (editable) {
        await editable.type(comment, { delay: 50 });
      } else {
        console.log('未找到评论输入框，跳过');
        await page.close();
        continue;
      }
      // 3. 等待“发送”按钮可用并点击
      const sendBtnSelector = 'button.btn.submit:not([disabled])';
      await page.waitForSelector(sendBtnSelector, { timeout: 10000 });
      await page.click(sendBtnSelector);
      console.log(`第${i}条：已在${url}下评论：${comment}`);
    } catch (e) {
      console.log(`第${i}条：评论失败，跳过`);
    }
    await page.close();
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();
})(); 