(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PFH_COPY_FORMAT = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function formatResultsForCopy(results, options = {}) {
    const mode = options.mode || "class";
    const includeName = options.includeName != null ? !!options.includeName : mode !== "one";
    const rows = (Array.isArray(results) ? results : [])
      .map((item) => ({
        name: String(item && item.name || "").trim() || "学生",
        text: String(item && item.text || "").trim(),
      }))
      .filter((item) => item.text);

    return rows
      .map((item) => includeName ? `【${item.name}】\n${item.text}` : item.text)
      .join("\n\n");
  }

  return { formatResultsForCopy };
});
