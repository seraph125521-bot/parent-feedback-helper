# 初高中数学课后反馈助手（parent-feedback-helper）

一个面向初高中数学老师的轻量 H5 工具，用来快速生成发给家长的课后反馈。

老师只需要填写本节课主题、作业、学生表现等少量信息，工具会按照老师自己的发送格式生成可直接复制到微信的反馈内容。目前同时支持大班课和一对一辅导场景。

## 当前阶段

当前项目处于 **MVP 验证增强版**：已经从单纯“生成反馈”升级为“可每天复用的轻量工作台”。

现阶段目标不是做完整 CRM 或账号系统，而是验证三个关键假设：

- 老师是否愿意每天用它减少重复写反馈的时间。
- 机构老师是否需要常用学生和班级名单复用。
- 一对一老师是否需要按学生查看历史并参考上次反馈。

已有 DeepSeek Serverless 代理，但本地模板仍是兜底能力：不开 AI 或 AI 服务异常时，工具仍能生成反馈。

## 核心功能

### 写反馈

- 支持 **大班课** 和 **一对一** 两种授课模式。
- 大班课填写：上课时间、课次、数学主题、作业、班级整体表现、学生名单和每个学生表现关键词。
- 一对一填写：学生姓名、年级、课堂讲解内容、已掌握、主要卡点、练习建议、家长配合建议、下次课计划。
- 首次打开会预置一节示例课，方便快速体验；也可以一键清空示例重新填写。
- 生成按钮会根据人数动态显示，例如“大班 2 名，生成反馈”。
- 大班生成时显示进度，避免老师误以为卡住。

### AI 智能生成与本地兜底

- 前端通过 `llm.js` 调用 `/api/generate`。
- `/api/generate` 是 Vercel Serverless Function，负责把请求转发给 DeepSeek，API Key 只保存在服务端环境变量中。
- 大模型只生成“老师点评及建议”正文，最终栏目结构仍由本地模板引擎控制，保证格式稳定。
- AI 超时、限流、熔断或服务异常时，会自动回退到本地模板生成。
- 支持“换一版”：结果卡片中可以只重写当前学生，不影响全班其他反馈。

### 我的格式

- 老师可以自定义发送格式。
- 采用可视化栏目配置，不要求老师理解 `{placeholder}`。
- 支持：
  - 改开头标题。
  - 栏目开关。
  - 栏目排序。
  - 修改栏目小标题。
  - 实时预览家长看到的效果。
- 当前默认栏目：
  - 基本信息。
  - 学习知识点。
  - 作业布置。
  - 老师点评及宝贵建议。
- 支持导出/导入“我的格式”，方便换设备或备份；导出内容不包含学生名单和课堂数据。

### 常用学生 / 班级

为了让老师第二天打开时不用重新输入同一批学生，项目新增了学生资产能力。

- 生成成功后，会自动记录最近使用学生。
- 写反馈页展示最近学生 chip，点击即可加入本次名单。
- 支持把当前名单保存为常用班级或课程组。
- 常用班级以 chip 展示，例如“初二函数班 · 12人”。
- 点击班级 chip 会把组内学生追加到当前名单中，不会直接清空现有名单。
- 学生资产保存在浏览器本地，不需要账号。

### 历史记录

- 本地保存最近 30 次生成记录。
- 写反馈页展示最近生成记录。
- 支持恢复历史填写。
- 支持复制历史反馈。
- 支持按学生筛选历史记录。
- 支持从某条历史中“参考生成”：回到写反馈页后，本次 AI 生成会参考该学生上次反馈，但 prompt 明确要求不能复述旧内容，必须结合本节新情况。

### 微信友好复制

- 支持单条复制。
- 支持复制全部。
- 支持历史反馈复制。
- 大班复制格式默认为：

```text
【张晨】
反馈正文……

【李思远】
反馈正文……
```

- 一对一默认只复制正文，避免多余标题影响微信发送。
- 复制成功后会显示“已复制，可直接粘贴到微信”。

### 收款与验证闭环

- 结果页包含轻量 9.9 预定/支持入口。
- 不接正式支付网关，先用于 MVP 阶段手动验证付费意愿。
- 收款码图片后续可放到 `docs/images/`，当前代码只保留文字说明入口。

## 使用方法

### 纯静态演示

不需要安装依赖：

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

这种方式可以使用本地模板生成、学生资产、历史、格式配置、复制等功能。由于没有 Serverless Function，AI 请求会失败并自动回退到本地模板。

### 使用 DeepSeek 代理调试

需要 Vercel CLI 或 Vercel 部署环境。

1. 复制 `.env.example` 为 `.env.local`。
2. 填入 `DEEPSEEK_API_KEY`。
3. 使用 Vercel 本地开发：

```bash
vercel dev
```

4. 打开 Vercel dev 输出的本地地址。

## 环境变量

DeepSeek 代理使用以下环境变量：

