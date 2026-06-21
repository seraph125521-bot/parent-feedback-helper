# CloudBase 部署说明

本项目保留原有 Vercel 部署，同时新增 CloudBase 部署入口。两套入口共用前端代码，区别只在 AI 代理接口：

- Vercel：前端默认请求 `/api/generate`，由 `api/generate.js` 转发到 DeepSeek。
- CloudBase：前端通过 `runtime-config.js` 请求 CloudBase HTTP Function，由 `cloudfunctions/generate` 转发到 DeepSeek。

## 目录说明

```text
runtime-config.js
  默认运行时配置。仓库版本为空配置，Vercel 会继续回退到 /api/generate。

cloudfunctions/generate/
  CloudBase HTTP Function 版 DeepSeek 代理。

cloudbaserc.json
  CloudBase CLI 部署配置，固定 EnvId、函数根目录和非敏感环境变量。

scripts/prepare-cloudbase-static.js
  生成 CloudBase 静态托管发布目录 .cloudbase-dist/，并写入 CloudBase 函数地址。
```

## 环境变量

CloudBase HTTP Function 需要配置以下环境变量：

```text
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

可选防护参数与 Vercel 版本保持一致：

```text
RATE_LIMIT_PER_MINUTE=30
RATE_LIMIT_PER_HOUR=300
MAX_MESSAGES=12
MAX_CONTENT_CHARS=4000
MAX_TOKENS_CAP=800
UPSTREAM_TIMEOUT_MS=30000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_COOLDOWN_MS=60000
```

不要把真实 `DEEPSEEK_API_KEY` 写入仓库。

## 部署流程

### 1. 确认 CloudBase 环境

使用 CloudBase MCP 或控制台确认已登录，并记录明确的 `EnvId`。后续所有 CloudBase 操作都应使用这个完整 `EnvId`，不要依赖默认环境。

### 2. 部署 HTTP Function

函数目录：

```text
cloudfunctions/generate
```

运行模型：

- 类型：HTTP Function
- Runtime：Node.js 18
- 监听端口：`9000`
- 启动脚本：`scf_bootstrap`

函数必须允许静态站点匿名调用，否则浏览器请求会遇到 `EXCEED_AUTHORITY`。如果使用 CloudBase MCP，优先通过权限管理工具配置函数公开访问。

`scf_bootstrap` 必须使用 LF 换行并具备可执行权限。仓库通过 `.gitattributes` 固定该文件为 LF，避免 Windows 环境把 shebang 写成 CRLF 后导致云端报：

```text
[./scf_bootstrap] no such file or directory
```

如果 MCP 目录上传没有正确处理启动脚本，可用 CloudBase CLI 兜底覆盖部署函数代码：

```bash
npx -p @cloudbase/cli@latest tcb fn deploy generate --force --httpFn --runtime Nodejs18.15 --dir cloudfunctions/generate --json
```

网关路径 `/generate` 已存在时，不要再带 `--path /generate`，否则会提示路径已被占用。

### 3. 生成 CloudBase 静态发布目录

拿到 HTTP Function 公网地址后，在本地生成静态发布目录：

```bash
node scripts/prepare-cloudbase-static.js --api-endpoint=https://your-cloudbase-function-url
```

输出目录：

```text
.cloudbase-dist/
```

这个目录里的 `runtime-config.js` 会被替换为：

```js
window.PFH_CONFIG = {
  apiEndpoint: "https://your-cloudbase-function-url"
};
```

### 4. 发布静态站点

把 `.cloudbase-dist/` 发布到 CloudBase Web 应用或静态托管入口。首次创建 Web 应用时，优先使用 CloudBase MCP 的 `manageApps(action="createApp")` 创建独立访问域名；已有应用后再走更新发布。

## 验证

本地验证：

```bash
node --check api/generate.js
node --check llm.js
node --check cloudfunctions/generate/index.js
node --check scripts/prepare-cloudbase-static.js
node tests/template-engine.test.js
node tests/generator-template.test.js
node tests/api-security.test.js
```

平台验证：

1. 打开 Vercel 地址，确认页面仍可加载，AI 请求仍走 `/api/generate`。
2. 打开 CloudBase 地址，确认页面可加载。
3. 在 CloudBase 地址开启 AI，生成一条反馈，确认请求命中 CloudBase HTTP Function 且能返回点评。

## 回滚

- Vercel 不受 CloudBase 入口影响，出现 CloudBase 部署问题时可以继续使用 Vercel 地址。
- 如果 CloudBase 静态站点接口地址配置错误，重新运行 `scripts/prepare-cloudbase-static.js` 生成 `.cloudbase-dist/` 并重新发布即可。
- 如果函数异常，先在 CloudBase 控制台或 MCP 查询函数日志，再回滚函数代码到上一版。
