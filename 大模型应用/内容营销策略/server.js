// 基础Node.js Gemini API代理服务
const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cors = require('cors');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 从.env读取代理配置
if (process.env.HTTP_PROXY) process.env.http_proxy = process.env.HTTP_PROXY;
if (process.env.HTTPS_PROXY) process.env.https_proxy = process.env.HTTPS_PROXY;

app.use(bodyParser.json({ limit: '10mb' })); // 增加限制以支持更长文本
app.use(cors());

// 添加静态文件服务
app.use(express.static(__dirname));

// Mount xhs-comment-analyst business routes under a namespace to keep concerns separated
try {
  const { createXhsAnalystRouter } = require(path.join(__dirname, '..', '..', 'chromemcp', 'xhs-comment-analyst', 'router.js'));
  app.use('/xhs-analyst', createXhsAnalystRouter());
  console.log('[Mount] 挂载 xhs-comment-analyst 路由于 /xhs-analyst');
} catch (e) {
  console.warn('[Mount] 未能挂载 xhs-comment-analyst 路由:', e.message);
}

// Gemini模型与密钥映射
const GEMINI_KEYS = {
  'gemini-2.5-flash-preview-05-20': process.env.GEMINI_API_KEY_FLASH,
  'gemini-2.5-pro-preview-06-05': process.env.GEMINI_API_KEY_PRO,
  'gemini-2.0-flash': process.env.GEMINI_API_KEY_FLASH
};

// 模型配置参数 - 根据文档优化
const DEFAULT_MAX_OUTPUT_TOKENS = parseInt(process.env.MAX_OUTPUT_TOKENS || '20000', 10);
const MODEL_CONFIGS = {
  'gemini-2.5-flash-preview-05-20': {
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0.7,
    topP: 0.8,
    topK: 40,
    stopSequences: []
  },
  'gemini-2.5-pro-preview-06-05': {
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0.7,
    topP: 0.8,
    topK: 40,
    stopSequences: []
  },
  'gemini-2.0-flash': {
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0.7,
    topP: 0.8,
    topK: 40,
    stopSequences: []
  }
};

// 安全设置配置
const SAFETY_SETTINGS = [
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_NONE"
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH", 
    threshold: "BLOCK_NONE"
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_NONE"
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_NONE"
  }
];

// Token计数函数
async function countTokens(prompt, model, apiKey, agent) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens?key=${apiKey}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      agent
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.totalTokens || 0;
    }
  } catch (error) {
    console.warn('Token计数失败:', error.message);
  }
  return 0;
}

