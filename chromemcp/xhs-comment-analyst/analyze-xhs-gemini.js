const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: path.resolve(__dirname, '../../策略工作流/workflow_2/.env') });

// Gemini API 地址与模型从环境变量注入
// 注意：为避免被共享 .env 中的 GEMINI_API_URL(可能用于其他服务或mock:3101)覆盖，这里仅允许 XHS_GEMINI_API_URL 覆盖
// 默认指向当前已启动的后端服务（策略工作流/workflow_2/server.js，端口为 3001）
const GEMINI_API_URL = process.env.GEMINI_API_URL || process.env.XHS_GEMINI_API_URL || 'http://localhost:3101/api/gemini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20';

// 只保留 buildPrompt 函数体内模板
function buildPrompt({ brandDesc = '', monitorReq = '', currentDate = '', analyzeScope = 'all', jsonText = '', metaStatsText = '' }) {
  return `
你是一位资深的品牌社媒舆情分析专家，精通中文社交媒体（尤其是小红书）的用户语言习惯和平台生态。你具备敏锐的洞察力，擅长从海量用户评论中精准识别风险、挖掘用户需求与潜在机会点，并能提供数据驱动的、可落地的商业建议。同时你也是消费品多品类的资深品类专家，分析要带有品类视角，针对每个品类应该如何进行评论区的分析和洞察有针对性的思考和完整的方法论。你的分析风格是：客观、严谨、注重细节，并始终以帮助品牌识别负面风险、挖掘潜在的客户需求、提升产品和营销策略为最终目标。

# 背景信息与上下文

1.  **品牌及产品介绍**：${brandDesc ? `${brandDesc}` : '无'}
2.  **数据源**：请分析下方小红书评论区数据：
${jsonText}
3.  **品牌方特别关注**：${monitorReq ? `${monitorReq}` : '无特别要求，请进行常规综合分析。'}

4.  **系统校验统计（请以此为准进行所有数量计算，禁止采样/估算）**：
${metaStatsText || '无'}

# 任务指令

请严格按照以下步骤执行分析，并生成一份专业的舆情报告：

**第一步：数据预处理与标准化**
1.  解析JSON数据，提取每条评论的核心字段（笔记ID、链接、昵称、评论内容、发布时间）。
2.  以【${currentDate}】为基准，将所有相对时间（如“昨天”、“3天前”、“1小时前”）和绝对日期（如“07-22”）统一转换为YYYY-MM-DD的标准格式。
3.  分析范围：${analyzeScope === 'all' ? '分析全部已抓取到的评论。' : `仅分析评论时间为【${currentDate}】当天的评论，后续分析仅针对这些当日评论。`}

**第二步：评论分类与情感识别 (三层分类法)**
1.  **初级分类 (相关性)**：将${analyzeScope === 'all' ? '全部评论' : '当日所有评论'}分为 **“产品相关”** 和 **“非产品相关”**（如讨论博主、抽奖、无关广告等）。
2.  **二级分类 (情感倾向)**：仅针对“产品相关”的评论，进行情感分析，分为 **“正向”**、**“负向”**、**“中立/疑问”** 三类。
3.  **三级分类 (情绪强度)**：在所有“产品相关”的评论中，识别出“情绪激烈”的正向和负向评论。
    * **定义**：“情绪激烈”指包含强烈情感词汇（如“垃圾”、“踩雷”、“一生推”、“绝了”）、连续使用感叹号、或带有攻击性/极端赞美语气的评论。

**第三步：负向评论的归因分析**
1.  对所有“负向”评论进行主题聚类，将其归入以下一个或多个预设类别。如果出现无法归类的，请创建新的合理分类，注意要针对其所在品类进行适合该品类的归类和分析。
    * **产品功效/质量** (如：没效果、没作用、质量差等)
    * **用户体验/副作用** (如：不会用、体验不好、难用等)
    * **价格/性价比** (如：太贵、不值这个价等)
    * **包装/物流** (如：破损、发货慢等)
    * **客服/售后** (如：客服态度差、不解决问题等)
    * **信息误导** (如：与宣传不符等)
    * **纯粹谩骂/无意义**
2.  统计每个负向主题下的评论数量和占比。

**第四步：生成应对建议**
根据负向评论的归因分析结果，针对每个主要负向主题，提出具体、可执行的品牌应对建议。建议应区分“公关口径建议”（如何回复用户）和“内部优化建议”（产品、运营、客服团队如何改进）。

**第五步：潜在消费需求洞察**
1. **分析对象**：分析所有“产品相关”的评论（包括正、负、中立）。
2. **分析目标**：挖掘隐藏在评论中的用户新需求、产品改进建议和市场机会点。
3. **归纳洞察**：将洞察归纳至以下类别，每类需有典型评论举例和简要洞察描述：
   - **新功能/新配方建议**（如：“希望能出个XX版本/口味”，“如果能增加/替换成XX功能/材质就好了”）
   - **产品改进建议**（如：“建议改进一下XX的包装/材质/操作方式”，“希望能推出不同规格/尺寸，比如大容量或便携装”）
   - **新使用场景/用法挖掘**（如：“我发现这个产品除了常规用法，还能用在XX场景，或者搭配XX使用”，“解锁了XX的新用法，效果出乎意料”）
   - **市场机会点**（如：“和XX品牌相比，我们的优势在...，但在...方面有待提升”，“评论表明产品在XX人群/XX市场中很受欢迎，可重点发力”）

# 输出要求

请使用Markdown格式，生成一份结构清晰、可读性强的《品牌小红书评论区舆情日报 (${analyzeScope === 'all' ? '全量' : currentDate})》。报告必须包含以下所有部分：

---

### **一、 舆情核心数据摘要**
* **分析时间范围**：${analyzeScope === 'all' ? '请根据数据中的最早与最晚日期填写，如：YYYY-MM-DD 至 YYYY-MM-DD' : currentDate}
* **${analyzeScope === 'all' ? '总评论数' : '当日总评论数'}**：[数字]（必须等于“系统校验统计”中的总评论数）
* **产品相关评论**：[数字]，占总评论数 [百分比]
* **产品相关评论情感分布**：
    * **正向**：[数量] 条，占比 [百分比]
    * **负向**：[数量] 条，占比 [百分比]
    * **中立/疑问**：[数量] 条，占比 [百分比]
* **情绪激烈评论**：[数量] 条，占产品相关评论 [百分比]

【一致性要求】所有数量加总需与“系统校验统计”的总评论数一致。

### **二、 疑似负向评论清单**
（列出所有在【第二步】中被识别为“负向”的评论）

| 笔记ID | 用户昵称 | 评论时间 (YYYY-MM-DD) | 评论内容 | 笔记链接 |
| :--- | :--- | :--- | :--- | :--- |
| ... | ... | ... | ... | ... |

### **三、 负向评论归因分析**
（以表格形式展示【第三步】的分析结果）

| 负向主题 | 评论数量 | 占比 | 典型评论示例 |
| :--- | :--- | :--- | :--- |
| 产品功效/质量 | ... | ...% | "用了半瓶了，一点效果都没有..." |
| 用户体验/副作用 | ... | ...% | "上脸有点刺痛，我可能是过敏了" |
| ... | ... | ... | ... |

### **四、 品牌应对策略与建议**
**1. 针对「产品功效/质量」问题的建议**
* **公关口径**：...
* **内部优化**：...
**2. 针对「用户体验/副作用」问题的建议**
* **公关口径**：...
* **内部优化**：...
(以此类推)

### **五、 消费者需求洞察与机会点**
（此部分展示【第五步】的分析结果）

**1. 新功能/新配方建议**
* **洞察描述**：多位用户提到希望产品增加...功能，或加入...成分。
* **典型评论**：>"...评论原文..."

**2. 产品改进建议**
* **洞察描述**：用户普遍反映产品的...（如包装、质地）有待改进，建议...
* **典型评论**：>"...评论原文..."

**3. 新使用场景/用法挖掘**
* **洞察描述**：发现用户创造性地将产品用于...场景，这可能是新的营销宣传点。
* **典型评论**：>"...评论原文..."

**4. 市场机会点**
* **洞察描述**：用户在与竞品的比较中，指出了我们的...优势，并对...（如特定版本、定价策略）表现出市场需求。
* **典型评论**：>"...评论原文..."

### **六、 品牌方特别关注点回应**
* **关注点**：${monitorReq}
* **分析与洞察**：[针对性地分析和回答品牌方的疑问]

---
`;
}

