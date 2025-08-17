// server.js - keep as a thin wrapper to mount the router when run standalone
const express = require('express');
const cors = require('cors');
const { createXhsAnalystRouter } = require('./router');

const app = express();
app.use(cors());
app.use(createXhsAnalystRouter());

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`xhs-comment-analyst 后端已启动，监听端口${PORT}`);
});