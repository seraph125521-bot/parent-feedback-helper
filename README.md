# 课后反馈助手 Electron 桌面版

这是 `parent-feedback-helper` 的独立 Electron 桌面版 MVP。原 Web 项目仍保留在 `d:\Desktop\parent-feedback-helper`，本项目只从原项目读取并同步静态前端文件，不把 Electron 配置混入原 Web 项目。

## 项目结构

```text
parent-feedback-helper-electron/
  package.json
  src/
    main.js
    preload.js
  renderer/
    index.html
    *.js
    styles.css
  scripts/
    sync-renderer.js
```

`renderer/` 由同步脚本生成，来源是原 Web 项目的静态文件。桌面版会覆盖 `renderer/runtime-config.js`，让 AI 和使用日志请求指向 CloudBase 线上 HTTP 函数。

## 同步 Web 静态文件

默认从相邻目录 `d:\Desktop\parent-feedback-helper` 同步：

```bash
npm run sync
```

如果原 Web 项目移动了位置，可以临时指定来源：

```bash
set PFH_WEB_SOURCE=d:\path\to\parent-feedback-helper
npm run sync
```

同步脚本只复制白名单静态文件：`index.html`、`styles.css`、前端 JS 模块和本地模板相关文件。它不会读取或打包 `.env`、服务端函数代码、DeepSeek API Key。

## 本地启动

首次安装依赖：

```bash
npm install
```

同步 renderer：

```bash
npm run sync
```

启动桌面版：

```bash
npm start
```

## 打包 Windows

```bash
npm run build:win
```

打包产物输出到 `dist/`。当前配置使用 `electron-builder` 的 Windows `nsis` target。

## 数据存储

桌面版继续复用原前端的 `localStorage` 设计，表单草稿、历史记录、常用学生/班级和 AI 开关都保存在 Electron 应用自己的浏览器存储中。它和原浏览器 Web 版的 localStorage 不共享。

主要 key 与原 Web 版一致：

- `pfh_multi_subject_state_v1`
- `pfh_llm_enabled_v1`
- `pfh_history_v1`
- `pfh_student_assets_v1`
- `pfh_payment_prompt_v1`

在 Windows 上，Electron 应用数据通常位于用户目录下的应用数据路径，由 Electron/Chromium 管理。

## AI 与使用日志

桌面版不包含 DeepSeek API Key。AI 生成由 renderer 通过 HTTPS 调用 CloudBase：

```text
https://parentfeedback-d5gfdmo492032c24d.service.tcloudbase.com/generate
```

使用日志也指向 CloudBase：

```text
https://parentfeedback-d5gfdmo492032c24d.service.tcloudbase.com/usage
```

如果网络不可用或 CloudBase 函数异常，原前端逻辑会自动回退到本地模板生成。

## 安全边界

Electron 窗口显式设置：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`

`src/preload.js` 当前不暴露任何 Node.js 或 Electron API，只保留未来需要桌面能力时的安全扩展点。

## 文档依据

- Electron `BrowserWindow.loadFile()` 与 `webPreferences`：https://electronjs.org/docs/latest/api/browser-window
- Electron `nodeIntegration`、`contextIsolation`、`preload`：https://electronjs.org/docs/latest/api/structures/web-preferences
- electron-builder `package.json` 顶层 `build` 配置：https://www.electron.build/configuration