// 健壮JSON修复函数（简化版）
function robustJsonRepair(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  // 去除markdown代码块
  result = result.replace(/```json[\s\S]*?```/g, m => m.replace(/```json|```/g, '').trim());
  result = result.replace(/```[\s\S]*?```/g, m => m.replace(/```/g, '').trim());
  // 尝试提取第一个合法JSON对象或数组
  let jsonMatch = result.match(/({[\s\S]*}|\[[\s\S]*\])/);
  if (jsonMatch) {
    result = jsonMatch[0];
  }
  // 常见修复
  result = result
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/}\s*,\s*}/g, '}}')
    .replace(/]\s*,\s*]/g, ']]')
    .replace(/}\s*,\s*]/g, '}]')
    .replace(/]\s*,\s*}/g, ']}')
    // 修复数组中的对象之间缺少逗号
    .replace(/}\s*\{/g, '},{')
    .replace(/}\s*\[/g, '},[')
    .replace(/]\s*\{/g, '],{')
    .replace(/]\s*\[/g, '],[')
    // 修复字符串后缺少逗号
    .replace(/"\s*"/g, '","')
    .replace(/"\s*}/g, '",}')
    .replace(/"\s*]/g, '",]')
    .replace(/"\s*\{/g, '",{')
    .replace(/"\s*\[/g, '",[')
    // 修复数字后缺少逗号
    .replace(/(\d+)\s*"/g, '$1,"')
    .replace(/(\d+)\s*}/g, '$1,}')
    .replace(/(\d+)\s*]/g, '$1,]')
    .replace(/(\d+)\s*\{/g, '$1,{')
    .replace(/(\d+)\s*\[/g, '$1,[')
    // 修复布尔值和null后缺少逗号
    .replace(/(true|false|null)\s*"/g, '$1,"')
    .replace(/(true|false|null)\s*}/g, '$1,}')
    .replace(/(true|false|null)\s*]/g, '$1,]')
    .replace(/(true|false|null)\s*\{/g, '$1,{')
    .replace(/(true|false|null)\s*\[/g, '$1,[');
  // 尝试补全缺失的结尾大括号
  const leftBraces = (result.match(/{/g) || []).length;
  const rightBraces = (result.match(/}/g) || []).length;
  if (leftBraces > rightBraces) {
    result += '}'.repeat(leftBraces - rightBraces);
  }
  const leftBrackets = (result.match(/\[/g) || []).length;
  const rightBrackets = (result.match(/]/g) || []).length;
  if (leftBrackets > rightBrackets) {
    result += ']'.repeat(leftBrackets - rightBrackets);
  }
  return result;
}

async function callGeminiAPI({ prompt, model = GEMINI_MODEL, responseSchema = null, schemaType = null, useStreaming = true, maxRetries = 3 }) {
  let finalPrompt = prompt.trim();
  let retry = 0;
  let lastError = null;
  while (retry < maxRetries) {
    try {
      console.log(`[Gemini调试] 第${retry+1}次调用，prompt长度:`, finalPrompt.length);
      const res = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          model,
          responseSchema,
          schemaType,
          useStreaming
        })
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('[Gemini调试] 响应非JSON:', text);
        throw new Error('后端返回非JSON格式: ' + text);
      }
      if (!res.ok) {
        throw new Error(data.error || '后端Gemini API请求失败');
      }
      // 直接返回后端result字段；若为字符串（Markdown），按原样返回
      return data.result;
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini调试] 第${retry+1}次调用失败:`, err.message);
      await new Promise(res => setTimeout(res, 1000 * (retry + 1)));
      retry++;
    }
  }
  throw new Error('Gemini后端API调用失败: ' + (lastError && lastError.message));
}

