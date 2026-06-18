/*
 * 鍓嶇澶фā鍨嬪鎴风锛圥FH_LLM锛?
 * ------------------------------------------------------------------
 * 鍙礋璐ｆ妸瀵硅瘽娑堟伅鍙戠粰鏈嶅姟绔唬鐞?/api/generate锛屽啀鎷垮洖绾枃鏈€?
 * 瀵嗛挜姘歌繙涓嶅湪杩欓噷锛屽墠绔彧鎸佹湁涓€涓€屾槸鍚﹀紑鍚?AI銆嶇殑寮€鍏崇姸鎬併€?
 *
 * 鏆撮湶锛歸indow.PFH_LLM
 *   isEnabled()              褰撳墠鏄惁寮€鍚?AI 鐢熸垚
 *   setEnabled(boolean)      鍒囨崲骞舵寔涔呭寲鍒?localStorage
 *   complete(messages, opts) 杩斿洖 Promise<string>锛堢偣璇勬鏂囷級
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  const ENABLE_KEY = "pfh_llm_enabled_v1";
  const ENDPOINT = "https://api.deepseek.com/chat/completions";
  const DEFAULT_TIMEOUT = 30000;
  // 鈿狅笍 璀﹀憡锛氫粎闄愭湰鍦版祴璇曟垨鍐呴儴浣跨敤锛岀粷瀵逛笉瑕佹妸甯︽湁鐪熷疄 Key 鐨勪唬鐮佸叕寮€鍒嗕韩锛?
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
          "Authorization": `Bearer ${API_KEY}`
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
        throw new Error((detail && detail.error && detail.error.message) || `鏈嶅姟杩斿洖 ${resp.status}`);
      }

      const data = await resp.json();
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text || !text.trim()) throw new Error("澶фā鍨嬭繑鍥炰负绌?);
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

