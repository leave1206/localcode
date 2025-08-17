// 删除监控功能测试脚本
// 在浏览器控制台中运行此脚本来测试修复后的删除功能

console.log('🧪 开始测试修复后的删除监控功能...');

// 测试1: 检查当前状态
console.log('📋 测试1: 检查当前状态');
console.log('当前品牌ID:', currentBrandId);
console.log('品牌数量:', monitorBrands ? monitorBrands.length : 0);

if (monitorBrands && monitorBrands.length > 0) {
  console.log('现有品牌:', monitorBrands.map(b => ({ id: b.id, name: b.brandName })));
  
  if (currentBrandId) {
    const currentBrand = monitorBrands.find(b => b.id === currentBrandId);
    console.log('当前选中品牌:', currentBrand ? currentBrand.brandName : '未知');
  }
}

// 测试2: 检查删除按钮状态
console.log('📋 测试2: 检查删除按钮状态');
const deleteMonitorBtn = document.getElementById('deleteMonitorBtn');
if (deleteMonitorBtn) {
  console.log('删除按钮存在:', true);
  console.log('删除按钮文本:', deleteMonitorBtn.textContent);
  console.log('删除按钮是否禁用:', deleteMonitorBtn.disabled);
} else {
  console.log('删除按钮不存在');
}

// 测试3: 检查存储键
console.log('📋 测试3: 检查存储键');
if (currentBrandId) {
  const expectedStorageKey = `xhs_comments_brand_${currentBrandId}.json`;
  console.log('当前品牌存储键:', expectedStorageKey);
  
  // 检查存储中是否存在该键
  chrome.storage.local.get([expectedStorageKey], function(data) {
    const exists = data[expectedStorageKey] !== undefined;
    console.log('存储键是否存在:', exists);
    
    if (exists) {
      const brandData = data[expectedStorageKey];
      console.log('品牌数据内容:', {
        hasMeta: !!brandData._meta,
        metaBrandId: brandData._meta ? brandData._meta.brandId : null,
        noteCount: Object.keys(brandData).filter(k => /^\d+$/.test(k)).length
      });
    }
  });
} else {
  console.log('当前没有选中的品牌');
}

// 测试4: 模拟删除操作（不实际执行）
console.log('📋 测试4: 模拟删除操作');
if (currentBrandId && monitorBrands && monitorBrands.length > 0) {
  const currentBrand = monitorBrands.find(b => b.id === currentBrandId);
  if (currentBrand) {
    console.log('如果要删除当前品牌，将执行以下操作:');
    console.log('1. 删除存储键:', `xhs_comments_brand_${currentBrandId}.json`);
    console.log('2. 从品牌列表中移除:', currentBrand.brandName);
    console.log('3. 更新全局变量和UI');
    
    if (monitorBrands.length > 1) {
      const remainingBrands = monitorBrands.filter(b => b.id !== currentBrandId);
      console.log('4. 切换到剩余品牌:', remainingBrands[0].brandName);
    } else {
      console.log('4. 清空所有状态（无其他品牌）');
    }
  }
} else {
  console.log('无法模拟删除操作：没有选中的品牌或品牌列表为空');
}

// 测试5: 检查删除后的预期状态
console.log('📋 测试5: 检查删除后的预期状态');
if (monitorBrands && monitorBrands.length > 0) {
  const remainingCount = monitorBrands.length - 1;
  console.log('删除当前品牌后，剩余品牌数量:', remainingCount);
  
  if (remainingCount > 0) {
    const remainingBrands = monitorBrands.filter(b => b.id !== currentBrandId);
    console.log('剩余品牌:', remainingBrands.map(b => b.brandName));
    console.log('预期切换到的品牌:', remainingBrands[0].brandName);
  } else {
    console.log('删除后将无品牌，预期清空所有状态');
  }
}

console.log('✅ 删除监控功能测试完成！');

// 使用说明
console.log('💡 使用说明:');
console.log('1. 确保已选择一个品牌（品牌切换器中有激活的品牌标签）');
console.log('2. 点击"删除监控"按钮');
console.log('3. 确认删除操作');
console.log('4. 检查是否只删除了当前品牌，其他品牌是否保留');

// 注意事项
console.log('⚠️ 注意事项:');
console.log('- 删除操作不可恢复，请谨慎操作');
console.log('- 删除后会自动切换到其他品牌（如果存在）');
console.log('- 删除最后一个品牌后会清空所有状态');
