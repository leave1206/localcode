// 公共错误处理函数
function handleChromeRuntimeError(operation, errorCallback = null) {
  if (chrome.runtime.lastError) {
    const errorMsg = chrome.runtime.lastError.message;
    console.warn(`[monitor] ${operation} 操作失败:`, errorMsg);
    if (errorCallback && typeof errorCallback === 'function') {
      errorCallback(errorMsg);
    }
    return true; // 表示有错误
  }
  return false; // 表示无错误
}

// 安全关闭标签，吞掉"无此tab"等异步错误
function closeTabSilently(tabId) {
  try {
    // 修复：使用更精确的tab关闭方式，避免影响插件页面
    chrome.tabs.get(tabId, (tab) => {
      if (handleChromeRuntimeError(`获取tab ${tabId} 信息`)) return;
      
      if (tab) {
        // 检查是否是插件页面，如果是则不关闭
        if (tab.url && tab.url.startsWith('chrome-extension://')) {
          console.log(`[monitor] tab ${tabId} 是插件页面，跳过关闭`);
          return;
        }
        
        // 使用更安全的关闭方式
        chrome.tabs.remove(tabId, () => {
          if (!handleChromeRuntimeError(`关闭tab ${tabId}`)) {
            console.log(`[monitor] 成功关闭tab ${tabId}`);
          }
        });
      }
    });
  } catch (e) {
    console.warn(`[monitor] closeTabSilently 异常:`, e);
  }
}

// background.js

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

// 记录"本次采集全部完成"的时间（精确到分钟）到 JSON 元数据中
async function setCollectionCompletedAtMeta(retry = 0) {
  try {
    const d = new Date();
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const completedAt = `${y}-${m}-${day} ${hh}:${mm}`; // YYYY-MM-DD HH:mm

    const key = await getTodayKey();
    chrome.storage.local.get([key], data => {
      const obj = data[key] || {};
      const hasNotes = Object.keys(obj).some(k => /^\d+$/.test(k));
      // 若尚未读到任何笔记（可能与最后一次写入存在竞态），延迟重试，避免把数据覆盖成只有 _meta
      if (!hasNotes && retry < 5) {
        const delay = 500 * (retry + 1);
        console.warn('[monitor] 尚未读到笔记数据，延迟写入_meta，重试#' + (retry+1) + ' in ' + delay + 'ms');
        setTimeout(() => setCollectionCompletedAtMeta(retry + 1), delay);
        return;
      }
      const merged = { ...obj, _meta: { ...(obj._meta || {}), collectionCompletedAt: completedAt } };
      chrome.storage.local.set({ [key]: merged }, () => {
        console.log('[monitor] 已写入元数据 collectionCompletedAt:', completedAt);
        // 同步将进度标记为完成，按钮状态置为未运行，确保前端状态立即更新
        chrome.storage.local.get(['monitorProgress'], s => {
          const p = s.monitorProgress || {};
          const forced = {
            ...p,
            current: Math.max(Number(p.current || 0), Number(p.total || 0)),
            total: Number(p.total || 0),
            running: false,
            status: 'completed' // 修复：采集完成应该设置为completed状态
          };
          chrome.storage.local.set({ monitorProgress: forced });
        });
      });
    });
  } catch (e) {
    console.warn('[monitor] 写入collectionCompletedAt失败:', e);
  }
}

// 移除定时分析相关代码
// chrome.alarms.create('uploadJson', { when: getNextTargetTime(), periodInMinutes: 24 * 60 });
// chrome.alarms.onAlarm.addListener(alarm => {
//   if (alarm.name === 'uploadJson') {
//     const todayKey = getTodayKey();
//     chrome.storage.local.get([todayKey], data => {
//       if (data[todayKey] && Object.keys(data[todayKey]).length > 0) {
//         fetch('http://localhost:3100/upload-and-analyze', {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify({
//             key: todayKey,
//             data: data[todayKey]
//           })
//         })
//         .then(res => res.json())
//         .then(resp => console.log('上传并分析结果:', resp))
//         .catch(err => console.error('上传或分析失败:', err));
//       } else {
//         console.log('无数据可上传:', todayKey);
//       }
//     });
//   }
// });

// ========== 定时采集主流程迁移到background（chrome.alarms重构） ========== //
// 在扩展重新加载后清空本地缓存：
// 注意：清空缓存逻辑容易与采集流程竞态，已移除
// 自动恢复监控功能：后台启动时自动检查监控状态
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['brandMonitorStates'], data => {
    const states = data.brandMonitorStates || {};
    // 恢复监控队列（启动时不立即调度，只恢复状态）
    Object.keys(states).forEach(brandId => {
      if (states[brandId]) {
        const id = parseInt(brandId);
        if (!monitorQueue.includes(id)) {
          monitorQueue.push(id);
        }
      }
    });
    console.log('[monitor] 后台启动自动恢复监控队列:', monitorQueue);
    
    // 设置定时调度
    setupDailySchedule();
  });
});

let monitorProgress = { brandId: null, current: 0, total: 0, running: false, status: 'idle', retryMap: {} };

// 新增：监控任务队列管理
let monitorQueue = []; // 监控队列：存储开启了监控的品牌ID
let collectionQueue = []; // 采集队列：存储待采集的任务（包括定时和立即采集）
let isProcessingCollection = false; // 是否正在处理采集任务

