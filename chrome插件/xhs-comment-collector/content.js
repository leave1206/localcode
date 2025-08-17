// ==Xiaohongshu Comment Collector==

// 立即执行的调试日志
console.log('🚀 content.js 已成功加载并执行！');

// 检查页面是否已经加载完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[content] DOMContentLoaded');
  });
} else {
  console.log('[content] DOM 已就绪');
}

// 1. 隐藏 webdriver 痕迹
try {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
} catch(e) {}

const MAX_LOOP = 30; // 降低最大循环次数，减少滑动
const MAX_COMMENTS = 100; // 达到100条评论即终止

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getNoteIdFromUrl() {
  const m = window.location.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-zA-Z]+)/);
  return m ? m[1] : '';
}

// 新增：获取所有评论详情（DOM当前可见）
function getAllCommentsFromDom() {
  console.log('🔍 开始获取DOM中的评论...');
  
  // 增强容错性：使用多种选择器策略
  const selectors = [
    // 第一优先级：标准选择器
    '.comments-container .comment-item',
    '.comments-container [data-testid="comment-item"]',
    '.comment-item',
    '[data-testid="comment-item"]',
    
    // 第二优先级：基于class的选择器
    '.comment',
    '.comment-wrapper',
    '.comment-content',
    
    // 第三优先级：基于data属性的选择器
    '[data-comment-id]',
    '[data-id]',
    
    // 第四优先级：基于文本内容的智能检测
    'div:contains("评论")',
    'div:contains("回复")'
  ];
  
  let commentNodes = [];
  let usedSelector = '';
  
  // 尝试各种选择器
  for (const selector of selectors) {
    // 跳过:contains选择器（在标准DOM中不支持）
    if (selector.includes(':contains')) continue;
    
    commentNodes = document.querySelectorAll(selector);
    if (commentNodes.length > 0) {
      usedSelector = selector;
      console.log(`✅ 通过选择器找到评论元素: ${selector}, 数量: ${commentNodes.length}`);
      break;
    }
  }
  
  if (commentNodes.length === 0) {
    console.warn('❌ 未找到任何评论元素，尝试备用策略...');
    
    // 备用策略：查找包含评论相关文本的div
    const allDivs = document.querySelectorAll('div');
    commentNodes = Array.from(allDivs).filter(div => {
      const text = div.innerText || '';
      return text.includes('评论') || text.includes('回复') || text.includes('点赞');
    });
    console.log(`🔍 备用策略找到 ${commentNodes.length} 个可能的评论元素`);
  }
  
  const results = Array.from(commentNodes).map((node, index) => {
    // 评论内容
    let content = '';
    let user = '';
    let time = '';
    
    // 内容提取：多种选择器策略
    const contentSelectors = [
      '.content', '[data-testid="comment-content"]', '.note-text',
      '.comment-text', '.text', '.message', '.body'
    ];
    for (const selector of contentSelectors) {
      const contentNode = node.querySelector(selector);
      if (contentNode && contentNode.innerText.trim()) {
        content = contentNode.innerText.trim();
        break;
      }
    }
    
    // 用户昵称提取：多种选择器策略
    const userSelectors = [
      '.author .name', '.user .name', '.nickname',
      '.username', '.user-name', '.author-name'
    ];
    for (const selector of userSelectors) {
      const userNode = node.querySelector(selector);
      if (userNode && userNode.innerText.trim()) {
        user = userNode.innerText.trim();
        break;
      }
    }
    
    // 时间提取：多种选择器策略
    const timeSelectors = [
      '.info .date span', '.time', '.date', '.timestamp',
      '.comment-time', '.post-time', '.create-time'
    ];
    for (const selector of timeSelectors) {
      const timeNode = node.querySelector(selector);
      if (timeNode && timeNode.innerText.trim()) {
        const rawTime = timeNode.innerText.trim();
        time = normalizeCommentTime(rawTime); // 应用时间标准化
        break;
      }
    }
    
    // 如果选择器都失败，尝试从整个节点的文本中提取
    if (!content && !user && !time) {
      const fullText = node.innerText || '';
      const lines = fullText.split('\n').filter(line => line.trim());
      if (lines.length >= 2) {
        content = lines[0] || '';
        user = lines[1] || '';
        const rawTime = lines[2] || '';
        time = normalizeCommentTime(rawTime); // 应用时间标准化
      }
    }
    
    console.log(`评论 ${index + 1}: 内容="${content}", 用户="${user}", 时间="${time}"`);
    return { content, user, time };
  });
  
  const validResults = results.filter(c => c.content && c.content.length > 0);
  console.log(`📊 总共找到 ${results.length} 个评论元素，有效评论 ${validResults.length} 个`);
  
  return validResults;
}

// 新增：移动鼠标到元素的函数（按照原始代码逻辑）
async function moveMouseToElement(el) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  el.dispatchEvent(new MouseEvent('mousemove', {clientX: x, clientY: y, bubbles: true}));
  await sleep(randomBetween(200, 800));
}

// 新增：偶尔模拟鼠标点击评论区的函数（按照原始代码逻辑）
async function maybeClickRandom() {
  if (Math.random() < 0.12) {
    const container = document.querySelector('.comments-container');
    if (container) {
      const rect = container.getBoundingClientRect();
      const x = rect.left + Math.random() * rect.width;
      const y = rect.top + Math.random() * rect.height;
      container.dispatchEvent(new MouseEvent('click', {clientX: x, clientY: y, bubbles: true}));
      await sleep(randomBetween(200, 800));
    }
  }
}

