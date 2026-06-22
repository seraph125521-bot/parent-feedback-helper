// Keep this preload as the only future bridge between Electron and the renderer.
// The current MVP intentionally exposes no Node.js or Electron APIs to the page.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.desktopShell = "electron";
});
