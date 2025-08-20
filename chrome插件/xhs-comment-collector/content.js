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

// 1. 增强反检测措施 - 隐藏自动化工具痕迹
try {
  // 隐藏webdriver标识
  Object.defineProperty(navigator, 'webdriver', { 
    get: () => undefined,
    configurable: true
  });
  
  // 隐藏Chrome自动化相关属性
  delete navigator.__proto__.webdriver;
  
  // 伪装User Agent相关属性
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5].map(() => 'plugin'),
    configurable: true
  });
  
  // 隐藏Chrome扩展检测特征
  Object.defineProperty(window, 'chrome', {
    get: () => ({
      runtime: undefined,
      // 保留必要的部分，隐藏扩展特征
      app: {
        isInstalled: false
      }
    }),
    configurable: true
  });
  
  // 重写console方法，避免检测脚本通过console判断
  const originalLog = console.log;
  console.log = function(...args) {
    // 过滤掉可能暴露插件的日志
    const logStr = args.join(' ');
    if (!logStr.includes('chrome-extension') && !logStr.includes('[content]')) {
      originalLog.apply(console, args);
    }
  };
  
  console.log('[反检测] 自动化工具痕迹隐藏完成');
  
} catch(e) {
  console.warn('[反检测] 痕迹隐藏部分失败:', e);
}

const MAX_LOOP = 30; // 降低最大循环次数，减少滑动
const MAX_COMMENTS = 100; // 达到100条评论即终止

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 新增：更自然的随机延迟函数
function naturalDelay(baseMs = 1000, variance = 0.3) {
  const variation = baseMs * variance * (Math.random() - 0.5) * 2;
  return Math.max(200, baseMs + variation);
}

// 新增：模拟人类阅读时间
function readingDelay(textLength = 50) {
  // 🔧 优化：真人看评论区很快，大幅缩短等待时间
  const baseReadingTime = Math.max(300, Math.min(textLength * 30, 1500)); // 30ms每字符，最多1.5秒
  return naturalDelay(baseReadingTime, 0.2); // 进一步减少随机变化
}

function getNoteIdFromUrl() {
  const m = window.location.pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-zA-Z]+)/);
  return m ? m[1] : '';
}

// ✅ 重新设计：基于结构层级区分正文和评论，避免data-v-xxx参数
function getAllCommentsFromDom() {
  console.log('🔍 开始获取DOM中的评论...');
  
  try {
    // ✅ 输入验证：检查DOM环境
    if (!document || typeof document.querySelector !== 'function') {
      console.error('❌ DOM环境不可用');
      return [];
    }
    
    // ✅ 使用稳定的选择器，通过结构层级区分评论和正文
    // 评论区域特征：在.list-container内的.comment-item，且包含.right > .content结构
    const commentContainer = document.querySelector('.list-container');
    
    if (!commentContainer) {
      console.log('❌ 未找到评论容器(.list-container)，该笔记没有评论');
      return [];
    }
  
  // ✅ 选择评论项：使用更稳定的选择器组合
  // 评论特征：.comment-item 且包含 .right > .content > .note-text 的完整结构
  const commentItems = commentContainer.querySelectorAll('.comment-item');
  
  // ✅ 过滤出真正的评论：必须有完整的评论结构
  const validCommentNodes = Array.from(commentItems).filter(node => {
    // 评论必须有这些结构：头像区(.avatar) + 内容区(.right)
    const hasAvatar = node.querySelector('.avatar');
    const hasRight = node.querySelector('.right');
    const hasContent = node.querySelector('.right .content');
    const hasNoteText = node.querySelector('.right .content .note-text');
    const hasAuthor = node.querySelector('.right .author-wrapper .author .name');
    const hasInfo = node.querySelector('.right .info');
    
    // 评论的完整结构验证
    return hasAvatar && hasRight && hasContent && hasNoteText && hasAuthor && hasInfo;
  });
  
  if (validCommentNodes.length === 0) {
    console.log('❌ 评论容器存在但没有找到有效评论，该笔记没有评论');
    return [];
  }
  
  console.log(`✅ 找到 ${validCommentNodes.length} 个有效评论`);
  
  const results = [];
  
  Array.from(validCommentNodes).forEach((node, index) => {
    try {
      // ✅ 根据实际HTML结构提取数据，并检测结构变更
      
      // 1. 用户昵称：.right > .author-wrapper > .author > .name
      let user = '';
      const userNode = node.querySelector('.right .author-wrapper .author .name');
      if (userNode) {
        user = userNode.innerText.trim();
      }
      
      // 2. 评论内容：.right > .content > .note-text > span
      let content = '';
      const contentNode = node.querySelector('.right .content .note-text span');
      if (contentNode) {
        content = contentNode.innerText.trim();
      }
      
      // 3. 时间：.right > .info > .date > span (第一个span)
      let time = '';
      const timeNode = node.querySelector('.right .info .date span');
      if (timeNode) {
        const rawTime = timeNode.innerText.trim();
        time = normalizeCommentTime(rawTime);
      }
      
      // 4. 点赞数：.right > .info > .interactions > .like > .like-wrapper > .count
      let likes = 0;
      const likeNode = node.querySelector('.right .info .interactions .like .like-wrapper .count');
      if (likeNode) {
        const likeText = likeNode.innerText.trim();
        // "赞" 表示0赞，数字表示具体赞数
        if (likeText === '赞') {
          likes = 0;
        } else {
          const likeNum = parseInt(likeText);
          if (!isNaN(likeNum)) {
            likes = likeNum;
          }
        }
      }
      
      // ✅ 直接保存，因为精确的选择器已经保证了数据质量
      console.log(`评论 ${index + 1}: 用户="${user}", 内容="${content}", 时间="${time}", 点赞=${likes}`);
      results.push({ content, user, time, likes });
      
    } catch (error) {
      console.error(`处理评论项 ${index + 1} 时出错:`, error);
    }
  });
  
    console.log(`📊 有效评论数量: ${results.length}`);
    return results;
    
  } catch (error) {
    console.error('❌ 获取评论时发生错误:', error);
    return [];
  }
}