// 在Gemini API返回后，做一次markdown代码块去除和正则提取JSON的兜底清洗
function cleanGeminiResponse(text) {
    if (typeof text !== 'string') return text;
    
    // 去除markdown代码块
    let cleaned = text.replace(/```json[\s\S]*?```/g, m => m.replace(/```json|```/g, '').trim());
    cleaned = cleaned.replace(/```[\s\S]*?```/g, m => m.replace(/```/g, '').trim());
    
    // 尝试提取第一个合法JSON
    let jsonMatch = cleaned.match(/({[\s\S]*}|\[[\s\S]*\])/);
    if (jsonMatch) {
        cleaned = jsonMatch[0];
    }
    
    return cleaned;
}

// 增强的JSON修复函数
function repairJsonResponse(text) {
    if (typeof text !== 'string') return text;
    
    let repaired = text;
    
    // 方法1: 修复常见的JSON格式问题
    repaired = repaired
        .replace(/,\s*}/g, '}')  // 移除对象末尾多余的逗号
        .replace(/,\s*]/g, ']')  // 移除数组末尾多余的逗号
        .replace(/}\s*,\s*}/g, '}}')  // 修复嵌套对象
        .replace(/]\s*,\s*]/g, ']]')  // 修复嵌套数组
        .replace(/}\s*,\s*]/g, '}]')  // 修复对象数组混合
        .replace(/]\s*,\s*}/g, ']}'); // 修复数组对象混合
    
    // 方法2: 修复数组元素间缺少逗号的问题
    // 这是针对"Expected ',' or ']' after array element"错误的专门修复
    repaired = repaired
        // 修复数组中的对象之间缺少逗号
        .replace(/}\s*}/g, '},}')  // 对象后直接跟对象，添加逗号
        .replace(/}\s*\[/g, '},[')  // 对象后直接跟数组，添加逗号
        .replace(/]\s*}/g, '],}')  // 数组后直接跟对象，添加逗号
        .replace(/]\s*\[/g, '],[')  // 数组后直接跟数组，添加逗号
        // 修复字符串后缺少逗号
        .replace(/"\s*"/g, '","')  // 字符串后直接跟字符串，添加逗号
        .replace(/"\s*}/g, '",}')  // 字符串后直接跟对象结束，添加逗号
        .replace(/"\s*]/g, '",]')  // 字符串后直接跟数组结束，添加逗号
        .replace(/"\s*\{/g, '",{')  // 字符串后直接跟对象开始，添加逗号
        .replace(/"\s*\[/g, '",[')  // 字符串后直接跟数组开始，添加逗号
        // 修复数字后缺少逗号
        .replace(/(\d+)\s*"/g, '$1,"')  // 数字后直接跟字符串，添加逗号
        .replace(/(\d+)\s*}/g, '$1,}')  // 数字后直接跟对象结束，添加逗号
        .replace(/(\d+)\s*]/g, '$1,]')  // 数字后直接跟数组结束，添加逗号
        .replace(/(\d+)\s*\{/g, '$1,{')  // 数字后直接跟对象开始，添加逗号
        .replace(/(\d+)\s*\[/g, '$1,[')  // 数字后直接跟数组开始，添加逗号
        // 修复布尔值和null后缺少逗号
        .replace(/(true|false|null)\s*"/g, '$1,"')  // 布尔值/null后直接跟字符串，添加逗号
        .replace(/(true|false|null)\s*}/g, '$1,}')  // 布尔值/null后直接跟对象结束，添加逗号
        .replace(/(true|false|null)\s*]/g, '$1,]')  // 布尔值/null后直接跟数组结束，添加逗号
        .replace(/(true|false|null)\s*\{/g, '$1,{')  // 布尔值/null后直接跟对象开始，添加逗号
        .replace(/(true|false|null)\s*\[/g, '$1,['); // 布尔值/null后直接跟数组开始，添加逗号
    
    // 方法3: 修复引号问题
    repaired = repaired
        .replace(/([^\\])"/g, '$1\\"')  // 转义未转义的引号
        .replace(/\\"/g, '"')  // 修复过度转义
        .replace(/\\\\/g, '\\');  // 修复反斜杠
    
    // 方法4: 修复换行符问题
    repaired = repaired
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    
    // 方法5: 修复常见的语法错误
    repaired = repaired
        .replace(/([a-zA-Z0-9_]+):\s*([^",\{\}\[\]\s][^,\{\}\[\]]*[^",\{\}\[\]\s])/g, '"$1": "$2"')  // 修复缺少引号的键值对
        .replace(/([a-zA-Z0-9_]+):\s*([^",\{\}\[\]\s][^,\{\}\[\]]*)/g, '"$1": "$2"');  // 修复缺少引号的键值对
    
    return repaired;
}

// 新增：Schema验证和智能修复函数
function validateAndRepairWithSchema(text, schema, schemaType) {
    if (typeof text !== 'string') return text;
    
    console.log(`[Schema验证] 开始验证 schemaType: ${schemaType}`);
    console.log(`[Schema验证] 原始文本长度: ${text.length}`);
    
    // 首先尝试基础清理
    let cleaned = cleanGeminiResponse(text);
    
    // 根据schemaType进行针对性修复
    if (schemaType === 'crowd') {
        cleaned = repairCrowdSchema(cleaned);
    } else if (schemaType === 'scene') {
        cleaned = repairSceneSchema(cleaned);
    }
    
    // 尝试解析
    try {
        const parsed = JSON.parse(cleaned);
        console.log(`[Schema验证] 修复成功，解析后的数据结构:`, Object.keys(parsed));
        return parsed;
    } catch (e) {
        console.warn(`[Schema验证] 修复后仍无法解析:`, e.message);
        // 如果还是失败，使用通用修复
        return repairJsonResponse(cleaned);
    }
}

// 新增：增强的Schema验证和修复函数
function validateAndRepairWithSchemaEnhanced(text, schema, schemaType) {
    if (typeof text !== 'string') return text;
    console.log(`[增强Schema验证] 开始验证 schemaType: ${schemaType}`);
    console.log(`[增强Schema验证] 原始文本长度: ${text.length}`);
    // 只做严格格式净化
    const before = text;
    const result = strictJsonFormatRepair(text, schemaType);
    console.log('[格式净化修复diff]', { before, after: JSON.stringify(result).slice(0, 500) });
    return result;
}

// 新增：增强的crowd schema修复
function repairCrowdSchemaEnhanced(text, schema) {
    console.log(`[增强Crowd修复] 开始修复crowd schema格式`);
    
    // 0. 预处理：处理换行符和控制字符
    text = text
        .replace(/\\n/g, ' ')  // 将 \n 替换为空格
        .replace(/\\r/g, ' ')  // 将 \r 替换为空格
        .replace(/\\t/g, ' ')  // 将 \t 替换为空格
        .replace(/\n/g, ' ')   // 将实际的换行符替换为空格
        .replace(/\r/g, ' ')   // 将实际的回车符替换为空格
        .replace(/\t/g, ' ')   // 将实际的制表符替换为空格
        .replace(/\s+/g, ' ')  // 将多个空白字符合并为单个空格
        .trim();
    
    // 1. 确保有matchedCrowds数组
    if (!text.includes('"matchedCrowds"') && !text.includes('matchedCrowds')) {
        console.log(`[增强Crowd修复] 未找到matchedCrowds，尝试包装为crowd格式`);
        // 尝试提取数组并包装
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            text = `{"matchedCrowds": ${arrayMatch[0]}}`;
        } else {
            // 如果连数组都没有，尝试包装为单个对象
            const objectMatch = text.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                text = `{"matchedCrowds": [${objectMatch[0]}]}`;
            }
        }
    }
    
    // 2. 修复matchedCrowds数组格式
    text = text
        // 确保matchedCrowds是数组
        .replace(/"matchedCrowds"\s*:\s*\{/g, '"matchedCrowds": [{')
        .replace(/}\s*$/g, '}]')
        // 修复数组元素间缺少逗号 - 更精确的修复
        .replace(/}\s*\{/g, '}, {')
        // 修复数组元素间缺少逗号 - 处理更复杂的情况
        .replace(/(\d+)\s*\{/g, '$1, {')
        .replace(/(true|false|null)\s*\{/g, '$1, {')
        .replace(/"([^"]*)"\s*\{/g, '"$1", {')
        .replace(/]\s*\{/g, '], {')
        // 确保每个对象都有必要字段
        .replace(/"groupName"\s*:\s*"([^"]*)"/g, '"groupName": "$1"')
        .replace(/"typeOption"\s*:\s*"([^"]*)"/g, '"typeOption": "$1"')
        .replace(/"industryOption"\s*:\s*"([^"]*)"/g, '"industryOption": "$1"')
        .replace(/"groupDesc"\s*:\s*"([^"]*)"/g, '"groupDesc": "$1"')
        .replace(/"coverNum"\s*:\s*(\d+)/g, '"coverNum": $1')
        .replace(/"人群类型"\s*:\s*"([^"]*)"/g, '"人群类型": "$1"')
        .replace(/"score"\s*:\s*(\d+)/g, '"score": $1')
        .replace(/"reasoning"\s*:\s*"([^"]*)"/g, '"reasoning": "$1"');
    
    // 3. 添加缺失的字段
    const crowdObjectPattern = /\{[^}]*"groupName"[^}]*\}/g;
    text = text.replace(crowdObjectPattern, (match) => {
        let obj = match;
        // 添加缺失的必要字段
        if (!obj.includes('"typeOption"')) obj = obj.replace(/}$/, ', "typeOption": ""}');
        if (!obj.includes('"industryOption"')) obj = obj.replace(/}$/, ', "industryOption": ""}');
        if (!obj.includes('"groupDesc"')) obj = obj.replace(/}$/, ', "groupDesc": ""}');
        if (!obj.includes('"coverNum"')) obj = obj.replace(/}$/, ', "coverNum": 0}');
        if (!obj.includes('"人群类型"')) obj = obj.replace(/}$/, ', "人群类型": ""}');
        if (!obj.includes('"score"')) obj = obj.replace(/}$/, ', "score": 50}');
        if (!obj.includes('"reasoning"')) obj = obj.replace(/}$/, ', "reasoning": "默认评分"}');
        return obj;
    });
    
    // 4. 修复常见的JSON语法错误 - 更精确的修复
    text = text
        // 修复多余的逗号 - 更精确的匹配
        .replace(/,\s*}/g, '}')  // 对象末尾多余的逗号
        .replace(/,\s*]/g, ']')  // 数组末尾多余的逗号
        .replace(/,\s*,\s*}/g, ',}')  // 连续逗号
        .replace(/,\s*,\s*]/g, ',]')  // 连续逗号
        // 修复缺少的逗号
        .replace(/}\s*}/g, '},}')
        .replace(/]\s*]/g, '],]')
        .replace(/}\s*]/g, '},]')
        .replace(/]\s*}/g, '],}')
        // 修复字符串问题
        .replace(/"\s*"/g, '","')
        .replace(/"\s*}/g, '",}')
        .replace(/"\s*]/g, '",]')
        .replace(/"\s*\{/g, '",{')
        .replace(/"\s*\[/g, '",[')
        // 修复数字问题
        .replace(/(\d+)\s*"/g, '$1,"')
        .replace(/(\d+)\s*}/g, '$1,}')
        .replace(/(\d+)\s*]/g, '$1,]')
        .replace(/(\d+)\s*\{/g, '$1,{')
        .replace(/(\d+)\s*\[/g, '$1,[')
        // 修复布尔值和null问题
        .replace(/(true|false|null)\s*"/g, '$1,"')
        .replace(/(true|false|null)\s*}/g, '$1,}')
        .replace(/(true|false|null)\s*]/g, '$1,]')
        .replace(/(true|false|null)\s*\{/g, '$1,{')
        .replace(/(true|false|null)\s*\[/g, '$1,[')
        // 修复未闭合的字符串 - 新增
        .replace(/"([^"]*)$/g, '"$1"')  // 修复行末未闭合的字符串
        .replace(/^([^"]*)"([^"]*)$/g, '"$1$2"')  // 修复行首未闭合的字符串
        // 修复对象末尾的格式问题 - 新增
        .replace(/,\s*}\s*,\s*]/g, '}]')  // 修复对象数组末尾的格式
        .replace(/,\s*]\s*,\s*}/g, ']}')  // 修复数组对象末尾的格式
        // 修复数组元素间的格式问题 - 新增
        .replace(/}\s*,\s*,\s*\{/g, '}, {')  // 修复连续逗号
        .replace(/]\s*,\s*,\s*\[/g, '], [')  // 修复连续逗号
        // 修复字符串中的转义问题 - 新增
        .replace(/\\"/g, '"')  // 修复过度转义的引号
        .replace(/\\\\/g, '\\')  // 修复过度转义的反斜杠
        // 修复换行符和制表符 - 新增
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    
    // 5. 修复特定的格式错误 - 新增
    text = text
        // 修复对象之间缺少逗号的问题
        .replace(/"([^"]*)"\s*}\s*,\s*\{/g, '"$1"}, {')  // 修复对象间缺少逗号
        .replace(/(\d+)\s*}\s*,\s*\{/g, '$1}, {')  // 修复数字后对象间缺少逗号
        .replace(/(true|false|null)\s*}\s*,\s*\{/g, '$1}, {')  // 修复布尔值后对象间缺少逗号
        // 修复对象内部缺少逗号的问题
        .replace(/"([^"]*)"\s*"([^"]*)"/g, '"$1", "$2"')  // 修复字符串间缺少逗号
        .replace(/(\d+)\s*"([^"]*)"/g, '$1, "$2"')  // 修复数字后字符串缺少逗号
        .replace(/(true|false|null)\s*"([^"]*)"/g, '$1, "$2"')  // 修复布尔值后字符串缺少逗号
        // 修复对象结束和开始之间的问题
        .replace(/}\s*,\s*,\s*\{/g, '}, {')  // 修复连续逗号
        .replace(/]\s*,\s*,\s*\[/g, '], [')  // 修复连续逗号
        // 修复数组元素间的问题
        .replace(/"([^"]*)"\s*]\s*,\s*\[/g, '"$1"], [')  // 修复字符串后数组间缺少逗号
        .replace(/(\d+)\s*]\s*,\s*\[/g, '$1], [')  // 修复数字后数组间缺少逗号
        .replace(/(true|false|null)\s*]\s*,\s*\[/g, '$1], [')  // 修复布尔值后数组间缺少逗号
        // 修复对象和数组混合的问题
        .replace(/"([^"]*)"\s*}\s*,\s*\[/g, '"$1"}, [')  // 修复字符串后对象数组间缺少逗号
        .replace(/(\d+)\s*}\s*,\s*\[/g, '$1}, [')  // 修复数字后对象数组间缺少逗号
        .replace(/(true|false|null)\s*}\s*,\s*\[/g, '$1}, [')  // 修复布尔值后对象数组间缺少逗号
        .replace(/"([^"]*)"\s*]\s*,\s*\{/g, '"$1"], {')  // 修复字符串后数组对象间缺少逗号
        .replace(/(\d+)\s*]\s*,\s*\{/g, '$1], {')  // 修复数字后数组对象间缺少逗号
        .replace(/(true|false|null)\s*]\s*,\s*\{/g, '$1], {');  // 修复布尔值后数组对象间缺少逗号
    
    // 6. 最终清理 - 新增
    text = text
        // 移除所有控制字符
        .replace(/[\x00-\x1F\x7F]/g, '')
        // 规范化空白字符
        .replace(/\s+/g, ' ')
        // 确保JSON结构完整
        .trim();
    
    console.log(`[增强Crowd修复] 修复完成，文本长度: ${text.length}`);
    return text;
}

// 新增：增强的scene schema修复
function repairSceneSchemaEnhanced(text, schema) {
    console.log(`[增强Scene修复] 开始修复scene schema格式`);
    
    // 0. 预处理：处理换行符和控制字符
    text = text
        .replace(/\\n/g, ' ')  // 将 \n 替换为空格
        .replace(/\\r/g, ' ')  // 将 \r 替换为空格
        .replace(/\\t/g, ' ')  // 将 \t 替换为空格
        .replace(/\n/g, ' ')   // 将实际的换行符替换为空格
        .replace(/\r/g, ' ')   // 将实际的回车符替换为空格
        .replace(/\t/g, ' ')   // 将实际的制表符替换为空格
        .replace(/\s+/g, ' ')  // 将多个空白字符合并为单个空格
        .trim();
    
    // 1. 确保有整合人群场景洞察数组
    if (!text.includes('"整合人群场景洞察"') && !text.includes('整合人群场景洞察')) {
        console.log(`[增强Scene修复] 未找到整合人群场景洞察，尝试包装为scene格式`);
        // 尝试提取数组并包装
        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            text = `{"整合人群场景洞察": ${arrayMatch[0]}}`;
        } else {
            // 如果连数组都没有，尝试包装为单个对象
            const objectMatch = text.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                text = `{"整合人群场景洞察": [${objectMatch[0]}]}`;
            }
        }
    }
    
    // 2. 修复整合人群场景洞察数组格式
    text = text
        // 确保整合人群场景洞察是数组
        .replace(/"整合人群场景洞察"\s*:\s*\{/g, '"整合人群场景洞察": [{')
        .replace(/}\s*$/g, '}]')
        // 修复数组元素间缺少逗号
        .replace(/}\s*\{/g, '}, {')
        // 修复对象末尾的格式问题
        .replace(/,\s*}\s*,\s*]/g, '}]')  // 修复对象数组末尾的格式
        .replace(/,\s*]\s*,\s*}/g, ']}')  // 修复数组对象末尾的格式
        // 修复数组元素间的格式问题
        .replace(/}\s*,\s*,\s*\{/g, '}, {')  // 修复连续逗号
        .replace(/]\s*,\s*,\s*\[/g, '], [')  // 修复连续逗号
        // 修复字符串中的转义问题
        .replace(/\\"/g, '"')  // 修复过度转义的引号
        .replace(/\\\\/g, '\\')  // 修复过度转义的反斜杠
        // 修复换行符和制表符
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    
    // 3. 修复特定的格式错误
    text = text
        // 修复对象之间缺少逗号的问题
        .replace(/"([^"]*)"\s*}\s*,\s*\{/g, '"$1"}, {')  // 修复对象间缺少逗号
        .replace(/(\d+)\s*}\s*,\s*\{/g, '$1}, {')  // 修复数字后对象间缺少逗号
        .replace(/(true|false|null)\s*}\s*,\s*\{/g, '$1}, {')  // 修复布尔值后对象间缺少逗号
        // 修复对象内部缺少逗号的问题
        .replace(/"([^"]*)"\s*"([^"]*)"/g, '"$1", "$2"')  // 修复字符串间缺少逗号
        .replace(/(\d+)\s*"([^"]*)"/g, '$1, "$2"')  // 修复数字后字符串缺少逗号
        .replace(/(true|false|null)\s*"([^"]*)"/g, '$1, "$2"')  // 修复布尔值后字符串缺少逗号
        // 修复对象结束和开始之间的问题
        .replace(/}\s*,\s*,\s*\{/g, '}, {')  // 修复连续逗号
        .replace(/]\s*,\s*,\s*\[/g, '], [')  // 修复连续逗号
        // 修复数组元素间的问题
        .replace(/"([^"]*)"\s*]\s*,\s*\[/g, '"$1"], [')  // 修复字符串后数组间缺少逗号
        .replace(/(\d+)\s*]\s*,\s*\[/g, '$1], [')  // 修复数字后数组间缺少逗号
        .replace(/(true|false|null)\s*]\s*,\s*\[/g, '$1], [')  // 修复布尔值后数组间缺少逗号
        // 修复对象和数组混合的问题
        .replace(/"([^"]*)"\s*}\s*,\s*\[/g, '"$1"}, [')  // 修复字符串后对象数组间缺少逗号
        .replace(/(\d+)\s*}\s*,\s*\[/g, '$1}, [')  // 修复数字后对象数组间缺少逗号
        .replace(/(true|false|null)\s*}\s*,\s*\[/g, '$1}, [')  // 修复布尔值后对象数组间缺少逗号
        .replace(/"([^"]*)"\s*]\s*,\s*\{/g, '"$1"], {')  // 修复字符串后数组对象间缺少逗号
        .replace(/(\d+)\s*]\s*,\s*\{/g, '$1], {')  // 修复数字后数组对象间缺少逗号
        .replace(/(true|false|null)\s*]\s*,\s*\{/g, '$1], {');  // 修复布尔值后数组对象间缺少逗号
    
    // 4. 最终清理
    text = text
        // 移除所有控制字符
        .replace(/[\x00-\x1F\x7F]/g, '')
        // 规范化空白字符
        .replace(/\s+/g, ' ')
        // 确保JSON结构完整
        .trim();
    
    console.log(`[增强Scene修复] 修复完成，文本长度: ${text.length}`);
    return text;
}

// 新增：验证解析结果是否符合schema结构
function validateAgainstSchema(parsed, schema, schemaType) {
    const errors = [];
    
    if (schemaType === 'crowd') {
        // 验证crowd schema结构
        if (!parsed.matchedCrowds || !Array.isArray(parsed.matchedCrowds)) {
            errors.push('缺少matchedCrowds数组');
        } else {
            parsed.matchedCrowds.forEach((crowd, index) => {
                const requiredFields = ['groupName', 'typeOption', 'industryOption', 'groupDesc', 'coverNum', '人群类型', 'score', 'reasoning'];
                requiredFields.forEach(field => {
                    if (!(field in crowd)) {
                        errors.push(`人群${index}缺少字段: ${field}`);
                    }
                });
            });
        }
    } else if (schemaType === 'scene') {
        // 验证scene schema结构
        if (!parsed.整合人群场景洞察 || !Array.isArray(parsed.整合人群场景洞察)) {
            errors.push('缺少整合人群场景洞察数组');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

// 新增：修复schema结构问题
function fixSchemaStructure(parsed, schema, schemaType) {
    console.log(`[结构修复] 开始修复schema结构问题`);
    
    if (schemaType === 'crowd') {
        // 确保有matchedCrowds数组
        if (!parsed.matchedCrowds) {
            parsed.matchedCrowds = [];
        }
        
        // 修复每个crowd对象的字段
        parsed.matchedCrowds.forEach(crowd => {
            if (!crowd.groupName) crowd.groupName = '';
            if (!crowd.typeOption) crowd.typeOption = '';
            if (!crowd.industryOption) crowd.industryOption = '';
            if (!crowd.groupDesc) crowd.groupDesc = '';
            if (!crowd.coverNum) crowd.coverNum = 0;
            if (!crowd.人群类型) crowd.人群类型 = '';
            if (!crowd.score) crowd.score = 50;
            if (!crowd.reasoning) crowd.reasoning = '默认评分';
        });
    } else if (schemaType === 'scene') {
        // 确保有整合人群场景洞察数组
        if (!parsed.整合人群场景洞察) {
            parsed.整合人群场景洞察 = [];
        }
    }
    
    return parsed;
}

// ========== 新增：完整JSON格式重建函数 ========== //
function completeJsonRebuild(text, formatType) {
    console.log(`[完整JSON重建] 开始重建 ${formatType} 格式...`);
    console.log(`[完整JSON重建] 原始文本长度: ${text.length}`);
    
    // 1. 去除markdown代码块、前后非JSON内容
    let cleaned = text;
    if (typeof cleaned !== 'string') return cleaned;
    
    // 去除markdown代码块
    cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
    cleaned = cleaned.replace(/```\s*/g, '');
    
    // 去除前后非JSON内容
    let jsonMatch = cleaned.match(/({[\\s\\S]*}|\\[[\\s\\S]*\\])/);
    if (jsonMatch) {
        cleaned = jsonMatch[0];
    }
    
    // 2. 修复常见的JSON语法错误
    cleaned = cleaned
        // 修复换行符问题
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        // 去除控制字符
        .replace(/[\\x00-\\x1F\\x7F]/g, '')
        // 修复多余的空格
        .replace(/\\s+/g, ' ')
        // 修复多余的逗号
        .replace(/,\\s*}/g, '}')
        .replace(/,\\s*]/g, ']')
        // 修复字段名缺少双引号的问题
        .replace(/([{,]\\s*)([a-zA-Z_][a-zA-Z0-9_]*)\\s*:/g, '$1"$2":')
        // 修复字符串值缺少双引号的问题
        .replace(/:\\s*([^"\\d\\[\\{\\s][^,}\\]]*[^"\\s,}\\]])/g, ':"$1"')
        // 修复单引号问题
        .replace(/'/g, '"')
        // 修复未闭合的字符串
        .replace(/"([^"]*)$/g, '"$1"')
        // 修复多余的右括号
        .replace(/\\}\\]*\\}\\]*$/g, '}')
        .replace(/\\]\\}*\\]\\}*$/g, ']');
    
    // 3. 针对特定格式的错误修复
    if (formatType === 'crowd') {
        cleaned = repairCrowdSpecificErrors(cleaned);
    } else if (formatType === 'scene') {
        cleaned = repairSceneSpecificErrors(cleaned);
    }
    
    // 4. 确保JSON结构完整
    cleaned = ensureCompleteJsonStructure(cleaned, formatType);
    
    console.log(`[完整JSON重建] 重建后文本长度: ${cleaned.length}`);
    return cleaned;
}

