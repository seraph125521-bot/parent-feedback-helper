/*
 * Zeabur / 本地一体化服务
 * ------------------------------------------------------------------
 * 一个 Node 服务同时做两件事：
 *   1. 托管前端静态文件（index.html / css / js）
 *   2. 提供 POST /api/generate，转发给 DeepSeek（复用 api/generate.js 逻辑）
 *
 * 密钥只存在于环境变量 DEEPSEEK_API_KEY，前端永远拿不到。
 *
 * 本地调试：把 .env.example 复制为 .env.local 填入真实 Key，然后 `npm start`。
 * Zeabur 部署：在项目 Variables 里配置 DEEPSEEK_API_KEY，平台自动 `npm start`。
 * ------------------------------------------------------------------
 */

const path = require("path");
const express = require("express");

try {
  require("dotenv").config({ path: path.join(__dirname, ".env.local") });
} catch (e) {
  // dotenv 仅本地需要，线上用平台环境变量，缺失可忽略
}

const generateHandler = require("./api/generate.js");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/api/generate", generateHandler);

app.use(
  express.static(__dirname, {
    dotfiles: "ignore",
    extensions: ["html"],
  })
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`数学课后反馈助手已启动：http://localhost:${port}`);
});
