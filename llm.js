/*
 * Frontend LLM client (PFH_LLM)
 * ------------------------------------------------------------------
 * Calls the serverless proxy: POST /api/generate
 * API Key must stay on server-side env vars (Vercel).
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
  const API_ENDPOINT = "/api/generate";
  const DEFAULT_TIMEOUT = 30000;

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
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages 不能为空");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
    try {
      const resp = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          temperature: options.temperature != null ? options.temperature : 0.7,
          max_tokens: options.max_tokens != null ? options.max_tokens : 400,
        }),
        signal: controller.signal,
      });

      const detail = await safeJson(resp);
      if (!resp.ok) {
        const err = new Error(readErrorMessage(detail) || `服务端代理返回 ${resp.status}`);
        err.status = resp.status;
        err.code = (detail && detail.code) || statusToCode(resp.status);
        throw err;
      }

      const text = detail && typeof detail.text === "string" ? detail.text.trim() : "";
      if (!text || !text.trim()) throw new Error("大模型返回为空");
      return text;
    } catch (err) {
      const aborted = err && err.name === "AbortError";
      const next = new Error(aborted ? "大模型请求超时" : (err && err.message) || "大模型请求失败");
      next.status = err && err.status;
      next.code = aborted ? "TIMEOUT" : (err && err.code) || "NETWORK_ERROR";
      throw next;
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

  function statusToCode(status) {
    if (status === 429) return "RATE_LIMITED";
    if (status === 503) return "CIRCUIT_OPEN";
    if (status === 504) return "TIMEOUT";
    return "UPSTREAM_ERROR";
  }

  function getProviderInfo() {
    return {
      key: "server-proxy",
      name: "DeepSeek (Server Proxy)",
      endpoint: API_ENDPOINT,
      model: "deepseek-chat",
    };
  }

  window.PFH_LLM = {
    isEnabled,
    setEnabled,
    complete,
    getProviderInfo,
    ENDPOINT: API_ENDPOINT,
  };
})();