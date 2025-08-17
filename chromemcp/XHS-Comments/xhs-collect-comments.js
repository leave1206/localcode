const axios = require('axios');
const schedule = require('node-schedule');
const fs = require('fs');

const MCP_URL = 'http://127.0.0.1:12306/mcp';
const XHS_NOTE_URL = 'https://www.xiaohongshu.com/explore/6878a0ed0000000022030a80?app_platform=android&ignoreEngage=true&app_version=8.91.0&share_from_user_hidden=true&xsec_source=app_share&type=normal&xsec_token=CBd30PyICcbDqDISf8RWTkNWzezButI5ME9U5lCPU06NI=&author_share=1&shareRedId=N0lIQTs3Rj02NzUyOTgwNjczOTk2ST45&apptime=1753147007&share_id=22775f67a22d40828596730841a9ed43&share_channel=copy_link&appuid=5cfa82b40000000010022d80&xhsshare=CopyLink'; // TODO: 替换为你的笔记链接
const COMMENT_SELECTOR = '.comment-list'; // TODO: 如有不同请用开发者工具查找实际评论区class

async function openAndCollect() {
  try {
    await axios.post(MCP_URL, {
      method: 'chrome_navigate',
      params: { url: XHS_NOTE_URL }
    });
    console.log('已打开小红书页面:', XHS_NOTE_URL);

    await new Promise(r => setTimeout(r, 8000));

    // 多次滚动页面，加载更多评论
    for (let i = 0; i < 10; i++) {
      await axios.post(MCP_URL, {
        method: 'chrome_inject_script',
        params: {
          jsScript: 'window.scrollTo(0, document.body.scrollHeight);',
          type: 'MAIN'
        }
      });
      await new Promise(r => setTimeout(r, 2000));
    }

    const res = await axios.post(MCP_URL, {
      method: 'chrome_get_web_content',
      params: { url: XHS_NOTE_URL, textContent: true, selector: COMMENT_SELECTOR }
    });
    console.log('评论区内容:', res.data);

    const now = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(`comments-${now}.txt`, JSON.stringify(res.data, null, 2), 'utf-8');
    console.log('评论内容已保存到文件。');
  } catch (err) {
    console.error('采集失败:', err.message);
  }
}

schedule.scheduleJob('0 8 * * *', openAndCollect);
openAndCollect(); 