function setMonitorProgress(progress) {
  monitorProgress = progress;
  chrome.storage.local.set({ monitorProgress });
}

// 新增：添加品牌到监控队列
function addToMonitorQueue(brandId) {
  if (!monitorQueue.includes(brandId)) {
    monitorQueue.push(brandId);
    console.log(`[monitor] 品牌 ${brandId} 已添加到监控队列`);
    scheduleNextCollection();
  }
}

// 新增：从监控队列移除品牌 - 同时取消采集队列中的任务
function removeFromMonitorQueue(brandId) {
  const index = monitorQueue.indexOf(brandId);
  if (index !== -1) {
    monitorQueue.splice(index, 1);
    console.log(`[monitor] 品牌 ${brandId} 已从监控队列移除`);
  }
  
  // 同时从采集队列中移除该品牌的待执行任务
  const originalLength = collectionQueue.length;
  collectionQueue = collectionQueue.filter(task => task.brandId !== brandId);
  const removedCount = originalLength - collectionQueue.length;
  if (removedCount > 0) {
    console.log(`[monitor] 从采集队列移除品牌 ${brandId} 的 ${removedCount} 个待执行任务`);
  }
}

// 新增：添加采集任务到队列 - 增加去重逻辑和brandId验证
function addToCollectionQueue(brandId, isImmediate = false) {
  console.log(`[队列管理] 尝试添加品牌 ${brandId} 到采集队列，立即执行: ${isImmediate}`);
  
  // 验证brandId是否有效
  if (!brandId || typeof brandId !== 'number') {
    console.error(`[monitor] 无效的brandId: ${brandId}, 类型: ${typeof brandId}`);
    return Promise.resolve(false);
  }
  
  // 检查brandId是否存在于品牌列表中
  return new Promise((resolve) => {
    chrome.storage.local.get(['monitorBrands'], (data) => {
      const brands = data.monitorBrands || [];
      const brandExists = brands.some(brand => brand.id === brandId);
      
      if (!brandExists) {
        console.error(`[队列管理] 品牌ID ${brandId} 不存在于品牌列表中，当前品牌列表:`, brands.map(b => b.id));
        resolve(false);
        return;
      }
      
      console.log(`[队列管理] 品牌 ${brandId} 存在，当前全局状态:`, {
        monitorProgressBrandId: monitorProgress.brandId,
        monitorProgressStatus: monitorProgress.status,
        queueLength: collectionQueue.length,
        queueBrands: collectionQueue.map(t => t.brandId)
      });
      
        // 修复：检查该品牌的任务状态 - 阻止正在采集中的任务
  if (monitorProgress.brandId === brandId && monitorProgress.status === 'collecting') {
    console.log(`[队列管理] 品牌 ${brandId} 正在采集中，跳过添加`);
    resolve(false);
    return;
  }
  
  // 新增：检查是否有其他任务正在处理中（针对立即采集的并发控制）
  if (isImmediate && isProcessingCollection) {
    console.log(`[队列管理] 有其他立即采集任务正在执行中，拒绝品牌 ${brandId} 的立即采集请求`);
    resolve(false);
    return;
  }
  
  // 修复：如果任务状态是已完成或失败，应该允许重新添加任务
  if (monitorProgress.brandId === brandId && 
      (monitorProgress.status === 'completed' || monitorProgress.status === 'failed' || monitorProgress.status === 'stopped')) {
    console.log(`[队列管理] 品牌 ${brandId} 状态为 ${monitorProgress.status}，清理旧状态并允许新任务`);
    // 清理旧的进度状态
    chrome.storage.local.set({ 
      monitorProgress: { 
        brandId: null, 
        current: 0, 
        total: 0, 
        running: false, 
        status: 'idle',
        retryMap: {} 
      } 
    });
    monitorProgress = { brandId: null, current: 0, total: 0, running: false, status: 'idle', retryMap: {} };
  }
  
  // 修复：如果是立即采集任务，且当前进度属于其他品牌，也应该允许添加
  if (isImmediate && monitorProgress.brandId && monitorProgress.brandId !== brandId) {
    console.log(`[队列管理] 立即采集任务品牌 ${brandId}，当前进度品牌 ${monitorProgress.brandId}，允许不同品牌的立即采集`);
    // 立即采集可以并行或打断其他品牌的任务，不需要清理状态，交给processCollectionQueue处理
  }
  
  // 新增：如果是立即采集任务，记录当前品牌的状态信息
  if (isImmediate) {
    console.log(`[立即采集] 品牌 ${brandId} 立即采集检查通过，当前状态:`, {
      hasMonitorProgress: !!monitorProgress.brandId,
      progressBrandId: monitorProgress.brandId,
      progressStatus: monitorProgress.status,
      isCurrentBrand: monitorProgress.brandId === brandId,
      queueLength: collectionQueue.length
    });
  }
  
  // 检查队列中是否已存在该品牌的任务
  const existingTask = collectionQueue.find(task => task.brandId === brandId);
  if (existingTask) {
    // 如果是立即采集，且已存在的是定时任务，则用立即任务替换
    if (isImmediate && !existingTask.isImmediate) {
      console.log(`[队列管理] 立即采集替换品牌 ${brandId} 的排队任务`);
      // 移除原有的定时任务
      const index = collectionQueue.findIndex(task => task.brandId === brandId);
      if (index !== -1) {
        collectionQueue.splice(index, 1);
      }
      // 继续添加立即任务
    } else if (isImmediate && existingTask.isImmediate) {
      // 如果都是立即采集任务，允许覆盖（重新开始采集）
      console.log(`[队列管理] 立即采集任务覆盖品牌 ${brandId} 的现有立即任务`);
      const index = collectionQueue.findIndex(task => task.brandId === brandId);
      if (index !== -1) {
        collectionQueue.splice(index, 1);
      }
      // 继续添加新的立即任务
    } else {
      // 修复：如果是立即采集任务，即使队列中已有该品牌的任务也应该允许执行
      if (isImmediate) {
        console.log(`[队列管理] 立即采集任务强制覆盖品牌 ${brandId} 的现有任务 (现有任务类型: ${existingTask.isImmediate ? '立即' : '定时'})`);
        const index = collectionQueue.findIndex(task => task.brandId === brandId);
        if (index !== -1) {
          collectionQueue.splice(index, 1);
        }
        // 继续添加新的立即任务
      } else {
        console.log(`[队列管理] 品牌 ${brandId} 已经有任务在队列中 (立即: ${existingTask.isImmediate})，跳过添加`);
        resolve(false);
        return;
      }
    }
  }
      
      // 添加任务到队列
      const task = {
        brandId,
        isImmediate,
        timestamp: Date.now()
      };
      
      // 立即采集任务插入队列头部，定时任务插入尾部
      if (isImmediate) {
        collectionQueue.unshift(task); // 插入头部，优先处理
        console.log(`[队列管理] 立即采集任务已添加到队列头部：品牌 ${brandId}，当前队列长度: ${collectionQueue.length}`);
        
        // 正常处理队列
        processCollectionQueue();
      } else {
        collectionQueue.push(task); // 插入尾部
        console.log(`[队列管理] 定时采集任务已添加到队列：品牌 ${brandId}，当前队列长度: ${collectionQueue.length}`);
        // 定时任务正常处理队列
        processCollectionQueue();
      }
      
      console.log(`[队列管理] 品牌 ${brandId} 任务添加成功`);
      resolve(true);
    });
  });
}

