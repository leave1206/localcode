const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.resolve(__dirname, '../策略工作流/workflow_2/.env') });

// 兼容 Node 16/18+ fetch
let fetchFn;
if (typeof fetch !== 'undefined') {
  fetchFn = fetch;
} else {
  fetchFn = require('node-fetch');
}

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function crawlXiaohongshu(keyword) {
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const context = await browser.newContext({ storageState: path.resolve(__dirname, './xiaohongshu-auth.json') });
  const page = await context.newPage();
  await page.goto('https://www.xiaohongshu.com/explore');
  await page.waitForTimeout(2000);

  // 搜索
  const searchSelector = 'input[placeholder="搜索小红书"]';
  try {
    await page.waitForSelector(searchSelector, { timeout: 20000 });
    await page.fill(searchSelector, keyword);
    const inputHandle = await page.$(searchSelector);
    const searchBtnHandle = await page.evaluateHandle(input => input.nextElementSibling, inputHandle);
    await searchBtnHandle.click();
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
    const cardSelector = 'section.note-item';
    let cardHandles = await page.$$(cardSelector);
    if (cardHandles.length === 0) {
      await page.waitForTimeout(2000);
      cardHandles = await page.$$(cardSelector);
      if (cardHandles.length === 0) {
        await page.screenshot({ path: path.resolve(__dirname, './debug_no_cards.png') });
        break;
      }
    }
    let newFound = 0;
    for (let i = 0; i < cardHandles.length && notes.length < 10; i++) {
      try {
        const delay = 500 + Math.floor(Math.random() * 1500);
        await page.waitForTimeout(delay);
        const coverLinkHandle = await cardHandles[i].$('a.cover');
        let link = '';
        if (coverLinkHandle) {
          link = await coverLinkHandle.getAttribute('href');
        }
        const absLink = link && link.startsWith('http') ? link : (link ? `https://www.xiaohongshu.com${link}` : '');
        if (!absLink || noteSet.has(absLink)) continue;
        noteSet.add(absLink);
        let cover = '';
        try {
          const imgHandle = await cardHandles[i].$('a.cover img');
          if (imgHandle) cover = await imgHandle.getAttribute('src');
        } catch {}
        let title = '';
        try {
          const titleHandle = await cardHandles[i].$('.footer .title span');
          if (titleHandle) title = await titleHandle.innerText();
        } catch {}
        if (coverLinkHandle) {
          await coverLinkHandle.click();
          await page.waitForTimeout(2000);
        } else {
          continue;
        }
        let content = '';
        try {
          content = await page.$eval('div[style*="white-space"], .note-content, .content', el => el.innerText.trim());
        } catch {}
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
        await page.goBack();
        await page.waitForTimeout(1000);
        newFound++;
      } catch (e) {
        continue;
      }
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    scrollCount++;
    if (newFound === 0) {
      break;
    }
  }
  fs.writeFileSync(path.resolve(__dirname, './notes-detail.json'), JSON.stringify(notes, null, 2), 'utf-8');
  await browser.close();
}

async function analyzeComments() {
  const notesPath = path.resolve(__dirname, './notes-detail.json');
  if (!fs.existsSync(notesPath)) {
    console.error('未找到 notes-detail.json，请先运行抓取脚本。');
    process.exit(1);
  }
  const notes = JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
  let allComments = [];
  notes.forEach((note, noteIdx) => {
    if (note.comments && note.comments.length > 0) {
      note.comments.forEach((c, commentIdx) => {
        if (c.text && c.text.trim()) {
          allComments.push(`第${noteIdx + 1}篇笔记-第${commentIdx + 1}条评论：${c.text.trim()}`);
        }
      });
    }
  });
  if (allComments.length === 0) {
    console.error('未找到任何评论内容，无法分析。');
    process.exit(1);
  }
  const prompt = `\n你是一名专业的内容分析师。请帮我分析以下小红书用户评论，判断是否存在“广告过多”相关的负面内容，并输出一份简明的分析报告。请用中文输出。\n\n评论内容如下：\n${allComments.map((c, i) => c).join('\\n')}\n\n请分析：\n1. 是否有用户表达了对广告过多的不满或负面情绪？\n2. 如果有，请列举相关评论内容，并简要说明其倾向，并标记清楚是哪篇笔记下的第几条评论。\n3. 总结整体评论对“小度智能屏”广告的态度，并给出你的结论。\n`;

  // 通过本地 Gemini 代理接口调用
  const url = 'http://localhost:3101/api/gemini';
  const body = {
    prompt,
    model: 'gemini-2.5-flash-preview-05-20',
    useStreaming: false
  };
  let resp;
  try {
    resp = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('无法连接本地 Gemini 代理服务，请确保策略工作流的服务已启动 (如: node server.js)', e.message);
    process.exit(1);
  }
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Gemini代理返回非JSON:', text);
    process.exit(1);
  }
  if (!resp.ok) {
    console.error('Gemini代理API请求失败:', data.error || text);
    process.exit(1);
  }
  let report = data.result;
  if (typeof report === 'object') report = JSON.stringify(report, null, 2);
  console.log('Gemini 分析报告：\n');
  console.log(report);
  fs.writeFileSync(path.resolve(__dirname, './xiaohongshu-ad-analysis.txt'), report, 'utf-8');
  console.log('\n分析报告已保存到 playwright/xiaohongshu-ad-analysis.txt');
}

(async () => {
  let analyzeOnly = process.argv.includes('--analyze-only');
  if (analyzeOnly) {
    console.log('已启用仅分析模式，直接分析现有评论数据...');
    await analyzeComments();
    return;
  }
  let keyword = process.argv[2];
  if (!keyword) {
    keyword = await askQuestion('请输入要抓取的小红书关键词（如小度智能屏）：');
  }
  console.log(`开始抓取“小红书”关键词：${keyword}`);
  await crawlXiaohongshu(keyword);
  console.log('抓取完成，开始分析评论内容...');
  await analyzeComments();
})(); 