// 修复crowd格式特定错误
function repairCrowdSpecificErrors(text) {
    // 修复 "人群类型": "生活方式",} 这种错误
    text = text.replace(/"人群类型"\\s*:\\s*"([^"]*)"\\s*,?\\s*\\}/g, '"人群类型":"$1"}');
    
    // 修复 "score": 50, "typeOption": "孕育学习", "人群类型": "生活方式",} 这种错误
    text = text.replace(/"人群类型"\\s*:\\s*"([^"]*)"\\s*,?\\s*\\}/g, '"人群类型":"$1"}');
    
    // 修复 industryOption 字段的逗号问题
    text = text.replace(/"industryOption"\\s*:\\s*"([^"]*)"\\s*,?\\s*\\}/g, '"industryOption":"$1"}');
    
    // 修复 reasoning 字段的逗号问题
    text = text.replace(/"reasoning"\\s*:\\s*"([^"]*)"\\s*,?\\s*\\}/g, '"reasoning":"$1"}');
    
    return text;
}

// 修复scene格式特定错误
function repairSceneSpecificErrors(text) {
    // 修复场景洞察结尾的多余字符
    text = text.replace(/\\}\\]*\\}\\]*\\}\\]*$/g, '}]}');
    
    // 修复精细化使用场景的结尾问题
    text = text.replace(/"小红书核心话术"\\s*:\\s*"([^"]*)"\\s*\\}\\s*\\]\\s*\\}\\s*\\]\\s*\\}/g, '"小红书核心话术":"$1"}]}]}');
    
    return text;
}

