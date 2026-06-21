/*
 * DeepSeek proxy for CloudBase HTTP Function.
 * ------------------------------------------------------------------
 * Runtime model: standard HTTP server listening on port 9000.
 * The browser calls this function from CloudBase static hosting, while
 * DEEPSEEK_API_KEY stays in CloudBase environment variables.
 * ------------------------------------------------------------------
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

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
const MAX_BODY_BYTES = 128 * 1024;
const PORT = 9000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const rateBuckets = new Map();
const circuitBreaker = {
  failures: 0,
  openedUntil: 0,
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendOptions(res);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "只支持 POST 请求" }, { Allow: "POST" });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    sendJson(res, 503, { error: "服务端未配置 DEEPSEEK_API_KEY" });
    return;
  }

  const config = getConfig();
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, err.statusCode || 400, { error: err.message || "请求体不是合法 JSON" });
    return;
  }
  body = body || {};

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    sendJson(res, 400, { error: "messages 不能为空" });
    return;
  }
  if (messages.length > config.maxMessages) {
    sendJson(res, 400, { error: "messages 数量过多" });
    return;
  }

  const rate = checkRateLimit(getClientIp(req), config);
  if (!rate.allowed) {
    sendJson(
      res,
      429,
      {
        code: "RATE_LIMITED",
        error: "请求太频繁，请稍后再试",
        retryAfter: rate.retryAfter,
      },
      { "Retry-After": String(rate.retryAfter) },
    );
    return;
  }

  if (isCircuitOpen()) {
    sendJson(res, 503, {
      code: "CIRCUIT_OPEN",
      error: "AI 服务暂时繁忙，请稍后再试",
    });
    return;
  }

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

  try {
    const upstream = await requestJson(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: safeMessages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      },
      {
        Authorization: `Bearer ${apiKey}`,
      },
      config.upstreamTimeoutMs,
    );

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      console.error("DeepSeek upstream error:", upstream.statusCode, upstream.text.slice(0, 500));
      recordFailure(config);
      sendJson(res, 502, { error: `大模型服务返回 ${upstream.statusCode}` });
      return;
    }

    let data;
    try {
      data = JSON.parse(upstream.text);
    } catch (err) {
      recordFailure(config);
      sendJson(res, 502, { error: "大模型返回不是合法 JSON" });
      return;
    }

    const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "");
    if (!text) {
      recordFailure(config);
      sendJson(res, 502, { error: "大模型返回为空" });
      return;
    }

    recordSuccess();
    sendJson(res, 200, {
      text,
      model: data.model || model,
      usage: data.usage || null,
    });
  } catch (err) {
    const timedOut = err && err.code === "UPSTREAM_TIMEOUT";
    console.error("DeepSeek proxy failed:", err);
    recordFailure(config);
    sendJson(res, timedOut ? 504 : 500, { error: timedOut ? "大模型请求超时" : "大模型请求失败" });
  }
});

server.listen(PORT, () => {
  console.log(`CloudBase DeepSeek proxy listening on ${PORT}`);
});

function sendOptions(res) {
  res.writeHead(204, CORS_HEADERS);
  res.end();
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
    ...headers,
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(withStatus(new Error("请求体过大"), 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(withStatus(new Error("请求体不是合法 JSON"), 400));
      }
    });

    req.on("error", (err) => reject(err));
  });
}

function requestJson(url, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const transport = parsed.protocol === "http:" ? http : https;

    const req = transport.request(
      parsed,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (resp) => {
        const chunks = [];
        resp.on("data", (chunk) => chunks.push(chunk));
        resp.on("end", () => {
          resolve({
            statusCode: resp.statusCode || 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      const err = new Error("Upstream timeout");
      err.code = "UPSTREAM_TIMEOUT";
      req.destroy(err);
    });
    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });
}

function withStatus(error, statusCode) {
  error.statusCode = statusCode;
  return error;
}

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
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
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