function truncateText(text, maxLen = 260) {
  if (!text || typeof text !== 'string') return text;
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + ' …';
}

function preprocessCommentsJson(rawJson) {
  // 仅保留必须字段，并对长评论做截断
  const slim = {};
  for (const [noteId, note] of Object.entries(rawJson)) {
    const comments = Array.isArray(note.comments) ? note.comments : [];
    slim[noteId] = {
      noteId,
      link: note.link || note.url || '',
      comments: comments.map(c => ({
        user: c.user || c.nickname || c.name || '',
        content: truncateText(c.content || c.text || ''),
        date: c.date || c.time || c.created_at || c.createdAt || ''
      }))
    };
  }
  return slim;
}

function computeMetaStats(rawJson) {
  const totalCount = Object.values(rawJson).reduce((acc, note) => acc + (Array.isArray(note.comments) ? note.comments.length : 0), 0);
  const perCounts = Object.entries(rawJson).reduce((acc, [key, note]) => {
    acc[key] = Array.isArray(note.comments) ? note.comments.length : 0;
    return acc;
  }, {});
  const perCountsText = Object.entries(perCounts).map(([k, v]) => `${k}=${v}`).join(', ');
  // 日期范围
  const dates = [];
  for (const note of Object.values(rawJson)) {
    for (const c of (note.comments || [])) {
      const d = c.date || c.time || c.created_at || c.createdAt;
      if (typeof d === 'string' && d.length) dates.push(d);
    }
  }
  const range = { min: null, max: null };
  if (dates.length) {
    // 粗略提取 YYYY-MM-DD
    const norm = dates.map(s => (s.match(/\d{4}-\d{2}-\d{2}/) || [s])[0]);
    norm.sort();
    range.min = norm[0];
    range.max = norm[norm.length - 1];
  }
  const metaStatsText = `系统校验统计：\n- 总评论数: ${totalCount}\n- 各笔记条数: ${perCountsText}` + (range.min && range.max ? `\n- 数据日期范围: ${range.min} 至 ${range.max}` : '');
  return { totalCount, perCountsText, metaStatsText };
}