// 确保JSON结构完整
function ensureCompleteJsonStructure(text, formatType) {
    // 计算括号匹配
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        
        if (char === '\\\\') {
            escapeNext = true;
            continue;
        }
        
        if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
        }
        
        if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            if (char === '[') bracketCount++;
            if (char === ']') bracketCount--;
        }
    }
    
    // 补充缺失的右括号
    while (braceCount > 0) {
        text += '}';
        braceCount--;
    }
    
    while (bracketCount > 0) {
        text += ']';
        bracketCount--;
    }
    
    // 确保根结构正确
    if (formatType === 'crowd') {
        if (!text.includes('"matchedCrowds"')) {
            text = '{"matchedCrowds":[]}';
        }
    } else if (formatType === 'scene') {
        if (!text.includes('"整合人群场景洞察"')) {
            text = '{"整合人群场景洞察":[]}';
        }
    }
    
    return text;
}

// 增强的JSON修复函数
function repairJsonResponseEnhanced(text, schema, schemaType) {
    console.log(`[增强JSON修复] 开始增强修复...`);
    
    try {
        // 1. 尝试直接解析
        const parsed = JSON.parse(text);
        console.log(`[增强JSON修复] 直接解析成功`);
        return parsed;
    } catch (error) {
        console.log(`[增强JSON修复] 第一次修复失败: ${error.message}`);
        
        // 2. 尝试完整JSON重建
        try {
            const rebuilt = completeJsonRebuild(text, schemaType);
            const parsed = JSON.parse(rebuilt);
            console.log(`[增强JSON修复] 完整重建成功`);
            return parsed;
        } catch (error2) {
            console.log(`[增强JSON修复] 第二次修复也失败: ${error2.message}`);
            
            // 3. 尝试手动构建JSON结构
            try {
                console.log(`[增强JSON修复] 尝试手动构建JSON结构...`);
                const manualBuilt = manualBuildJsonStructure(text, schemaType);
                console.log(`[增强JSON修复] 手动构建成功`);
                return manualBuilt;
            } catch (error3) {
                console.log(`[增强JSON修复] 手动构建也失败: ${error3.message}`);
                
                // 4. 最后尝试更宽松的匹配
                try {
                    console.log(`[增强JSON修复] 尝试更宽松的匹配...`);
                    const looseMatch = looseJsonMatch(text, schemaType);
                    console.log(`[增强JSON修复] 宽松匹配成功`);
                    return looseMatch;
                } catch (error4) {
                    console.log(`[增强JSON修复] 所有修复方法都失败: ${error4.message}`);
                    throw new Error(`无法解析JSON数据: ${error4.message}`);
                }
            }
        }
    }
}

// 手动构建JSON结构
function manualBuildJsonStructure(text, schemaType) {
    if (schemaType === 'crowd') {
        return manualBuildCrowdStructure(text);
    } else if (schemaType === 'scene') {
        return manualBuildSceneStructure(text);
    }
    throw new Error(`不支持的schema类型: ${schemaType}`);
}

// 手动构建crowd结构
function manualBuildCrowdStructure(text) {
    const crowdObjects = [];
    
    // 查找所有可能的groupName位置
    const groupNameMatches = text.match(/"groupName"\\s*:\\s*"([^"]+)"/g);
    if (groupNameMatches && groupNameMatches.length > 0) {
        console.log(`[增强JSON修复] 找到${groupNameMatches.length}个groupName`);
        
        for (let i = 0; i < groupNameMatches.length; i++) {
            const groupNameMatch = groupNameMatches[i];
            const groupName = groupNameMatch.match(/"groupName"\\s*:\\s*"([^"]+)"/)[1];
            
            // 在groupName周围查找对象边界
            const groupNameIndex = text.indexOf(groupNameMatch);
            const objectText = extractObjectAroundIndex(text, groupNameIndex);
            
            if (objectText) {
                const crowdObject = {
                    groupName: extractFieldFromObject(objectText, 'groupName') || groupName,
                    typeOption: extractFieldFromObject(objectText, 'typeOption') || '',
                    industryOption: extractFieldFromObject(objectText, 'industryOption') || '',
                    groupDesc: extractFieldFromObject(objectText, 'groupDesc') || '',
                    coverNum: extractNumberFieldFromObject(objectText, 'coverNum') || 0,
                    人群类型: extractFieldFromObject(objectText, '人群类型') || '',
                    score: extractNumberFieldFromObject(objectText, 'score') || 50,
                    reasoning: extractFieldFromObject(objectText, 'reasoning') || ''
                };
                crowdObjects.push(crowdObject);
            }
        }
    }
    
    console.log(`[增强JSON修复] 手动构建成功，找到${crowdObjects.length}个人群`);
    return { matchedCrowds: crowdObjects };
}

