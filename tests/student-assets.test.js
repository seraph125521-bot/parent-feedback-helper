const assert = require("assert");
const assets = require("../studentAssets.js");

const empty = assets.createEmptyAssets();
assert.deepStrictEqual(empty.students, []);
assert.deepStrictEqual(empty.groups, []);

let store = assets.trackStudentUsage(empty, [
  { name: "张晨", keywords: "画图规范" },
  { name: "李思远", keywords: "主动归纳" },
], { now: "2026-06-20T10:00:00.000Z", idFactory: (prefix) => `${prefix}_1` });

assert.strictEqual(store.students.length, 2);
assert.strictEqual(store.students[0].name, "张晨");
assert.strictEqual(store.students[0].lastKeywords, "画图规范");
assert.strictEqual(store.students[0].useCount, 1);

store = assets.trackStudentUsage(store, [
  { name: "张晨", keywords: "求交点偶尔跳步" },
], { now: "2026-06-20T11:00:00.000Z", idFactory: (prefix) => `${prefix}_2` });

assert.strictEqual(store.students.length, 2);
const zhang = store.students.find((s) => s.name === "张晨");
assert.strictEqual(zhang.useCount, 2);
assert.strictEqual(zhang.lastKeywords, "求交点偶尔跳步");
assert.strictEqual(zhang.defaultKeywords, "");

const recent = assets.getRecentStudents(store, 1);
assert.strictEqual(recent.length, 1);
assert.strictEqual(recent[0].name, "张晨");

store = assets.saveGroupFromStudents(store, "初二函数班", [
  { name: "张晨", keywords: "本次课表现" },
  { name: "王一", keywords: "计算认真" },
], { now: "2026-06-20T12:00:00.000Z", idFactory: (prefix) => `${prefix}_g` });

assert.strictEqual(store.groups.length, 1);
assert.strictEqual(store.groups[0].name, "初二函数班");
assert.strictEqual(store.groups[0].studentIds.length, 2);
assert(store.students.some((s) => s.name === "王一"));

const groupStudents = assets.getGroupStudents(store, store.groups[0].id);
assert.deepStrictEqual(groupStudents.map((s) => s.name), ["张晨", "王一"]);
assert.strictEqual(groupStudents[0].keywords, "本次课表现");
assert.strictEqual(store.students.find((s) => s.name === "张晨").defaultKeywords, "");

const oldHistory = [{ id: 1, results: [{ name: "张晨", text: "旧反馈" }] }];
const migrated = assets.migrateHistoryEntries(oldHistory);
assert.deepStrictEqual(migrated[0].studentNames, ["张晨"]);
assert.deepStrictEqual(migrated[0].studentIds, []);

console.log("student-assets ok");