async function analyzeXhsComments(jsonPath, reportPath, brandDesc = '', monitorReq = '', currentDate = '', analyzeScope = 'all') {
  try {
    console.log(`[${new Date().toLocaleString()}] analyzeXhsComments 输入参数:`);
    console.log('  jsonPath:', jsonPath);
    console.log('  reportPath:', reportPath);
    console.log('  brandDesc:', brandDesc);
    console.log('  monitorReq:', monitorReq);
    console.log('  currentDate:', currentDate);
    console.log('  analyzeScope:', analyzeScope);
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const slim = preprocessCommentsJson(raw);
    const jsonText = JSON.stringify(slim, null, 2);
    const { totalCount, metaStatsText } = computeMetaStats(raw);
    console.log('预处理后数据条数:', totalCount);
    console.log('预处理后数据结构:', jsonText.slice(0, 1000));
    const prompt = buildPrompt({ brandDesc, monitorReq, currentDate, analyzeScope, jsonText, metaStatsText });
    console.log(`[${new Date().toLocaleString()}] 分析输入prompt内容如下：\n`, prompt);
    const result = await callGeminiAPI({ prompt });
    fs.writeFileSync(reportPath, typeof result === 'string' ? result : JSON.stringify(result, null, 2), 'utf-8');
    console.log(`[${new Date().toLocaleString()}] 分析报告已保存: ${reportPath}`);
    if (typeof result === 'string') {
      console.log(`[${new Date().toLocaleString()}] 最终写入报告内容预览：`);
      console.log(result.slice(0, 1000));
    } else {
      console.log(`[${new Date().toLocaleString()}] 最终写入报告内容预览：`);
      console.log(JSON.stringify(result, null, 2).slice(0, 1000));
    }
  } catch (e) {
    console.error(`[${new Date().toLocaleString()}] 分析异常:`, e);
  }
}

// 上传即分析：导出函数供server.js调用
module.exports = { analyzeXhsComments, buildPrompt, callGeminiAPI };