// 手动构建scene结构
function manualBuildSceneStructure(text) {
    const sceneObjects = [];
    
    // 查找所有可能的原始优质人群
    const originalCrowdMatches = text.match(/"原始优质人群"\\s*:\\s*{/g);
    if (originalCrowdMatches && originalCrowdMatches.length > 0) {
        console.log(`[增强JSON修复] 找到${originalCrowdMatches.length}个原始优质人群`);
        
        for (let i = 0; i < originalCrowdMatches.length; i++) {
            const match = originalCrowdMatches[i];
            const matchIndex = text.indexOf(match, i > 0 ? text.indexOf(originalCrowdMatches[i-1]) + originalCrowdMatches[i-1].length : 0);
            
            // 提取整个场景洞察对象
            const sceneObjectText = extractSceneObjectAroundIndex(text, matchIndex);
            
            if (sceneObjectText) {
                const sceneObject = {
                    原始优质人群: extractOriginalCrowdFromScene(sceneObjectText),
                    拓展典型人群: extractExpandedCrowdsFromScene(sceneObjectText)
                };
                sceneObjects.push(sceneObject);
            }
        }
    }
    
    console.log(`[增强JSON修复] 手动构建成功，找到${sceneObjects.length}个场景洞察`);
    return { 整合人群场景洞察: sceneObjects };
}

// 宽松JSON匹配
function looseJsonMatch(text, schemaType) {
    if (schemaType === 'crowd') {
        console.log(`[增强JSON修复] 尝试更宽松的crowd匹配...`);
        return looseCrowdMatch(text);
    } else if (schemaType === 'scene') {
        console.log(`[增强JSON修复] 尝试更宽松的scene匹配...`);
        return looseSceneMatch(text);
    }
    throw new Error(`不支持的schema类型: ${schemaType}`);
}

// 宽松crowd匹配
function looseCrowdMatch(text) {
    const crowdObjects = [];
    
    // 使用更宽松的正则表达式
    const groupNameRegex = /"groupName"\\s*:\\s*"([^"]+)"/g;
    let match;
    
    while ((match = groupNameRegex.exec(text)) !== null) {
        const groupName = match[1];
        const startIndex = match.index;
        
        // 向前后扩展搜索范围
        const searchStart = Math.max(0, startIndex - 1000);
        const searchEnd = Math.min(text.length, startIndex + 2000);
        const searchText = text.substring(searchStart, searchEnd);
        
        const crowdObject = {
            groupName: groupName,
            typeOption: extractFieldFromObject(searchText, 'typeOption') || '',
            industryOption: extractFieldFromObject(searchText, 'industryOption') || '',
            groupDesc: extractFieldFromObject(searchText, 'groupDesc') || '',
            coverNum: extractNumberFieldFromObject(searchText, 'coverNum') || 0,
            人群类型: extractFieldFromObject(searchText, '人群类型') || '',
            score: extractNumberFieldFromObject(searchText, 'score') || 50,
            reasoning: extractFieldFromObject(searchText, 'reasoning') || ''
        };
        crowdObjects.push(crowdObject);
    }
    
    console.log(`[增强JSON修复] 宽松crowd匹配成功，找到${crowdObjects.length}个人群`);
    return { matchedCrowds: crowdObjects };
}

// 宽松scene匹配
function looseSceneMatch(text) {
    const sceneObjects = [];
    
    // 查找原始优质人群
    const originalCrowdRegex = /"原始优质人群"\\s*:\\s*{/g;
    let match;
    
    while ((match = originalCrowdRegex.exec(text)) !== null) {
        const startIndex = match.index;
        
        // 向前后扩展搜索范围
        const searchStart = Math.max(0, startIndex - 500);
        const searchEnd = Math.min(text.length, startIndex + 3000);
        const searchText = text.substring(searchStart, searchEnd);
        
        const sceneObject = {
            原始优质人群: extractOriginalCrowdFromScene(searchText),
            拓展典型人群: extractExpandedCrowdsFromScene(searchText)
        };
        sceneObjects.push(sceneObject);
    }
    
    console.log(`[增强JSON修复] 宽松scene匹配成功，找到${sceneObjects.length}个场景洞察`);
    return { 整合人群场景洞察: sceneObjects };
}

// 辅助函数：从对象文本中提取字符串字段
function extractFieldFromObject(objectText, fieldName) {
    const regex = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]*)"`, 'i');
    const match = objectText.match(regex);
    return match ? match[1] : '';
}

// 辅助函数：从对象文本中提取数字字段
function extractNumberFieldFromObject(objectText, fieldName) {
    const regex = new RegExp(`"${fieldName}"\\s*:\\s*(\\d+)`, 'i');
    const match = objectText.match(regex);
    return match ? parseInt(match[1]) : null;
}

// 辅助函数：从对象文本中提取场景数组
function extractScenesFromObject(objectText) {
    const scenes = [];
    const sceneMatches = objectText.match(/"场景名称"\\s*:\\s*"([^"]+)"/g);
    
    if (sceneMatches) {
        for (const sceneMatch of sceneMatches) {
            const sceneName = sceneMatch.match(/"场景名称"\\s*:\\s*"([^"]+)"/)[1];
            const sceneDesc = extractFieldFromObject(objectText, '场景描述');
            const xiaohongshu = extractFieldFromObject(objectText, '小红书核心话术');
            
            scenes.push({
                场景名称: sceneName,
                场景描述: sceneDesc,
                小红书核心话术: xiaohongshu
            });
        }
    }
    
    return scenes;
}

// 辅助函数：提取对象周围的文本
function extractObjectAroundIndex(text, index) {
    let startIndex = index;
    let endIndex = index;
    let braceCount = 0;
    let inObject = false;
    
    // 向前查找对象开始
    while (startIndex > 0) {
        if (text[startIndex] === '}') braceCount++;
        if (text[startIndex] === '{') {
            braceCount--;
            if (braceCount === 0) {
                inObject = true;
                break;
            }
        }
        startIndex--;
    }
    
    if (!inObject) return null;
    
    // 向后查找对象结束
    braceCount = 0;
    for (let i = startIndex; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        if (text[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }
    
    return text.substring(startIndex, endIndex);
}

// 辅助函数：提取场景对象周围的文本
function extractSceneObjectAroundIndex(text, index) {
    let startIndex = index;
    let endIndex = index;
    let braceCount = 0;
    let inObject = false;
    
    // 向前查找对象开始
    while (startIndex > 0) {
        if (text[startIndex] === '}') braceCount++;
        if (text[startIndex] === '{') {
            braceCount--;
            if (braceCount === 0) {
                inObject = true;
                break;
            }
        }
        startIndex--;
    }
    
    if (!inObject) return null;
    
    // 向后查找对象结束
    braceCount = 0;
    for (let i = startIndex; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        if (text[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }
    
    return text.substring(startIndex, endIndex);
}

// 辅助函数：从场景文本中提取原始优质人群
function extractOriginalCrowdFromScene(sceneText) {
    const originalCrowdMatch = sceneText.match(/"原始优质人群"\\s*:\\s*{([^}]+)}/);
    if (!originalCrowdMatch) return {};
    
    const crowdText = originalCrowdMatch[1];
    return {
        groupName: extractFieldFromObject(crowdText, 'groupName') || '',
        typeOption: extractFieldFromObject(crowdText, 'typeOption') || '',
        industryOption: extractFieldFromObject(crowdText, 'industryOption') || '',
        groupDesc: extractFieldFromObject(crowdText, 'groupDesc') || '',
        coverNum: extractNumberFieldFromObject(crowdText, 'coverNum') || 0,
        人群类型: extractFieldFromObject(crowdText, '人群类型') || '',
        score: extractNumberFieldFromObject(crowdText, 'score') || 50,
        reasoning: extractFieldFromObject(crowdText, 'reasoning') || ''
    };
}

// 辅助函数：从场景文本中提取拓展典型人群
function extractExpandedCrowdsFromScene(sceneText) {
    const expandedCrowds = [];
    
    // 简化版本：直接查找典型人群名称
    const crowdNameMatches = sceneText.match(/"典型人群名称"\\s*:\\s*"([^"]+)"/g);
    if (crowdNameMatches) {
        for (const crowdMatch of crowdNameMatches) {
            const crowdName = crowdMatch.match(/"典型人群名称"\\s*:\\s*"([^"]+)"/)[1];
            
            // 在crowdName周围查找相关字段
            const crowdIndex = sceneText.indexOf(crowdMatch);
            const searchStart = Math.max(0, crowdIndex - 500);
            const searchEnd = Math.min(sceneText.length, crowdIndex + 1000);
            const searchText = sceneText.substring(searchStart, searchEnd);
            
            const expandedCrowd = {
                典型人群名称: crowdName,
                典型人群画像描述: extractFieldFromObject(searchText, '典型人群画像描述') || '',
                需求痛点: extractFieldFromObject(searchText, '需求痛点') || '',
                匹配产品卖点: extractFieldFromObject(searchText, '匹配产品卖点') || '',
                精细化使用场景: extractScenesFromObject(searchText)
            };
            expandedCrowds.push(expandedCrowd);
        }
    }
    
    return expandedCrowds;
}

// 增强的JSON解析函数
function parseJsonSafely(text, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // 首先尝试直接解析
            return JSON.parse(text);
        } catch (e) {
            lastError = e;
            console.warn(`JSON解析第${attempt}次尝试失败:`, e.message);
            
            if (attempt === 1) {
                // 第一次失败，尝试基础清理
                text = cleanGeminiResponse(text);
            } else if (attempt === 2) {
                // 第二次失败，尝试增强修复
                text = repairJsonResponse(text);
            } else {
                // 第三次失败，尝试更激进的修复
                // 移除所有可能的干扰字符
                text = text
                    .replace(/[^\x20-\x7E]/g, '')  // 只保留可打印ASCII字符
                    .replace(/\s+/g, ' ')  // 规范化空白字符
                    .trim();
                
                // 尝试提取JSON部分
                const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
                if (jsonMatch) {
                    text = jsonMatch[0];
                }
            }
        }
    }
    
    throw new Error(`JSON解析失败，已尝试${maxRetries}次: ${lastError.message}`);
}

