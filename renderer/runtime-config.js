/*
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