```bash
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

API 防滥用与成本保护：

```bash
RATE_LIMIT_PER_MINUTE=30
RATE_LIMIT_PER_HOUR=300
MAX_MESSAGES=12
MAX_CONTENT_CHARS=4000
MAX_TOKENS_CAP=800
UPSTREAM_TIMEOUT_MS=30000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_COOLDOWN_MS=60000
```

注意：`.env.local` 含密钥，不能提交到 Git。

## 软件架构

项目采用纯前端 H5 + 可选 Vercel Serverless Function 的结构。

```text
index.html
  页面结构：写反馈 / 我的格式 / 生成结果

styles.css
  移动端优先的 iOS 风格样式、卡片、按钮、chip、结果卡片

app.js
  页面交互、状态管理、localStorage、学生名单、历史、复制、生成流程

templateEngine.js
  老师专属格式模板引擎，负责结构化栏目渲染和旧字符串模板兼容

generator.js
  反馈生成入口，本地模板兜底，大模型 prompt 构造，一对一/大班生成逻辑

llm.js
  前端 LLM 客户端，调用 /api/generate，并处理超时/限流/熔断错误

studentAssets.js
  常用学生、最近学生、班级/课程组、历史迁移等本地数据逻辑

copyFormat.js
  微信友好的复制格式化逻辑

api/generate.js
  DeepSeek Serverless 代理，包含限流、熔断、参数清洗和超时保护

tests/
  轻量 Node 测试

docs/
  验证物料、话术、收款与产品规格文档
```

## 数据存储

当前所有业务数据都存在浏览器 localStorage 中。

| Key | 用途 |
| --- | --- |
| `pfh_math_sec_state_v3` | 当前表单状态、授课模式、模板配置、本次课学生名单 |
| `pfh_llm_enabled_v1` | AI 智能生成开关 |
| `pfh_history_v1` | 最近 30 次生成历史，兼容旧结构并补充 `studentNames` |
| `pfh_student_assets_v1` | 常用学生、最近学生、班级/课程组 |
| `pfh_payment_prompt_v1` | 收款提示展开/隐藏状态 |

当前没有账号系统和云同步。这个设计是有意的：先验证老师是否真的高频使用，再决定是否引入登录、云端数据和跨设备同步。

## API 防护

`api/generate.js` 已实现基础生产保护：

- 只允许 POST。
- 校验 `messages` 非空和数量上限。
- 过滤 role，只允许 `system`、`user`、`assistant`。
- 截断单条消息内容长度。
- 限制 `temperature` 和 `max_tokens`。
- 按 IP 做分钟/小时限流。
- DeepSeek 连续失败后短时间熔断。
- 上游超时后返回 504。
- 不透传任意前端参数到上游。

当前限流是 Serverless 内存级方案，适合 MVP 基础保护。真实传播后建议升级为 Redis/Upstash 之类的跨实例限流。

## 本地验证

常用验证命令：

```bash
node --check api/generate.js
node --check llm.js
node --check studentAssets.js
node --check copyFormat.js
node --check generator.js
node --check app.js

node tests/template-engine.test.js
node tests/generator-template.test.js
node tests/api-security.test.js
node tests/student-assets.test.js
node tests/copy-format.test.js
```

也可以一次性运行：

```bash
node --check api/generate.js; node --check llm.js; node --check studentAssets.js; node --check copyFormat.js; node --check generator.js; node --check app.js; node tests/template-engine.test.js; node tests/generator-template.test.js; node tests/api-security.test.js; node tests/student-assets.test.js; node tests/copy-format.test.js
```

说明：`tests/api-security.test.js` 会 mock DeepSeek 上游失败，因此输出中出现 `DeepSeek upstream error: 502 bad gateway` 是预期行为。

## 产品特点

- 移动端优先，适合老师课后在手机上操作。
- 使用底部导航，主流程只有“写反馈”和“我的格式”。
- 结果页独立展示，避免复制时误触底部导航。
- UI 采用 iOS 风格卡片、分段控件、chip、toast、圆角按钮。
- 默认不做复杂账号系统，降低验证成本。
- AI 只增强内容表达，不控制老师的最终发送格式。
- 常用学生和班级优先，核心目标是减少老师每天重复输入。

## 下一步迭代建议

当前最值得继续打磨的是“学生资产”和“一对一连续跟进”：

1. 常用班级管理增强：重命名、删除确认、隐藏学生、组内学生编辑。
2. 一对一学生历史页：按学生集中查看最近反馈和卡点变化。
3. 基于上次反馈继续生成的质量评估：避免复读、避免编造进步。
4. 微信内置浏览器兼容测试：复制、文件导入/导出、localStorage 稳定性。
5. 真实收款验证：将 9.9 预定入口和 docs 中的收款登记流程打通。
6. 如果出现跨设备需求，再考虑账号和云同步。

## 验证计划

- 短期：找 30 个初高中数学老师/机构老师试用。
- 免费服务 10 个真实老师，观察是否第二天继续使用。
- 目标：拿到 5 个 9.9 预定。
- 如果 2 周内有明确付费信号，再继续做账号、云同步、更多学科或小程序。