// 新增：更自然的鼠标移动函数
async function moveMouseToElement(el) {
  if (!el) return;
  
  try {
    const rect = el.getBoundingClientRect();
    // 添加一些随机偏移，避免总是点击中心
    const offsetX = randomBetween(-20, 20);
    const offsetY = randomBetween(-20, 20);
    const x = Math.max(0, rect.left + rect.width / 2 + offsetX);
    const y = Math.max(0, rect.top + rect.height / 2 + offsetY);
    
    // 模拟更自然的鼠标事件序列
    el.dispatchEvent(new MouseEvent('mouseenter', {clientX: x, clientY: y, bubbles: true}));
    await sleep(naturalDelay(50, 0.3));
    
    el.dispatchEvent(new MouseEvent('mousemove', {clientX: x, clientY: y, bubbles: true}));
    await sleep(naturalDelay(100, 0.5));
    
    // 偶尔触发mouseover
    if (Math.random() < 0.3) {
      el.dispatchEvent(new MouseEvent('mouseover', {clientX: x, clientY: y, bubbles: true}));
      await sleep(naturalDelay(50, 0.4));
    }
    
    await sleep(naturalDelay(200, 0.6));
  } catch (error) {
    console.warn('[鼠标移动] 移动失败:', error);
  }
}

// 新增：更自然的随机交互函数
async function maybeClickRandom() {
  try {
    const container = document.querySelector('.comments-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    // 避免点击边缘，选择中心区域
    const margin = 20;
    const x = rect.left + margin + Math.random() * (rect.width - 2 * margin);
    const y = rect.top + margin + Math.random() * (rect.height - 2 * margin);
    
    // 模拟更自然的点击序列
    container.dispatchEvent(new MouseEvent('mousedown', {clientX: x, clientY: y, bubbles: true}));
    await sleep(naturalDelay(50, 0.3));
    
    container.dispatchEvent(new MouseEvent('mouseup', {clientX: x, clientY: y, bubbles: true}));
    await sleep(naturalDelay(30, 0.3));
    
    container.dispatchEvent(new MouseEvent('click', {clientX: x, clientY: y, bubbles: true}));
    await sleep(naturalDelay(300, 0.5));
    
    console.log('[随机交互] 模拟用户点击');
  } catch (error) {
    console.warn('[随机交互] 点击失败:', error);
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
        if (chrome.runtime.lastError) {
          console.error('❌ 读取chrome.storage.local失败:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
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
      if (chrome.runtime.lastError) {
        console.error('❌ 读取历史评论数据失败:', chrome.runtime.lastError);
        resolve([]);
        return;
      }
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
    // 🔧 优化：等待评论区加载，缩短等待时间
    await sleep(1000); // 1秒足够大部分页面加载完成
    
    // ✅ 修复：使用精确的评论获取函数
    console.log('[首次采集] 获取初始评论...');
    let initialComments = getAllCommentsFromDom();
    
    if (initialComments && Array.isArray(initialComments) && initialComments.length > 0) {
        // 首次采集：初始评论直接添加
        commentsDetail.push(...initialComments);
        console.log(`[首次采集] 初始评论数: ${initialComments.length}`);
    } else {
        console.log('[首次采集] 未找到初始评论，该笔记可能没有评论或需要滚动加载');
        
        // ✅ 优化1：无评论页面快速退出
        // 检查是否真的没有评论容器，如果没有则快速结束
        const commentContainer = document.querySelector('.list-container');
        if (!commentContainer) {
          console.log('[优化] 无评论容器，快速结束采集');
          await sleep(naturalDelay(500, 0.8)); // 0.5-2秒快速结束
          return commentsDetail;
        }
    }
    
    // 滚动获取更多评论 - 完全按照原始代码逻辑
    let lastCount = commentsDetail.length;
    let loop = 0;
    let noNewCount = 0;
    const MAX_NO_NEW = 4; // 🔧 修复：增加到4次，确保充分滚动加载
    
    // ✅ 优化2：提前检测THE END，如果已经在页面底部则跳过循环
    if (checkForTheEnd && checkForTheEnd()) {
      console.log('[优化] 提前检测到THE END，评论已完整，跳过滚动循环');
      return commentsDetail;
    }
    
    // ✅ 优化3：智能评估评论数量，避免不必要的循环
    let totalComments = getCommentsTotal();
    
    // 🔧 修复：如果首次获取总数为0，等待重试确保页面完全加载
    if (totalComments === 0) {
        console.log(`[首次采集] 首次获取评论总数为0，等待2秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 🔧 优化：缩短重试时间
        
        totalComments = getCommentsTotal();
        console.log(`[首次采集] 重试后评论总数: ${totalComments}`);
        
        if (totalComments === 0) {
            const errorMsg = `[首次采集] 重试后仍然没有找到评论总数元素，页面可能异常或结构发生变化`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    const needFullLoop = totalComments > 10; // 🔧 修复：评论数>10时才进行完整循环，现在totalComments不会为0
    
    if (!needFullLoop && commentsDetail.length >= totalComments) {
      console.log(`[优化] 评论数≤10且已获取完整(${commentsDetail.length}/${totalComments})，执行快速验证`);
      // 快速验证一次即可
      await sleep(naturalDelay(1000, 0.4));
      const verifyComments = getAllCommentsFromDom();
      for (const comment of verifyComments) {
        if (!commentsDetail.some(existing => 
          existing.content === comment.content && 
          existing.user === comment.user && 
          existing.time === comment.time
        )) {
          commentsDetail.push(comment);
        }
      }
      console.log(`[优化] 快速验证完成，最终评论数: ${commentsDetail.length}`);
      return commentsDetail;
    }
    
    try {
      while (loop < 30) { // MAX_LOOP = 30
        console.log(`准备第 ${loop + 1} 次滚动`);
        
        // ✅ 优化4：提前检测THE END，优先级最高
        if (checkForTheEnd && checkForTheEnd()) {
          console.log('[首次采集] 检测到THE END，结束滚动');
          break;
        }
        
        // 1. 更自然的页面滚动 - 模拟人类阅读行为
        const currentScroll = window.pageYOffset;
        const targetScroll = Math.min(document.body.scrollHeight - randomBetween(100, 300), currentScroll + randomBetween(300, 800));
        
        // 分段滚动，更像人类行为
        const scrollSteps = randomBetween(2, 4);
        for (let step = 0; step < scrollSteps; step++) {
          const stepScroll = currentScroll + (targetScroll - currentScroll) * (step + 1) / scrollSteps;
          window.scrollTo({ top: stepScroll, behavior: 'smooth' });
          await sleep(naturalDelay(300, 0.5)); // 更自然的延迟
        }
        
        // 模拟阅读停顿
        await sleep(readingDelay(randomBetween(30, 80)));

        // 2. 评论区容器滑动 - 降低频率，增加自然性
        const container = document.querySelector('.comments-container');
        if (container && Math.random() < 0.7) { // 70%概率操作评论区
          // 偶尔向上回看
          if (Math.random() < 0.15) {
            container.scrollTop -= randomBetween(30, 150);
            await sleep(naturalDelay(600, 0.4));
          }
          
          // 主要向下滚动
          const scrollAmount = randomBetween(80, 250);
          container.scrollTop += scrollAmount;
          await sleep(naturalDelay(1000, 0.6));
          
          // 偶尔移动鼠标到容器
          if (Math.random() < 0.25) await moveMouseToElement(container);
        }

        // 3. 智能定位到最后评论 - 减少频率
        const commentNodes = document.querySelectorAll('.comments-container .comment-item, .comments-container [data-testid="comment-item"]');
        if (commentNodes.length > 0 && Math.random() < 0.6) {
          const last = commentNodes[commentNodes.length - 1];
          last.scrollIntoView({behavior: 'smooth', block: 'end'});
          await sleep(naturalDelay(800, 0.4));
          
          // 很少移动鼠标到最后一条评论
          if (Math.random() < 0.1) await moveMouseToElement(last);
        }

        // 4. 降低随机点击频率
        if (Math.random() < 0.08) { // 从0.12降低到0.08
          await maybeClickRandom();
        }
        
        // 5. ✅ 修复：判断评论数是否增加或达到上限
        const currentCommentsDetail = getAllCommentsFromDom();
        
        // 合并新评论到结果中（去重）
        for (const comment of currentCommentsDetail) {
          if (!commentsDetail.some(existing => 
            existing.content === comment.content && 
            existing.user === comment.user && 
            existing.time === comment.time
          )) {
            commentsDetail.push(comment);
          }
        }
        
        if (commentsDetail.length >= 100) { // MAX_COMMENTS = 100
          console.log(`[首次采集] 已采集到100条评论，任务终止`);
          break;
        }
        
        if (commentsDetail.length === lastCount) {
          noNewCount++;
          console.log(`[首次采集] 第${noNewCount}次无新评论，当前${commentsDetail.length}/${totalComments}条`);
          
          // 🔧 修复：严格按照设计原则 - 只有检测到THE END才允许提前结束
          // 否则必须采集到100条评论才能结束，连续无新评论不应该成为终止条件
          console.log(`[首次采集] 连续${noNewCount}次无新评论，但未检测到THE END，继续滚动尝试获取更多评论`);
          
          // 只在连续很多次无新评论时给出警告，但不终止
          if (noNewCount >= 10) {
            console.warn(`[首次采集] 已连续${noNewCount}次无新评论，可能页面加载有问题或评论已全部加载`);
          }
        } else {
          noNewCount = 0;
        }
        
        lastCount = commentsDetail.length;
        loop++;
        
        // ✅ 优化5：循环结束后的等待时间 - 大幅缩短，更贴近真人速度
        const waitTime = commentsDetail.length <= 10 ? 
          naturalDelay(1200, 0.3) : // 🔧 优化：评论≤10：1.2-1.6秒，真人速度
          naturalDelay(1800, 0.4);   // 🔧 优化：评论>10：1.8-2.5秒，稍慢但仍快速
          
        const pauseType = Math.random();
        if (pauseType < 0.05) {
          // 5%概率稍长停顿（偶尔仔细看）
          await sleep(commentsDetail.length <= 10 ? naturalDelay(2000, 0.3) : naturalDelay(3000, 0.3));
          console.log('[自然化] 模拟仔细阅读停顿');
        } else if (pauseType < 0.15) {
          // 10%概率中等停顿（稍微思考）
          await sleep(commentsDetail.length <= 10 ? naturalDelay(1500, 0.3) : naturalDelay(2200, 0.3));
          console.log('[自然化] 模拟思考停顿');
        } else {
          // 85%概率快速滚动（真人看评论很快）
          await sleep(waitTime);
        }
      }
    } catch (error) {
      console.error('滚动过程中出错:', error);
    }
    
    // ✅ 修复：滚动完成，评论已在过程中实时合并
    
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
        console.log(`[增量采集] 当前评论总数为0，等待3秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // 🔧 优化：缩短重试时间
        
        currentCommentsTotal = getCommentsTotal();
        console.log(`[增量采集] 重试后评论总数: ${currentCommentsTotal}`);
        
        // 如果重试后仍为0，说明页面异常，报错终止
        if (currentCommentsTotal === 0) {
            const errorMsg = `[增量采集] 重试后仍然没有找到评论总数元素，页面可能异常或结构发生变化`;
            console.error(errorMsg);
            throw new Error(errorMsg);
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
    
    // ✅ 优化：增量采集也提前检测THE END
    if (checkForTheEnd()) {
      console.log('[增量采集] 提前检测到THE END，评论已完整，跳过滚动循环');
      return [];
    }
    
    let lastCount = 0;
    let loop = 0;
    let noNewCount = 0;
    const MAX_NO_NEW = 4; // 🔧 修复：增量采集也增加到4次，确保充分滚动加载
    const allNewComments = [];
    
    try {
      while (loop < 30) { // MAX_LOOP = 30，但增量采集可以更保守
        console.log(`[增量采集] 准备第 ${loop + 1} 次滚动`);
        
        // ✅ 优化：增量采集也要提前检测THE END
        if (checkForTheEnd()) {
            console.log(`[增量采集] 检测到THE END，评论已到底，直接结束该笔记的采集`);
            break;
        }
        
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
            
            // 🔧 修复：增量采集保持原逻辑，因为增量采集的目标是找新增评论
            // 如果连续多次没有新增评论，可以合理认为增量采集完成
            if (noNewCount >= MAX_NO_NEW) {
                console.log(`[增量采集] 连续${MAX_NO_NEW}次无新评论，判定增量采集完毕，停止采集`);
                break;
            }
        }
        
        // 检查是否达到最大滚动次数（增量采集更保守）
        if (loop >= 10) { // 增量采集最多滚动10次
            console.log(`[增量采集] 已达到最大滚动次数 (10)，终止增量采集任务`);
            break;
        }
        
        loop++;
        
        // ✅ 优化：增量采集也根据评论数量动态调整等待时间
        const currentCommentCount = allNewComments.length + (historicalData.comments?.length || 0);
        if (currentCommentCount <= 10) {
          // 评论数少，缩短等待时间
          if (Math.random() < 0.15) {
            await sleep(randomBetween(2000, 4000)); // 缩短长停顿
          } else {
            await sleep(randomBetween(1000, 2500)); // 缩短正常停顿
          }
        } else {
          // 评论数多，保持原有等待时间
          if (Math.random() < 0.15) {
            await sleep(randomBetween(4000, 9000));
          } else {
            await sleep(randomBetween(2000, 5000));
          }
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

// ✅ 删除：移除可能采集正文的备用函数
// 这个函数已被getAllCommentsFromDom()替代，使用精确的HTML结构选择器

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
      commentsTotal = getCommentsTotal();
      if (commentsTotal === 0) {
        console.error('saveNoteCommentsToLocal: 无法获取评论总数，数据保存失败');
        throw new Error('无法获取评论总数，数据保存失败');
      }
      collectionTime = new Date().toISOString().split('T')[0];
    } else if (noteData && typeof noteData === 'object') {
      // 新格式：saveNoteCommentsToLocal(noteId, noteData)
      comments = noteData.comments || [];
      noteUrl = noteData.note_url || window.location.href;
      noteTitle = noteData.note_title || getNoteTitle() || '未知标题';
      noteAuthor = noteData.note_author || getNoteAuthor() || '未知作者';
      commentsTotal = getCommentsTotal();
      if (commentsTotal === 0) {
        console.error('saveNoteCommentsToLocal: 无法获取评论总数，数据保存失败');
        throw new Error('无法获取评论总数，数据保存失败');
      } // 🔧 修复：始终使用页面显示的真实总数
      collectionTime = noteData.collection_time || new Date().toISOString().split('T')[0];
    } else {
      // 无效的noteData，使用默认值
      console.warn('saveNoteCommentsToLocal: noteData 无效，使用默认值');
      comments = [];
      noteUrl = window.location.href;
      noteTitle = getNoteTitle() || '未知标题';
      noteAuthor = getNoteAuthor() || '未知作者';
      commentsTotal = getCommentsTotal();
      if (commentsTotal === 0) {
        console.error('saveNoteCommentsToLocal: 无法获取评论总数，数据保存失败');
        throw new Error('无法获取评论总数，数据保存失败');
      }
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
        if (chrome.runtime.lastError) {
          console.error('❌ 保存评论时读取存储失败:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
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
        if (chrome.runtime.lastError) {
          console.error('❌ 保存到chrome.storage.local失败:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
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
  // 新增：模拟用户进入页面的自然延迟
  console.log('[自然化] 模拟页面加载后的用户行为延迟...');
  await sleep(naturalDelay(1000, 0.4)); // 🔧 优化：1-1.4秒快速开始
  
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
    
    // 新增：模拟用户查看页面内容的行为
    console.log('[自然化] 模拟用户浏览页面内容...');
    
    // 🔧 优化：快速浏览，直接滚动到评论区附近
    console.log('[自然化] 快速定位到评论区...');
    
    // 快速滚动到页面中下部（评论区通常在这里）
    const targetPosition = Math.max(window.innerHeight * 0.6, document.body.scrollHeight * 0.4);
    window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    await sleep(naturalDelay(800, 0.3)); // 0.8-1.0秒
    
    // 调用采集逻辑获取评论数据
    console.log('开始采集评论数据...');
    const commentsDetail = await getAllCommentsDetail(noteId);
    
    console.log('采集完成，获取到评论数:', commentsDetail.length);
    
    // ✅ 保存数据到本地存储：无论是否有评论都保存正文内容
    const noteUrl = window.location.href;
    const noteData = { 
      noteUrl, 
      note_title: getNoteTitle(), 
      note_author: getNoteAuthor(), 
      note_content: getNoteContent(), // ✅ 添加正文内容
      comments: commentsDetail || [],
      comments_total: (() => {
        const total = getCommentsTotal();
        if (total === 0) {
          console.error('forceLoadAllComments: 无法获取评论总数');
          throw new Error('无法获取评论总数');
        }
        return total;
      })(), // 🔧 修复：使用页面显示的真实总数，确保不为0
      collection_time: new Date().toISOString().split('T')[0]
    };
    
    // ✅ 修复：为异步操作添加错误处理
    try {
      await saveNoteCommentsToLocal(noteId, noteData);
      
      if (commentsDetail && commentsDetail.length > 0) {
        console.log(`✅ 采集完成：正文内容 + ${commentsDetail.length}条评论 已保存`);
      } else {
        console.log('✅ 采集完成：正文内容已保存（该笔记无评论）');
      }
    } catch (saveError) {
      console.error('❌ 保存数据失败:', saveError);
      // 即使保存失败，也要继续执行后续流程
    }
    
    // 通知采集完成并关闭页面
    notifyCollectingStatus('collected');
    try { stopHeartbeat(); } catch(e) {}
    
    await closePageSafely(noteId, 'collected');
    
  } catch (e) {
    console.error('采集异常:', e);
    // ✅ 修复：异常时也尝试保存已采集到的评论，使用精确采集函数
    try {
      const noteId = getNoteIdFromUrl();
      const noteUrl = window.location.href;
      const commentsDetail = getAllCommentsFromDom(); // ✅ 使用精确的评论采集函数
      if (commentsDetail && commentsDetail.length > 0) {
        console.log(`[异常恢复] 保存已采集的 ${commentsDetail.length} 条评论`);
        await saveNoteCommentsToLocal(noteId, { 
          noteUrl, 
          note_title: getNoteTitle(), 
          note_author: getNoteAuthor(), 
          note_content: getNoteContent(), // ✅ 添加正文内容
          comments: commentsDetail,
          comments_total: (() => {
            const total = getCommentsTotal();
            if (total === 0) {
              console.error('异常恢复: 无法获取评论总数');
              throw new Error('无法获取评论总数');
            }
            return total;
          })(),
          collection_time: new Date().toISOString().split('T')[0]
        });
      } else {
        console.log('[异常恢复] 没有有效评论可保存');
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
      // 更自然的延迟启动
      const startDelay = naturalDelay(3000, 0.4); // 3-5秒自然延迟
      console.log(`[自然化] 将在 ${Math.round(startDelay)}ms 后开始采集`);
      setTimeout(forceLoadAllComments, startDelay);
      sendResponse({ ok: true });
      return true;
    } else {
      allowCollect = false;
      console.log('[页面检查] 非笔记详情页，跳过采集');
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

// 🔧 修复：精确获取评论总数函数（按用户要求只从class="total"获取）
function getCommentsTotal() {
  try {
    console.log('🔍 开始查找评论总数元素...');
    
    // 🎯 按用户要求：精确只从class="total"获取，不要备用复杂逻辑
    const totalElement = document.querySelector('.total');
    
    if (totalElement) {
      const totalText = totalElement.innerText.trim();
      console.log('评论总数元素文本内容:', totalText);
      console.log('使用选择器: .total');
      
      // 精确匹配"共 X 条评论"格式，提取数字
      const match = totalText.match(/共\s*(\d+)\s*条评论/);
      if (match) {
        const total = parseInt(match[1]);
        console.log('✅ 从class="total"成功解析评论总数:', total);
        return total;
      } else {
        console.warn('⚠️ class="total"元素文本格式不匹配"共 X 条评论":', totalText);
        return 0;
      }
    } else {
      console.warn('❌ 未找到class="total"元素');
      return 0;
    }
  } catch (error) {
    console.error('❌ 获取评论总数时发生错误:', error);
    return 0;
  }
}



// ✅ 修复：使用精确的评论采集函数
function getCurrentPageComments() {
    console.log('[获取当前页面评论] 开始获取...');
    
    // ✅ 直接使用精确的评论采集函数
    const comments = getAllCommentsFromDom();
    
    if (!comments || comments.length === 0) {
        console.log('[获取当前页面评论] 未找到评论或该笔记没有评论');
        return [];
    }
    
    // 在增量采集时，对评论进行去重处理
    const uniqueComments = [];
    const seenComments = new Set();
    
    for (const comment of comments) {
        // 使用评论内容、用户和时间作为唯一标识
        const commentKey = `${comment.content}_${comment.user}_${comment.time}`;
        if (!seenComments.has(commentKey)) {
            seenComments.add(commentKey);
            uniqueComments.push(comment);
        }
    }
    
    if (uniqueComments.length !== comments.length) {
        console.log(`[去重] 原始评论数: ${comments.length}, 去重后: ${uniqueComments.length}`);
    }
    
    console.log(`[获取当前页面评论] 最终返回 ${uniqueComments.length} 条有效评论`);
    return uniqueComments;
}

// ✅ 新增：获取笔记正文内容（包含话题标签）
function getNoteContent() {
  console.log('🔍 获取笔记正文内容...');
  
  try {
    // ✅ 输入验证：检查页面环境
    if (!document || typeof document.querySelector !== 'function') {
      console.warn('❌ DOM环境不可用');
      return '';
    }
    
    // ✅ 正文内容位于 #detail-desc > .note-text 中
    // 这个结构与评论中的 .note-text 不同，正文在页面主体区域
    const contentContainer = document.querySelector('#detail-desc .note-text');
    
    if (!contentContainer) {
      console.log('❌ 未找到正文容器(#detail-desc .note-text)');
      return '';
    }
    
    // ✅ 提取完整正文内容，包括话题标签
    const content = contentContainer.innerText || contentContainer.textContent || '';
    
    // ✅ 数据验证：确保返回值是字符串
    const result = typeof content === 'string' ? content.trim() : '';
    
    console.log(`✅ 获取到正文内容: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ 获取正文内容时发生错误:', error);
    return '';
  }
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
    
    // 如果没有找到标题，尝试从正文中获取第一行作为标题
    const content = getNoteContent();
    if (content) {
        const firstLine = content.split('\n')[0];
        return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
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
            if (chrome.runtime.lastError) {
                console.error('❌ 获取笔记评论数据失败:', chrome.runtime.lastError);
                resolve(null);
                return;
            }
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