// 新增：处理采集队列
function processCollectionQueue() {
  if (isProcessingCollection || collectionQueue.length === 0) {
    return;
  }
  
  // 检查队列中是否有立即采集任务
  const hasImmediateTask = collectionQueue.some(task => task.isImmediate);
  
  // 修复：只有当有任务在"采集中"状态时才等待
  if (monitorProgress.status === 'collecting') {
    console.log('[monitor] 有任务正在采集中，等待完成后处理队列');
    return;
  }
  
  const task = collectionQueue.shift();
  isProcessingCollection = true;
  
  console.log(`[monitor] 开始处理采集任务：品牌 ${task.brandId}，立即采集：${task.isImmediate}`);
  // 修复参数传递：立即采集forceNow=true，定时采集startAtMidnight=true
  startMonitorTaskBg(task.isImmediate, !task.isImmediate, task.brandId);
}

// 新增：采集任务完成后的回调
function onCollectionComplete(success = true, brandId = null) {
  isProcessingCollection = false;
  
  if (success) {
    console.log(`[monitor] 采集任务完成，处理下一个任务`);
  } else {
    console.log(`[monitor] 采集任务失败，品牌 ${brandId} 退出队列`);
    // 任务失败时，设置失败状态
    if (brandId) {
      chrome.storage.local.set({ 
        monitorProgress: { 
          brandId: brandId, 
          current: 0, 
          total: 0, 
          running: false, 
          status: 'failed',
          retryMap: {} 
        } 
      });
    }
  }
  
  // 处理下一个任务
  setTimeout(() => {
    processCollectionQueue();
  }, 5000); // 等待5秒后处理下一个任务
}

// 新增：定时调度监控队列中的品牌 - 修复异步调用
function scheduleNextCollection() {
  // 为监控队列中的每个品牌安排24点定时采集
  monitorQueue.forEach(brandId => {
    // 检查是否已经有该品牌的定时任务在队列中
    const taskExists = collectionQueue.some(task => 
      task.brandId === brandId && !task.isImmediate
    );
    
    if (!taskExists) {
      console.log(`[monitor] 为品牌 ${brandId} 添加定时采集任务`);
      // 修复：正确处理Promise返回值
      addToCollectionQueue(brandId, false).then(added => {
        if (added) {
          console.log(`[monitor] 品牌 ${brandId} 定时采集任务添加成功`);
        } else {
          console.log(`[monitor] 品牌 ${brandId} 定时采集任务添加失败（可能已存在或品牌无效）`);
        }
      }).catch(error => {
        console.error(`[monitor] 品牌 ${brandId} 定时采集任务添加异常:`, error);
      });
    } else {
      console.log(`[monitor] 品牌 ${brandId} 的定时采集任务已存在，跳过`);
    }
  });
}

