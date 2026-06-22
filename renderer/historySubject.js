(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PFH_HISTORY_SUBJECT = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function withSnapshotCategory(snapshot, itemSubject, currentCategory) {
    const base = snapshot && typeof snapshot === "object" ? snapshot : {};
    const category = String(base.category || itemSubject || currentCategory || "数学").trim() || "数学";
    return {
      ...base,
      category,
    };
  }

  return {
    withSnapshotCategory,
  };
});
