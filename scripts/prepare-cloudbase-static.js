/*
 * Prepare a CloudBase static publish directory.
 *
 * Usage:
 *   node scripts/prepare-cloudbase-static.js --api-endpoint=https://example.com/generate
 *
 * Output:
 *   .cloudbase-dist/
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".cloudbase-dist");
const STATIC_FILES = [
  "index.html",
  "styles.css",
  "runtime-config.js",
  "templateEngine.js",
  "llm.js",
  "studentAssets.js",
  "copyFormat.js",
  "generator.js",
  "app.js",
];

function main() {
  const apiEndpoint = readArg("api-endpoint") || process.env.CLOUDBASE_API_ENDPOINT || "";
  if (!apiEndpoint) {
    console.error("缺少 CloudBase 函数地址：请传入 --api-endpoint=... 或设置 CLOUDBASE_API_ENDPOINT");
    process.exit(1);
  }

  recreateDir(OUT_DIR);
  for (const file of STATIC_FILES) {
    copyFile(file);
  }
  copyDirIfExists("docs/images");
  writeRuntimeConfig(apiEndpoint);

  console.log(`CloudBase 静态发布目录已生成：${OUT_DIR}`);
  console.log(`AI 接口地址：${apiEndpoint}`);
}

function readArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : "";
}

function recreateDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(file) {
  const src = path.join(ROOT, file);
  const dest = path.join(OUT_DIR, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirIfExists(dir) {
  const src = path.join(ROOT, dir);
  if (!fs.existsSync(src)) return;
  const dest = path.join(OUT_DIR, dir);
  fs.cpSync(src, dest, { recursive: true });
}

function writeRuntimeConfig(apiEndpoint) {
  const config = [
    "window.PFH_CONFIG = {",
    `  apiEndpoint: ${JSON.stringify(apiEndpoint)}`,
    "};",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "runtime-config.js"), config, "utf8");
}

main();