// 新增：每日24点定时调度
function setupDailySchedule() {
  // 清除之前的定时器
  chrome.alarms.clear('dailyMonitorSchedule');
  
  // 设置每日24点的定时器
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  
  chrome.alarms.create('dailyMonitorSchedule', { 
    when: tomorrow.getTime(),
    periodInMinutes: 24 * 60 // 每24小时重复
  });
  
  console.log(`[monitor] 已设置每日24点定时调度，下次执行时间：${tomorrow.toLocaleString()}`);
}

function startMonitorTaskBg(forceNow = false, startAtMidnight = false, targetBrandId = null) {
  chrome.storage.local.get({ monitorBrands: [] }, data => {
    const brands = data.monitorBrands || [];
    if (brands.length === 0) {
      setMonitorProgress({ brandId: null, current: 0, total: 0, running: false, status: 'idle', retryMap: {} });
      console.log('[monitor] 未找到监控品牌，采集终止');
      return;
    }
    
    // 修复：支持指定品牌ID，如果没有指定则使用最新添加的品牌
    let brand;
    if (targetBrandId) {
      brand = brands.find(b => b.id === targetBrandId);
      if (!brand) {
        console.error(`[monitor] 未找到指定的品牌ID: ${targetBrandId}`);
        return;
      }
      console.log(`[monitor] 启动指定品牌的监控任务: ${brand.brandName} (ID: ${targetBrandId})`);
    } else {
      // 使用第一个可用品牌
      brand = brands[0];
      console.log(`[monitor] 启动默认品牌的监控任务: ${brand.brandName} (ID: ${brand.id})`);
    }
    
    const totalLinks = Array.isArray(brand.noteLinks) ? brand.noteLinks.length : 0;
    // 修复：区分排队状态和采集状态
    const taskStatus = forceNow ? 'collecting' : 'queued'; // 立即采集为"采集中"，定时采集为"排队中"
    monitorProgress = { 
      brandId: brand.id, 
      current: 0, 
      total: totalLinks, 
      running: forceNow, // 只有立即采集才设为true
      status: taskStatus, // 新增：任务状态
      retryMap: {} 
    };
    setMonitorProgress(monitorProgress);
    
    // 调度：
    //  - startAtMidnight: 当天24:00开始
    //  - 否则默认下午3点；若forceNow为true，则立即开始
    const now = new Date();
    let delay = 0;
    if (!forceNow) {
      const target = startAtMidnight
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0, 0);
      delay = target - now;
      if (delay < 0) delay = 0; // 已过3点立即开始
    }
    console.log(`[monitor] 监控任务启动，品牌: ${brand.brandName}，延迟(ms): ${delay}`);
    chrome.alarms.create('monitorOpenNote', { when: Date.now() + delay });
  });
}

// 采集状态与心跳跟踪
const tabCollectStatus = {};
const tabContexts = {}; // { [tabId]: { link, startedAt } }
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 内容脚本心跳：10s一次；后台收到后刷新该tab的心跳超时闹钟（45s）
  if (msg && msg.type === 'XHS_HEARTBEAT') {
    if (sender && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      try { chrome.alarms.clear(`monitorHb:${tabId}`); } catch(e) {}
      chrome.alarms.create(`monitorHb:${tabId}`, { when: Date.now() + 45*1000 });
    }
    try { sendResponse && sendResponse({ ok: true }); } catch(e) {}
    return true;
  }
  // 采集状态：collecting/collected
  if (msg && msg.xhsCollectStatus) {
    if (sender && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      tabCollectStatus[tabId] = msg.xhsCollectStatus;
      
      // 修复：移除重复的关闭逻辑，统一由closeCurrentTab消息处理器处理
      // 只更新状态，不主动关闭tab
      console.log(`[monitor] tab ${tabId} 状态更新为: ${msg.xhsCollectStatus}`);
    }
    try { sendResponse && sendResponse({ ok: true }); } catch(e) {}
    return true;
  }
  
  // 新增：处理content script状态更新消息，不关闭tab
  if (msg && msg.action === 'updateTabStatus') {
    if (sender && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      console.log(`[monitor] 收到content script状态更新: tab ${tabId}, 状态: ${msg.status}`);
      
      // 只更新状态，不关闭tab
      if (msg.status === 'collected') {
        tabCollectStatus[tabId] = 'collected';
        console.log(`[monitor] tab ${tabId} 状态更新为采集完成`);
      } else if (msg.status === 'error') {
        tabCollectStatus[tabId] = 'error';
        console.log(`[monitor] tab ${tabId} 状态更新为采集错误`);
      }
    }
    try { sendResponse && sendResponse({ ok: true }); } catch(e) {}
    return true;
  }
  
  // 新增：处理content script请求关闭当前tab的消息（备用方案）
  if (msg && msg.action === 'closeCurrentTab') {
    if (sender && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      console.log(`[monitor] 收到content script备用关闭请求: tab ${tabId}:`, msg.noteUrl);
      
      // 更新状态
      if (msg.status === 'collected') {
        tabCollectStatus[tabId] = 'collected';
        console.log(`[monitor] tab ${tabId} 标记为采集完成`);
      } else if (msg.status === 'error') {
        tabCollectStatus[tabId] = 'error';
        console.log(`[monitor] tab ${tabId} 标记为采集错误`);
      }
      
      // 安全检查并关闭tab（仅作为备用方案）
      chrome.tabs.get(tabId, (tab) => {
        if (handleChromeRuntimeError(`获取tab ${tabId} 信息`)) return;
        
        if (tab) {
          // 检查是否是插件页面，如果是则不关闭
          if (tab.url && tab.url.startsWith('chrome-extension://')) {
            console.warn(`[monitor] tab ${tabId} 是插件页面，拒绝关闭请求`);
            return;
          }
          
          // 检查是否是目标网站，如果不是则不关闭
          if (!tab.url || !tab.url.includes('xiaohongshu.com')) {
            console.warn(`[monitor] tab ${tabId} 不是目标网站，拒绝关闭请求:`, tab.url);
            return;
          }
          
          // 安全关闭tab
          console.log(`[monitor] 备用方案：安全关闭tab ${tabId}:`, tab.url);
          closeTabSilently(tabId);
        }
      });
    }
    try { sendResponse && sendResponse({ ok: true }); } catch(e) {}
    return true;
  }
});

