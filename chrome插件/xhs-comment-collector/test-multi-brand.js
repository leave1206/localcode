// 多品牌功能测试脚本
// 在浏览器控制台中运行此脚本来测试多品牌功能

console.log('🧪 开始测试多品牌功能...');

// 测试1: 检查全局变量
console.log('📋 测试1: 检查全局变量');
console.log('currentBrandId:', typeof currentBrandId !== 'undefined' ? currentBrandId : '未定义');
console.log('monitorBrands:', typeof monitorBrands !== 'undefined' ? monitorBrands : '未定义');

// 测试2: 检查函数是否存在
console.log('📋 测试2: 检查函数是否存在');
console.log('getCurrentBrandStorageKey:', typeof getCurrentBrandStorageKey !== 'undefined' ? '存在' : '不存在');
console.log('renderBrandSwitcher:', typeof renderBrandSwitcher !== 'undefined' ? '存在' : '不存在');
console.log('switchBrand:', typeof switchBrand !== 'undefined' ? '存在' : '不存在');

// 测试3: 模拟添加品牌
console.log('📋 测试3: 模拟添加品牌');
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get(['monitorBrands'], function(data) {
    const brands = data.monitorBrands || [];
    console.log('当前品牌数量:', brands.length);
    
    if (brands.length > 0) {
      console.log('现有品牌:', brands.map(b => ({ id: b.id, name: b.brandName })));
      
      // 测试品牌切换
      if (brands.length > 1) {
        console.log('📋 测试4: 品牌切换功能');
        console.log('当前品牌ID:', currentBrandId);
        console.log('可切换的品牌:', brands.map(b => b.id));
      }
    }
  });
} else {
  console.log('❌ Chrome API 不可用，无法测试存储功能');
}

// 测试5: 检查DOM元素
console.log('📋 测试5: 检查DOM元素');
const brandSwitcher = document.getElementById('brandSwitcher');
const brandSelector = document.getElementById('brandSelector');
const brandInfo = document.getElementById('brandInfo');

console.log('品牌切换器:', brandSwitcher ? '存在' : '不存在');
console.log('品牌选择器:', brandSelector ? '存在' : '不存在');
console.log('品牌信息:', brandInfo ? '存在' : '不存在');

// 测试6: 检查按钮事件
console.log('📋 测试6: 检查按钮事件');
const addMonitorBtn = document.getElementById('addMonitorBtn');
const editMonitorBtn = document.getElementById('editMonitorBtn');
const toggleMonitorBtn = document.getElementById('toggleMonitorBtn');

console.log('添加监控按钮:', addMonitorBtn ? '存在' : '不存在');
console.log('编辑监控按钮:', editMonitorBtn ? '存在' : '不存在');
console.log('切换监控按钮:', toggleMonitorBtn ? '存在' : '不存在');

// 测试7: 检查下载按钮
console.log('📋 测试7: 检查下载按钮');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const downloadExcelBtn = document.getElementById('downloadExcelBtn');

console.log('下载JSON按钮:', downloadJsonBtn ? '存在' : '不存在');
console.log('下载Excel按钮:', downloadExcelBtn ? '存在' : '不存在');

console.log('✅ 多品牌功能测试完成！');

// 如果发现任何问题，请检查控制台输出
console.log('💡 提示: 如果发现任何问题，请检查上述测试结果');