// ========== 新增：严格格式净化修复函数 ========== //
function strictJsonFormatRepair(text, formatType) {
    // 1. 去除markdown代码块、前后非JSON内容
    let cleaned = text;
    if (typeof cleaned !== 'string') return cleaned;
    cleaned = cleaned.replace(/```json[\s\S]*?```/g, m => m.replace(/```json|```/g, '').trim());
    cleaned = cleaned.replace(/```[\s\S]*?```/g, m => m.replace(/```/g, '').trim());
    // 只保留第一个合法JSON
    let jsonMatch = cleaned.match(/({[\s\S]*}|\[[\s\S]*\])/);
    if (jsonMatch) {
        cleaned = jsonMatch[0];
    }
    // 2. 只做格式净化，不补字段
    cleaned = cleaned
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/\n|\r|\t/g, ' ')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    // 3. 严格校验格式
    try {
        const parsed = JSON.parse(cleaned);
        // 4. 严格输出格式
        if (formatType === 'crowd') {
            if (parsed.matchedCrowds && Array.isArray(parsed.matchedCrowds)) {
                return { matchedCrowds: parsed.matchedCrowds };
            }
        } else if (formatType === 'scene') {
            if (parsed.整合人群场景洞察 && Array.isArray(parsed.整合人群场景洞察)) {
                return { 整合人群场景洞察: parsed.整合人群场景洞察 };
            }
        }
        // 兜底：如果结构不符，返回空结构
        if (formatType === 'crowd') return { matchedCrowds: [] };
        if (formatType === 'scene') return { 整合人群场景洞察: [] };
        return {};
    } catch (e) {
        // 兜底：解析失败，返回空结构
        if (formatType === 'crowd') return { matchedCrowds: [] };
        if (formatType === 'scene') return { 整合人群场景洞察: [] };
        return {};
    }
}

app.post('/api/gemini', async (req, res) => {
  const { prompt, model, responseSchema, schemaType, useStreaming = false, thinkingBudget } = req.body;
  
  // 获取当前模型的API密钥
  let apiKey = GEMINI_KEYS[model];
  let currentModel = model;
  let isFallbackToPro = false;
  
  if (!apiKey) {
    return res.status(400).json({ error: '无效的模型或API密钥未配置' });
  }

  let agent = undefined;
  if (process.env.http_proxy || process.env.https_proxy) {
    agent = new HttpsProxyAgent(process.env.http_proxy || process.env.https_proxy);
  }

  // 检查prompt长度
  if (!prompt || prompt.length === 0) {
    return res.status(400).json({ error: 'prompt不能为空' });
  }

  // Token计数检查
  const tokenCount = await countTokens(prompt, model, apiKey, agent);
  console.log(`Token预估数量: ${tokenCount}`);
  
  // 根据模型设置token限制
  const maxInputTokens = model.includes('2.5') ? 2000000 : 1000000; // 2.5模型支持更长输入
  if (tokenCount > maxInputTokens) {
    return res.status(400).json({ 
      error: `输入token数量(${tokenCount})超过模型限制(${maxInputTokens})`,
      tokenCount,
      maxInputTokens
    });
  }

  // 构建一个本次请求专用的生成配置，避免修改原始配置
  const generationConfig = { ...(MODEL_CONFIGS[model] || MODEL_CONFIGS['gemini-2.5-flash-preview-05-20']) };

  // 使用有限思考预算，避免占满输出token；可用环境变量 THINKING_BUDGET 覆盖，默认 256
  const configuredBudget = Number(process.env.THINKING_BUDGET);
  const thinkingBudgetValue = Number.isFinite(configuredBudget) && configuredBudget > 0 ? configuredBudget : 256;
  generationConfig.thinkingConfig = { thinkingBudget: thinkingBudgetValue };
  
  // 构建请求payload，包含生成配置和安全设置
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: generationConfig, // 使用本次请求专用的配置
    safetySettings: SAFETY_SETTINGS
  };

  // 如果提供了responseSchema，添加结构化输出配置
  if (responseSchema) {
    payload.generationConfig.responseMimeType = 'application/json';
    payload.generationConfig.responseSchema = responseSchema;
  }

  let retry = 0;
  let lastError = null;
  const maxRetries = 3;

  console.log('--- Gemini API 调用开始 ---');
  console.log('请求模型:', currentModel);
  console.log('prompt长度:', prompt.length, '字符');
  console.log('Token数量(预估):', tokenCount);
  console.log('payload大小:', Buffer.byteLength(JSON.stringify(payload), 'utf8'), '字节');
  console.log('使用流式传输:', useStreaming);
  console.log('生成配置:', JSON.stringify(generationConfig));
  console.log('结构化输出:', !!responseSchema);

  while (retry < maxRetries) {
    try {
      console.log(`[fetch] 第${retry+1}次尝试...`);
      
      // 根据是否使用流式传输选择不同的端点
      const endpoint = useStreaming ? 'generateContentStream' : 'generateContent';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:${endpoint}?key=${apiKey}`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        console.error('[fetch] 超时，已中断本次请求');
      }, 300000); // 增加到5分钟

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        agent,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      console.log('[fetch] 响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        lastError = errorBody.error?.message || response.statusText;
        console.error('[fetch] 响应非200:', lastError);
        
        // 检查是否是配额超限错误
        if (lastError.includes('quota') || lastError.includes('Quota') || lastError.includes('exceeded')) {
          console.warn('[fetch] 检测到配额超限错误，尝试切换到PRO密钥');
          
          // 如果还没有切换到PRO密钥，则切换
          if (!isFallbackToPro && process.env.GEMINI_API_KEY_PRO) {
            isFallbackToPro = true;
            apiKey = process.env.GEMINI_API_KEY_PRO;
            // 保持使用前端选择的模型，不切换模型
            console.log('[fetch] 已切换到PRO密钥，保持使用模型:', currentModel);
            
            // 重新尝试请求
            retry = 0; // 重置重试次数
            continue;
          } else {
            // 如果已经切换到PRO密钥还是失败，直接返回错误
            return res.status(400).json({ error: lastError, tokenCount });
          }
        }
        
        // 如果是token限制错误，直接返回，不重试
        if (lastError.includes('token') || lastError.includes('Token')) {
          return res.status(400).json({ error: lastError, tokenCount });
        }
        
        retry++;
        // 指数退避重试
        const delay = Math.min(10000 * Math.pow(2, retry), 60000);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }

      if (useStreaming) {
        // 流式响应处理
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  break;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.candidates && parsed.candidates[0]?.content?.parts?.[0]?.text) {
                    const chunk = parsed.candidates[0].content.parts[0].text;
                    fullResponse += chunk;
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        let textResponse = fullResponse;
        if (responseSchema) {
          // 如果配置了responseSchema，直接尝试解析JSON
          try {
            const parsed = validateAndRepairWithSchemaEnhanced(textResponse, responseSchema, schemaType);
            console.log('--- Gemini API 流式调用成功 ---');
            console.log('[Token消耗统计] 流式响应:', {
              预估输入Token: tokenCount,
              输出Token: '流式响应无法精确统计',
              总Token: '流式响应无法精确统计'
            });
            return res.json({ 
              result: parsed, 
              tokenCount,
              usageInfo: {
                promptTokenCount: tokenCount,
                candidatesTokenCount: '流式响应',
                totalTokenCount: '流式响应'
              }
            });
          } catch (e) {
            // JSON解析失败，尝试提取JSON
            let jsonMatch = textResponse.match(/({[\s\S]*}|\[[\s\S]*\])/);
            if (jsonMatch) {
              textResponse = jsonMatch[0];
            } else {
              textResponse = textResponse.replace(/^```json\s*|```\s*$/g, '').trim();
            }
            
            if (!(textResponse.startsWith('{') || textResponse.startsWith('['))) {
              lastError = 'Gemini返回内容不是JSON: ' + textResponse.slice(0, 100);
              console.error('[fetch] Gemini返回内容不是JSON:', textResponse.slice(0, 200));
              retry++;
              const delay = Math.min(10000 * Math.pow(2, retry), 60000);
              await new Promise(res => setTimeout(res, delay));
              continue;
            }
            
            try {
              const parsed = validateAndRepairWithSchemaEnhanced(textResponse, responseSchema, schemaType);
              console.log('--- Gemini API 流式调用成功 ---');
              console.log('[Token消耗统计] 流式响应:', {
                预估输入Token: tokenCount,
                输出Token: '流式响应无法精确统计',
                总Token: '流式响应无法精确统计'
              });
              return res.json({ 
                result: parsed, 
                tokenCount,
                usageInfo: {
                  promptTokenCount: tokenCount,
                  candidatesTokenCount: '流式响应',
                  totalTokenCount: '流式响应'
                }
              });
            } catch (e) {
              lastError = 'JSON解析失败: ' + e.message;
              console.error('[fetch] JSON解析失败:', e.message, textResponse.slice(0, 200));
              retry++;
              const delay = Math.min(10000 * Math.pow(2, retry), 60000);
              await new Promise(res => setTimeout(res, delay));
              continue;
            }
          }
        } else {
          console.log('--- Gemini API 流式调用成功 ---');
          console.log('[Token消耗统计] 流式响应:', {
            预估输入Token: tokenCount,
            输出Token: '流式响应无法精确统计',
            总Token: '流式响应无法精确统计'
          });
          return res.json({ 
            result: textResponse, 
            tokenCount,
            usageInfo: {
              promptTokenCount: tokenCount,
              candidatesTokenCount: '流式响应',
              totalTokenCount: '流式响应'
            }
          });
        }
      } else {
        // 非流式响应处理
        const data = await response.json();
        console.log('[fetch] 响应数据:', JSON.stringify(data).slice(0, 500));
        
        // 解析token使用情况
        let usageInfo = {};
        if (data.usageMetadata) {
          usageInfo = {
            promptTokenCount: data.usageMetadata.promptTokenCount || 0,
            thoughtsTokenCount: data.usageMetadata.thoughtsTokenCount || 0,
            candidatesTokenCount: data.usageMetadata.candidatesTokenCount || 0,
            totalTokenCount: data.usageMetadata.totalTokenCount || 0
          };
          console.log('[Token消耗统计]', {
            输入Token: usageInfo.promptTokenCount,
            思考Token: usageInfo.thoughtsTokenCount,
            输出Token: usageInfo.candidatesTokenCount,
            总Token: usageInfo.totalTokenCount,
            预估输入Token: tokenCount,
            差异: Math.abs(usageInfo.promptTokenCount - tokenCount)
          });
        } else {
          console.log('[Token消耗统计] 未获取到usageMetadata，使用预估值:', {
            预估输入Token: tokenCount,
            输出Token: '未知',
            总Token: '未知'
          });
        }
        
        if (!data.candidates || data.candidates.length === 0) {
          lastError = 'API返回内容为空';
          console.error('[fetch] API返回内容为空');
          retry++;
          await new Promise(res => setTimeout(res, 10000));
          continue;
        }

        // 检查candidates[0]是否有有效的content和parts
        const candidate = data.candidates[0];
        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
          lastError = 'API返回的candidates格式无效';
          console.error('[fetch] API返回的candidates格式无效:', JSON.stringify(candidate));
          retry++;
          await new Promise(res => setTimeout(res, 10000));
          continue;
        }

        let textResponse = candidate.content.parts[0].text;
        if (!textResponse) {
          lastError = 'API返回的文本内容为空';
          console.error('[fetch] API返回的文本内容为空');
          retry++;
          await new Promise(res => setTimeout(res, 10000));
          continue;
        }
        
        textResponse = cleanGeminiResponse(textResponse);
        
        if (responseSchema) {
          // 如果配置了responseSchema，使用增强的schema验证和修复
          try {
            const parsed = validateAndRepairWithSchemaEnhanced(textResponse, responseSchema, schemaType);
            console.log('--- Gemini API 调用成功 ---');
            
            // 根据schemaType保存数据到全局变量
            if (schemaType === 'crowd') {
              latestCrowdData = parsed;
            } else if (schemaType === 'scene') {
              latestSceneData = parsed;
            }
            
            console.log('[Token消耗统计] 流式响应:', {
              预估输入Token: tokenCount,
              输出Token: '流式响应无法精确统计',
              总Token: '流式响应无法精确统计'
            });
            return res.json({ 
              result: parsed, 
              tokenCount,
              usageInfo: {
                promptTokenCount: tokenCount,
                candidatesTokenCount: '流式响应',
                totalTokenCount: '流式响应'
              }
            });
          } catch (e) {
            // JSON解析失败，尝试提取JSON
            let jsonMatch = textResponse.match(/({[\s\S]*}|\[[\s\S]*\])/);
            if (jsonMatch) {
              textResponse = jsonMatch[0];
            } else {
              // 兜底，去掉 markdown 标记
              textResponse = textResponse.replace(/^```json\s*|```\s*$/g, '').trim();
            }
            
            if (!(textResponse.startsWith('{') || textResponse.startsWith('['))) {
              lastError = 'Gemini返回内容不是JSON: ' + textResponse.slice(0, 100);
              console.error('[fetch] Gemini返回内容不是JSON:', textResponse.slice(0, 200));
              retry++;
              const delay = Math.min(10000 * Math.pow(2, retry), 60000);
              await new Promise(res => setTimeout(res, delay));
              continue;
            }
            
            try {
              const parsed = validateAndRepairWithSchemaEnhanced(textResponse, responseSchema, schemaType);
              console.log('--- Gemini API 调用成功 ---');
              
              // 根据schemaType保存数据到全局变量
              if (schemaType === 'crowd') {
                latestCrowdData = parsed;
              } else if (schemaType === 'scene') {
                latestSceneData = parsed;
              }
              
              console.log('[Token消耗统计] 流式响应:', {
                预估输入Token: tokenCount,
                输出Token: '流式响应无法精确统计',
                总Token: '流式响应无法精确统计'
              });
              return res.json({ 
                result: parsed, 
                tokenCount,
                usageInfo: {
                  promptTokenCount: tokenCount,
                  candidatesTokenCount: '流式响应',
                  totalTokenCount: '流式响应'
                }
              });
            } catch (e) {
              lastError = 'JSON解析失败: ' + e.message;
              console.error('[fetch] JSON解析失败:', e.message, textResponse.slice(0, 200));
              retry++;
              const delay = Math.min(10000 * Math.pow(2, retry), 60000);
              await new Promise(res => setTimeout(res, delay));
              continue;
            }
          }
        } else {
          // 非schema请求，尝试解析JSON，如果失败则作为普通文本返回
          try {
            const parsed = parseJsonSafely(textResponse);
            console.log('--- Gemini API 调用成功 (自动解析为JSON) ---');
            return res.json({ 
              result: parsed, 
              tokenCount,
              usageInfo
            });
          } catch (e) {
            // 解析失败，说明是普通文本，直接返回
            console.log('--- Gemini API 调用成功 (返回纯文本) ---');
            return res.json({ 
              result: textResponse, 
              tokenCount,
              usageInfo
            });
          }
        }
      }
    } catch (err) {
      lastError = err.message;
      console.error('[fetch] 捕获异常:', err && err.stack ? err.stack : err);
      retry++;
      // 指数退避重试
      const delay = Math.min(10000 * Math.pow(2, retry), 60000);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  
  console.error('--- Gemini API 调用失败 ---', lastError);
  res.status(500).json({ 
    error: lastError || 'Gemini API请求失败', 
    tokenCount,
    usageInfo: {
      promptTokenCount: tokenCount,
      candidatesTokenCount: 0,
      totalTokenCount: tokenCount
    }
  });
});

