// 统一的日期处理函数 - 移到全局作用域
function getFormattedDate(date, format = 'YYYY-MM-DD') {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  if (format === 'YYYY-MM-DD') {
    return `${year}-${month}-${day}`;
  } else if (format === 'YYYYMMDD') {
    return `${year}${month}${day}`;
  }
  return `${year}-${month}-${day}`;
}

function getTodayFormatted(format = 'YYYY-MM-DD') {
  return getFormattedDate(new Date(), format);
}

function getYesterdayFormatted(format = 'YYYY-MM-DD') {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getFormattedDate(yesterday, format);
}

// 多品牌管理相关全局变量
let currentBrandId = null;
let monitorBrands = [];

// ✅ 性能优化：防抖机制，防止用户快速点击
let buttonClickDebounce = {
  toggleMonitor: false,
  startNow: false,
  deleteMonitor: false
};

// 新增：获取品牌监控状态
function getBrandMonitorStatus(brandId) {
  return new Promise((resolve, reject) => {
    // ✅ 数据验证：验证输入参数
    if (!brandId || typeof brandId !== 'number') {
      const error = new Error(`无效的brandId: ${brandId}, 类型: ${typeof brandId}`);
      console.error('❌ getBrandMonitorStatus参数验证失败:', error.message);
      reject(error);
      return;
    }
    
    chrome.storage.local.get(['brandMonitorStates'], (data) => {
      // ✅ Chrome API错误处理
      if (chrome.runtime.lastError) {
        const error = new Error(`获取brandMonitorStates失败: ${chrome.runtime.lastError.message}`);
        console.error('❌ getBrandMonitorStatus存储读取失败:', error.message);
        reject(error);
        return;
      }
      
      const states = data.brandMonitorStates || {};
      const status = !!states[brandId];
      console.log(`🔍 品牌 ${brandId} 监控状态: ${status}`);
      resolve(status);
    });
  });
}

// 新增：设置品牌监控状态
function setBrandMonitorStatus(brandId, enabled) {
  return new Promise((resolve, reject) => {
    // ✅ 数据验证：验证输入参数
    if (!brandId || typeof brandId !== 'number') {
      const error = new Error(`无效的brandId: ${brandId}, 类型: ${typeof brandId}`);
      console.error('❌ setBrandMonitorStatus参数验证失败:', error.message);
      reject(error);
      return;
    }
    
    if (typeof enabled !== 'boolean') {
      const error = new Error(`无效的enabled值: ${enabled}, 类型: ${typeof enabled}`);
      console.error('❌ setBrandMonitorStatus参数验证失败:', error.message);
      reject(error);
      return;
    }
    
    chrome.storage.local.get(['brandMonitorStates'], (data) => {
      // ✅ Chrome API错误处理
      if (chrome.runtime.lastError) {
        const error = new Error(`获取brandMonitorStates失败: ${chrome.runtime.lastError.message}`);
        console.error('❌ setBrandMonitorStatus存储读取失败:', error.message);
        reject(error);
        return;
      }
      
      const states = data.brandMonitorStates || {};
      states[brandId] = enabled;
      
      chrome.storage.local.set({ brandMonitorStates: states }, () => {
        // ✅ Chrome API错误处理
        if (chrome.runtime.lastError) {
          const error = new Error(`保存brandMonitorStates失败: ${chrome.runtime.lastError.message}`);
          console.error('❌ setBrandMonitorStatus存储写入失败:', error.message);
          reject(error);
          return;
        }
        
        console.log(`✅ 品牌 ${brandId} 监控状态已设置为: ${enabled}`);
        resolve();
      });
    });
  });
}

// 新增：全局按钮状态更新函数
function updateButtonStates() {
  // 🔧 修复：如果品牌管理还未初始化完成，则跳过更新
  if (currentBrandId === null && monitorBrands.length === 0) {
    console.log('⚠️ 品牌管理尚未初始化，跳过按钮状态更新');
    return;
  }
  
  console.log('🔄 开始更新按钮状态，当前品牌ID:', currentBrandId);
  
  const toggleMonitorBtn = document.getElementById('toggleMonitorBtn');
  const startNowBtn = document.getElementById('startNowBtn');
  const deleteMonitorBtn = document.getElementById('deleteMonitorBtn');
  const editMonitorBtn = document.getElementById('editMonitorBtn');
  
  // 安全检查：确保所有按钮元素都存在
  if (!toggleMonitorBtn || !startNowBtn || !deleteMonitorBtn || !editMonitorBtn) {
    console.error('❌ 按钮元素未找到:', {
      toggleMonitorBtn: !!toggleMonitorBtn,
      startNowBtn: !!startNowBtn,
      deleteMonitorBtn: !!deleteMonitorBtn,
      editMonitorBtn: !!editMonitorBtn
    });
    return;
  }
  
  if (!currentBrandId) {
    console.log('⚠️ 无当前品牌，禁用所有按钮');
    toggleMonitorBtn.textContent = '▶️ 开启监控';
    toggleMonitorBtn.disabled = true;
    startNowBtn.disabled = true;
    deleteMonitorBtn.disabled = true;
    editMonitorBtn.disabled = true; // 新增：禁用编辑按钮
    return;
  }
  
  console.log('✅ 启用所有按钮，品牌ID:', currentBrandId);
  toggleMonitorBtn.disabled = false;
  startNowBtn.disabled = false;
  deleteMonitorBtn.disabled = false;
  editMonitorBtn.disabled = false; // 新增：启用编辑按钮
  
  // ✅ 完整的Promise处理：获取当前品牌的监控状态
  (async () => {
    try {
      const isMonitorEnabled = await getBrandMonitorStatus(currentBrandId);
      const buttonText = isMonitorEnabled ? '⏸️ 停止监控' : '▶️ 开启监控';
      toggleMonitorBtn.textContent = buttonText;
      console.log('📝 监控按钮文本已更新为:', buttonText, '(监控状态:', isMonitorEnabled, ')');
      // 注意：状态显示由 updateStatusBar 函数统一管理，避免重复设置
    } catch (error) {
      console.error('❌ 获取品牌监控状态失败:', error);
      // ✅ 错误恢复：出错时设置默认状态
      toggleMonitorBtn.textContent = '▶️ 开启监控';
      
      // ✅ 用户友好的错误提示
      if (error.message.includes('无效的brandId')) {
        console.warn('⚠️ 品牌ID无效，可能需要重新选择品牌');
      }
    }
  })();
}

// 获取当前品牌的存储键
function getCurrentBrandStorageKey() {
  if (!currentBrandId) return 'xhs_comments_brand_monitor.json';
  return `xhs_comments_brand_${currentBrandId}.json`;
}

// 获取所有品牌监控数据
function getAllBrandData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (allData) => {
      const brandData = {};
      Object.keys(allData).forEach(key => {
        if (key.startsWith('xhs_comments_brand_') && key.endsWith('.json')) {
          const brandId = key.replace('xhs_comments_brand_', '').replace('.json', '');
          brandData[brandId] = allData[key];
        }
      });
      resolve(brandData);
    });
  });
}

