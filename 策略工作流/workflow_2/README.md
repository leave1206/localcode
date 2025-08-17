# Gemini API 优化服务

## 概述

这是一个针对较长文本prompt优化的Gemini API代理服务，根据[Gemini API官方文档](https://ai.google.dev/gemini-api/docs/get-started/tutorial?lang=web&hl=zh-cn#count-tokens)进行了多项改进，提高了pro模型的稳定性。

## 主要优化

### 1. Token计数和限制检查
- 在发送请求前自动计算token数量
- 根据模型类型设置合理的token限制
- 避免因token超限导致的失败

### 2. 流式传输支持
- 支持`generateContentStream`端点
- 提高长文本响应的稳定性
- 减少超时风险

### 3. 优化的模型参数配置
- 针对不同模型设置最佳参数
- 包含temperature、topP、topK等配置
- 提高生成质量的一致性

### 4. 安全设置
- 配置适当的安全阈值
- 减少因内容过滤导致的失败

### 5. 改进的错误处理和重试机制
- 指数退避重试策略
- 更详细的错误信息
- 针对不同错误类型的处理

## API使用说明

### 基础调用

```javascript
// 普通调用
const response = await fetch('/api/gemini', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: '你的prompt内容',
    model: 'gemini-2.5-pro-preview-06-05',
    responseSchema: true // 如果需要JSON格式返回
  })
});

// 流式调用（推荐用于长文本）
const response = await fetch('/api/gemini', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: '你的长文本prompt',
    model: 'gemini-2.5-pro-preview-06-05',
    useStreaming: true, // 启用流式传输
    responseSchema: true
  })
});
```

### Token计数API

```javascript
// 在发送请求前检查token数量
const tokenResponse = await fetch('/api/count-tokens', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: '你的prompt内容',
    model: 'gemini-2.5-pro-preview-06-05'
  })
});

const { tokenCount, promptLength } = await tokenResponse.json();
console.log(`Token数量: ${tokenCount}, 字符长度: ${promptLength}`);
```

## 模型配置

### 支持的模型
- `gemini-2.5-flash-preview-05-20` - 快速响应，适合大部分场景
- `gemini-2.5-pro-preview-06-05` - 高质量输出，适合复杂任务
- `gemini-2.0-flash` - 稳定版本

### 模型参数
每个模型都配置了以下参数：
- `maxOutputTokens`: 8192 - 最大输出token数
- `temperature`: 0.7 - 创造性控制
- `topP`: 0.8 - 核采样参数
- `topK`: 40 - Top-K采样参数

## 环境变量配置

```bash
# .env文件
GEMINI_API_KEY_FLASH=your_flash_api_key
GEMINI_API_KEY_PRO=your_pro_api_key
HTTP_PROXY=http://proxy:port  # 可选
HTTPS_PROXY=http://proxy:port # 可选
PORT=3001
```

## 最佳实践

### 1. 长文本处理
- 对于超过10万字符的prompt，建议使用流式传输
- 在发送前使用token计数API检查长度
- 考虑将长文本分段处理

### 2. 错误处理
```javascript
try {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: longText,
      model: 'gemini-2.5-pro-preview-06-05',
      useStreaming: true
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    if (error.tokenCount) {
      console.log(`Token数量: ${error.tokenCount}`);
    }
    throw new Error(error.error);
  }
  
  const result = await response.json();
  console.log('成功:', result.result);
} catch (error) {
  console.error('调用失败:', error.message);
}
```

### 3. 性能优化
- 对于重复的prompt，考虑缓存结果
- 使用适当的模型（Flash用于快速响应，Pro用于高质量输出）
- 监控token使用量以控制成本

## 故障排除

### 常见错误
1. **Token超限**: 检查prompt长度，考虑分段处理
2. **超时**: 使用流式传输或减少prompt长度
3. **API密钥错误**: 检查环境变量配置
4. **网络问题**: 检查代理设置

### 日志分析
服务会输出详细的日志信息，包括：
- Token计数
- 请求大小
- 响应状态
- 错误详情

## 更新日志

### v2.0.0
- 添加token计数功能
- 支持流式传输
- 优化模型参数配置
- 改进错误处理机制
- 增加安全设置配置 