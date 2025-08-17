const { chromium } = require('playwright');
const fs = require('fs');

// 获取用户输入的关键词
const readline = require('readline');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

(async () => {
  const keyword = process.argv[2] || await askQuestion('请输入搜索关键词：');
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const context = await browser.newContext({ storageState: 'playwright/xiaohongshu-auth.json' });
  const page = await context.newPage();
  await page.goto('https://www.xiaohongshu.com/explore');
  await page.waitForTimeout(2000);

  // 输入关键词到搜索框并点击放大镜
  const searchSelector = 'input[placeholder="搜索小红书"]';
  try {
    console.log('等待搜索输入框出现...');
    await page.waitForSelector(searchSelector, { timeout: 20000 });
    console.log('搜索输入框已出现，开始输入关键词...');
    await page.fill(searchSelector, keyword);
    const inputHandle = await page.$(searchSelector);
    const searchBtnHandle = await page.evaluateHandle(input => input.nextElementSibling, inputHandle);
    await searchBtnHandle.click();
    console.log('已点击放大镜按钮，等待搜索结果加载...');
    await page.waitForTimeout(5000);
  } catch (e) {
    console.error('未能找到搜索输入框或放大镜按钮，采集流程中止。');
    await browser.close();
    process.exit(1);
  }

  let noteSet = new Set();
  let notes = [];
  let maxScroll = 30;
  let scrollCount = 0;
  while (notes.length < 10 && scrollCount < maxScroll) {
    // 遍历所有 section.note-item
    const cardSelector = 'section.note-item';
    let cardHandles = await page.$$(cardSelector);
    console.log(`本轮检测到卡片数：${cardHandles.length}`);
    if (cardHandles.length === 0) {
      console.log('未检测到卡片，等待2秒重试...');
      await page.waitForTimeout(2000);
      cardHandles = await page.$$(cardSelector);
      if (cardHandles.length === 0) {
        console.log('重试后依然无卡片，截图并跳出循环。');
        await page.screenshot({ path: 'playwright/debug_no_cards.png' });
        break;
      }
    }
    let newFound = 0;
    for (let i = 0; i < cardHandles.length && notes.length < 10; i++) {
      try {
        // 随机延迟0.5-2秒
        const delay = 500 + Math.floor(Math.random() * 1500);
        await page.waitForTimeout(delay);
        // 获取详情页链接
        const coverLinkHandle = await cardHandles[i].$('a.cover');
        let link = '';
        if (coverLinkHandle) {
          link = await coverLinkHandle.getAttribute('href');
        }
        const absLink = link && link.startsWith('http') ? link : (link ? `https://www.xiaohongshu.com${link}` : '');
        if (!absLink || noteSet.has(absLink)) continue;
        noteSet.add(absLink);

        // 获取封面
        let cover = '';
        try {
          const imgHandle = await cardHandles[i].$('a.cover img');
          if (imgHandle) cover = await imgHandle.getAttribute('src');
        } catch {}

        // 获取标题
        let title = '';
        try {
          const titleHandle = await cardHandles[i].$('.footer .title span');
          if (titleHandle) title = await titleHandle.innerText();
        } catch {}

        // 点击进入详情页
        if (coverLinkHandle) {
          await coverLinkHandle.click();
          await page.waitForTimeout(2000);
        } else {
          continue;
        }

        // 采集正文内容
        let content = '';
        try {
          content = await page.$eval('div[style*="white-space"], .note-content, .content', el => el.innerText.trim());
        } catch {}

        // 滚动评论区，加载更多评论
        const commentContainerSelector = '.list-container';
        const commentItemSelector = '.comment-item';
        let loadedCount = 0;
        for (let scrollTimes = 0; scrollTimes < 10; scrollTimes++) {
          await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) el.scrollTop = el.scrollHeight;
          }, commentContainerSelector);
          await page.waitForTimeout(800);
          const currentCount = await page.$$eval(commentItemSelector, nodes => nodes.length);
          if (currentCount >= 20 || currentCount === loadedCount) break;
          loadedCount = currentCount;
        }

        // 采集前20条评论
        let comments = [];
        try {
          comments = await page.$$eval(commentItemSelector, nodes =>
            nodes.slice(0, 20).map(node => {
              const user = node.querySelector('.author .name')?.innerText || '';
              const text = node.querySelector('.content .note-text span')?.innerText || '';
              return { user, text };
            })
          );
        } catch {}

        notes.push({ title, cover, content, url: absLink, comments });
        console.log(`已采集第${notes.length}条：${title}`);

        // 返回上一页
        await page.goBack();
        await page.waitForTimeout(1000);
        newFound++;
      } catch (e) {
        console.log('采集卡片失败，跳过');
        continue;
      }
    }
    console.log(`本轮新采集：${newFound} 条，累计：${notes.length} 条。`);
    // 滑动加载新内容
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    scrollCount++;
    if (newFound === 0) {
      break;
    }
  }

  fs.writeFileSync('playwright/notes-detail.json', JSON.stringify(notes, null, 2), 'utf-8');
  console.log('已保存前' + notes.length + '条' + keyword + '相关笔记详情到 playwright/notes-detail.json');
  await browser.close();
})(); 