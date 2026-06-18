/*
 * 前端大模型客户端（PFH_LLM）
 * ------------------------------------------------------------------
 * 只负责把对话消息发给服务端代理 /api/generate，再拿回纯文本。
 * 密钥永远不在这里，前端只持有一个「是否开启 AI」的开关状态。
 *
 * 暴露：window.PFH_LLM
 *   isEnabled()              当前是否开启 AI 生成
 *   setEnabled(boolean)      切换并持久化到 localStorage
 *   complete(messages, opts) 返回 Promise<string>（点评正文）
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  const ENABLE_KEY = "pfh_llm_enabled_v1";
  const ENDPOINT = "/api/generate";
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          temperature: options.temperature != null ? options.temperature : 0.7,
          max_tokens: options.max_tokens != null ? options.max_tokens : 400,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const detail = await safeJson(resp);
        throw new Error((detail && detail.error) || `服务返回 ${resp.status}`);
      }

      const data = await resp.json();
      const text = (data && data.text) || "";
      if (!text.trim()) throw new Error("大模型返回为空");
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
