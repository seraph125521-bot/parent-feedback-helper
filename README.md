# 初高中数学课后反馈助手（parent-feedback-helper）

帮初高中数学老师**一键生成发给家长的课后反馈**的轻量 H5 工具。
老师课后填几句课堂观察、作业安排和学生表现，工具会按照老师自己的反馈格式，自动生成可发到家长群的课后反馈。

## 现在是什么状态

- **演示版（MVP v0）**：纯前端 H5，无需后端、无需 API Key，打开即用。
- 反馈内容当前由**初高中数学本地词库 + 老师专属格式模板**生成，用于地推演示和验证需求。
- 老师可以编辑自己的固定格式，例如“时间 / 课次 / 学生 / 学习知识点 / 作业布置 / 老师点评及建议”。
- 已预留接入真实大模型的接口：后续优先替换 `generator.js` 里的 `buildTeacherComment()` 或 `generateFeedback()`。

## 本次已实现的模板能力

- 新增“老师专属反馈格式”编辑区，支持老师粘贴或修改机构自己的课后反馈结构。
- 新增字段：上课时间、课次、学习知识点、作业布置、班级整体表现。
- 新增 `templateEngine.js`，专门负责：
   - 默认课后反馈模板；
   - 占位符上下文组装；
   - 将 `{lessonTime}`、`{lessonNo}`、`{studentName}`、`{knowledgePoints}`、`{homework}`、`{teacherComment}` 渲染成最终文本。
- `generator.js` 现在只负责生成“老师点评及宝贵建议”，再交给 `templateEngine.js` 按老师格式输出完整反馈。
- 表单内容和老师模板会保存到浏览器 localStorage，刷新后不容易丢。

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
templateEngine.js 老师专属格式模板引擎
generator.js    反馈生成引擎（演示=本地词库；预留 LLM 接入点）
app.js          表单交互、生成、复制、本地缓存
tests/          轻量 Node 测试
docs/           验证物料（提示词 / 私信话术 / 收款登记）
```

## 老师专属模板占位符

当前默认模板：

```text
课后反馈
一. 时间：{lessonTime}
   课次：{lessonNo}
   学生：{studentName}

二. 学习知识点：
{knowledgePoints}

三. 作业布置：
{homework}

四. 老师点评及宝贵建议：
{teacherComment}
```

老师可以改栏目名、顺序和措辞，只要保留需要自动填充的占位符即可。

## 本地验证

```bash
node --check templateEngine.js
node --check generator.js
node --check app.js
node tests/template-engine.test.js
node tests/generator-template.test.js
```

## 接入真实大模型（验证通过后再做）

1. 选一个国内大模型（DeepSeek / 通义 / 豆包），拿到 API Key。
2. 加一个极简后端（云函数/Serverless）转发请求，**不要把 Key 放前端**。
3. 在 `generator.js` 里优先替换 `buildTeacherComment()`：
   - 让大模型生成 `{teacherComment}`；
   - 继续使用 `templateEngine.js` 套老师自己的模板。
4. 如果希望大模型一次性输出完整反馈，可以使用 `buildFeedbackPrompt(input)` 生成包含老师模板的完整提示词。

## 验证计划（见 docs/）

- 本周：私信 30 个初高中数学老师/机构老师 → 免费服务 10 个 → 拿到 5 个 9.9 预定。
- 2 周内 ≥5 个预定 → 接真实模型、正式做；0–1 个 → 换方向。