// 渲染品牌切换器
function renderBrandSwitcher() {
  const brandSwitcher = document.getElementById('brandSwitcher');
  const brandSelector = document.getElementById('brandSelector');
  const brandInfo = document.getElementById('brandInfo');
  
  if (monitorBrands.length <= 1) {
    brandSwitcher.style.display = 'none';
    return;
  }
  
  brandSwitcher.style.display = 'block';
  
  // 生成品牌标签
  let brandTabsHtml = '';
  monitorBrands.forEach((brand, index) => {
    const isActive = brand.id === currentBrandId;
          brandTabsHtml += `
        <div class="brand-tab ${isActive ? 'active' : ''}" 
             data-brand-id="${brand.id}">
         ${brand.brandName}
        </div>
      `;
  });
      brandSelector.innerHTML = brandTabsHtml;
    
    // 绑定品牌标签的点击事件
    brandSelector.querySelectorAll('.brand-tab').forEach(tab => {
      const brandId = parseInt(tab.dataset.brandId);
      tab.addEventListener('click', () => switchBrand(brandId));
    });
    
    // 显示当前品牌信息
    const currentBrand = monitorBrands.find(b => b.id === currentBrandId);
  if (currentBrand) {
    brandInfo.innerHTML = `
      <strong>${currentBrand.brandName}</strong><br>
      ${currentBrand.brandDesc ? `介绍：${currentBrand.brandDesc}` : ''}<br>
      ${currentBrand.monitorReq ? `要求：${currentBrand.monitorReq}` : ''}<br>
      笔记链接：${currentBrand.noteLinks ? currentBrand.noteLinks.length : 0}条
    `;
  }
}

// 切换品牌
function switchBrand(brandId) {
  console.log('切换品牌到:', brandId);
  currentBrandId = brandId;
  
  // 更新品牌标签状态
  document.querySelectorAll('.brand-tab').forEach(tab => {
    tab.classList.remove('active');
    if (parseInt(tab.dataset.brandId) === brandId) {
      tab.classList.add('active');
    }
  });
  
  // 重新渲染品牌信息
  renderBrandSwitcher();
  
  // 重新加载评论数据
  loadCurrentBrandComments();
  
  // 修复：立即更新状态栏，确保显示当前品牌的状态
  updateStatusBar();
  
  // 修复：更新按钮状态，确保按钮绑定到当前品牌
  updateButtonStates();
  
      // 简化：清除品牌切换时的状态显示，但不影响后台任务
  chrome.storage.local.get(['monitorProgress'], data => {
    const progress = data.monitorProgress || {};
    // 修复：基于新的状态系统，只清除非采集中状态的失败标记
    if (progress.brandId && progress.brandId !== brandId && progress.status !== 'collecting') {
      console.log('切换品牌，清除非采集中状态的失败标记');
      chrome.storage.local.set({ 
        monitorProgress: { 
          ...progress, 
          status: 'idle',  // 重置为空闲状态
          displayCleared: true  // 标记显示已清除
        } 
      }, () => updateStatusBar());
    }
  });
  
  console.log('品牌切换完成，当前品牌ID:', currentBrandId);
}

// 新增：检查品牌当天是否已完成采集 - 简化逻辑
function checkBrandCompletedToday(brandId) {
  return new Promise((resolve) => {
    if (!brandId) {
      resolve(false);
      return;
    }
    
    const storageKey = `xhs_comments_brand_${brandId}.json`;
    chrome.storage.local.get([storageKey], (data) => {
      try {
        const brandData = data[storageKey];
        if (!brandData || !brandData._meta || !brandData._meta.collectionCompletedAt) {
          resolve(false);
          return;
        }
        
        const today = getTodayFormatted('YYYY-MM-DD');
        const completedAt = brandData._meta.collectionCompletedAt;
        
        // 简化时间比较逻辑
        const completedDate = completedAt.includes(' ') ? 
          completedAt.split(' ')[0] : completedAt.substring(0, 10);
        
        resolve(completedDate === today);
      } catch (error) {
        console.error('检查当日完成状态时出错:', error);
        resolve(false);
      }
    });
  });
}

// 新增：全局状态栏更新函数
function updateStatusBar() {
  chrome.storage.local.get(['monitorBrands', 'monitorProgress'], async (data) => {
    const brands = data.monitorBrands || [];
    if (brands.length === 0) {
      setMonitorStatus('📋 暂无监控任务', '#64748b');
      return;
    }
    
    // 获取当前品牌信息
    const currentBrand = brands.find(b => b.id === currentBrandId);
    if (!currentBrand) {
      setMonitorStatus('📋 当前品牌不存在', '#64748b');
      return;
    }
    
    const progress = data.monitorProgress || {};
    
    // 修复：检查进度是否属于当前品牌，同时处理显示清除标记
    const isCurrentBrandProgress = progress.brandId === currentBrandId && !progress.displayCleared;
    
    // 检查当前品牌今天是否已完成采集
    const isCompletedToday = await checkBrandCompletedToday(currentBrandId);
    
    // 获取当前品牌的监控状态
    const isMonitorEnabled = await getBrandMonitorStatus(currentBrandId);
    
    // 添加调试日志
    console.log('[状态栏更新]', {
      currentBrandId,
      currentBrandName: currentBrand.brandName,
      progressBrandId: progress.brandId,
      isCurrentBrandProgress,
      isCompletedToday,
      isMonitorEnabled,
      progressRunning: progress.running,
      progressCurrent: progress.current,
      progressTotal: progress.total
    });
    
    // 修复：基于新的状态系统显示不同状态，但要考虑当天完成的情况
    if (isCurrentBrandProgress && progress.total && progress.brandId) {
      const statusEmoji = {
        'queued': '⏳',
        'collecting': '🔄', 
        'completed': '✅',
        'failed': '❌',
        'stopped': '⏸️',
        'idle': '⏸️'
      };
      
      const statusColor = {
        'queued': '#f59e42',
        'collecting': '#4285f4',
        'completed': '#22c55e', 
        'failed': '#ef4444',
        'stopped': '#64748b',
        'idle': '#64748b'
      };
      
      const statusText = {
        'queued': '排队中，等待24点开始采集',
        'collecting': `正在采集第${progress.current+1||1}/${progress.total}篇笔记... (${Math.round(((progress.current + 1) / progress.total) * 100)}%)`,
        'completed': '采集已完成，可点击下载按钮保存数据',
        'failed': '采集任务失败，请重新开启监控',
        'stopped': '任务已停止',
        'idle': '任务空闲'
      };
      
      // 基于新的状态系统显示状态
      const currentStatus = progress.status || 'idle';
      
      // 修复：如果状态是completed或stopped，且当天已完成，优先显示当天完成状态
      if ((currentStatus === 'completed' || currentStatus === 'stopped') && isCompletedToday) {
        setMonitorStatus(`✅ ${currentBrand.brandName} - 当天已有采集记录，可点击下载按钮保存数据。可重新开启监控或立即采集`, '#22c55e');
        return;
      }
      
      const emoji = statusEmoji[currentStatus] || '🔄';
      const color = statusColor[currentStatus] || '#4285f4';
      const text = statusText[currentStatus] || '状态未知';
      
      setMonitorStatus(`${emoji} ${currentBrand.brandName} - ${text}`, color);
      return;
    }
    
    // 如果今天已完成采集，显示完成状态（但不影响按钮功能）
    if (isCompletedToday) {
      setMonitorStatus(`✅ ${currentBrand.brandName} - 当天已有采集记录，可点击下载按钮保存数据`, '#22c55e');
      return;
    }
    
    // 根据监控状态显示不同提示
    if (isMonitorEnabled) {
      setMonitorStatus(`⏸️ ${currentBrand.brandName} - 监控已开启，等待24点定时采集`, '#f59e42');
    } else {
      setMonitorStatus(`⏸️ ${currentBrand.brandName} - 监控未开启，点击开启监控可加入定时队列`, '#f59e42');
    }
  });
}