function extractNoteIdFromUrl(url) {
  try {
    const m = url.match(/\/(?:explore|discovery\/item)\/([0-9a-zA-Z]+)/);
    return m ? m[1] : '';
  } catch (e) {
    return '';
  }
}

function runMonitorLinksBg() {
  console.log('[monitor] runMonitorLinksBg调用', new Date().toLocaleString());
  chrome.storage.local.get({ monitorBrands: [], monitorProgress: {} }, data => {
    const brands = data.monitorBrands || [];
    const progress = data.monitorProgress || {};
    console.log('[monitor] 当前进度', JSON.stringify(progress));
    
    // 修复：检查任务状态，如果是排队中则更新为采集中
    if (progress.status === 'queued') {
      console.log(`[monitor] 任务从排队中转为采集中: 品牌 ${progress.brandId}`);
      progress.running = true;
      progress.status = 'collecting';
      setMonitorProgress(progress);
      // 同步更新全局状态
      monitorProgress = progress;
    }
    
    if (!progress.running) {
      console.log('[monitor] 采集任务未运行，终止');
      return;
    }
          if (progress.current >= progress.total) {
        progress.running = false;
        progress.status = 'completed'; // 新增：设置为完成状态
        setMonitorProgress(progress);
        console.log('[monitor] 所有笔记采集完毕');
        // 写入采集完成时间（到分钟）
        setCollectionCompletedAtMeta().catch(e => console.warn('[monitor] 写入完成时间失败:', e));
        // 采集任务全部完成后，仅写入完成时间，供插件内下载当日 JSON
        // 不再进行任何上传/分析相关后续操作
        onCollectionComplete(true, progress.brandId); // 新增：通知队列任务完成
        return;
      }
    const brand = brands.find(b => b.id === progress.brandId) || brands[0];
    const link = brand.noteLinks[progress.current];
    const retryMap = progress.retryMap || {};
    const retryCount = retryMap[progress.current] || 0;
    console.log('[monitor] 打开笔记', progress.current+1, '/', progress.total, link, '重试:', retryCount);
    
    // 直接打开页面，让content.js处理所有采集逻辑（包括首次采集判断和增量采集）
    // 保留完整原始链接（含参数），避免分享令牌失效
    const normLink = link;
    
    chrome.tabs.create({ url: normLink, active: true }, function(tab) {
      console.log('[monitor] tabs.create成功', tab.id, normLink);
      const tabId = tab.id;
      tabContexts[tabId] = { link: normLink, startedAt: Date.now() };
      
      // 先注册onRemoved监听，避免在监听注册前tab被关闭导致丢失事件
      function onTabRemoved(closedTabId) {
        if (closedTabId === tabId) {
          chrome.tabs.onRemoved.removeListener(onTabRemoved);
          chrome.alarms.clear('monitorFallback');
          try { chrome.alarms.clear(`monitorHardCap:${tabId}`); } catch(e) {}
          try { chrome.alarms.clear(`monitorHb:${tabId}`); } catch(e) {}
          console.log('[monitor] tab关闭', tabId, link, '采集状态:', tabCollectStatus[tabId]);
          const startedAt = tabContexts[tabId]?.startedAt;
          delete tabContexts[tabId];
          // 检查采集状态
          if (tabCollectStatus[tabId] !== 'collected') {
            // 修复：检查是否为各种跳过的状态，如果是则不需要重试
            if (tabCollectStatus[tabId] === '404_skipped') {
              console.log(`[monitor] tab ${tabId} 是404跳过的笔记，无需重试，继续下一篇`);
              // 404跳过的笔记已经在checkPageStatusAndProceed中处理过了，这里不需要额外处理
              return;
            }
            
            if (tabCollectStatus[tabId] === 'timeout_closed') {
              console.log(`[monitor] tab ${tabId} 是超时强制关闭的tab，无需重试，继续下一篇`);
              // 超时关闭的tab已经在alarm监听器中处理过了，这里不需要额外处理
              return;
            }
            
            if (tabCollectStatus[tabId] === 'heartbeat_timeout') {
              console.log(`[monitor] tab ${tabId} 是心跳超时强制关闭的tab，无需重试，继续下一篇`);
              // 心跳超时关闭的tab已经在alarm监听器中处理过了，这里不需要额外处理
              return;
            }
            
            console.warn('[monitor] 采集未完成，tab被关闭，判定为失败');
            console.log('[monitor] 当前采集状态:', tabCollectStatus[tabId]);
            console.log('[monitor] tab创建时间:', startedAt);
            console.log('[monitor] tab存活时间:', Date.now() - (startedAt || 0), 'ms');
            
            // 如果tab存活时间太短（小于10秒），可能是页面加载问题，给更多重试机会
            const tabLifetime = Date.now() - (tabContexts[tabId]?.startedAt || 0);
            if (tabLifetime < 10000) {
              console.log('[monitor] tab存活时间过短，可能是页面加载问题，增加重试次数');
              if (retryCount < 3) { // 增加重试次数
                retryMap[progress.current] = retryCount + 1;
                setMonitorProgress(progress);
                const nextDelay = 15*1000 + Math.floor(Math.random()*10*1000); // 15~25秒重试
                console.log('[monitor] 页面加载问题，延迟(ms)后重试:', nextDelay);
                chrome.alarms.create('monitorOpenNote', { when: Date.now() + nextDelay });
                return;
              }
            }
            
            if (retryCount < 2) {
              retryMap[progress.current] = retryCount + 1;
              setMonitorProgress(progress);
              const nextDelay = 10*1000 + Math.floor(Math.random()*10*1000); // 10~20秒重试
              console.log('[monitor] 采集未完成，延迟(ms)后重试:', nextDelay);
              chrome.alarms.create('monitorOpenNote', { when: Date.now() + nextDelay });
              return;
            } else {
              progress.current++;
              retryMap[progress.current-1] = 0;
              console.log('[monitor] 采集失败，已达最大重试次数，跳过，延迟(ms)后下一篇:', 5*1000 + Math.floor(Math.random()*5*1000));
              setMonitorProgress(progress);
              if (progress.current >= progress.total) {
                progress.running = false;
                progress.status = 'completed';
                setMonitorProgress(progress);
                console.log('[monitor] 所有笔记采集完毕');
                setCollectionCompletedAtMeta().catch(e => console.warn('[monitor] 写入完成时间失败:', e));
                onCollectionComplete(true, progress.brandId); // 新增：通知队列任务完成
                return;
              }
              chrome.alarms.create('monitorOpenNote', { when: Date.now() + 5*1000 + Math.floor(Math.random()*5*1000) });
              return;
            }
          }
          
          // 采集完成，推进到下一篇
          progress.current++;
          retryMap[progress.current-1] = 0;
          setMonitorProgress(progress);
          if (progress.current >= progress.total) {
            progress.running = false;
            progress.status = 'completed';
            setMonitorProgress(progress);
            console.log('[monitor] 所有笔记采集完毕');
            setCollectionCompletedAtMeta().catch(e => console.warn('[monitor] 写入完成时间失败:', e));
            onCollectionComplete(true, progress.brandId); // 新增：通知队列任务完成
            return;
          }
          const nextDelay = 6*1000 + Math.floor(Math.random()*12*1000); // 6~18秒后下一篇
          console.log('[monitor] 笔记已关闭，延迟(ms)后打开下一篇:', nextDelay);
          chrome.alarms.create('monitorOpenNote', { when: Date.now() + nextDelay });
        }
      }
      chrome.tabs.onRemoved.addListener(onTabRemoved);
      
      // 修复：先检测页面状态，如果是404则立即跳过，不发送消息
      setTimeout(async () => {
        const shouldProceed = await checkPageStatusAndProceed(tabId, normLink, progress, retryMap);
        
        // 只有在页面状态正常时才发送消息和设置alarm
        if (shouldProceed !== false) {
          // 向content发送开始指令
          console.log(`[monitor] 准备向tab ${tabId} 发送消息:`, { fromPlugin: true });
          sendMessageToTab(tabId, { fromPlugin: true });
          
          // 添加兜底：缩短到120秒
          chrome.alarms.create('monitorFallback', { when: Date.now() + 120*1000 });
          // 为该tab设置单篇硬性上限：120秒（从90秒增加到120秒）
          chrome.alarms.create(`monitorHardCap:${tabId}`, { when: Date.now() + 120*1000 });
          // 初始化心跳超时：45秒（若一直未收心跳则触发）
          chrome.alarms.create(`monitorHb:${tabId}`, { when: Date.now() + 45*1000 });
        }
      }, 3000); // 给页面3秒加载时间
    });
  });
}

