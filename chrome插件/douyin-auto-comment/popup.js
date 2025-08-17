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

function renderRoomCards(configs) {
  const roomCards = document.getElementById('roomCards');
  roomCards.innerHTML = '';
  // 保持原有顺序，最新添加的ID在最上方
  const ids = Object.keys(configs);
  for (let i = 0; i < ids.length; i++) {
    const liveRoomId = ids[i];
    const config = configs[liveRoomId];
    const card = document.createElement('div');
    card.className = 'room-card';
    card.innerHTML = `
      <div class="room-card-header">
        <span>${liveRoomId}</span>
        <button class="delete-room" data-id="${liveRoomId}">删除</button>
      </div>
      <textarea class="comments" placeholder="请输入评论内容，每行一条...">${config.comments || defaultComments}</textarea>
      <div style="margin-bottom:8px;">
        <label style="font-size:14px;">最小间隔(分钟): <input class="intervalMin" type="number" min="0.01" max="60" step="0.01" value="${config.intervalMin || defaultIntervalMin}" /></label>
        <label style="font-size:14px;margin-left:12px;">最大间隔(分钟): <input class="intervalMax" type="number" min="0.01" max="120" step="0.01" value="${config.intervalMax || defaultIntervalMax}" /></label>
      </div>
      <div class="card-actions">
        <span class="runStatus" style="font-size:14px;color:${config.runStatus === 'running' ? '#4285f4' : '#d93025'};margin-right:10px;">状态: ${config.runStatus === 'running' ? '运行中' : '已暂停'}</span>
        <button class="toggleRun" data-id="${liveRoomId}" style="margin-right:10px;">${config.runStatus === 'running' ? '暂停' : '启动'}</button>
        <button class="saveConfig" data-id="${liveRoomId}">保存</button>
      </div>
    `;
    roomCards.appendChild(card);
  }

  // 绑定事件
  document.querySelectorAll('.delete-room').forEach(btn => {
    btn.onclick = function() {
      const delId = this.getAttribute('data-id');
      chrome.storage.local.get({liveRoomConfigs: {[defaultLiveRoomId]: {...defaultConfig}}}, function(data) {
        const configs = data.liveRoomConfigs;
        if (Object.keys(configs).length <= 1) return; // 至少保留一个
        delete configs[delId];
        chrome.storage.local.set({liveRoomConfigs: configs}, function() {
          renderRoomCards(configs);
        });
      });
    };
  });
  document.querySelectorAll('.toggleRun').forEach(btn => {
    btn.onclick = function() {
      const id = this.getAttribute('data-id');
      chrome.storage.local.get({liveRoomConfigs: {[defaultLiveRoomId]: {...defaultConfig}}}, function(data) {
        const configs = data.liveRoomConfigs;
        const cur = configs[id];
        cur.runStatus = cur.runStatus === 'running' ? 'paused' : 'running';
        configs[id] = cur;
        chrome.storage.local.set({liveRoomConfigs: configs}, function() {
          renderRoomCards(configs);
        });
      });
    };
  });
  document.querySelectorAll('.saveConfig').forEach(btn => {
    btn.onclick = function() {
      const id = this.getAttribute('data-id');
      const card = this.closest('.room-card');
      const comments = card.querySelector('.comments').value || defaultComments;
      const intervalMin = parseFloat(card.querySelector('.intervalMin').value) || defaultIntervalMin;
      const intervalMax = parseFloat(card.querySelector('.intervalMax').value) || defaultIntervalMax;
      const runStatus = card.querySelector('.runStatus').textContent.includes('运行中') ? 'running' : 'paused';
      chrome.storage.local.get({liveRoomConfigs: {[defaultLiveRoomId]: {...defaultConfig}}}, function(data) {
        const configs = data.liveRoomConfigs;
        configs[id] = { comments, intervalMin, intervalMax, runStatus };
        chrome.storage.local.set({liveRoomConfigs: configs}, function() {
          const statusDiv = document.getElementById('status');
          statusDiv.textContent = '已保存！';
          setTimeout(() => { statusDiv.textContent = ''; }, 1500);
          renderRoomCards(configs);
        });
      });
    };
  });
}

document.addEventListener('DOMContentLoaded', function() {
  chrome.storage.local.get({liveRoomConfigs: {[defaultLiveRoomId]: {...defaultConfig}}}, function(data) {
    renderRoomCards(data.liveRoomConfigs);
  });
  renderLogs();
});

document.getElementById('addLiveRoom').onclick = function() {
  const newId = document.getElementById('newLiveRoomId').value.trim();
  if (!newId) return;
  chrome.storage.local.get({liveRoomConfigs: {[defaultLiveRoomId]: {...defaultConfig}}}, function(data) {
    let configs = data.liveRoomConfigs;
    if (!configs[newId]) {
      // 新ID插入到对象最前面
      configs = {[newId]: {...defaultConfig}, ...configs};
    }
    chrome.storage.local.set({liveRoomConfigs: configs}, function() {
      document.getElementById('newLiveRoomId').value = '';
      renderRoomCards(configs);
    });
  });
};

function renderLogs() {
  chrome.storage.local.get({commentLogs: []}, function(data) {
    const logs = data.commentLogs || [];
    const logList = document.getElementById('logList');
    if (!logList) return;
    if (logs.length === 0) {
      logList.innerHTML = '<span style="color:#888;">暂无日志</span>';
      return;
    }
    logList.innerHTML = logs.map(log => {
      const color = log.status === 'success' ? '#34a853' : '#d93025';
      return `<div style="margin-bottom:2px;"><span style=\"color:#888;\">${log.time}</span> <span style=\"color:#4285f4;\">[${log.liveRoomId||''}]</span> <span style=\"color:#222;\">${log.content}</span> <span style=\"color:${color};\">[${log.status === 'success' ? '成功' : '失败'}]</span></div>`;
    }).join('');
  });
}

document.addEventListener('DOMContentLoaded', renderLogs);

const clearBtn = document.getElementById('clearLogs');
if (clearBtn) {
  clearBtn.onclick = function() {
    chrome.storage.local.set({commentLogs: []}, renderLogs);
  };
}
// 监听storage变化，实时刷新日志
chrome.storage.onChanged.addListener(function(changes, area) {
  if (area === 'local' && changes.commentLogs) {
    renderLogs();
  }
}); 