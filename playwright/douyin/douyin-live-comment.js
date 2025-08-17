const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 评论文案列表
const comments = [
  '1.79是带杯子的价格吗',
  '买两单是不是送两个杯子',
  '喜欢疙瘩汤',
  '幼儿园喝到初中[流泪]早餐天天都是一杯豆奶一个面包',
  '上次主播不是说只送胖胖杯吗',
  '杯子是电池还是充电的',
  '维维是老国货吗',
  '一号是不是甜的不甜的都有',
  '记得小时候经常偷奶奶家的豆奶粉干吃，被逮到还不承认。',
  '你们终于知道要搞活动了'
];

// 抖音直播间链接
const LIVE_URL = 'https://live.douyin.com/837702480064';

// 随机选择一条评论
function getRandomComment() {
  return comments[Math.floor(Math.random() * comments.length)];
}

(async () => {
  const authPath = path.resolve(__dirname, 'douyin-auth.json');
  let context;
  const browser = await chromium.launch({ 
    headless: false, 
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' 
  });
  if (fs.existsSync(authPath)) {
    context = await browser.newContext({ storageState: authPath });
    console.log('已加载 douyin-auth.json，自动登录抖音...');
  } else {
    console.log('未检测到 douyin-auth.json，请先运行 save-douyin-auth.js 保存登录状态！');
    await browser.close();
    process.exit(1);
  }
  const page = await context.newPage();
  await page.goto(LIVE_URL);
  console.log('已打开抖音直播间，等待页面加载...');
  await page.waitForTimeout(8000); // 等待页面加载

  // 评论循环
  while (true) {
    try {
      // 检查是否出现滑块验证码
      const sliderSelector = 'div[role="slider"], .captcha_verify_slide--slidebar, .captcha_verify_container';
      if (await page.$(sliderSelector)) {
        console.log('检测到滑块验证码，请手动完成滑动验证，完成后回到终端按回车...');
        await new Promise(resolve => process.stdin.once('data', resolve));
        await page.waitForTimeout(1000); // 等待页面刷新
      }
      // 1. 定位 contenteditable 输入框
      const inputSelector = 'div[contenteditable="true"][data-placeholder*="互动"]';
      await page.waitForSelector(inputSelector, { timeout: 15000 });
      const input = await page.$(inputSelector);
      // 2. 输入评论内容
      const comment = getRandomComment();
      await input.type(comment, { delay: 50 });
      // 3. 定位并点击带有指定 SVG path 的发送按钮
      const sendBtn = await page.$('button svg path[d="M17.5 30C23.851 30 29 24.851 29 18.5S23.851 7 17.5 7 6 12.149 6 18.5 11.149 30 17.5 30zm-5.16-13.883a1.16 1.16 0 0 0 1.64 1.64l2.395-2.394v8.838a1.16 1.16 0 0 0 2.321 0v-8.839l1.028 1.028 1.368 1.368a1.16 1.16 0 1 0 1.64-1.641l-4.219-4.22a1.382 1.382 0 0 0-1.954 0l-4.22 4.22h.001z"]');
      if (sendBtn) {
        // svg -> button
        const button = await sendBtn.evaluateHandle(node => node.closest('button'));
        if (button) {
          await button.asElement().click();
          console.log('已评论：', comment);
        } else {
          console.log('未找到发送按钮（button），跳过本次');
        }
      } else {
        console.log('未找到发送按钮（svg），跳过本次');
      }
    } catch (e) {
      console.log('评论失败，可能未登录或页面结构变化，错误：', e.message);
    }
    // 等待10秒
    await page.waitForTimeout(10000);
  }

  // await browser.close(); // 永不关闭
})(); 