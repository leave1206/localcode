// 修复后的功能测试脚本
// 在浏览器控制台中运行此脚本来测试修复后的功能

console.log('🧪 开始测试修复后的功能...');

// 测试1: 检查全局变量
console.log('📋 测试1: 检查全局变量');
console.log('currentBrandId:', typeof currentBrandId !== 'undefined' ? currentBrandId : '未定义');
console.log('monitorBrands:', typeof monitorBrands !== 'undefined' ? monitorBrands : '未定义');

// 测试2: 检查函数是否存在
console.log('📋 测试2: 检查函数是否存在');
console.log('getCurrentBrandStorageKey:', typeof getCurrentBrandStorageKey !== 'undefined' ? '存在' : '不存在');
console.log('renderBrandSwitcher:', typeof renderBrandSwitcher !== 'undefined' ? '存在' : '不存在');
console.log('switchBrand:', typeof switchBrand !== 'undefined' ? '存在' : '不存在');
console.log('updateStatusBar:', typeof updateStatusBar !== 'undefined' ? '存在' : '不存在');

// 测试3: 检查品牌切换器
console.log('📋 测试3: 检查品牌切换器');
const brandSwitcher = document.getElementById('brandSwitcher');
const brandSelector = document.getElementById('brandSelector');
const brandInfo = document.getElementById('brandInfo');

console.log('品牌切换器:', brandSwitcher ? '存在' : '不存在');
console.log('品牌选择器:', brandSelector ? '存在' : '不存在');
console.log('品牌信息:', brandInfo ? '存在' : '不存在');

if (brandSelector) {
  const brandTabs = brandSelector.querySelectorAll('.brand-tab');
  console.log('品牌标签数量:', brandTabs.length);
  
  brandTabs.forEach((tab, index) => {
    const brandId = tab.dataset.brandId;
    const isActive = tab.classList.contains('active');
    console.log(`标签${index + 1}: ID=${brandId}, 激活=${isActive}, 文本=${tab.textContent}`);
  });
}

// 测试4: 检查事件监听器
console.log('📋 测试4: 检查事件监听器');
if (brandSelector) {
  const brandTabs = brandSelector.querySelectorAll('.brand-tab');
  brandTabs.forEach((tab, index) => {
    const brandId = tab.dataset.brandId;
    console.log(`标签${index + 1} (ID: ${brandId}) 的点击事件:`, tab.onclick ? '已绑定' : '未绑定');
  });
}

// 测试5: 模拟品牌切换
console.log('📋 测试5: 模拟品牌切换');
if (typeof switchBrand === 'function' && monitorBrands && monitorBrands.length > 1) {
  console.log('当前品牌ID:', currentBrandId);
  console.log('可用品牌:', monitorBrands.map(b => ({ id: b.id, name: b.brandName })));
  
  // 找到第一个不是当前品牌的品牌
  const nextBrand = monitorBrands.find(b => b.id !== currentBrandId);
  if (nextBrand) {
    console.log('准备切换到品牌:', nextBrand.brandName, 'ID:', nextBrand.id);
    console.log('执行切换前，当前品牌ID:', currentBrandId);
    
    // 执行切换
    switchBrand(nextBrand.id);
    
    console.log('执行切换后，当前品牌ID:', currentBrandId);
  }
} else {
  console.log('无法测试品牌切换：函数不存在或品牌数量不足');
}

// 测试6: 检查状态栏更新
console.log('📋 测试6: 检查状态栏更新');
if (typeof updateStatusBar === 'function') {
  console.log('调用updateStatusBar函数...');
  updateStatusBar();
  console.log('updateStatusBar调用完成');
} else {
  console.log('updateStatusBar函数不存在');
}

console.log('✅ 修复后的功能测试完成！');

// 如果发现任何问题，请检查控制台输出
console.log('💡 提示: 如果发现任何问题，请检查上述测试结果');
console.log('💡 特别关注：品牌切换是否正常工作，状态栏是否正确更新');
