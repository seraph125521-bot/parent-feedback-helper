const assert = require("assert");
const { formatResultsForCopy } = require("../copyFormat.js");

const classText = formatResultsForCopy([
  { name: "张晨", text: "课后反馈 A" },
  { name: "李思远", text: "课后反馈 B" },
], { mode: "class" });

assert.strictEqual(classText, "【张晨】\n课后反馈 A\n\n【李思远】\n课后反馈 B");
assert(!classText.includes("—"));

const oneText = formatResultsForCopy([
  { name: "张晨", text: "一对一反馈" },
], { mode: "one" });
assert.strictEqual(oneText, "一对一反馈");

const oneWithName = formatResultsForCopy([
  { name: "张晨", text: "一对一反馈" },
], { mode: "one", includeName: true });
assert.strictEqual(oneWithName, "【张晨】\n一对一反馈");

const blankSafe = formatResultsForCopy([
  { name: "", text: "无姓名反馈" },
], { mode: "class" });
assert.strictEqual(blankSafe, "【学生】\n无姓名反馈");

console.log("copy-format ok");