// 检查是否为首次采集
async function isFirstCollection(noteId) {
  try {
    const key = await getTodayKey();
    console.log('检查首次采集，存储键:', key);
    console.log('检查笔记ID:', noteId);
    
    return new Promise((resolve) => {
      chrome.storage.local.get({ [key]: {} }, function(data) {
        const allData = data[key] || {};
        console.log('获取到的存储数据:', allData);
        
        let found = false;
        let foundNote = null;
        for (const num in allData) {
          if (allData[num] && allData[num].noteId === noteId) {
            found = true;
            foundNote = allData[num];
            break;
          }
        }
        
        console.log('是否找到已存在的笔记:', found);
        if (found) {
          console.log('已存在笔记的评论数:', foundNote.comments ? foundNote.comments.length : 0);
          console.log('已存在笔记的评论总数:', foundNote.comments_total || 0);
        }
        
        resolve(!found);
      });
    });
  } catch (error) {
    console.error('检查首次采集时出错:', error);
    return true; // 出错时默认按首次采集处理
  }
}

// 获取历史评论数据 - 增量采集必需函数
async function getHistoricalComments(noteId) {
  return new Promise(async resolve => {
    const key = await getTodayKey();
    chrome.storage.local.get({ [key]: {} }, function(data) {
      const allData = data[key] || {};
      
      for (const num in allData) {
        if (allData[num] && allData[num].noteId === noteId) {
          resolve(allData[num]); // 返回完整的历史数据
          return;
        }
      }
      resolve(null);
    });
  });
}

// 检查是否有新增评论 - 增量采集必需函数
function hasNewComments(currentComments, historicalData) {
  if (!historicalData || !historicalData.comments || historicalData.comments.length === 0) {
    return true; // 首次采集，认为有新评论
  }
  
  // 比对评论内容
  const historicalContents = historicalData.comments.map(c => c.content).filter(c => c);
  const currentContents = currentComments.map(c => c.content).filter(c => c);
  
  // 检查是否有新的评论内容
  for (const content of currentContents) {
    if (!historicalContents.includes(content)) {
      return true;
    }
  }
  
  return false;
}

// 修改：主采集函数，增加首次采集和后续采集的区分
async function getAllCommentsDetail(noteId) {
  if (!noteId) {
    noteId = getNoteIdFromUrl();
  }
  console.log('=== 开始采集逻辑 ===');
  console.log('当前页面URL:', window.location.href);
  console.log('提取的笔记ID:', noteId);
  
  const isFirst = await isFirstCollection(noteId);
  console.log('是否为首次采集:', isFirst);
  
  if (isFirst) {
    console.log('首次采集该笔记，使用完整采集逻辑');
    return await getAllCommentsDetailFirstTime(noteId);
  } else {
    console.log('后续采集该笔记，使用增量采集逻辑');
    console.log('笔记ID:', noteId);
    return await getAllCommentsDetailIncremental(noteId);
  }
}

// 新增：首次采集逻辑（保持原有逻辑不变）
async function getAllCommentsDetailFirstTime(noteId) {
  const commentsDetail = [];
  let lastProgressNotify = 0;
  
  try {
    // 等待评论区加载
    await sleep(2000);
    
    // 获取初始评论 - 使用统一的评论获取函数
    let initialComments = getAllCommentsFromDom();
    if (initialComments && Array.isArray(initialComments)) {
        // 首次采集：初始评论直接添加，无需去重（因为commentsDetail为空）
        commentsDetail.push(...initialComments);
        console.log('初始评论数:', initialComments.length);
    } else {
        console.log('初始评论获取为空或失败，继续执行滚动逻辑...');
    }
    
    // 滚动获取更多评论 - 完全按照原始代码逻辑
    let lastCount = commentsDetail.length;
    let loop = 0;
    let noNewCount = 0;
    const MAX_NO_NEW = 2;
    
    try {
      while (loop < 30) { // MAX_LOOP = 30
        console.log(`准备第 ${loop + 1} 次滚动`);
        
        // 1. window整体向下滚动，距离和等待时间随机
        window.scrollTo(0, document.body.scrollHeight - randomBetween(0, 200));
        await sleep(randomBetween(1200, 3500));

        // 2. 评论区容器滑动，距离和等待时间随机
        const container = document.querySelector('.comments-container');
        if (container) {
          if (Math.random() < 0.2) {
            container.scrollTop -= randomBetween(50, 200);
            await sleep(randomBetween(800, 2000));
          }
          container.scrollTop += randomBetween(100, 400);
          await sleep(randomBetween(1200, 3500));
          if (Math.random() < 0.3) await moveMouseToElement(container);
        }

        // 3. 多次让最后一条评论 scrollIntoView，带停顿
        const commentNodes = document.querySelectorAll('.comments-container .comment-item, .comments-container [data-testid="comment-item"]');
        for (let i = 0; i < randomBetween(1, 2); i++) {
          if (commentNodes.length > 0) {
            const last = commentNodes[commentNodes.length - 1];
            last.scrollIntoView({behavior: 'smooth', block: 'end'});
            await sleep(randomBetween(800, 2000));
            if (Math.random() < 0.2) await moveMouseToElement(last);
          }
        }

        // 4. 偶尔模拟鼠标点击评论区
        await maybeClickRandom();

        // 5. 检查是否出现THE END
        if (checkForTheEnd && checkForTheEnd()) {
          console.log('[首次采集] 检测到THE END，结束滚动');
          break;
        }
        
        // 6. 判断评论数是否增加或达到上限
        const currentCommentsDetail = getAllCommentsFromDom();
        if (currentCommentsDetail.length >= 100) { // MAX_COMMENTS = 100
          console.error('已采集到100条评论，任务终止');
          break;
        }
        
        if (currentCommentsDetail.length === lastCount) {
          noNewCount++;
          if (noNewCount >= MAX_NO_NEW) {
            console.error('连续两次无新评论，判定采集完毕，停止采集');
            break;
          }
        } else {
          noNewCount = 0;
        }
        
        lastCount = currentCommentsDetail.length;
        loop++;
        
        // 循环结束后的等待时间
        if (Math.random() < 0.15) {
          await sleep(randomBetween(4000, 9000));
        } else {
          await sleep(randomBetween(2000, 5000));
        }
      }
    } catch (error) {
      console.error('滚动过程中出错:', error);
    }
    
    // 滚动完成后，获取最终的所有评论
    const finalCommentsDetail = getAllCommentsFromDom();
    console.log('滚动完成，最终评论数:', finalCommentsDetail.length);
    
    // 将最终评论添加到结果中（去重）
    for (const comment of finalCommentsDetail) {
      if (!commentsDetail.some(existing => 
        existing.content === comment.content && 
        existing.user === comment.user && 
        existing.time === comment.time
      )) {
        commentsDetail.push(comment);
      }
    }
    
    console.log('首次采集完成，总评论数:', commentsDetail.length);
    return commentsDetail;
    
  } catch (error) {
    console.error('首次采集出错:', error);
    return commentsDetail;
  }
}

