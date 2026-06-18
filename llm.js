/*
 * Frontend LLM client (PFH_LLM)
 * ------------------------------------------------------------------
 * This GitHub Pages build calls DeepSeek directly from the browser.
 * WARNING: the API key is visible in page source. Use only for temporary tests.
 *
 * Exposes: window.PFH_LLM
 *   isEnabled()              Whether AI generation is enabled
 *   setEnabled(boolean)      Persist toggle state to localStorage
 *   complete(messages, opts) Returns Promise<string>
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  const ENABLE_KEY = "pfh_llm_enabled_v1";
  const ENDPOINT = "https://api.deepseek.com/chat/completions";
  const DEFAULT_TIMEOUT = 30000;
  const API_KEY = "sk-680519d42cf9450cb0b710f3ce691f2c";

  let enabled = false;
  try {
    enabled = localStorage.getItem(ENABLE_KEY) === "1";
  } catch (e) {}

  function isEnabled() {
    return enabled;
  }

  function setEnabled(value) {
    enabled = !!value;
    try {
      localStorage.setItem(ENABLE_KEY, enabled ? "1" : "0");
    } catch (e) {}
    return enabled;
  }

  async function complete(messages, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages,
          temperature: options.temperature != null ? options.temperature : 0.7,
          max_tokens: options.max_tokens != null ? options.max_tokens : 400,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const detail = await safeJson(resp);
        throw new Error((detail && detail.error && detail.error.message) || `服务返回 ${resp.status}`);
      }

      const data = await resp.json();
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text || !text.trim()) throw new Error("大模型返回为空");
      return text.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async function safeJson(resp) {
    try {
      return await resp.json();
    } catch (e) {
      return null;
    }
  }

  window.PFH_LLM = { isEnabled, setEnabled, complete, ENDPOINT };
})();