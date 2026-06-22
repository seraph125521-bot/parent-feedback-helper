const fs = require("node:fs");
const path = require("node:path");

const SOURCE_DIR = path.resolve(
  process.env.PFH_WEB_SOURCE || path.join(__dirname, "..", "..", "parent-feedback-helper")
);
const TARGET_DIR = path.resolve(__dirname, "..", "renderer");

const STATIC_FILES = [
  "index.html",
  "styles.css",
  "usageLogger.js",
  "subjectConfig.js",
  "templateEngine.js",
  "llm.js",
  "studentAssets.js",
  "historySubject.js",
  "copyFormat.js",
  "generator.js",
  "app.js",
];

const DESKTOP_RUNTIME_CONFIG = `/*
 * Desktop runtime configuration.
 *
 * Electron loads the renderer from file://, so browser-relative /api/generate
 * cannot reach the original web serverless route. Keep API keys server-side by
 * calling the deployed CloudBase HTTP functions instead.
 */
window.PFH_CONFIG = {
  apiEndpoint: "https://parentfeedback-d5gfdmo492032c24d.service.tcloudbase.com/generate",
  usageLogEndpoint: "https://parentfeedback-d5gfdmo492032c24d.service.tcloudbase.com/usage"
};
`;

function assertSourceFile(fileName) {
  const sourcePath = path.join(SOURCE_DIR, fileName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source file: ${sourcePath}`);
  }
  return sourcePath;
}

function copyStaticFile(fileName) {
  const sourcePath = assertSourceFile(fileName);
  const targetPath = path.join(TARGET_DIR, fileName);
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`copied ${fileName}`);
}

function syncRenderer() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Web source directory does not exist: ${SOURCE_DIR}`);
  }

  fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  STATIC_FILES.forEach(copyStaticFile);
  fs.writeFileSync(path.join(TARGET_DIR, "runtime-config.js"), DESKTOP_RUNTIME_CONFIG, "utf8");
  console.log("wrote runtime-config.js for CloudBase desktop endpoints");
  console.log(`renderer synced from ${SOURCE_DIR}`);
}

syncRenderer();