// 新增：Token计数API
app.post('/api/count-tokens', async (req, res) => {
  const { prompt, model } = req.body;
  const apiKey = GEMINI_KEYS[model];
  
  if (!apiKey) {
    return res.status(400).json({ error: '无效的模型或API密钥未配置' });
  }

  let agent = undefined;
  if (process.env.http_proxy || process.env.https_proxy) {
    agent = new HttpsProxyAgent(process.env.http_proxy || process.env.https_proxy);
  }

  try {
    const tokenCount = await countTokens(prompt, model, apiKey, agent);
    res.json({ tokenCount, promptLength: prompt ? prompt.length : 0 });
  } catch (error) {
    res.status(500).json({ error: 'Token计数失败: ' + error.message });
  }
});

// 新增：全量人群API
app.get('/api/audience', (req, res) => {
  const filePath = path.join(__dirname, 'data', '全量人群.json');
  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: '无法读取全量人群数据' });
    }
    try {
      const json = JSON.parse(data);
      res.json(json);
    } catch (e) {
      res.status(500).json({ error: '全量人群数据格式错误' });
    }
  });
});

// 全局变量存储最新的数据
let latestCrowdData = null;
let latestSceneData = null;

// 启动服务器
app.listen(PORT, () => {
    console.log(`Gemini后端服务已启动，端口: ${PORT}`);
    console.log(`支持的模型: ${Object.keys(MODEL_CONFIGS).join(', ')}`);
});

