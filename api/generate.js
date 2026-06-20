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
const DEFAULT_MAX_MESSAGES = 12;
const DEFAULT_MAX_CONTENT_CHARS = 4000;
const DEFAULT_MAX_TOKENS_CAP = 800;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 30000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
const DEFAULT_RATE_LIMIT_PER_HOUR = 300;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS = 60000;

const rateBuckets = new Map();
const circuitBreaker = {
  failures: 0,
  openedUntil: 0,
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "只支持 POST 请求" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "服务端未配置 DEEPSEEK_API_KEY" });
  }

  const config = getConfig();

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
  if (messages.length > config.maxMessages) {
    return res.status(400).json({ error: "messages 数量过多" });
  }

  const rate = checkRateLimit(getClientIp(req), config);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfter));
    return res.status(429).json({
      code: "RATE_LIMITED",
      error: "请求太频繁，请稍后再试",
      retryAfter: rate.retryAfter,
    });
  }

  if (isCircuitOpen()) {
    return res.status(503).json({
      code: "CIRCUIT_OPEN",
      error: "AI 服务暂时繁忙，请稍后再试",
    });
  }

  // 只透传必要字段，避免把任意参数注入上游
  const safeMessages = messages
    .filter((m) => m && typeof m.content === "string")
    .map((m) => ({
      role: ["system", "user", "assistant"].includes(m.role) ? m.role : "user",
      content: String(m.content).slice(0, config.maxContentChars),
    }));

  const temperature = clampNumber(body.temperature, 0, 2, 0.7);
  const maxTokens = clampNumber(body.max_tokens, 1, config.maxTokensCap, 400);

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);

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
      recordFailure(config);
      return res.status(502).json({ error: `大模型服务返回 ${upstream.status}` });
    }

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      recordFailure(config);
      return res.status(502).json({ error: "大模型返回为空" });
    }

    recordSuccess();

    return res.status(200).json({
      text,
      model: data.model || model,
      usage: data.usage || null,
    });
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    console.error("DeepSeek proxy failed:", err);
    recordFailure(config);
    return res
      .status(aborted ? 504 : 500)
      .json({ error: aborted ? "大模型请求超时" : "大模型请求失败" });
  } finally {
    clearTimeout(timer);
  }
};

function getConfig() {
  return {
    maxMessages: readIntEnv("MAX_MESSAGES", DEFAULT_MAX_MESSAGES, 1, 50),
    maxContentChars: readIntEnv("MAX_CONTENT_CHARS", DEFAULT_MAX_CONTENT_CHARS, 1, 12000),
    maxTokensCap: readIntEnv("MAX_TOKENS_CAP", DEFAULT_MAX_TOKENS_CAP, 50, 4000),
    upstreamTimeoutMs: readIntEnv("UPSTREAM_TIMEOUT_MS", DEFAULT_UPSTREAM_TIMEOUT_MS, 1000, 60000),
    rateLimitPerMinute: readIntEnv("RATE_LIMIT_PER_MINUTE", DEFAULT_RATE_LIMIT_PER_MINUTE, 1, 1000),
    rateLimitPerHour: readIntEnv("RATE_LIMIT_PER_HOUR", DEFAULT_RATE_LIMIT_PER_HOUR, 1, 10000),
    circuitBreakerThreshold: readIntEnv("CIRCUIT_BREAKER_THRESHOLD", DEFAULT_CIRCUIT_BREAKER_THRESHOLD, 1, 50),
    circuitBreakerCooldownMs: readIntEnv("CIRCUIT_BREAKER_COOLDOWN_MS", DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS, 1000, 600000),
  };
}

function readIntEnv(name, fallback, min, max) {
  const n = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function getClientIp(req) {
  const forwarded = req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"]);
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers && (req.headers["x-real-ip"] || req.headers["X-Real-IP"]);
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function checkRateLimit(ip, config) {
  const now = Date.now();
  const key = ip || "unknown";
  const bucket = rateBuckets.get(key) || {
    minuteStart: now,
    minuteCount: 0,
    hourStart: now,
    hourCount: 0,
  };

  if (now - bucket.minuteStart >= 60000) {
    bucket.minuteStart = now;
    bucket.minuteCount = 0;
  }
  if (now - bucket.hourStart >= 3600000) {
    bucket.hourStart = now;
    bucket.hourCount = 0;
  }

  if (bucket.minuteCount >= config.rateLimitPerMinute) {
    rateBuckets.set(key, bucket);
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((60000 - (now - bucket.minuteStart)) / 1000)) };
  }
  if (bucket.hourCount >= config.rateLimitPerHour) {
    rateBuckets.set(key, bucket);
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((3600000 - (now - bucket.hourStart)) / 1000)) };
  }

  bucket.minuteCount += 1;
  bucket.hourCount += 1;
  rateBuckets.set(key, bucket);
  pruneRateBuckets(now);
  return { allowed: true, retryAfter: 0 };
}

function pruneRateBuckets(now) {
  if (rateBuckets.size < 500) return;
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.hourStart > 3600000) rateBuckets.delete(key);
  }
}

function isCircuitOpen() {
  return circuitBreaker.openedUntil > Date.now();
}

function recordSuccess() {
  circuitBreaker.failures = 0;
  circuitBreaker.openedUntil = 0;
}

function recordFailure(config) {
  circuitBreaker.failures += 1;
  if (circuitBreaker.failures >= config.circuitBreakerThreshold) {
    circuitBreaker.openedUntil = Date.now() + config.circuitBreakerCooldownMs;
  }
}

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
