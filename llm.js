/*
 * Frontend LLM client (PFH_LLM)
 * ------------------------------------------------------------------
 * This GitHub Pages build calls an LLM provider directly from the browser.
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
  const DEFAULT_TIMEOUT = 30000;

  // Change this to "zhipu" after filling Zhipu's API key below.
  const ACTIVE_PROVIDER = "deepseek";

  const PROVIDERS = {
    deepseek: {
      name: "DeepSeek",
      endpoint: "https://api.deepseek.com/chat/completions",
      model: "deepseek-chat",
      apiKey: "sk-24478a24451d471ba17da93accfd996a",
    },
    zhipu: {
      name: "Zhipu AI",
      endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      model: "glm-4-flash",
      apiKey: "这里填入你的智谱AI_API_Key",
    },
  };

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
    const provider = PROVIDERS[ACTIVE_PROVIDER] || PROVIDERS.deepseek;
    if (!provider.apiKey || provider.apiKey.includes("这里填入")) {
      throw new Error(`${provider.name} API Key 未配置`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
    try {
      const resp = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: options.temperature != null ? options.temperature : 0.7,
          max_tokens: options.max_tokens != null ? options.max_tokens : 400,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const detail = await safeJson(resp);
        throw new Error(readErrorMessage(detail) || `${provider.name} 服务返回 ${resp.status}`);
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

  function readErrorMessage(detail) {
    if (!detail) return "";
    if (typeof detail.error === "string") return detail.error;
    return (detail.error && detail.error.message) || detail.message || "";
  }

  function getProviderInfo() {
    const provider = PROVIDERS[ACTIVE_PROVIDER] || PROVIDERS.deepseek;
    return {
      key: ACTIVE_PROVIDER,
      name: provider.name,
      endpoint: provider.endpoint,
      model: provider.model,
    };
  }

  window.PFH_LLM = {
    isEnabled,
    setEnabled,
    complete,
    getProviderInfo,
    ENDPOINT: (PROVIDERS[ACTIVE_PROVIDER] || PROVIDERS.deepseek).endpoint,
  };
})();