// 添加Excel导出端点
app.get('/export-excel', async (req, res) => {
    try {
        if (!latestSceneData || !latestSceneData.整合人群场景洞察) {
            return res.status(400).json({ error: '没有可导出的数据' });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('人群场景洞察');

        // 设置表头
        worksheet.columns = [
            { header: '原始优质人群-人群名称', key: 'originalGroupName', width: 20 },
            { header: '原始优质人群-覆盖人数', key: 'originalCoverNum', width: 15 },
            { header: '原始优质人群-人群描述', key: 'originalGroupDesc', width: 40 },
            { header: '原始优质人群-行业选项', key: 'originalIndustryOption', width: 15 },
            { header: '原始优质人群-匹配理由', key: 'originalReasoning', width: 50 },
            { header: '原始优质人群-匹配分数', key: 'originalScore', width: 15 },
            { header: '原始优质人群-类型选项', key: 'originalTypeOption', width: 15 },
            { header: '原始优质人群-人群类型', key: 'originalCrowdType', width: 15 },
            { header: '拓展典型人群-人群名称', key: 'expandedGroupName', width: 25 },
            { header: '拓展典型人群-画像描述', key: 'expandedGroupDesc', width: 40 },
            { header: '拓展典型人群-需求痛点', key: 'expandedPainPoint', width: 50 },
            { header: '拓展典型人群-匹配产品卖点', key: 'expandedProductMatch', width: 50 },
            { header: '精细化使用场景-场景名称', key: 'sceneName', width: 25 },
            { header: '精细化使用场景-场景描述', key: 'sceneDesc', width: 40 },
            { header: '精细化使用场景-小红书核心话术', key: 'xiaohongshuScript', width: 50 }
        ];

        // 添加数据
        let rowIndex = 2; // 从第2行开始（第1行是表头）
        for (const sceneInsight of latestSceneData.整合人群场景洞察) {
            const originalCrowd = sceneInsight.原始优质人群;
            const expandedCrowds = sceneInsight.拓展典型人群 || [];

            if (expandedCrowds.length === 0) {
                // 如果没有拓展典型人群，只添加原始优质人群数据
                worksheet.getCell(`A${rowIndex}`).value = originalCrowd.groupName || '';
                worksheet.getCell(`B${rowIndex}`).value = originalCrowd.coverNum || 0;
                worksheet.getCell(`C${rowIndex}`).value = originalCrowd.groupDesc || '';
                worksheet.getCell(`D${rowIndex}`).value = originalCrowd.industryOption || '';
                worksheet.getCell(`E${rowIndex}`).value = originalCrowd.reasoning || '';
                worksheet.getCell(`F${rowIndex}`).value = originalCrowd.score || 0;
                worksheet.getCell(`G${rowIndex}`).value = originalCrowd.typeOption || '';
                worksheet.getCell(`H${rowIndex}`).value = originalCrowd.人群类型 || '';
                rowIndex++;
            } else {
                // 为每个拓展典型人群添加一行数据
                for (const expandedCrowd of expandedCrowds) {
                    const scenes = expandedCrowd.精细化使用场景 || [];
                    
                    if (scenes.length === 0) {
                        // 如果没有精细化使用场景，只添加人群数据
                        worksheet.getCell(`A${rowIndex}`).value = originalCrowd.groupName || '';
                        worksheet.getCell(`B${rowIndex}`).value = originalCrowd.coverNum || 0;
                        worksheet.getCell(`C${rowIndex}`).value = originalCrowd.groupDesc || '';
                        worksheet.getCell(`D${rowIndex}`).value = originalCrowd.industryOption || '';
                        worksheet.getCell(`E${rowIndex}`).value = originalCrowd.reasoning || '';
                        worksheet.getCell(`F${rowIndex}`).value = originalCrowd.score || 0;
                        worksheet.getCell(`G${rowIndex}`).value = originalCrowd.typeOption || '';
                        worksheet.getCell(`H${rowIndex}`).value = originalCrowd.人群类型 || '';
                        worksheet.getCell(`I${rowIndex}`).value = expandedCrowd.典型人群名称 || '';
                        worksheet.getCell(`J${rowIndex}`).value = expandedCrowd.典型人群画像描述 || '';
                        worksheet.getCell(`K${rowIndex}`).value = expandedCrowd.需求痛点 || '';
                        worksheet.getCell(`L${rowIndex}`).value = expandedCrowd.匹配产品卖点 || '';
                        rowIndex++;
                    } else {
                        // 为每个精细化使用场景添加一行数据
                        for (const scene of scenes) {
                            worksheet.getCell(`A${rowIndex}`).value = originalCrowd.groupName || '';
                            worksheet.getCell(`B${rowIndex}`).value = originalCrowd.coverNum || 0;
                            worksheet.getCell(`C${rowIndex}`).value = originalCrowd.groupDesc || '';
                            worksheet.getCell(`D${rowIndex}`).value = originalCrowd.industryOption || '';
                            worksheet.getCell(`E${rowIndex}`).value = originalCrowd.reasoning || '';
                            worksheet.getCell(`F${rowIndex}`).value = originalCrowd.score || 0;
                            worksheet.getCell(`G${rowIndex}`).value = originalCrowd.typeOption || '';
                            worksheet.getCell(`H${rowIndex}`).value = originalCrowd.人群类型 || '';
                            worksheet.getCell(`I${rowIndex}`).value = expandedCrowd.典型人群名称 || '';
                            worksheet.getCell(`J${rowIndex}`).value = expandedCrowd.典型人群画像描述 || '';
                            worksheet.getCell(`K${rowIndex}`).value = expandedCrowd.需求痛点 || '';
                            worksheet.getCell(`L${rowIndex}`).value = expandedCrowd.匹配产品卖点 || '';
                            worksheet.getCell(`M${rowIndex}`).value = scene.场景名称 || '';
                            worksheet.getCell(`N${rowIndex}`).value = scene.场景描述 || '';
                            worksheet.getCell(`O${rowIndex}`).value = scene.小红书核心话术 || '';
                            rowIndex++;
                        }
                    }
                }
            }
        }

        // 设置表头样式
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // 设置响应头
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=人群场景洞察数据.xlsx');

        // 写入响应
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('导出Excel失败:', error);
        res.status(500).json({ error: '导出Excel失败' });
    }
}); 