function stopMonitorTaskBg() {
  chrome.alarms.clear('monitorOpenNote');
  monitorProgress.running = false;
  monitorProgress.status = 'stopped'; // 新增：设置停止状态
  setMonitorProgress(monitorProgress);
  isProcessingCollection = false; // 重置队列处理状态
  console.log('[monitor] 监控任务已停止');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'START_MONITOR_BG') {
    // 通过队列系统启动监控任务
    const targetBrandId = msg.brandId || null;
    const isImmediate = !!msg.forceNow;
    console.log(`[monitor] 收到启动监控请求，品牌ID: ${targetBrandId || '未指定（使用最新品牌）'}，立即执行: ${isImmediate}`);
    
    // 将旧的直接启动也通过队列系统处理，确保串行执行
    if (targetBrandId) {
      addToCollectionQueue(targetBrandId, isImmediate).then(added => {
        sendResponse({ ok: true, added: added });
      }).catch(() => {
        sendResponse({ ok: false, added: false });
      });
    } else {
      // 未指定brandId时，使用第一个可用品牌
      chrome.storage.local.get({ monitorBrands: [] }, data => {
        const brands = data.monitorBrands || [];
        if (brands.length > 0) {
          const defaultBrandId = brands[0].id;
          addToCollectionQueue(defaultBrandId, isImmediate).then(added => {
            sendResponse({ ok: true, added: added });
          }).catch(() => {
            sendResponse({ ok: false, added: false });
          });
        } else {
          sendResponse({ ok: false, added: false });
        }
      });
    }
    return true; // 保持消息通道开放
  } else if (msg && msg.type === 'STOP_MONITOR_BG') {
    stopMonitorTaskBg();
    sendResponse({ ok: true });
  } else if (msg && msg.type === 'ADD_TO_MONITOR_QUEUE') {
    // 新增：添加品牌到监控队列
    addToMonitorQueue(msg.brandId);
    addToCollectionQueue(msg.brandId, false).then(added => {
      sendResponse({ ok: true, added: added });
    }).catch(() => {
      sendResponse({ ok: false, added: false });
    });
    return true; // 保持消息通道开放
  } else if (msg && msg.type === 'REMOVE_FROM_MONITOR_QUEUE') {
    // 新增：从监控队列移除品牌
    removeFromMonitorQueue(msg.brandId);
    sendResponse({ ok: true });
  } else if (msg && msg.type === 'START_IMMEDIATE_COLLECTION') {
    // 新增：立即采集
    addToCollectionQueue(msg.brandId, true).then(added => {
      sendResponse({ ok: true, added: added });
    }).catch(() => {
      sendResponse({ ok: false, added: false });
    });
    return true; // 保持消息通道开放
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  console.log('[monitor] alarm触发:', alarm.name, new Date().toLocaleString());
  if (alarm.name === 'monitorOpenNote') {
    runMonitorLinksBg();
  } else if (alarm.name === 'dailyMonitorSchedule') {
    // 每日24点定时调度：为监控队列中的所有品牌添加采集任务
    console.log('[monitor] 每日24点定时调度触发，队列中的品牌：', monitorQueue);
    scheduleNextCollection();
  } else if (alarm.name === 'monitorFallback') {
    console.warn('[monitor] 触发fallback，尝试推进任务');
    // 修复：检查任务状态，避免与正在进行的任务冲突
    if (!monitorProgress.running) {
      console.log('[monitor] 任务未运行，忽略fallback');
      return;
    }
    // 检查是否有正在运行的tab
    const hasRunningTabs = Object.keys(tabContexts).length > 0;
    if (hasRunningTabs) {
      console.log('[monitor] 有正在运行的tab，延迟fallback');
      chrome.alarms.create('monitorFallback', { when: Date.now() + 30*1000 });
      return;
    }
    runMonitorLinksBg();
  } else if (alarm.name.startsWith('monitorHardCap:')) {
    const tabId = parseInt(alarm.name.split(':')[1], 10);
    console.warn('[monitor] 单篇硬性上限触发，强制关闭tab并推进:', tabId);
    // 修复：标记tab状态为超时关闭，避免onTabRemoved触发重试逻辑
    tabCollectStatus[tabId] = 'timeout_closed';
    closeTabSilently(tabId);
  } else if (alarm.name.startsWith('monitorHb:')) {
    const tabId = parseInt(alarm.name.split(':')[1], 10);
    console.warn('[monitor] 心跳超时，关闭tab并推进:', tabId);
    // 修复：标记tab状态为心跳超时，避免onTabRemoved触发重试逻辑
    tabCollectStatus[tabId] = 'heartbeat_timeout';
    closeTabSilently(tabId);
  }
});