// 新增：增量采集逻辑
async function getAllCommentsDetailIncremental(noteId) {
    console.log(`[增量采集] 开始增量采集笔记: ${noteId}`);
    
    // 获取历史数据
    const historicalData = await getNoteCommentsFromLocal(noteId);
    if (!historicalData || !historicalData.comments || historicalData.comments.length === 0) {
        console.log(`[增量采集] 历史数据为空或无效，转为首次采集`);
        return getAllCommentsDetailFirstTime(noteId);
    }
    
    const historicalCommentsTotal = historicalData.comments_total || 0;
    console.log(`[增量采集] 历史评论总数: ${historicalCommentsTotal}`);
    
    // 获取当前页面评论总数
    let currentCommentsTotal = getCommentsTotal();
    console.log(`[增量采集] 当前页面评论总数: ${currentCommentsTotal}`);
    
    // 如果当前评论总数为0，可能是页面未完全加载，等待后重试
    if (currentCommentsTotal === 0) {
        console.log(`[增量采集] 当前评论总数为0，等待5秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        currentCommentsTotal = getCommentsTotal();
        console.log(`[增量采集] 重试后评论总数: ${currentCommentsTotal}`);
        
        // 如果重试后仍为0，转为首次采集
        if (currentCommentsTotal === 0) {
            console.log(`[增量采集] 重试后评论总数仍为0，转为首次采集`);
            return getAllCommentsDetailFirstTime(noteId);
        }
    }
    
    // 关键逻辑1：评论总数比较
    if (currentCommentsTotal === historicalCommentsTotal) {
        console.log(`[增量采集] 评论总数无变化 (${currentCommentsTotal} = ${historicalCommentsTotal})，直接跳过采集下一篇`);
        return [];
    }
    
    // 简化逻辑：如果当前评论总数小于历史总数，直接跳过
    if (currentCommentsTotal < historicalCommentsTotal) {
        console.log(`[增量采集] 当前评论总数 (${currentCommentsTotal}) 小于历史总数 (${historicalCommentsTotal})，直接跳过采集下一篇`);
        return [];
    }
    
    console.log(`[增量采集] 评论总数有变化 (${currentCommentsTotal} > ${historicalCommentsTotal})，开始内容重复校验和增量采集`);
    
    // 关键逻辑2：内容重复校验和增量处理 - 参考原始代码的滚动逻辑
    console.log(`[增量采集] 开始增量滚动，参考原始代码逻辑`);
    
    let lastCount = 0;
    let loop = 0;
    let noNewCount = 0;
    const MAX_NO_NEW = 2;
    const allNewComments = [];
    
    try {
      while (loop < 30) { // MAX_LOOP = 30，但增量采集可以更保守
        console.log(`[增量采集] 准备第 ${loop + 1} 次滚动`);
        
        // 1. window整体向下滚动，距离和等待时间随机
        window.scrollTo(0, document.body.scrollHeight - randomBetween(0, 200));
        await sleep(randomBetween(1200, 3500));

        // 2. 评论区容器滑动，距离和等待时间随机
        const container = document.querySelector('.comments-container');
        if (container) {
          if (Math.random() < 0.2) {
            container.scrollTop -= randomBetween(50, 200);
            await sleep(randomBetween(800, 2000));
          }
          container.scrollTop += randomBetween(100, 400);
          await sleep(randomBetween(1200, 3500));
          if (Math.random() < 0.3) await moveMouseToElement(container);
        }

        // 3. 多次让最后一条评论 scrollIntoView，带停顿
        const commentNodes = document.querySelectorAll('.comments-container .comment-item, .comments-container [data-testid="comment-item"]');
        for (let i = 0; i < randomBetween(1, 2); i++) {
          if (commentNodes.length > 0) {
            const last = commentNodes[commentNodes.length - 1];
            last.scrollIntoView({behavior: 'smooth', block: 'end'});
            await sleep(randomBetween(800, 2000));
            if (Math.random() < 0.2) await moveMouseToElement(last);
          }
        }

        // 4. 偶尔模拟鼠标点击评论区
        await maybeClickRandom();

        // 5. 获取当前页面的评论并检查增量
        const currentComments = getCurrentPageComments();
        console.log(`[增量采集] 第 ${loop + 1} 次滚动后，当前页面评论数量: ${currentComments.length}`);
        
        // 检查当前页面的评论是否都已存在
        const { newComments, allExist } = checkCommentsExistence(currentComments, historicalData);
        
        if (newComments.length > 0) {
            console.log(`[增量采集] 发现 ${newComments.length} 条新评论，添加到结果中`);
            allNewComments.push(...newComments);
            noNewCount = 0; // 有新评论，重置计数器
        } else {
            noNewCount++;
            console.log(`[增量采集] 连续 ${noNewCount} 次无新评论`);
            
            if (noNewCount >= MAX_NO_NEW) {
                console.log(`[增量采集] 连续两次无新评论，判定增量采集完毕，停止采集`);
                break;
            }
        }
        
        // 检查是否出现THE END
        if (checkForTheEnd()) {
            console.log(`[增量采集] 检测到THE END，评论已到底，直接结束该笔记的采集`);
            break;
        }
        
        // 检查是否达到最大滚动次数（增量采集更保守）
        if (loop >= 10) { // 增量采集最多滚动10次
            console.log(`[增量采集] 已达到最大滚动次数 (10)，终止增量采集任务`);
            break;
        }
        
        loop++;
        
        // 循环结束后的等待时间
        if (Math.random() < 0.15) {
          await sleep(randomBetween(4000, 9000));
        } else {
          await sleep(randomBetween(2000, 5000));
        }
      }
    } catch (error) {
      console.error('[增量采集] 滚动过程中出错:', error);
    }
    
    console.log(`[增量采集] 增量采集完成，共滚动 ${loop} 次，收集新评论 ${allNewComments.length} 条`);
    return allNewComments;
}

// 新增：检查评论是否已存在的辅助函数
function checkCommentsExistence(currentComments, historicalData) {
    if (!historicalData || !historicalData.comments || historicalData.comments.length === 0) {
        return { newComments: currentComments, allExist: false };
    }
    
    // 直接使用评论内容进行对比，不依赖评论ID
    const historicalContents = new Set();
    historicalData.comments.forEach(c => {
        if (c.content && c.user && c.time) {
            // 使用内容+用户+时间作为唯一标识
            const contentKey = `${c.content}_${c.user}_${c.time}`;
            historicalContents.add(contentKey);
        }
    });
    
    const newComments = [];
    for (const comment of currentComments) {
        if (comment.content && comment.user && comment.time) {
            const contentKey = `${comment.content}_${comment.user}_${comment.time}`;
            if (!historicalContents.has(contentKey)) {
                newComments.push(comment);
            }
        }
    }
    
    const allExist = newComments.length === 0;
    return { newComments, allExist };
}

// 新增：检查是否出现THE END的函数
function checkForTheEnd() {
  try {
    console.log('🔍 开始检测THE END元素...');
    
    // 增强容错性：减少对特定data-v属性的依赖
    const selectors = [
      // 第一优先级：您指定的确切选择器（可能失效）
      '[data-v-4643bded][data-v-4a19279a].end-container',
      
      // 第二优先级：基于class的通用选择器（更稳定）
      '.end-container',
      '.end',
      '.comment-end',
      '.load-end',
      '.bottom-end',
      
      // 第三优先级：包含关键词的选择器（容错性较强）
      '[class*="end"]',
      '[class*="end-container"]',
      '[class*="comment-end"]',
      '[class*="load-end"]',
      
      // 第四优先级：基于文本内容的智能检测（最稳定）
      'div:contains("THE END")',
      'span:contains("THE END")',
      'div:contains("END")',
      'span:contains("END")'
    ];
    
    // 首先尝试基于选择器的查找
    for (const selector of selectors) {
      // 跳过:contains选择器（在标准DOM中不支持）
      if (selector.includes(':contains')) continue;
      
      const element = document.querySelector(selector);
      if (element) {
        const text = element.innerText.trim();
        console.log(`🔍 通过选择器 ${selector} 检测到元素: "${text}"`);
        
        // 检查文本内容是否包含THE END
        if (isTheEndText(text)) {
          console.log('✅ 确认检测到THE END，评论已到底');
          return true;
        }
      }
    }
    
    // 如果选择器查找失败，使用智能文本检测
    console.log('🔍 选择器查找失败，使用智能文本检测...');
    if (findTheEndByTextContent()) {
      console.log('✅ 通过智能文本检测确认THE END');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ 检查THE END时发生错误:', error);
    return false;
  }
}

// 新增：智能文本检测THE END
function findTheEndByTextContent() {
  try {
    console.log('🔍 开始智能文本检测THE END...');
    
    // 查找所有可能包含THE END的元素
    const allElements = document.querySelectorAll('div, span, p, strong, b');
    const theEndPatterns = [
      /THE\s*END/i,           // "THE END" (不区分大小写)
      /-\s*THE\s*END\s*-/i,   // "- THE END -"
      /THE\s*END\s*!/i,       // "THE END!"
      /END/i,                 // "END"
      /结束/i,                 // "结束"
      /到底/i,                 // "到底"
      /没有更多/i,             // "没有更多"
      /加载完成/i               // "加载完成"
    ];
    
    for (const element of allElements) {
      const text = element.innerText.trim();
      if (text.length > 0 && text.length < 100) { // 限制文本长度，避免误匹配
        for (const pattern of theEndPatterns) {
          if (pattern.test(text)) {
            console.log(`✅ 智能检测到可能的THE END元素: "${text}"`);
            if (isTheEndText(text)) {
              return true;
            }
          }
        }
      }
    }
    
    console.log('❌ 智能文本检测未找到THE END元素');
    return false;
  } catch (error) {
    console.error('❌ 智能文本检测THE END时发生错误:', error);
    return false;
  }
}

// 新增：判断文本是否为THE END的辅助函数
function isTheEndText(text) {
  // 检查文本内容是否包含THE END相关关键词
  const theEndKeywords = [
    'THE END',
    'END',
    '结束',
    '到底',
    '没有更多',
    '加载完成',
    '评论已到底',
    '没有更多评论'
  ];
  
  const lowerText = text.toLowerCase();
  for (const keyword of theEndKeywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      console.log(`✅ 文本 "${text}" 匹配THE END关键词: "${keyword}"`);
      return true;
    }
  }
  
  return false;
}

// 新增：从页面获取评论的辅助函数
function getCommentsFromPage() {
  try {
    const commentNodes = document.querySelectorAll('.comments-container .comment-item, .comments-container [data-testid="comment-item"]');
    
    if (commentNodes.length === 0) {
      console.log('[获取评论] 未找到评论节点，可能页面结构变化');
      return { success: true, comments: [], error: null }; // 返回结构化结果
    }
    
    console.log(`[获取评论] 找到 ${commentNodes.length} 个评论节点`);
    
    const comments = Array.from(commentNodes).map((node, index) => {
      try {
        // 评论内容
        let content = '';
        let user = '';
        let time = '';
        let likes = 0;
        let comment_id = `comment_${index}`; // 默认评论ID
        
        // 内容
        const contentNode = node.querySelector('.content, [data-testid="comment-content"], .note-text');
        if (contentNode) content = contentNode.innerText.trim();
        
        // 用户昵称
        const userNode = node.querySelector('.author .name');
        if (userNode) user = userNode.innerText.trim();
        
        // 时间 - 新增时间统一化处理
        const timeNode = node.querySelector('.info .date span');
        if (timeNode) {
          const rawTime = timeNode.innerText.trim();
          time = normalizeCommentTime(rawTime);
        }
        
        // 尝试获取评论ID
        const commentIdNode = node.querySelector('[data-comment-id], [data-id]');
        if (commentIdNode) {
          comment_id = commentIdNode.getAttribute('data-comment-id') || commentIdNode.getAttribute('data-id') || comment_id;
        }
        
        // 优化：使用更高效的选择器获取点赞数
        const likeNode = node.querySelector('.like-wrapper .count') || 
                        node.querySelector('.like .count') || 
                        node.querySelector('[class*="like"] .count');
        
        if (likeNode) {
          const likeText = likeNode.innerText.trim();
          const likeNum = parseInt(likeText);
          if (!isNaN(likeNum)) {
            likes = likeNum;
          }
        }
        
        return { comment_id, content, user, time, likes };
      } catch (commentError) {
        console.warn(`[获取评论] 处理第 ${index} 个评论节点时出错:`, commentError);
        return null;
      }
    }).filter(c => c && c.content); // 过滤掉无效评论
    
    return { success: true, comments, error: null };
    
  } catch (error) {
    console.error('[获取评论] 获取评论时发生错误:', error);
    return { success: false, comments: [], error: error.message };
  }
}

// 时间统一化处理函数
function normalizeCommentTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '';
  
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = (today.getMonth() + 1).toString().padStart(2, '0');
  const currentDay = today.getDate().toString().padStart(2, '0');
  
  // 清理输入字符串
  const cleanTimeStr = timeStr.trim();
  
  // 如果已经是"YYYY-MM-DD"格式，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanTimeStr)) {
    return cleanTimeStr;
  }
  
  // 如果已经是"MM-DD"格式，转换为"YYYY-MM-DD"
  if (/^\d{2}-\d{2}$/.test(cleanTimeStr)) {
    const parts = cleanTimeStr.split('-');
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    
    // 验证月份和日期的有效性
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      console.warn('无效的日期格式:', cleanTimeStr);
      return `${currentYear}-${currentMonth}-${currentDay}`; // 返回今天的日期作为默认值
    }
    
    // 计算这个日期相对于今天的天数
    const targetDate = new Date(today.getFullYear(), month - 1, day);
    
    // 如果目标日期在今年已经过了，说明是去年的日期
    if (targetDate > today) {
      targetDate.setFullYear(today.getFullYear() - 1);
    }
    
    // 计算天数差
    const timeDiff = today.getTime() - targetDate.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    // 如果天数差在合理范围内（1-15天），使用计算出的日期
    if (daysDiff >= 1 && daysDiff <= 15) {
      const targetYear = targetDate.getFullYear();
      const targetMonth = (targetDate.getMonth() + 1).toString().padStart(2, '0');
      const targetDay = targetDate.getDate().toString().padStart(2, '0');
      return `${targetYear}-${targetMonth}-${targetDay}`;
    }
    
    // 否则直接补全年份
    return `${today.getFullYear()}-${cleanTimeStr}`;
  }
  
  // 规则1：包含"刚刚"、"分钟"、"小时"，统一处理为当天日期
  if (cleanTimeStr.includes('刚刚') || cleanTimeStr.includes('分钟') || cleanTimeStr.includes('小时')) {
    return `${currentYear}-${currentMonth}-${currentDay}`;
  }
  
  // 规则2：包含"昨天"，处理为昨天日期
  if (cleanTimeStr.includes('昨天')) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayMonth = (yesterday.getMonth() + 1).toString().padStart(2, '0');
    const yesterdayDay = yesterday.getDate().toString().padStart(2, '0');
    return `${currentYear}-${yesterdayMonth}-${yesterdayDay}`;
  }
  
  // 规则3：处理"X天前"格式
  const dayMatch = cleanTimeStr.match(/(\d+)天前/);
  if (dayMatch) {
    const daysAgo = parseInt(dayMatch[1]);
    if (daysAgo >= 1 && daysAgo <= 15) {  // 修复：统一处理1-15天，与MM-DD格式保持一致
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - daysAgo);
      const targetMonth = (targetDate.getMonth() + 1).toString().padStart(2, '0');
      const targetDay = targetDate.getDate().toString().padStart(2, '0');
      return `${currentYear}-${targetMonth}-${targetDay}`;
    }
  }
  
  // 其他情况，尝试解析并转换
  try {
    // 处理可能的其他时间格式，如"06-30"
    if (cleanTimeStr.includes('-')) {
      const parts = cleanTimeStr.split('-');
      if (parts.length === 2) {
        const month = parts[0].padStart(2, '0');
        const day = parts[1].padStart(2, '0');
        if (/^\d{2}$/.test(month) && /^\d{2}$/.test(day)) {
          return `${currentYear}-${month}-${day}`;
        }
      }
    }
  } catch (e) {
    console.warn('时间解析失败:', cleanTimeStr, e);
  }
  
  // 无法解析的情况，返回今天的日期作为默认值，确保格式统一
  console.warn('无法解析的时间格式，使用今天的日期作为默认值:', cleanTimeStr);
  return `${currentYear}-${currentMonth}-${currentDay}`;
}

function getTodayKey() {
  // 获取当前监控品牌的存储键
  return new Promise((resolve) => {
    chrome.storage.local.get(['monitorBrands', 'monitorProgress'], (data) => {
      const brands = data.monitorBrands || [];
      const progress = data.monitorProgress || {};
      
      if (progress.brandId && brands.find(b => b.id === progress.brandId)) {
        resolve(`xhs_comments_brand_${progress.brandId}.json`);
      } else if (brands.length > 0) {
        // 如果没有当前品牌ID，使用最新的品牌
        resolve(`xhs_comments_brand_${brands[brands.length - 1].id}.json`);
      } else {
        // 没有品牌时使用默认存储
        resolve('xhs_comments_brand_default.json');
      }
    });
  });
}

function saveNoteCommentsToLocal(noteId, noteData) {
  return new Promise(resolve => {
    // 验证输入参数
    if (!noteId) {
      console.error('saveNoteCommentsToLocal: noteId 不能为空');
      resolve();
      return;
    }
    
    // 如果noteData是数组，说明是旧格式调用，转换为新格式
    let comments, noteUrl, noteTitle, noteAuthor, commentsTotal, collectionTime;
    
    if (Array.isArray(noteData)) {
      // 旧格式：saveNoteCommentsToLocal(noteId, noteUrl, comments)
      comments = noteData || [];
      noteUrl = arguments[1] || window.location.href; // 第二个参数是noteUrl
      noteTitle = getNoteTitle() || '未知标题';
      noteAuthor = getNoteAuthor() || '未知作者';
      commentsTotal = getCommentsTotal() || 0;
      collectionTime = new Date().toISOString().split('T')[0];
    } else if (noteData && typeof noteData === 'object') {
      // 新格式：saveNoteCommentsToLocal(noteId, noteData)
      comments = noteData.comments || [];
      noteUrl = noteData.note_url || window.location.href;
      noteTitle = noteData.note_title || getNoteTitle() || '未知标题';
      noteAuthor = noteData.note_author || getNoteAuthor() || '未知作者';
      commentsTotal = noteData.comments_total || getCommentsTotal() || 0;
      collectionTime = noteData.collection_time || new Date().toISOString().split('T')[0];
    } else {
      // 无效的noteData，使用默认值
      console.warn('saveNoteCommentsToLocal: noteData 无效，使用默认值');
      comments = [];
      noteUrl = window.location.href;
      noteTitle = getNoteTitle() || '未知标题';
      noteAuthor = getNoteAuthor() || '未知作者';
      commentsTotal = getCommentsTotal() || 0;
      collectionTime = new Date().toISOString().split('T')[0];
    }
    
    // 确保所有变量都有有效值
    if (!noteUrl || !noteTitle || !noteAuthor) {
      console.error('saveNoteCommentsToLocal: 关键字段缺失', { noteUrl, noteTitle, noteAuthor });
      resolve();
      return;
    }
    
    console.log('保存评论数:', comments.length);
    console.log('保存的笔记信息:', { noteId, noteUrl, noteTitle, noteAuthor, commentsTotal, collectionTime });
    
    getTodayKey().then(key => {
      chrome.storage.local.get({ [key]: {} }, function(data) {
      let allData = data[key] || {};
      
      // 查找当前noteId是否已存在
      let foundNum = null;
      for (const num in allData) {
        if (allData[num] && allData[num].noteId === noteId) {
          foundNum = num;
          break;
        }
      }
      
      let useNum = foundNum;
      if (!useNum) {
        // 如果是新笔记，分配新的编号
        const nums = Object.keys(allData).map(n => parseInt(n)).filter(n => !isNaN(n));
        useNum = nums.length > 0 ? (Math.max(...nums) + 1).toString() : '1';
      }
      
      // 保存数据，包含采集时间和评论总数
      const now = new Date();
      
      // 如果是增量采集（已存在的笔记），需要合并评论数据
      let finalComments = comments;
      if (foundNum && allData[foundNum] && allData[foundNum].comments) {
        const existingComments = allData[foundNum].comments;
        console.log(`增量采集：原有评论 ${existingComments.length} 条，新增评论 ${comments.length} 条`);
        
        // 合并评论，去重（基于内容+用户+时间）
        const existingKeys = new Set();
        existingComments.forEach(c => {
          if (c.content && c.user && c.time) {
            const key = `${c.content}_${c.user}_${c.time}`;
            existingKeys.add(key);
          }
        });
        
        // 添加新评论（去重）
        const mergedComments = [...existingComments];
        comments.forEach(c => {
          if (c.content && c.user && c.time) {
            const key = `${c.content}_${c.user}_${c.time}`;
            if (!existingKeys.has(key)) {
              mergedComments.push(c);
              existingKeys.add(key);
            }
          }
        });
        
        finalComments = mergedComments;
        console.log(`合并后总评论数: ${finalComments.length} 条`);
      }
      
      allData[useNum] = { 
        noteId, 
        note_url: noteUrl,        // 统一字段名
        note_title: noteTitle,    // 统一字段名
        note_author: noteAuthor,  // 统一字段名
        comments: finalComments,  // 使用合并后的评论数据
        comments_total: commentsTotal,
        collection_time: collectionTime,  // 使用传入的collectionTime
        lastUpdated: now.toISOString()
      };
      
      chrome.storage.local.set({ [key]: allData }, function() {
        console.log('已保存评论到chrome.storage.local', key, allData);
        resolve();
      });
      });
    });
  });
}



// 采集状态同步：采集开始和完成时主动通知后台
function notifyCollectingStatus(status) {
  try {
    chrome.runtime.sendMessage({ xhsCollectStatus: status, noteUrl: window.location.href }, () => {});
  } catch(e) {}
}

// 心跳：简化版心跳机制，减少资源消耗
let heartbeatTimer = null;

function startHeartbeat() {
    // 清理之前的定时器
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    
    // 简化心跳逻辑，降低频率到10秒
    heartbeatTimer = setInterval(() => {
        try {
            chrome.runtime.sendMessage({ type: 'XHS_HEARTBEAT', noteId: getNoteIdFromUrl() }, () => {});
        } catch(e) {
            // 静默处理错误，避免日志过多
        }
    }, 10000); // 从5秒改为10秒
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

// 强制加载所有评论的主函数 - 修复后的逻辑
async function forceLoadAllComments() {
  notifyCollectingStatus('collecting');
  // 启动心跳机制，配合后台monitorHb
  try { startHeartbeat(); } catch(e) {}
  
  try {
    // 获取笔记ID
    const noteId = getNoteIdFromUrl();
    if (!noteId) {
      console.error('无法获取笔记ID，终止采集');
      notifyCollectingStatus('collected');
      try { stopHeartbeat(); } catch(e) {}
      
      await closePageSafely(noteId, 'collected');
      return;
    }
    
    // 调用采集逻辑获取评论数据
    console.log('开始采集评论数据...');
    const commentsDetail = await getAllCommentsDetail(noteId);
    
    console.log('采集完成，获取到评论数:', commentsDetail.length);
    
    // 保存数据到本地存储
    if (commentsDetail && commentsDetail.length > 0) {
      const noteUrl = window.location.href;
      await saveNoteCommentsToLocal(noteId, { 
        noteUrl, 
        note_title: getNoteTitle(), 
        note_author: getNoteAuthor(), 
        comments: commentsDetail,
        comments_total: getCommentsTotal(),
        collection_time: new Date().toISOString().split('T')[0]
      });
      console.log('评论数据保存成功');
    } else {
      console.log('未获取到评论数据，跳过保存');
    }
    
    // 通知采集完成并关闭页面
    notifyCollectingStatus('collected');
    try { stopHeartbeat(); } catch(e) {}
    
    await closePageSafely(noteId, 'collected');
    
  } catch (e) {
    console.error('采集异常:', e);
    // 异常时也尝试保存已采集到的评论
    try {
      const noteId = getNoteIdFromUrl();
      const noteUrl = window.location.href;
      const commentsDetail = getAllCommentsFromDom();
      if (commentsDetail && commentsDetail.length > 0) {
        await saveNoteCommentsToLocal(noteId, { 
          noteUrl, 
          note_title: getNoteTitle(), 
          note_author: getNoteAuthor(), 
          comments: commentsDetail,
          comments_total: getCommentsTotal(),
          collection_time: new Date().toISOString().split('T')[0]
        });
      }
    } catch (saveError) {
      console.error('保存异常数据时出错:', saveError);
    }
    
    notifyCollectingStatus('collected');
    try { stopHeartbeat(); } catch(e) {}
    
    await closePageSafely(noteId, 'collected');
    
  }
}

let allowCollect = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.fromPlugin) {
    // 允许 /explore/{id} 与 /discovery/item/{id}
    const m = window.location.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-zA-Z]+)/);
    if (m && m[1]) {
      allowCollect = true;
      setTimeout(forceLoadAllComments, randomBetween(2000, 5000));
      sendResponse({ ok: true });
      return true;
    } else {
      allowCollect = false;
      // 非笔记详情页不采集
    }
  }
  return false;
});

// 禁止页面自动采集，只有插件消息触发才采集
// window.addEventListener('load', () => {
//   setTimeout(forceLoadAllComments, randomBetween(2000, 5000));
// });

// 风控风险检查说明：
// 1. 本脚本仅在 content script 注入页面，不会主动发起批量请求，不会注入 window.eval/Function 等高危代码。
// 2. 采集逻辑全部基于页面真实渲染内容，无直接接口批量请求行为。
// 3. 如需更低风控风险，建议分批采集、间隔更长时间、避免频繁刷新页面。 

// 新增：获取评论总数的函数
function getCommentsTotal() {
  try {
    console.log('🔍 开始查找评论总数元素...');
    
    // 增强容错性：减少对特定data-v属性的依赖
    const selectors = [
      // 第一优先级：您指定的确切选择器（可能失效）
      '[data-v-4a19279a] .total',
      '[data-v-46299452] .count',
      
      // 第二优先级：基于class的通用选择器（更稳定）
      '.total',
      '.count',
      '.comment-total',
      '.comment-count',
      '.total-count',
      
      // 第三优先级：包含关键词的选择器（容错性最强）
      '[class*="total"]',
      '[class*="count"]',
      '[class*="comment-total"]',
      '[class*="comment-count"]',
      '[class*="total-count"]',
      
      // 第四优先级：基于文本内容的智能检测（最稳定）
      'div:contains("共")',
      'span:contains("共")',
      'div:contains("条评论")',
      'span:contains("条评论")'
    ];
    
    let totalNode = null;
    let usedSelector = '';
    
    // 首先尝试基于选择器的查找
    for (const selector of selectors) {
      // 跳过:contains选择器（在标准DOM中不支持）
      if (selector.includes(':contains')) continue;
      
      totalNode = document.querySelector(selector);
      if (totalNode) {
        usedSelector = selector;
        console.log(`✅ 通过选择器找到评论总数元素: ${selector}`);
        break;
      }
    }
    
    // 如果选择器查找失败，使用智能文本检测
    if (!totalNode) {
      console.log('🔍 选择器查找失败，使用智能文本检测...');
      totalNode = findElementByTextContent();
      if (totalNode) {
        usedSelector = '智能文本检测';
        console.log('✅ 通过智能文本检测找到评论总数元素');
      }
    }
    
    if (totalNode) {
      const totalText = totalNode.innerText.trim();
      console.log('评论总数元素文本内容:', totalText);
      console.log('使用的检测方法:', usedSelector);
      
      // 检查是否是纯数字格式（如 [data-v-46299452] .count 元素）
      if (usedSelector.includes('count') || /^\d+$/.test(totalText)) {
        const total = parseInt(totalText);
        if (!isNaN(total)) {
          console.log('✅ 从纯数字元素成功解析评论总数:', total);
          return total;
        }
      }
      
      // 优先匹配"共 X 条评论"格式
      const match = totalText.match(/共\s*(\d+)\s*条评论/);
      if (match) {
        const total = parseInt(match[1]);
        console.log('✅ 成功解析评论总数:', total);
        return total;
      } else {
        console.log('⚠️ 文本内容不匹配"共 X 条评论"格式，尝试其他匹配...');
        // 尝试其他可能的格式
        const altMatch = totalText.match(/(\d+)/);
        if (altMatch) {
          const total = parseInt(altMatch[1]);
          console.log('✅ 使用备用格式解析评论总数:', total);
          return total;
        }
      }
    }
    
    // Fallback: If totalNode not found, try to infer from comment count
    console.log('🔍 未找到评论总数元素，尝试通过评论容器数量推断...');
    const commentNodes = document.querySelectorAll('.comments-container .comment-item, .comments-container [data-testid="comment-item"]');
    console.log('找到的评论容器数量:', commentNodes.length);
    
    if (commentNodes.length > 0) {
      console.log('📊 通过评论容器数量推断当前可见评论数:', commentNodes.length);
      console.log('⚠️  注意：这只是当前可见的评论数，不是总评论数');
      // 返回当前可见评论数，但明确说明这不是总数
      return commentNodes.length;
    }
    
    console.warn('❌ 无法获取评论总数，返回0');
    return 0;
  } catch (error) {
    console.error('❌ 获取评论总数时发生错误:', error);
    return 0;
  }
}

// 新增：基于文本内容的智能元素查找
function findElementByTextContent() {
  try {
    console.log('🔍 开始智能文本检测...');
    
    // 查找所有可能包含评论总数的元素
    const allElements = document.querySelectorAll('div, span, p, strong, b');
    const targetPatterns = [
      /共\s*\d+\s*条评论/,      // "共 X 条评论"
      /\d+\s*条评论/,           // "X 条评论"
      /共\s*\d+/,               // "共 X"
      /\d+\s*条/                 // "X 条"
    ];
    
    for (const element of allElements) {
      const text = element.innerText.trim();
      if (text.length > 0 && text.length < 50) { // 限制文本长度，避免误匹配
        for (const pattern of targetPatterns) {
          if (pattern.test(text)) {
            console.log(`✅ 智能检测到可能的评论总数元素: "${text}"`);
            return element;
          }
        }
      }
    }
    
    console.log('❌ 智能文本检测未找到匹配元素');
    return null;
  } catch (error) {
    console.error('❌ 智能文本检测时发生错误:', error);
    return null;
  }
}

// 新增：获取当前页面评论的辅助函数
function getCurrentPageComments() {
    const result = getCommentsFromPage();
    
    if (!result.success) {
        console.error('[获取当前页面评论] 获取失败:', result.error);
        return [];
    }
    
    const comments = result.comments;
    
    // 在增量采集时，对评论进行去重处理
    const uniqueComments = [];
    const seenComments = new Set();
    
    for (const comment of comments) {
        // 使用评论内容、用户和时间作为唯一标识，不依赖评论ID
        const commentKey = `${comment.content}_${comment.user}_${comment.time}`;
        if (!seenComments.has(commentKey)) {
            seenComments.add(commentKey);
            uniqueComments.push(comment);
        }
    }
    
    if (uniqueComments.length !== comments.length) {
        console.log(`[去重] 原始评论数: ${comments.length}, 去重后: ${uniqueComments.length}`);
    }
    
    return uniqueComments;
}

// 新增：获取笔记标题的辅助函数
function getNoteTitle() {
    const titleElement = document.querySelector('.title') || 
                        document.querySelector('.note-title') || 
                        document.querySelector('[class*="title"]') ||
                        document.querySelector('h1') ||
                        document.title;
    
    if (titleElement) {
        return titleElement.innerText ? titleElement.innerText.trim() : titleElement.textContent.trim();
    }
    
    return document.title || '未知标题';
}

// 新增：获取笔记作者的辅助函数
function getNoteAuthor() {
    const authorElement = document.querySelector('.author .name') || 
                         document.querySelector('.user-name') || 
                         document.querySelector('[class*="author"]') ||
                         document.querySelector('[class*="user"]');
    
    if (authorElement) {
        return authorElement.innerText ? authorElement.innerText.trim() : authorElement.textContent.trim();
    }
    
    return '未知作者';
} 

// 新增：从本地存储获取笔记评论数据的辅助函数
async function getNoteCommentsFromLocal(noteId) {
    return new Promise(async resolve => {
        const key = await getTodayKey();
        chrome.storage.local.get({ [key]: {} }, function(data) {
            const allData = data[key] || {};
            
            for (const num in allData) {
                if (allData[num] && allData[num].noteId === noteId) {
                    resolve(allData[num]); // 返回完整的历史数据
                    return;
                }
            }
            resolve(null);
        });
    });
} 

// 新增：统一的页面关闭函数
async function closePageSafely(noteId, status = 'collected') {
  console.log('准备关闭当前页面，状态:', status);
  
  // 安全检查：确保不是插件页面
  if (window.location.href.startsWith('chrome-extension://')) {
    console.warn('当前是插件页面，拒绝关闭');
    return;
  }
  
  // 安全检查：确保是目标网站
  if (!window.location.href.includes('xiaohongshu.com')) {
    console.warn('当前不是目标网站，拒绝关闭');
    return;
  }
  
  // 通知background.js更新状态
  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        action: 'updateTabStatus',
        noteUrl: window.location.href,
        noteId: noteId,
        status: status
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
    console.log('状态更新消息已发送');
  } catch (error) {
    console.warn('发送状态更新消息失败:', error);
  }
  
  // 延迟关闭页面，确保消息发送完成
  setTimeout(() => {
    try {
      console.log('关闭当前页面');
      window.close();
    } catch (closeError) {
      console.warn('window.close()失败，使用备用方案:', closeError);
      // 备用方案：通知background.js关闭tab
      chrome.runtime.sendMessage({ 
        action: 'closeCurrentTab',
        noteUrl: window.location.href,
        noteId: noteId,
        status: status
      }, () => {});
    }
  }, 100);
} 