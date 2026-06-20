(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PFH_STUDENT_ASSETS = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function createEmptyAssets() {
    return { version: 1, students: [], groups: [] };
  }

  function normalizeAssets(input) {
    const src = input && typeof input === "object" ? input : {};
    return {
      version: 1,
      students: Array.isArray(src.students) ? src.students.map(normalizeStudent).filter((s) => s.name) : [],
      groups: Array.isArray(src.groups) ? src.groups.map(normalizeGroup).filter((g) => g.name) : [],
    };
  }

  function normalizeStudent(item) {
    const now = new Date().toISOString();
    return {
      id: String(item.id || makeId("stu")),
      name: String(item.name || "").trim(),
      defaultKeywords: String(item.defaultKeywords || "").trim(),
      lastKeywords: String(item.lastKeywords || item.keywords || "").trim(),
      grade: String(item.grade || "").trim(),
      tags: Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : [],
      useCount: toNumber(item.useCount),
      lastUsedAt: item.lastUsedAt || "",
      createdAt: item.createdAt || now,
      hidden: !!item.hidden,
    };
  }

  function normalizeGroup(item) {
    const now = new Date().toISOString();
    return {
      id: String(item.id || makeId("grp")),
      name: String(item.name || "").trim(),
      studentIds: Array.isArray(item.studentIds) ? item.studentIds.map(String).filter(Boolean) : [],
      useCount: toNumber(item.useCount),
      lastUsedAt: item.lastUsedAt || "",
      createdAt: item.createdAt || now,
      hidden: !!item.hidden,
    };
  }

  function trackStudentUsage(assets, students, options = {}) {
    const next = normalizeAssets(assets);
    const now = options.now || new Date().toISOString();
    const idFactory = options.idFactory || makeId;
    const byName = new Map(next.students.map((student) => [student.name, student]));

    (students || []).forEach((item) => {
      const name = String(item && item.name || "").trim();
      if (!name) return;
      let student = byName.get(name);
      if (!student) {
        student = normalizeStudent({ id: idFactory("stu"), name, createdAt: now });
        next.students.push(student);
        byName.set(name, student);
      }
      student.lastKeywords = String(item.keywords || item.lastKeywords || student.lastKeywords || "").trim();
      student.useCount += 1;
      student.lastUsedAt = now;
      student.hidden = false;
    });

    return sortAssets(next);
  }

  function getRecentStudents(assets, limit = 8) {
    return normalizeAssets(assets).students
      .filter((student) => !student.hidden)
      .sort((a, b) => compareRecent(a, b))
      .slice(0, limit);
  }

  function getRecentGroups(assets, limit = 3) {
    return normalizeAssets(assets).groups
      .filter((group) => !group.hidden)
      .sort((a, b) => compareRecent(a, b))
      .slice(0, limit);
  }

  function saveGroupFromStudents(assets, name, students, options = {}) {
    const now = options.now || new Date().toISOString();
    const idFactory = options.idFactory || makeId;
    let next = trackStudentUsage(assets, students, { now, idFactory });
    const names = (students || []).map((s) => String(s.name || "").trim()).filter(Boolean);
    const studentIds = names
      .map((studentName) => next.students.find((student) => student.name === studentName))
      .filter(Boolean)
      .map((student) => student.id);

    const groupName = String(name || "").trim();
    if (!groupName || studentIds.length === 0) return next;

    let group = next.groups.find((item) => item.name === groupName);
    if (!group) {
      group = normalizeGroup({ id: idFactory("grp"), name: groupName, createdAt: now });
      next.groups.push(group);
    }
    group.studentIds = Array.from(new Set(studentIds));
    group.useCount += 1;
    group.lastUsedAt = now;
    group.hidden = false;

    return sortAssets(next);
  }

  function getGroupStudents(assets, groupId) {
    const data = normalizeAssets(assets);
    const group = data.groups.find((item) => item.id === groupId && !item.hidden);
    if (!group) return [];
    return group.studentIds
      .map((id) => data.students.find((student) => student.id === id && !student.hidden))
      .filter(Boolean)
      .map((student) => ({
        id: student.id,
        name: student.name,
        keywords: student.lastKeywords || student.defaultKeywords || "",
      }));
  }

  function deleteGroup(assets, groupId) {
    const next = normalizeAssets(assets);
    next.groups = next.groups.filter((group) => group.id !== groupId);
    return next;
  }

  function migrateHistoryEntries(entries) {
    return (Array.isArray(entries) ? entries : []).map((item) => {
      const results = Array.isArray(item.results) ? item.results : [];
      return {
        ...item,
        studentNames: Array.isArray(item.studentNames)
          ? item.studentNames
          : results.map((result) => String(result.name || "").trim()).filter(Boolean),
        studentIds: Array.isArray(item.studentIds) ? item.studentIds : [],
      };
    });
  }

  function sortAssets(assets) {
    const next = normalizeAssets(assets);
    next.students.sort((a, b) => compareRecent(a, b));
    next.groups.sort((a, b) => compareRecent(a, b));
    return next;
  }

  function compareRecent(a, b) {
    const time = Date.parse(b.lastUsedAt || b.createdAt || "") - Date.parse(a.lastUsedAt || a.createdAt || "");
    if (time) return time;
    return (b.useCount || 0) - (a.useCount || 0);
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  return {
    createEmptyAssets,
    normalizeAssets,
    trackStudentUsage,
    getRecentStudents,
    getRecentGroups,
    saveGroupFromStudents,
    getGroupStudents,
    deleteGroup,
    migrateHistoryEntries,
  };
});
