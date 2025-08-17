const express = require('express');
const fs = require('fs');
const path = require('path');
const { analyzeXhsComments } = require('./analyze-xhs-gemini');

function createXhsAnalystRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '10mb' }));

  const baseDir = __dirname;
  const brandInfoPath = path.join(baseDir, 'xhs_json', 'brand_info.json');

  function getBrandInfoByKey(key) {
    if (!fs.existsSync(brandInfoPath)) return {};
    try {
      const all = JSON.parse(fs.readFileSync(brandInfoPath, 'utf-8'));
      const base = path.basename(key, '.json');
      return all[base] || {};
    } catch (e) {
      return {};
    }
  }

  function getCurrentDateFromKey(key) {
    const m = key.match(/(\d{4})(\d{2})(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return '';
  }

  router.post('/upload', (req, res) => {
    const { key, data, brandDesc, monitorReq, analyzeScope } = req.body;
    if (!key || !data) {
      return res.status(400).json({ error: '缺少key或data' });
    }
    const savePath = path.join(baseDir, 'xhs_json', key);
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFile(savePath, JSON.stringify(data, null, 2), async err => {
      if (err) {
        console.error('保存失败:', err);
        return res.status(500).json({ error: '保存失败' });
      }
      try {
        const reportPath = savePath.replace('.json', '_report.txt');
        const brandInfo = getBrandInfoByKey(key);
        const usedBrandDesc = brandDesc || brandInfo.brandDesc || '';
        const usedMonitorReq = monitorReq || brandInfo.monitorReq || '';
        const currentDate = getCurrentDateFromKey(key);
        await analyzeXhsComments(savePath, reportPath, usedBrandDesc, usedMonitorReq, currentDate, analyzeScope || 'today');
      } catch (e) {
        console.error('自动分析失败:', e);
      }
      res.json({ status: 'ok', file: savePath });
    });
  });

  router.post('/upload-and-analyze', async (req, res) => {
    const { key, data, brandDesc, monitorReq, analyzeScope } = req.body;
    if (!key || !data) return res.status(400).json({ error: '缺少key或data' });
    const savePath = path.join(baseDir, 'xhs_json', key);
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, JSON.stringify(data, null, 2));
    try {
      const reportPath = savePath.replace('.json', '_report.txt');
      const brandInfo = getBrandInfoByKey(key);
      const usedBrandDesc = brandDesc || brandInfo.brandDesc || '';
      const usedMonitorReq = monitorReq || brandInfo.monitorReq || '';
      const currentDate = getCurrentDateFromKey(key);
      await analyzeXhsComments(savePath, reportPath, usedBrandDesc, usedMonitorReq, currentDate, analyzeScope || 'today');
      const reportFileName = path.basename(reportPath);
      const reportUrl = `/xhs_json/${reportFileName}`;
      res.json({ status: 'ok', reportUrl, reportFileName });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 静态文件服务（保持与原服务路径一致）
  router.use('/xhs_json', express.static(path.join(baseDir, 'xhs_json')));

  return router;
}

module.exports = { createXhsAnalystRouter };


