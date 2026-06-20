const assert = require("assert");

const API_PATH = "../api/generate.js";

function loadHandler(env = {}) {
  delete require.cache[require.resolve(API_PATH)];
  const previousEnv = { ...process.env };
  process.env = {
    ...previousEnv,
    DEEPSEEK_API_KEY: "sk-test",
    RATE_LIMIT_PER_MINUTE: "99",
    RATE_LIMIT_PER_HOUR: "99",
    CIRCUIT_BREAKER_THRESHOLD: "99",
    CIRCUIT_BREAKER_COOLDOWN_MS: "1000",
    ...env,
  };
  const handler = require(API_PATH);
  return handler;
}

function makeReq(body, headers = {}) {
  return {
    method: "POST",
    headers,
    socket: { remoteAddress: "127.0.0.1" },
    body,
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function call(handler, req) {
  const res = makeRes();
  await handler(req, res);
  return res;
}

function mockFetchSuccess() {
  global.fetch = async (url, options) => ({
    ok: true,
    json: async () => ({
      model: "deepseek-chat",
      choices: [{ message: { content: "生成内容" } }],
      usage: { total_tokens: 12 },
    }),
    text: async () => "",
    _url: url,
    _options: options,
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

(async () => {
  await test("rejects non-POST requests", async () => {
    const handler = loadHandler();
    const res = await call(handler, { method: "GET", headers: {}, body: null });
    assert.strictEqual(res.statusCode, 405);
    assert.strictEqual(res.headers.allow, "POST");
  });

  await test("rejects requests without server API key", async () => {
    delete require.cache[require.resolve(API_PATH)];
    const previousEnv = { ...process.env };
    delete process.env.DEEPSEEK_API_KEY;
    const handler = require(API_PATH);
    const res = await call(handler, makeReq({ messages: [{ role: "user", content: "hi" }] }));
    process.env = previousEnv;
    assert.strictEqual(res.statusCode, 503);
  });

  await test("clamps and sanitizes upstream payload", async () => {
    let payload = null;
    global.fetch = async (url, options) => {
      payload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "ok" } }] }),
        text: async () => "",
      };
    };

    const handler = loadHandler({ MAX_CONTENT_CHARS: "8", MAX_TOKENS_CAP: "100" });
    const res = await call(handler, makeReq({
      messages: [{ role: "bad-role", content: "1234567890" }],
      temperature: 5,
      max_tokens: 500,
      unexpected: "ignored",
    }));

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(payload.messages[0].role, "user");
    assert.strictEqual(payload.messages[0].content, "12345678");
    assert.strictEqual(payload.temperature, 2);
    assert.strictEqual(payload.max_tokens, 100);
    assert.strictEqual(payload.unexpected, undefined);
  });

  await test("rate limits repeated requests from the same IP", async () => {
    mockFetchSuccess();
    const handler = loadHandler({ RATE_LIMIT_PER_MINUTE: "1", RATE_LIMIT_PER_HOUR: "10" });
    const body = { messages: [{ role: "user", content: "hi" }] };

    const first = await call(handler, makeReq(body, { "x-forwarded-for": "203.0.113.10" }));
    const second = await call(handler, makeReq(body, { "x-forwarded-for": "203.0.113.10" }));

    assert.strictEqual(first.statusCode, 200);
    assert.strictEqual(second.statusCode, 429);
    assert.strictEqual(second.body.code, "RATE_LIMITED");
  });

  await test("opens circuit after repeated upstream failures", async () => {
    global.fetch = async () => ({
      ok: false,
      status: 502,
      json: async () => ({}),
      text: async () => "bad gateway",
    });

    const handler = loadHandler({
      RATE_LIMIT_PER_MINUTE: "20",
      RATE_LIMIT_PER_HOUR: "20",
      CIRCUIT_BREAKER_THRESHOLD: "2",
      CIRCUIT_BREAKER_COOLDOWN_MS: "60000",
    });
    const body = { messages: [{ role: "user", content: "hi" }] };

    const first = await call(handler, makeReq(body, { "x-forwarded-for": "203.0.113.20" }));
    const second = await call(handler, makeReq(body, { "x-forwarded-for": "203.0.113.21" }));
    const third = await call(handler, makeReq(body, { "x-forwarded-for": "203.0.113.22" }));

    assert.strictEqual(first.statusCode, 502);
    assert.strictEqual(second.statusCode, 502);
    assert.strictEqual(third.statusCode, 503);
    assert.strictEqual(third.body.code, "CIRCUIT_OPEN");
  });

  delete global.fetch;
  console.log("api-security ok");
})().catch((err) => {
  delete global.fetch;
  console.error(err);
  process.exit(1);
});
