let lastThree = [];

function getRandomComment(commentsArr) {
  // 过滤掉最近三条已发内容
  let available = commentsArr.filter(c => !lastThree.includes(c));
  if (available.length === 0) {
    // 如果都用过了，重置历史
    lastThree = [];
    available = [...commentsArr];
  }
  const idx = Math.floor(Math.random() * available.length);
  const comment = available[idx];
  lastThree.push(comment);
  if (lastThree.length > 3) lastThree.shift();
  return comment;
}

function logComment(content, status) {
  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', {hour12: false}) + '.' + now.getMilliseconds();
  const log = { time, content, status };
  chrome.storage.local.get({commentLogs: []}, function(data) {
    let logs = data.commentLogs || [];
    logs.push(log);
    if (logs.length > 100) logs = logs.slice(logs.length - 100);
    chrome.storage.local.set({commentLogs: logs});
  });
}

function sendComment(commentsArr) {
  if (!Array.isArray(commentsArr) || commentsArr.length === 0) return;
  let comment = getRandomComment(commentsArr).trim();
  const el = document.querySelector('[contenteditable="true"][data-placeholder="与大家互动一下..."]');
  if (el) {
    el.focus();
    el.innerHTML = '';
    const textNode = document.createTextNode(comment);
    el.appendChild(textNode);
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));

    // 延迟 200ms 后自动点击 SVG 发送按钮
    setTimeout(() => {
      const svgBtn = document.querySelector('#chatInput > svg');
      if (svgBtn) {
        const rect = svgBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        svgBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, clientX: x, clientY: y}));
        svgBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, clientX: x, clientY: y}));
        svgBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: x, clientY: y}));
        console.log('Dispatched mouse events to SVG send button');
        logComment(comment, 'success');
      } else {
        console.warn('SVG send button not found!');
        logComment(comment, 'fail');
      }
    }, 200);
  } else {
    logComment(comment, 'fail');
  }
}

function getRandomInterval() {
  return 5000 + Math.random() * 5000; // 5-10秒
}

function startAutoComment(commentsArr) {
  function loop() {
    sendComment(commentsArr);
    setTimeout(loop, getRandomInterval());
  }
  loop();
}

function tryStart(commentsArr) {
  const el = document.querySelector('[contenteditable="true"][data-placeholder="与大家互动一下..."]');
  if (el) {
    startAutoComment(commentsArr);
  } else {
    setTimeout(() => tryStart(commentsArr), 1000);
  }
}

// 默认评论内容
const defaultComments = `刚刚出去比价了，没拍到，回来看还是你们划算\n为什么这么便宜啊，比618还便宜\n我买了2单，太划算了\n买两单可以拿不同杯子吗\n还好618没买，你们怎么降价了\n刚刚出去比价了，没拍到，回来看还是你们划算\n为什么这么便宜啊，比618还便宜\n多搞搞这些活动，以后就在你们这里买了`;
const defaultIntervalMin = 1;
const defaultIntervalMax = 3;
const defaultLiveRoomId = '837702480064';
const defaultRunStatus = 'running';
const defaultConfig = {
  comments: defaultComments,
  intervalMin: defaultIntervalMin,
  intervalMax: defaultIntervalMax,
  runStatus: defaultRunStatus
};

function getRandomIntervalMs(min, max) {
  // min/max 单位为分钟，返回ms
  const minMs = min * 60 * 1000;
  const maxMs = max * 60 * 1000;
  return minMs + Math.random() * (maxMs - minMs);
}

function logComment(content, status, liveRoomId) {
  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', {hour12: false}) + '.' + now.getMilliseconds();
  const log = { time, content, status, liveRoomId };
  chrome.storage.local.get({commentLogs: []}, function(data) {
    let logs = data.commentLogs || [];
    logs.push(log);
    if (logs.length > 100) logs = logs.slice(logs.length - 100);
    chrome.storage.local.set({commentLogs: logs});
  });
}

function startAutoCommentWithConfig(commentsArr, min, max, liveRoomId) {
  function loop() {
    chrome.storage.local.get({liveRoomConfigs: {[liveRoomId]: {...defaultConfig}}}, function(data) {
      const config = data.liveRoomConfigs[liveRoomId];
      if (!config || config.runStatus !== 'running') return;
      sendCommentWithLog(commentsArr, liveRoomId);
      setTimeout(loop, getRandomIntervalMs(min, max));
    });
  }
  loop();
}

function sendCommentWithLog(commentsArr, liveRoomId) {
  if (!Array.isArray(commentsArr) || commentsArr.length === 0) return;
  let comment = getRandomComment(commentsArr).trim();
  const el = document.querySelector('[contenteditable="true"][data-placeholder="与大家互动一下..."]');
  if (el) {
    el.focus();
    el.innerHTML = '';
    const textNode = document.createTextNode(comment);
    el.appendChild(textNode);
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    setTimeout(() => {
      const svgBtn = document.querySelector('#chatInput > svg');
      if (svgBtn) {
        const rect = svgBtn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        svgBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, clientX: x, clientY: y}));
        svgBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, clientX: x, clientY: y}));
        svgBtn.dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: x, clientY: y}));
        logComment(comment, 'success', liveRoomId);
      } else {
        logComment(comment, 'fail', liveRoomId);
      }
    }, 200);
  } else {
    logComment(comment, 'fail', liveRoomId);
  }
}

// 启动所有匹配当前页面的直播间任务
chrome.storage.local.get({liveRoomConfigs: {[defaultLiveRoomId]: {...defaultConfig}}}, function(data) {
  const configs = data.liveRoomConfigs;
  Object.keys(configs).forEach(liveRoomId => {
    if (window.location.href.includes(liveRoomId)) {
      const config = configs[liveRoomId];
      let commentsArr = (config.comments || '').split('\n').map(s => s.trim()).filter(s => s.length > 0);
      let min = parseFloat(config.intervalMin) || defaultIntervalMin;
      let max = parseFloat(config.intervalMax) || defaultIntervalMax;
      setTimeout(() => startAutoCommentWithConfig(commentsArr, min, max, liveRoomId), 5000);
    }
  });
});

// 读取所有配置并启动
chrome.storage.local.get({
  comments: '',
  intervalMin: defaultIntervalMin,
  intervalMax: defaultIntervalMax,
  liveRoomId: defaultLiveRoomId,
  runStatus: defaultRunStatus
}, function(data) {
  let commentsStr = data.comments;
  let min = parseFloat(data.intervalMin) || defaultIntervalMin;
  let max = parseFloat(data.intervalMax) || defaultIntervalMax;
  let liveRoomId = data.liveRoomId || defaultLiveRoomId;
  let runStatus = data.runStatus || defaultRunStatus;
  if (!commentsStr || commentsStr.trim().length === 0) {
    // 首次使用或无内容，自动写入默认评论
    chrome.storage.local.set({comments: defaultComments}, function() {
      let commentsArr = defaultComments.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      setTimeout(() => tryStartWithConfig(commentsArr, min, max, liveRoomId, runStatus), 5000);
    });
  } else {
    let commentsArr = commentsStr.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    setTimeout(() => tryStartWithConfig(commentsArr, min, max, liveRoomId, runStatus), 5000);
  }
}); 