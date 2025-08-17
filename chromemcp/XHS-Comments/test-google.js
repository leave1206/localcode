const axios = require('axios');

const MCP_URL = 'http://127.0.0.1:12306/mcp';
const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q=周杰伦';

async function openGoogleSearch() {
  try {
    const res = await axios.post(MCP_URL, {
      action: 'chrome_navigate',
      args: { url: GOOGLE_SEARCH_URL }
    });
    console.log('已请求打开谷歌搜索页面:', GOOGLE_SEARCH_URL);
    console.log('MCP响应:', res.data);
  } catch (err) {
    console.error('请求失败:', err.response ? err.response.data : err.message);
  }
}

openGoogleSearch(); 