// 发送消息到tab，带重试机制，防止content script未及时注入
function sendMessageToTab(tabId, msg, retry = 0) {
  // 修复：检查tab状态，如果是404跳过等状态，立即停止重试
  if (tabCollectStatus[tabId] === '404_skipped' || 
      tabCollectStatus[tabId] === 'timeout_closed' || 
      tabCollectStatus[tabId] === 'heartbeat_timeout') {
    console.log(`[monitor] tab ${tabId} 状态为 ${tabCollectStatus[tabId]}，停止消息重试`);
    return;
  }
  
  console.log(`[monitor] 尝试向tab ${tabId} 发送消息 (重试${retry}):`, msg);
  
  chrome.tabs.sendMessage(tabId, msg, res => {
    if (handleChromeRuntimeError(`tab ${tabId} 消息发送 (重试${retry})`)) {
      
      // 修复：再次检查tab状态，避免在重试过程中状态发生变化
      if (tabCollectStatus[tabId] === '404_skipped' || 
          tabCollectStatus[tabId] === 'timeout_closed' || 
          tabCollectStatus[tabId] === 'heartbeat_timeout') {
        console.log(`[monitor] tab ${tabId} 状态已变为 ${tabCollectStatus[tabId]}，停止重试`);
        return;
      }
      
      if (retry < 5) {
        console.log(`[monitor] ${1000}ms 后重试...`);
        setTimeout(() => sendMessageToTab(tabId, msg, retry + 1), 1000);
      } else {
        console.error(`[monitor] tab ${tabId} content script 连接失败，已重试5次`);
      }
    } else {
      console.log(`[monitor] tab ${tabId} 消息发送成功，收到响应:`, res);
    }
  });
}

