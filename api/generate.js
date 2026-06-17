/*
 * DeepSeek 代理（Vercel Serverless Function）
 * ------------------------------------------------------------------
 * 作用：把前端发来的对话消息转发给 DeepSeek，密钥只存在于服务端环境变量，
 *       前端永远拿不到。前端请求路径：POST /api/generate
 *
 * 需要的环境变量（在 Vercel 项目 Settings → Environment Variables 配置）：
 *   DEEPSEEK_API_KEY   必填，DeepSeek 控制台申请的 sk-xxx
 *   DEEPSEEK_MODEL     选填，默认 deepseek-chat
 *   DEEPSEEK_BASE_URL  选填，默认 https://api.deepseek.com
 *
 * 本地调试：用 `vercel dev` 启动即可命中此函数；纯静态服务器（python -m http.server）
 *           下没有该接口，前端会自动回退到本地模板生成。
 * ------------------------------------------------------------------
 */

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const MAX_MESSAGES = 12;
const MAX_TOKENS_CAP = 800;
const UPSTREAM_TIMEOUT_MS = 30000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "只支持 POST 请求" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "服务端未配置 DEEPSEEK_API_KEY" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: "请求体不是合法 JSON" });
    }
  }
  body = body || {};

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "messages 不能为空" });
  }
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: "messages 数量过多" });
  }

  // 只透传必要字段，避免把任意参数注入上游
  const safeMessages = messages
    .filter((m) => m && typeof m.content === "string")
    .map((m) => ({
      role: ["system", "user", "assistant"].includes(m.role) ? m.role : "user",
      content: String(m.content).slice(0, 4000),
    }));

  const temperature = clampNumber(body.temperature, 0, 2, 0.7);
  const maxTokens = clampNumber(body.max_tokens, 1, MAX_TOKENS_CAP, 400);

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: safeMessages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const detail = await safeReadText(upstream);
      console.error("DeepSeek upstream error:", upstream.status, detail);
      return res.status(502).json({ error: `大模型服务返回 ${upstream.status}` });
    }

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      return res.status(502).json({ error: "大模型返回为空" });
    }

    return res.status(200).json({
      text,
      model: data.model || model,
      usage: data.usage || null,
    });
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    console.error("DeepSeek proxy failed:", err);
    return res
      .status(aborted ? 504 : 500)
      .json({ error: aborted ? "大模型请求超时" : "大模型请求失败" });
  } finally {
    clearTimeout(timer);
  }
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function safeReadText(resp) {
  try {
    return (await resp.text()).slice(0, 500);
  } catch (e) {
    return "";
  }
}
