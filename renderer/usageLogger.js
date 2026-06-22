(function () {
  "use strict";

  const SESSION_KEY = "pfh_usage_session_v1";

  function getEndpoint() {
    const config = window.PFH_CONFIG || {};
    const endpoint = typeof config.usageLogEndpoint === "string" ? config.usageLogEndpoint.trim() : "";
    return endpoint;
  }

  function getSessionId() {
    try {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const next = createEventId("s");
      sessionStorage.setItem(SESSION_KEY, next);
      return next;
    } catch (e) {
      return createEventId("s");
    }
  }

  function createEventId(prefix = "e") {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
  }

  function track(event, fields = {}) {
    const endpoint = getEndpoint();
    const clientEventId = fields.clientEventId || createEventId("e");
    if (!endpoint) return clientEventId;

    const payload = {
      ...fields,
      event,
      clientEventId,
      sessionId: getSessionId(),
    };
    const body = JSON.stringify(payload);

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) return clientEventId;
      }
    } catch (e) {}

    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}

    return clientEventId;
  }

  window.PFH_USAGE = {
    track,
    createEventId,
  };
})();