// 新增：全局监控状态设置函数
function setMonitorStatus(msg, color = '#64748b') {
  const statusMsg = document.getElementById('statusMsg');
  if (statusMsg) {
    statusMsg.style.display = 'block';
    statusMsg.textContent = msg;
    statusMsg.style.color = color;
    
    // 根据状态设置不同的样式
    if (color === '#4285f4') {
      statusMsg.style.background = '#eff6ff';
      statusMsg.style.borderLeftColor = '#3b82f6';
    } else if (color === '#22c55e') {
      statusMsg.style.background = '#f0fdf4';
      statusMsg.style.borderLeftColor = '#10b981';
    } else if (color === '#f59e42') {
      statusMsg.style.background = '#fffbeb';
      statusMsg.style.borderLeftColor = '#f59e0b';
    } else {
      statusMsg.style.background = '#f1f5f9';
      statusMsg.style.borderLeftColor = '#64748b';
    }
  }
}

// 加载当前品牌的评论数据
function loadCurrentBrandComments() {
  const storageKey = getCurrentBrandStorageKey();
  chrome.storage.local.get([storageKey], function(data) {
    renderComments(data[storageKey]);
  });
}

function renderComments(allData) {
  const listDiv = document.getElementById('commentList');
  // 仅统计数字键（笔记序号），忽略如 _meta 等非笔记字段
  const noteKeys = allData ? Object.keys(allData).filter(k => /^\d+$/.test(k)).sort((a,b)=>Number(a)-Number(b)) : [];
  if (!allData || noteKeys.length === 0) {
    listDiv.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:14px;padding:20px;">📝 暂无评论数据</div>';
    return;
  }
  
  let html = '';
  noteKeys.forEach(num => {
    const note = allData[num];
    html += `
      <div style="margin-bottom:16px;padding:16px;background:white;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="margin-bottom:12px;">
          <span style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">笔记${num}</span>
          <div style="margin-top:8px;font-size:13px;color:#64748b;">
            <a href="${note.note_url}" target="_blank" style="color:#3b82f6;text-decoration:none;word-break:break-all;">🔗 ${note.note_url}</a>
          </div>
          ${note.comments_total ? `<div style="margin-top:6px;font-size:12px;color:#10b981;font-weight:500;">📊 评论总数: ${note.comments_total}条</div>` : ''}
        </div>`;
    
    if (note.comments && note.comments.length > 0) {
      html += `<div style="font-size:13px;color:#475569;">`;
      note.comments.forEach((c, i) => {
        // 修复：使用动态的今天和昨天日期，而不是硬编码的08-15和08-14
        const todayStr = getTodayFormatted('YYYY-MM-DD');
        const yesterdayStr = getYesterdayFormatted('YYYY-MM-DD');
        const timeColor = c.time === todayStr ? '#10b981' : c.time === yesterdayStr ? '#f59e0b' : '#64748b';
        html += `
          <div style="margin:8px 0;padding:8px;background:#f8fafc;border-radius:8px;border-left:3px solid ${timeColor};">
            <div style="display:flex;align-items:center;margin-bottom:4px;">
              <span style="display:inline-block;background:#e2e8f0;color:#475569;padding:2px 6px;border-radius:12px;font-size:11px;font-weight:600;margin-right:8px;">${i+1}</span>
              <span style="font-weight:600;color:#1e293b;margin-right:8px;">👤 ${c.user||'-'}</span>
              <span style="color:${timeColor};font-weight:500;margin-right:8px;">🕐 ${c.time||'-'}</span>
              <span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:12px;font-size:11px;font-weight:600;">💖 ${c.likes||0}</span>
            </div>
            <div style="color:#374151;line-height:1.5;margin-left:20px;">${c.content}</div>
          </div>`;
      });
      html += `</div>`;
    } else {
      html += '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:16px;background:#f8fafc;border-radius:8px;">📝 暂无评论</div>';
    }
    html += '</div>';
  });
  
  listDiv.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function() {
  // 🔧 修复：初始化多品牌管理（不立即调用updateButtonStates避免时序问题）
  initializeBrandManagement();
  
  // 辅助函数：根据日期筛选评论
  function filterCommentsByDate(brandData, targetDate) {
    const filteredData = {};
    Object.keys(brandData).forEach(key => {
      if (/^\d+$/.test(key)) {
        const note = brandData[key];
        if (note && note.comments) {
          // 筛选指定日期的评论
          const filteredComments = note.comments.filter(comment => {
            const commentTime = comment.time || '';
            return commentTime === targetDate;
          });
          
          if (filteredComments.length > 0) {
            filteredData[key] = {
              ...note,
              comments: filteredComments
            };
          }
        }
      }
    });
    return filteredData;
  }
  
  // 辅助函数：准备Excel数据
  function prepareExcelData(brandData) {
    const excelData = [];
    // 添加表头
    excelData.push(['笔记ID', '笔记链接', '评论序号', '用户昵称', '评论时间', '点赞数', '评论内容', '采集时间']);
    
    // 添加数据行
    const noteKeys = Object.keys(brandData).filter(k => /^\d+$/.test(k));
    noteKeys.forEach(noteNum => {
      const note = brandData[noteNum];
      if (note && note.comments) {
        note.comments.forEach((comment, index) => {
          excelData.push([
            note.noteId || '',
            note.note_url || '',
            index + 1,
            comment.user || '',
            comment.time || '',
            comment.likes || 0,
            comment.content || '',
            note.collection_time || ''
          ]);
        });
      }
    });
    
    return excelData;
  }
  
  // ✅ 修复：增强品牌管理初始化，优先恢复正在采集的品牌
  function initializeBrandManagement() {
    chrome.storage.local.get(['monitorBrands', 'monitorProgress'], function(data) {
      monitorBrands = data.monitorBrands || [];
      const progress = data.monitorProgress || {};
      
      console.log('🚀 初始化品牌管理');
      console.log('📋 可用品牌:', monitorBrands.map(b => ({id: b.id, name: b.brandName})));
      console.log('📊 当前进度:', progress);
      
      if (monitorBrands.length > 0) {
        // ✅ 优先恢复正在采集的品牌状态
        if (progress.brandId && progress.running && monitorBrands.find(b => b.id === progress.brandId)) {
          console.log(`🔄 恢复正在采集的品牌: ${progress.brandId}`);
          currentBrandId = progress.brandId;
        } else {
          // 设置当前品牌为最新的品牌
          console.log('🆕 设置为最新品牌');
          currentBrandId = monitorBrands[monitorBrands.length - 1].id;
        }
        
        console.log(`✅ 当前品牌ID设置为: ${currentBrandId}`);
        
        // 渲染品牌切换器
        renderBrandSwitcher();
        
        // 加载当前品牌的评论数据
        loadCurrentBrandComments();
      } else {
        console.log('❌ 没有可用品牌');
        currentBrandId = null;
        // 如果没有品牌，显示默认的评论列表
        renderComments(undefined);
      }
      
      // ✅ 确保按钮状态正确初始化（延迟执行，确保数据完全加载）
      setTimeout(() => {
        updateButtonStates();
      }, 100);
    });
  }

  // 当有新的评论保存到品牌监控key时，实时刷新列表
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      // 检查当前品牌的数据变化
      const currentKey = getCurrentBrandStorageKey();
      if (Object.prototype.hasOwnProperty.call(changes, currentKey)) {
        const nv = changes[currentKey].newValue;
        // 防御：newValue 可能为 null/undefined（极少数情况下），回读一次
        if (nv && typeof nv === 'object') {
          renderComments(nv);
        } else {
          chrome.storage.local.get([currentKey], d => renderComments(d[currentKey]));
        }
      }
      
      // 检查品牌配置变化
      if (Object.prototype.hasOwnProperty.call(changes, 'monitorBrands')) {
        const newBrands = changes.monitorBrands.newValue || [];
        console.log('📋 品牌配置变化检测，新品牌列表:', newBrands.map(b => ({id: b.id, name: b.brandName})));
        console.log('📋 当前品牌ID:', currentBrandId);
        
        monitorBrands = newBrands;
        renderBrandSwitcher();
        
        // ✅ 修复：只有在品牌真正被删除时才切换，避免在采集过程中错误重置
        if (currentBrandId) {
          const currentBrandExists = monitorBrands.find(b => b.id === currentBrandId);
          
          if (!currentBrandExists) {
            console.warn('⚠️ 当前品牌被删除，需要切换品牌');
            if (monitorBrands.length > 0) {
              const newBrandId = monitorBrands[0].id;
              console.log(`🔄 切换到新品牌: ${newBrandId} (${monitorBrands[0].brandName})`);
              currentBrandId = newBrandId;
              loadCurrentBrandComments();
            } else {
              console.log('❌ 没有可用品牌，清空状态');
              currentBrandId = null;
              renderComments(undefined);
            }
          } else {
            console.log('✅ 当前品牌仍然存在，保持不变');
          }
        } else if (monitorBrands.length > 0) {
          // ✅ 修复：如果当前没有选中品牌但有可用品牌，选择第一个
          console.log('🆕 没有当前品牌，选择第一个可用品牌');
          currentBrandId = monitorBrands[0].id;
          loadCurrentBrandComments();
        }
        
        // ✅ 确保按钮状态正确更新
        updateButtonStates();
      }
      
      // ✅ 修复：同步采集进度变化，确保状态栏正确更新
      if (changes.monitorProgress || changes.brandMonitorStates) {
        const progress = changes.monitorProgress?.newValue || {};
        
        // ✅ 如果有正在运行的采集任务，确保当前品牌与采集品牌一致
        if (progress.brandId && progress.running && progress.brandId !== currentBrandId) {
          console.log(`🔄 检测到采集任务品牌变化: ${currentBrandId} → ${progress.brandId}`);
          
          // 检查新的品牌是否存在于品牌列表中
          const targetBrand = monitorBrands.find(b => b.id === progress.brandId);
          if (targetBrand) {
            console.log(`✅ 切换到采集任务的品牌: ${targetBrand.brandName}`);
            currentBrandId = progress.brandId;
            
            // 重新渲染界面
            renderBrandSwitcher();
            loadCurrentBrandComments();
            updateButtonStates();
          } else {
            console.warn(`⚠️ 采集任务的品牌ID ${progress.brandId} 在当前品牌列表中不存在`);
          }
        }
        
        // 延迟更新状态栏，确保数据完全同步
        setTimeout(() => {
          updateStatusBar();
        }, 100);
      }
    }
  });

  // 下载按钮：下载当前品牌监控的最新全部评论数据
  document.getElementById('downloadJsonBtn').onclick = function() {
    const currentKey = getCurrentBrandStorageKey();
    chrome.storage.local.get([currentKey, 'monitorBrands'], function(data) {
      const brandData = data[currentKey];
      const monitorBrands = data.monitorBrands || [];
      
      if (brandData && Object.keys(brandData).some(k => /^\d+$/.test(k))) {
        // 获取当前品牌信息
        const brand = monitorBrands.find(b => b.id === currentBrandId) || {};
        
        // 🔧 统一_meta数据格式，删除noteLinks字段（太长）
        const enhancedData = {
          ...brandData,
          _meta: {
            ...(brandData._meta || {}),
            brandId: brand.id,
            brandName: brand.brandName || '',
            brandDesc: brand.brandDesc || '',
            monitorReq: brand.monitorReq || '',
            createdAt: brand.createdAt || Date.now(),
            totalNoteLinks: brand.noteLinks ? brand.noteLinks.length : 0,
            // 删除noteLinks字段，避免JSON文件过大
            // noteLinks: brand.noteLinks,
            exportTime: new Date().toISOString()
          }
        };
        
        // 生成带品牌名和日期的文件名
        const brandName = brand.brandName ? brand.brandName.replace(/[^\w\u4e00-\u9fa5]/g, '_') : 'brand';
        const fileName = `xhs_comments_${brandName}_${getTodayFormatted('YYYYMMDD')}.json`;
        
        const blob = new Blob([JSON.stringify(enhancedData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        alert('❌ 未找到当前品牌的监控数据。请先完成采集。');
      }
    });
  };

  // Excel导出功能：导出当前品牌监控的最新全部评论数据
  document.getElementById('downloadExcelBtn').onclick = function() {
    const currentKey = getCurrentBrandStorageKey();
    chrome.storage.local.get([currentKey, 'monitorBrands'], function(data) {
      const brandData = data[currentKey];
      const monitorBrands = data.monitorBrands || [];
      
      if (brandData && Object.keys(brandData).some(k => /^\d+$/.test(k))) {
        // 获取当前品牌信息
        const brand = monitorBrands.find(b => b.id === currentBrandId) || {};
        
        // 准备Excel数据
        const excelData = prepareExcelData(brandData);
        
        // 创建Excel文件
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '评论数据');
        
        // 设置列宽
        ws['!cols'] = [
          { width: 15 }, // 笔记ID
          { width: 50 }, // 笔记链接
          { width: 10 }, // 评论序号
          { width: 15 }, // 用户昵称
          { width: 15 }, // 评论时间
          { width: 10 }, // 点赞数
          { width: 60 }, // 评论内容
          { width: 15 }  // 采集时间
        ];
        
        // 生成带品牌名和日期的文件名
        const brandName = brand.brandName ? brand.brandName.replace(/[^\w\u4e00-\u9fa5]/g, '_') : 'brand';
        const fileName = `xhs_comments_${brandName}_${getTodayFormatted('YYYYMMDD')}_all.xlsx`;
        
        // 下载Excel文件
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        alert('❌ 未找到当前品牌的监控数据。请先完成采集。');
      }
    });
  };

  // 下载当日JSON：筛选评论时间为当日的评论数据
  document.getElementById('downloadTodayJsonBtn').onclick = function() {
    const currentKey = getCurrentBrandStorageKey();
    chrome.storage.local.get([currentKey, 'monitorBrands'], function(data) {
      const brandData = data[currentKey];
      const monitorBrands = data.monitorBrands || [];
      
      if (brandData && Object.keys(brandData).some(k => /^\d+$/.test(k))) {
        // 获取今天的日期字符串 (YYYY-MM-DD格式)
        const todayStr = getTodayFormatted('YYYY-MM-DD');
        
        // 筛选当日评论数据（基于标准化后的时间格式）
        const todayData = filterCommentsByDate(brandData, todayStr);
        
        if (Object.keys(todayData).length > 0) {
          // 获取当前品牌信息
          const brand = monitorBrands.find(b => b.id === currentBrandId) || {};
          
          // 🔧 统一_meta数据格式，删除noteLinks字段（太长）
          const enhancedData = {
            ...todayData,
            _meta: {
              ...(todayData._meta || {}),
              brandId: brand.id,
              brandName: brand.brandName || '',
              brandDesc: brand.brandDesc || '',
              monitorReq: brand.monitorReq || '',
              createdAt: brand.createdAt || Date.now(),
              totalNoteLinks: brand.noteLinks ? brand.noteLinks.length : 0,
              // 删除noteLinks字段，避免JSON文件过大
              // noteLinks: brand.noteLinks,
              exportTime: new Date().toISOString(),
              filterType: 'today'
            }
          };
          
          // 生成带品牌名和日期的文件名
          const brandName = brand.brandName ? brand.brandName.replace(/[^\w\u4e00-\u9fa5]/g, '_') : 'brand';
          const fileName = `xhs_comments_${brandName}_${getTodayFormatted('YYYYMMDD')}_today.json`;
          
          const blob = new Blob([JSON.stringify(enhancedData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          alert('❌ 当日暂无评论数据');
        }
      } else {
        alert('❌ 未找到当前品牌的监控数据。请先完成采集。');
      }
    });
  };

  // 下载当日EXCEL：筛选评论时间为当日的评论数据
  document.getElementById('downloadTodayExcelBtn').onclick = function() {
    const currentKey = getCurrentBrandStorageKey();
    chrome.storage.local.get([currentKey, 'monitorBrands'], function(data) {
      const brandData = data[currentKey];
      const monitorBrands = data.monitorBrands || [];
      
      if (brandData && Object.keys(brandData).some(k => /^\d+$/.test(k))) {
        // 获取今天的日期字符串 (YYYY-MM-DD格式)
        const todayStr = getTodayFormatted('YYYY-MM-DD');
        
        // 筛选当日评论数据（基于标准化后的时间格式）
        const todayData = filterCommentsByDate(brandData, todayStr);
        
        if (Object.keys(todayData).length > 0) {
          // 获取当前品牌信息
          const brand = monitorBrands.find(b => b.id === currentBrandId) || {};
          
          // 准备Excel数据
          const excelData = prepareExcelData(todayData);
          
          // 创建Excel文件
          const ws = XLSX.utils.aoa_to_sheet(excelData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, '当日评论数据');
          
          // 生成带品牌名和日期的文件名
          const brandName = brand.brandName ? brand.brandName.replace(/[^\w\u4e00-\u9fa5]/g, '_') : 'brand';
          const fileName = `xhs_comments_${brandName}_${getTodayFormatted('YYYYMMDD')}_today.xlsx`;
          
          const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          alert('❌ 当日暂无评论数据');
        }
      } else {
        alert('❌ 未找到当前品牌的监控数据。请先完成采集。');
      }
    });
  };

  // 下载昨日JSON：筛选评论时间为昨日的评论数据
  document.getElementById('downloadYesterdayJsonBtn').onclick = function() {
    const currentKey = getCurrentBrandStorageKey();
    chrome.storage.local.get([currentKey, 'monitorBrands'], function(data) {
      const brandData = data[currentKey];
      const monitorBrands = data.monitorBrands || [];
      
      if (brandData && Object.keys(brandData).some(k => /^\d+$/.test(k))) {
        // 获取昨天的日期字符串 (YYYY-MM-DD格式)
        const yesterdayStr = getYesterdayFormatted('YYYY-MM-DD');
        
        // 筛选昨日评论数据（基于标准化后的时间格式）
        const yesterdayData = filterCommentsByDate(brandData, yesterdayStr);
        
        if (Object.keys(yesterdayData).length > 0) {
          // 获取当前品牌信息
          const brand = monitorBrands.find(b => b.id === currentBrandId) || {};
          
          // 🔧 统一_meta数据格式，删除noteLinks字段（太长）
          const enhancedData = {
            ...yesterdayData,
            _meta: {
              ...(yesterdayData._meta || {}),
              brandId: brand.id,
              brandName: brand.brandName || '',
              brandDesc: brand.brandDesc || '',
              monitorReq: brand.monitorReq || '',
              createdAt: brand.createdAt || Date.now(),
              totalNoteLinks: brand.noteLinks ? brand.noteLinks.length : 0,
              // 删除noteLinks字段，避免JSON文件过大
              // noteLinks: brand.noteLinks,
              exportTime: new Date().toISOString(),
              filterType: 'yesterday'
            }
          };
          
          // 生成带品牌名和日期的文件名
          const brandName = brand.brandName ? brand.brandName.replace(/[^\w\u4e00-\u9fa5]/g, '_') : 'brand';
          const fileName = `xhs_comments_${brandName}_${getTodayFormatted('YYYYMMDD')}_yesterday.json`;
          
          const blob = new Blob([JSON.stringify(enhancedData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          alert('❌ 昨日暂无评论数据');
        }
      } else {
        alert('❌ 未找到当前品牌的监控数据。请先完成采集。');
      }
    });
  };

  // 下载昨日EXCEL：筛选评论时间为昨日的评论数据
  document.getElementById('downloadYesterdayExcelBtn').onclick = function() {
    const currentKey = getCurrentBrandStorageKey();
    chrome.storage.local.get([currentKey, 'monitorBrands'], function(data) {
      const brandData = data[currentKey];
      const monitorBrands = data.monitorBrands || [];
      
      if (brandData && Object.keys(brandData).some(k => /^\d+$/.test(k))) {
        // 获取昨天的日期字符串 (YYYY-MM-DD格式)
        const yesterdayStr = getYesterdayFormatted('YYYY-MM-DD');
        
        // 筛选昨日评论数据（基于标准化后的时间格式）
        const yesterdayData = filterCommentsByDate(brandData, yesterdayStr);
        
        if (Object.keys(yesterdayData).length > 0) {
          // 获取当前品牌信息
          const brand = monitorBrands.find(b => b.id === currentBrandId) || {};
          
          // 准备Excel数据
          const excelData = prepareExcelData(yesterdayData);
          
          // 创建Excel文件
          const ws = XLSX.utils.aoa_to_sheet(excelData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, '昨日评论数据');
          
          // 生成带品牌名和日期的文件名
          const brandName = brand.brandName ? brand.brandName.replace(/[^\w\u4e00-\u9fa5]/g, '_') : 'brand';
          const fileName = `xhs_comments_${brandName}_${getTodayFormatted('YYYYMMDD')}_yesterday.xlsx`;
          
          const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          alert('❌ 昨日暂无评论数据');
        }
      } else {
        alert('❌ 未找到当前品牌的监控数据。请先完成采集。');
      }
    });
  };

  // 移除单独"下载当日/最近7天"按钮逻辑

  // 移除"上传并分析"及报告状态相关逻辑

  // 引入xlsx解析库（SheetJS）
  // 需在manifest中web_accessible_resources或CDN引入，或后续补充

  // 1. 监控表单弹窗逻辑
  const addMonitorBtn = document.getElementById('addMonitorBtn');
  const monitorFormModal = document.getElementById('monitorFormModal');
  const monitorFormCancelBtn = document.getElementById('monitorFormCancelBtn');
  const monitorFormConfirmBtn = document.getElementById('monitorFormConfirmBtn');
  const brandNameInput = document.getElementById('brandNameInput');
  const brandDescInput = document.getElementById('brandDescInput');
  const monitorReqInput = document.getElementById('monitorReqInput');
  const noteFileInput = document.getElementById('noteFileInput');
  const editMonitorBtn = document.getElementById('editMonitorBtn');

  addMonitorBtn.onclick = () => {
    monitorFormModal.style.display = 'flex';
    // 打开后滚动到顶部，避免在小窗口下表单被截断
    monitorFormModal.scrollTop = 0;
  };
  monitorFormCancelBtn.onclick = () => {
    monitorFormModal.style.display = 'none';
  };

  monitorFormConfirmBtn.onclick = async () => {
    // 检查XLSX库是否可用
    if (typeof XLSX === 'undefined') {
      alert('❌ Excel处理库未加载，请刷新页面重试');
      return;
    }
    
    const brandName = brandNameInput.value.trim();
    const brandDesc = brandDescInput.value.trim();
    const monitorReq = monitorReqInput.value.trim();
    const file = noteFileInput.files[0];
    
    if (!brandName) {
      alert('❌ 请输入品牌/产品名');
      return;
    }
    
    // 负面评论监控要求字段现在是选填的
    // if (!monitorReq) {
    //   alert('❌ 请输入监控要求');
    //   return;
    // }
    
    if (!file) {
      alert('❌ 请选择笔记链接文件');
      return;
    }
    
    // 检查文件类型
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('❌ 请选择Excel文件（.xlsx或.xls格式）');
      return;
    }
    
    // 解析excel
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, {type: 'array'});
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          alert('❌ Excel文件格式错误，无法读取工作表');
          return;
        }
        
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) {
          alert('❌ 无法读取第一个工作表');
          return;
        }
        
      const links = [];
        let row = 2; // 从第2行开始读取（第1行通常是标题）
        
      while (true) {
        const cell = sheet['A'+row];
        if (!cell || !cell.v) break;
          
          const link = cell.v.toString().trim();
          if (link && link.includes('xiaohongshu.com')) {
            links.push(link);
          }
        row++;
      }
        
        if (links.length === 0) {
          alert('❌ 未找到有效的小红书笔记链接，请检查Excel文件格式');
          return;
        }
        
        console.log(`✅ 成功解析Excel文件，找到${links.length}条笔记链接`);
        
              // 保存到chrome.storage.local，结构预留多品牌
        chrome.storage.local.get({monitorBrands: []}, function(data) {
          const brands = data.monitorBrands || [];
          const newBrand = {
            id: Date.now(),
            brandName,
            brandDesc,
            monitorReq,
            noteLinks: links,
            createdAt: Date.now()
          };
          brands.push(newBrand);
          
          // 为新品牌创建独立的存储键
          const brandStorageKey = `xhs_comments_brand_${newBrand.id}.json`;
          const initialBrandData = {
            _meta: {
              brandId: newBrand.id,
              brandName: newBrand.brandName,
              brandDesc: newBrand.brandDesc,
              monitorReq: newBrand.monitorReq,
              createdAt: newBrand.createdAt,
              totalNoteLinks: newBrand.noteLinks ? newBrand.noteLinks.length : 0,
              // 删除noteLinks字段，存储在品牌配置中即可
              // noteLinks: newBrand.noteLinks,
              collectionCompletedAt: null,
              version: '2.6.0'
            }
          };
          
          // ✅ Chrome API错误处理：同时保存品牌配置和初始数据
          chrome.storage.local.set({
            monitorBrands: brands,
            [brandStorageKey]: initialBrandData
          }, function() {
            // ✅ Chrome API错误处理
            if (chrome.runtime.lastError) {
              const errorMsg = `保存品牌数据失败: ${chrome.runtime.lastError.message}`;
              console.error('❌', errorMsg);
              alert(`❌ ${errorMsg}\n\n请重试或检查存储空间是否充足`);
              return;
            }
            
            console.log('✅ 品牌数据保存成功，开始更新UI状态');
            
            // ✅ 状态管理：避免竞态条件，使用锁机制
            const updateLock = { updating: true };
            
            try {
              // 更新全局变量
              monitorBrands = brands;
              currentBrandId = newBrand.id;
              
              console.log('当前品牌ID已设置为:', currentBrandId);
              console.log('监控品牌列表:', monitorBrands);
              
              // ✅ 状态管理：按顺序执行，确保状态正确同步
              renderBrandSwitcher();
              loadCurrentBrandComments();
              updateStatusBar();
              
              // ✅ 状态管理：确保按钮状态更新
              console.log('强制更新按钮状态...');
              updateButtonStates();
              
              // ✅ 防御性编程：延迟确认，防止异步竞态
              setTimeout(() => {
                if (updateLock.updating) {
                  updateButtonStates();
                  console.log('按钮状态更新完成');
                  updateLock.updating = false;
                }
              }, 200);
              
              // ✅ 用户体验：清晰的成功反馈
              alert(`✅ 监控信息已保存\n\n品牌/产品名：${brandName}\n品牌介绍：${brandDesc}\n评论分析要求：${monitorReq}\n笔记链接：${links.length}条`);
              
              // ✅ 状态清理：重置表单
              monitorFormModal.style.display = 'none';
              brandNameInput.value = '';
              brandDescInput.value = '';
              monitorReqInput.value = '';
              noteFileInput.value = '';
              
            } catch (uiError) {
              console.error('❌ UI更新过程中出错:', uiError);
              updateLock.updating = false;
              // ✅ 用户友好的错误提示
              alert('⚠️ 数据保存成功，但界面更新出现问题。请刷新页面重试。');
            }
          });
        });
        
      } catch (error) {
        console.error('Excel解析错误:', error);
        alert(`❌ Excel文件解析失败：${error.message}\n\n请确保：\n1. 文件是有效的Excel格式\n2. 第一列包含小红书笔记链接\n3. 从第2行开始有数据`);
      }
    };
    
    reader.onerror = function() {
      alert('❌ 文件读取失败，请重试');
    };
    
      reader.readAsArrayBuffer(file);
  };

  // 编辑监控信息按钮逻辑
  editMonitorBtn.onclick = () => {
    // 修复：检查当前品牌是否选中
    if (!currentBrandId) {
      alert('❌ 请先选择一个要编辑的品牌');
      return;
    }
    
    chrome.storage.local.get({monitorBrands: []}, function(data) {
      const brands = data.monitorBrands || [];
      if (brands.length === 0) {
        alert('❌ 暂无监控信息，请先添加');
        return;
      }
      
      // 修复：只能编辑当前选中的品牌
      const brand = brands.find(b => b.id === currentBrandId);
        
      if (!brand) {
        alert('❌ 当前选中的品牌不存在');
        return;
      }
      
      brandNameInput.value = brand.brandName || '';
      brandDescInput.value = brand.brandDesc || '';
      monitorReqInput.value = brand.monitorReq || '';
      noteFileInput.value = '';
      document.getElementById('noteLinksInfo').textContent = `已保存${brand.noteLinks.length}条笔记链接，如需更换请重新上传excel文件`;
      monitorFormModal.style.display = 'flex';
      monitorFormModal.scrollTop = 0;
      monitorFormConfirmBtn.onclick = async () => {
        // 检查XLSX库是否可用
        if (typeof XLSX === 'undefined') {
          alert('❌ Excel处理库未加载，请刷新页面重试');
          return;
        }
        
        const brandName = brandNameInput.value.trim();
        const brandDesc = brandDescInput.value.trim();
        const monitorReq = monitorReqInput.value.trim();
        const file = noteFileInput.files[0];
        
        if (!brandName) {
          alert('❌ 请输入品牌/产品名');
          return;
        }
        
        // 负面评论监控要求字段现在是选填的
        // if (!monitorReq) {
        //   alert('❌ 请输入监控要求');
        //   return;
        // }
        
        function saveBrand(links) {
          // 找到要编辑的品牌索引
          const brandIndex = brands.findIndex(b => b.id === brand.id);
          if (brandIndex === -1) {
            alert('❌ 未找到要编辑的品牌');
            return;
          }
          
          brands[brandIndex] = {
            id: brand.id,
            brandName,
            brandDesc,
            monitorReq,
            noteLinks: links,
            createdAt: brand.createdAt || Date.now()
          };
          
          // 更新品牌配置
          chrome.storage.local.set({monitorBrands: brands}, function() {
            // 更新全局变量
            monitorBrands = brands;
            
            // 更新品牌元数据
            const brandStorageKey = `xhs_comments_brand_${brand.id}.json`;
            chrome.storage.local.get([brandStorageKey], function(data) {
              const existingData = data[brandStorageKey] || {};
              const updatedData = {
                ...existingData,
                _meta: {
                  ...(existingData._meta || {}),
                  brandId: brand.id,
                  brandName: brandName,
                  brandDesc: brandDesc,
                  monitorReq: monitorReq,
                  createdAt: brand.createdAt || Date.now(),
                  totalNoteLinks: links ? links.length : 0,
                  // 删除noteLinks字段，存储在品牌配置中即可
                  // noteLinks: links,
                  lastUpdated: new Date().toISOString(),
                  version: '2.6.0'
                }
              };
              
              chrome.storage.local.set({[brandStorageKey]: updatedData}, function() {
                alert(`✅ 监控信息已更新\n\n品牌/产品名：${brandName}\n品牌介绍：${brandDesc}\n评论分析要求：${monitorReq}\n笔记链接：${links.length}条`);
                monitorFormModal.style.display = 'none';
                brandNameInput.value = '';
                brandDescInput.value = '';
                monitorReqInput.value = '';
                noteFileInput.value = '';
                document.getElementById('noteLinksInfo').textContent = '';
                
                // 刷新UI
                renderBrandSwitcher();
                updateStatusBar();
              });
            });
          });
        }
        
        if (file) {
          // 检查文件类型
          if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            alert('❌ 请选择Excel文件（.xlsx或.xls格式）');
            return;
          }
          
          const reader = new FileReader();
          reader.onload = function(e) {
            try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
              
              if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                alert('❌ Excel文件格式错误，无法读取工作表');
                return;
              }
              
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
              if (!sheet) {
                alert('❌ 无法读取第一个工作表');
                return;
              }
              
            const links = [];
              let row = 2; // 从第2行开始读取（第1行通常是标题）
              
            while (true) {
              const cell = sheet['A'+row];
              if (!cell || !cell.v) break;
                
                const link = cell.v.toString().trim();
                if (link && link.includes('xiaohongshu.com')) {
                  links.push(link);
                }
              row++;
              }
              
              if (links.length === 0) {
                alert('❌ 未找到有效的小红书笔记链接，请检查Excel文件格式');
                return;
              }
              
              console.log(`✅ 成功解析Excel文件，找到${links.length}条笔记链接`);
              saveBrand(links);
              
            } catch (error) {
              console.error('Excel解析错误:', error);
              alert(`❌ Excel文件解析失败：${error.message}\n\n请确保：\n1. 文件是有效的Excel格式\n2. 第一列包含小红书笔记链接\n3. 从第2行开始有数据`);
            }
          };
          
          reader.onerror = function() {
            alert('❌ 文件读取失败，请重试');
          };
          
          reader.readAsArrayBuffer(file);
        } else {
          saveBrand(brand.noteLinks);
        }
      };
    });
  };

  // 添加监控时也显示noteLinksInfo为空（避免重复绑定：此处仅重置说明文本）
  // 入口统一在上方 addMonitorBtn.onclick 中
  document.getElementById('noteLinksInfo').textContent = '';

  // 监控状态栏，仅展示由后台统一调度产生的进度
  // 只在分析任务真正开始时显示“分析中”，分析完成后显示“分析已完成”
  // 监控按钮逻辑增强
  // 监控按钮通过消息通知background.js
  const toggleMonitorBtn = document.getElementById('toggleMonitorBtn');
  const startNowBtn = document.getElementById('startNowBtn');
  const deleteMonitorBtn = document.getElementById('deleteMonitorBtn');
  
  // 修复：初始化按钮状态时检查当前品牌
  updateButtonStates();
  
  toggleMonitorBtn.onclick = async () => {
    console.log('🔘 开启监控按钮被点击，当前品牌ID:', currentBrandId);
    console.log('🔘 按钮是否禁用:', toggleMonitorBtn.disabled);
    
    // ✅ 性能优化：防抖机制，防止快速重复点击
    if (buttonClickDebounce.toggleMonitor) {
      console.log('⚠️ 防抖阻止：监控按钮操作进行中，忽略重复点击');
      return;
    }
    buttonClickDebounce.toggleMonitor = true;
    
    try {
      // ✅ 数据验证：检查当前品牌是否选中
      if (!currentBrandId) {
        console.error('❌ 当前品牌ID为空，无法开启监控');
        alert('❌ 请先选择一个品牌');
        return;
      }
      
      console.log('🔘 获取当前品牌监控状态...');
      
      let currentState, nextState;
      try {
        // ✅ 完整的Promise处理：获取当前品牌的监控状态
        currentState = await getBrandMonitorStatus(currentBrandId);
        nextState = !currentState;
        
        console.log('🔘 当前监控状态:', currentState, '→ 目标状态:', nextState);
        
        // ✅ 完整的Promise处理：设置当前品牌的监控状态
        await setBrandMonitorStatus(currentBrandId, nextState);
      } catch (error) {
        console.error('❌ 监控状态操作失败:', error);
        // ✅ 用户友好的错误提示
        alert(`❌ 监控状态更新失败：${error.message}\n\n请重试或检查插件权限`);
        return;
      }
      
      // 更新按钮文本
      toggleMonitorBtn.textContent = nextState ? '⏸️ 停止监控' : '▶️ 开启监控';
      console.log('🔘 按钮文本已更新为:', toggleMonitorBtn.textContent);
      
      if (nextState) {
        console.log('🔘 准备开启监控，发送消息到background...');
        // 开启监控：添加到监控队列
        chrome.runtime.sendMessage({ 
          type: 'ADD_TO_MONITOR_QUEUE', 
          brandId: currentBrandId 
        }, (response) => {
          console.log(`[监控开关] 品牌 ${currentBrandId} 开启监控响应:`, response);
          if (chrome.runtime.lastError) {
            console.error(`[监控开关] 通信错误:`, chrome.runtime.lastError);
            alert(`❌ 监控开启失败：${chrome.runtime.lastError.message}`);
            // 恢复按钮状态
            toggleMonitorBtn.textContent = '▶️ 开启监控';
            setBrandMonitorStatus(currentBrandId, false);
          } else if (response && response.ok) {
            if (response.added) {
              console.log(`[监控开关] 品牌 ${currentBrandId} 监控开启成功`);
              updateStatusBar();
            } else {
              // 修复：即使added为false，只要ok为true就表示操作成功（可能是任务已存在但状态更新成功）
              console.log(`[监控开关] 品牌 ${currentBrandId} 监控状态更新成功（任务可能已存在）`);
              updateStatusBar();
            }
          } else {
            // 真正的错误情况
            console.error(`[监控开关] 品牌 ${currentBrandId} 监控开启失败`);
            alert(`❌ 监控开启失败，请重试`);
            // 恢复按钮状态
            toggleMonitorBtn.textContent = '▶️ 开启监控';
            setBrandMonitorStatus(currentBrandId, false);
          }
        });
      } else {
        console.log('🔘 准备停止监控，发送消息到background...');
        // 停止监控：从监控队列移除
        chrome.runtime.sendMessage({ 
          type: 'REMOVE_FROM_MONITOR_QUEUE', 
          brandId: currentBrandId 
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(`[监控开关] 通信错误:`, chrome.runtime.lastError);
            // 通信失败，恢复按钮状态
            alert(`❌ 停止监控操作失败：${chrome.runtime.lastError.message}`);
            toggleMonitorBtn.textContent = '⏸️ 停止监控';
            setBrandMonitorStatus(currentBrandId, true);
          } else if (response && response.ok) {
            console.log(`[监控开关] 品牌 ${currentBrandId} 监控停止成功`);
            updateStatusBar();
          } else {
            // 操作失败，恢复按钮状态
            console.error(`[监控开关] 品牌 ${currentBrandId} 监控停止失败`);
            alert('❌ 停止监控操作失败，请重试');
            toggleMonitorBtn.textContent = '⏸️ 停止监控';
            setBrandMonitorStatus(currentBrandId, true);
          }
        });
      }
    } catch (unexpectedError) {
      console.error('❌ 按钮点击处理过程中出现未预期错误:', unexpectedError);
      alert('❌ 操作失败，请重试');
    } finally {
      // ✅ 内存管理：无论成功失败都要重置防抖标记
      setTimeout(() => {
        buttonClickDebounce.toggleMonitor = false;
      }, 1000); // 1秒后允许再次点击
    }
  };

  // 立即采集按钮：显式触发 forceNow
  startNowBtn.onclick = () => {
    console.log('⚡ 立即监控按钮被点击，当前品牌ID:', currentBrandId);
    console.log('⚡ 按钮是否禁用:', startNowBtn.disabled);
    
    // ✅ 性能优化：防抖机制，防止快速重复点击
    if (buttonClickDebounce.startNow) {
      console.log('⚠️ 防抖阻止：立即采集按钮操作进行中，忽略重复点击');
      return;
    }
    buttonClickDebounce.startNow = true;
    
    try {
      // ✅ 数据验证：检查当前品牌是否选中
      if (!currentBrandId) {
        console.error('❌ 当前品牌ID为空，无法立即采集');
        alert('❌ 请先选择一个品牌');
        return;
      }
    
    console.log('⚡ 准备立即采集，发送消息到background...');
    // 立即采集不影响监控状态，直接添加到采集队列
    chrome.runtime.sendMessage({ 
      type: 'START_IMMEDIATE_COLLECTION', 
      brandId: currentBrandId 
    }, (response) => {
      console.log(`[立即采集] 品牌 ${currentBrandId} 立即采集响应:`, response);
      if (chrome.runtime.lastError) {
        console.error(`[立即采集] 通信错误:`, chrome.runtime.lastError);
        alert(`❌ 立即采集失败：${chrome.runtime.lastError.message}`);
      } else if (response && response.ok) {
        if (response.added) {
          console.log(`[立即采集] 品牌 ${currentBrandId} 立即采集任务添加成功`);
          updateStatusBar();
        } else {
          // 修复：added为false表示任务被拒绝，给出合适的提示
          console.log(`[立即采集] 品牌 ${currentBrandId} 立即采集任务被拒绝`);
          alert('⚠️ 当前有采集任务执行中，请等待结束后再执行立即采集');
        }
      } else {
        // 真正的错误情况
        console.error(`[立即采集] 品牌 ${currentBrandId} 立即采集失败，响应:`, response);
        alert('❌ 立即采集失败，请重试');
      }
    });
    } catch (unexpectedError) {
      console.error('❌ 立即采集按钮处理过程中出现未预期错误:', unexpectedError);
      alert('❌ 立即采集操作失败，请重试');
    } finally {
      // ✅ 内存管理：无论成功失败都要重置防抖标记
      setTimeout(() => {
        buttonClickDebounce.startNow = false;
      }, 2000); // 2秒后允许再次点击（立即采集间隔稍长）
    }
  };

  // 删除监控：删除当前选中的品牌监控任务
  deleteMonitorBtn.onclick = () => {
    // 检查是否有当前选中的品牌
    if (!currentBrandId) {
      alert('❌ 请先选择一个要删除的品牌');
      return;
    }
    
    // 获取当前品牌信息
    const currentBrand = monitorBrands.find(b => b.id === currentBrandId);
    if (!currentBrand) {
      alert('❌ 当前选中的品牌不存在');
      return;
    }
    
    if (!confirm(`⚠️ 确认删除品牌"${currentBrand.brandName}"的监控任务？\n\n此操作不可恢复，将删除：\n• 品牌：${currentBrand.brandName}\n• 该品牌的所有历史评论数据\n• 该品牌的采集记录\n\n确定要继续吗？`)) return;
    
    // 停止当前品牌的监控并从队列移除
    setBrandMonitorStatus(currentBrandId, false).then(() => {
      chrome.runtime.sendMessage({ type: 'REMOVE_FROM_MONITOR_QUEUE', brandId: currentBrandId }, () => {
        // 清理品牌监控状态
        chrome.storage.local.get(['brandMonitorStates'], (data) => {
          const states = data.brandMonitorStates || {};
          delete states[currentBrandId];
          chrome.storage.local.set({ brandMonitorStates: states }, () => {
            // 删除当前品牌的数据
            const currentBrandStorageKey = `xhs_comments_brand_${currentBrandId}.json`;
            
            chrome.storage.local.remove([currentBrandStorageKey], () => {
              // 从品牌列表中移除当前品牌
              const updatedBrands = monitorBrands.filter(b => b.id !== currentBrandId);
              
              chrome.storage.local.set({ monitorBrands: updatedBrands }, () => {
                // 更新全局变量
                monitorBrands = updatedBrands;
                
                // 如果还有其他品牌，切换到第一个；否则清空
                if (updatedBrands.length > 0) {
                  currentBrandId = updatedBrands[0].id;
                  // 刷新UI
                  renderBrandSwitcher();
                  loadCurrentBrandComments();
                  updateStatusBar();
                  alert(`✅ 已删除品牌"${currentBrand.brandName}"的监控任务`);
                } else {
                  // 没有品牌了，清空所有状态
                  currentBrandId = null;
                  chrome.storage.local.set({ 
                    monitorProgress: { brandId: null, current: 0, total: 0, running: false, retryMap: {} },
                    brandMonitorStates: {} // 清空所有品牌监控状态
                  }, () => {
                    // 刷新UI
                    renderBrandSwitcher();
                    renderComments(undefined);
                    updateStatusBar();
                    alert(`✅ 已删除品牌"${currentBrand.brandName}"的监控任务，当前无其他品牌`);
                  });
                }
              });
            });
          });
        });
      });
    });
  };


  updateStatusBar();

  // 🔧 移除重复的按钮状态更新（已在initializeBrandManagement中处理）
  // setTimeout(() => {
  //   updateButtonStates();
  // }, 500);

}); 