// 新增：检测页面状态并决定是否继续采集
async function checkPageStatusAndProceed(tabId, link, progress, retryMap) {
  try {
    console.log(`[monitor] 开始检测tab ${tabId} 的页面状态...`);
    
    // 获取tab信息
    try {
      const tab = await chrome.tabs.get(tabId);
      if (handleChromeRuntimeError(`获取tab ${tabId} 信息`)) {
        return false; // 返回false表示不继续采集
      }
      
      // 检查页面URL是否发生变化（可能跳转到404）
      const currentUrl = tab.url;
      console.log(`[monitor] tab ${tabId} 当前URL:`, currentUrl);
      console.log(`[monitor] tab ${tabId} 原始链接:`, link);
      
      // 检测404页面特征
      const is404Page = detect404Page(currentUrl);
      if (is404Page) {
        console.log(`[monitor] tab ${tabId} 检测到404页面，直接跳过该笔记`);
        
        // 修复：标记tab状态为404，避免onTabRemoved触发重试逻辑
        tabCollectStatus[tabId] = '404_skipped';
        
        // 关闭tab
        closeTabSilently(tabId);
        
        // 推进到下一篇
        progress.current++;
        retryMap[progress.current-1] = 0;
        setMonitorProgress(progress);
        
        if (progress.current >= progress.total) {
          progress.running = false;
          progress.status = 'completed';
          setMonitorProgress(progress);
          console.log('[monitor] 所有笔记采集完毕');
          setCollectionCompletedAtMeta().catch(e => console.warn('[monitor] 写入完成时间失败:', e));
          onCollectionComplete(true, progress.brandId); // 新增：通知队列任务完成
          return false; // 返回false表示不继续采集
        }
        
        // 延迟后打开下一篇
        const nextDelay = 3*1000 + Math.floor(Math.random()*5*1000); // 3-8秒
        console.log(`[monitor] 跳过失效笔记，${nextDelay}ms后打开下一篇: ${progress.current}/${progress.total}`);
        chrome.alarms.create('monitorOpenNote', { when: Date.now() + nextDelay });
        return false; // 返回false表示不继续采集
      }
    } catch (tabError) {
      console.error(`[monitor] 获取tab ${tabId} 信息时发生异常:`, tabError);
      return false;
    }
    
    // 检查页面是否正常加载
    const pageStatus = await checkPageLoadStatus(tabId);
    if (pageStatus === 'error') {
      console.log(`[monitor] tab ${tabId} 页面加载异常，考虑跳过`);
      // 这里可以添加更多的页面状态检测逻辑
    }
    
    console.log(`[monitor] tab ${tabId} 页面状态检测完成，继续正常采集流程`);
    return true; // 返回true表示继续采集
    
  } catch (error) {
    console.error(`[monitor] 检测tab ${tabId} 页面状态时发生错误:`, error);
    // 检测失败时，继续正常流程，不中断采集
    return true; // 返回true表示继续采集
  }
}

// 新增：检测URL是否为404页面
function detect404Page(url) {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    
    // 检测404路径
    if (urlObj.pathname === '/404') {
      console.log('[monitor] 检测到404路径:', url);
      return true;
    }
    
    // 检测404参数
    const source = urlObj.searchParams.get('source');
    const errorCode = urlObj.searchParams.get('errorCode');
    
    if (source === 'note' && (errorCode === '-510001' || errorCode === '-510002')) {
      console.log('[monitor] 检测到404参数:', { source, errorCode });
      return true;
    }
    
    // 检测其他404特征
    if (url.includes('/404?') || url.includes('errorCode=')) {
      console.log('[monitor] 检测到404特征:', url);
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('[monitor] URL解析失败:', error);
    return false;
  }
}

// 新增：检查页面加载状态
async function checkPageLoadStatus(tabId) {
  try {
    // 尝试执行页面脚本检查状态
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // 检查页面是否包含错误信息
        const pageText = document.body.innerText || '';
        const hasError = pageText.includes('404') || 
                        pageText.includes('页面不存在') || 
                        pageText.includes('内容不存在') ||
                        pageText.includes('笔记不存在') ||
                        pageText.includes('内容已删除');
        
        // 检查页面是否包含正常内容
        const hasContent = document.querySelector('.note-content') || 
                          document.querySelector('.note-title') ||
                          document.querySelector('.author') ||
                          document.querySelector('.comments-container');
        
        return {
          hasError,
          hasContent,
          readyState: document.readyState,
          title: document.title
        };
      }
    });
    
    if (results && results[0] && results[0].result) {
      const result = results[0].result;
      console.log(`[monitor] tab ${tabId} 页面状态:`, result);
      
      if (result.hasError) {
        console.log(`[monitor] tab ${tabId} 页面包含错误信息`);
        return 'error';
      }
      
      if (!result.hasContent) {
        console.log(`[monitor] tab ${tabId} 页面缺少正常内容`);
        return 'incomplete';
      }
      
      return 'normal';
    }
    
    return 'unknown';
    
  } catch (error) {
    console.error(`[monitor] 检查tab ${tabId} 页面状态失败:`, error);
    return 'error';
  }
} 