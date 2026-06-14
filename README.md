# 数学课后反馈助手（parent-feedback-helper）

帮少儿数学老师**一键生成发给家长的课后反馈**的轻量 H5 工具。
老师课后填几句课堂观察，自动为全班每个孩子生成温暖、具体、不过度焦虑的数学课反馈，一键复制到微信群。

## 现在是什么状态

- **演示版（MVP v0）**：纯前端 H5，无需后端、无需 API Key，打开即用。
- 反馈内容当前由**数学场景本地模板 + 词库**生成（`generator.js`），用于地推演示和验证需求。
- 已预留接入真实大模型的接口：将来只改 `generateFeedback()` 一个函数即可。

## 怎么运行

不需要任何依赖，任选一种：

```bash
# 方式一：Python 自带服务器（推荐）
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000

# 方式二：直接双击 index.html 也能用（复制功能在 http 下更稳）
```

手机上演示：把这些静态文件传到任意静态托管（如 Vercel、Netlify、GitHub Pages、或国内对象存储），得到一个网址，私信发给老师即可。

## 文件结构

```
index.html      页面结构
styles.css      移动端样式
generator.js    反馈生成引擎（演示=本地模板；预留 LLM 接入点）
app.js          表单交互、生成、复制、本地缓存
docs/           验证物料（提示词 / 私信话术 / 收款登记）
```

## 接入真实大模型（验证通过后再做）

1. 选一个国内大模型（DeepSeek / 通义 / 豆包），拿到 API Key。
2. 加一个极简后端（云函数/Serverless）转发请求，**不要把 Key 放前端**。
3. 在 `generator.js` 的 `generateFeedback()` 里，把演示模式那行换成：
   `return await callLLM(buildPrompt(input));`
   `buildPrompt()` 已经写好。

## 验证计划（见 docs/）

- 本周：私信 30 个数学老师/机构老师 → 免费服务 10 个 → 拿到 5 个 9.9 预定。
- 2 周内 ≥5 个预定 → 接真实模型、正式做；0–1 个 → 换方向。
