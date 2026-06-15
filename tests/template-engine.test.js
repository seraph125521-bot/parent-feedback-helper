const assert = require("assert");
const {
  DEFAULT_FEEDBACK_TEMPLATE,
  renderTemplate,
  buildTemplateContext,
} = require("../templateEngine.js");

const context = buildTemplateContext({
  lessonTime: "2026年6月15日",
  lessonNo: "第8次课",
  topic: "一次函数图像与性质",
  homework: "完成专题试卷第 1-12 题",
  teacherComment: "张晨今天画图规范，求交点坐标时要注意步骤完整。",
  student: { name: "张晨" },
});

const text = renderTemplate(DEFAULT_FEEDBACK_TEMPLATE, context);

assert(text.includes("课后反馈"));
assert(text.includes("时间：2026年6月15日"));
assert(text.includes("课次：第8次课"));
assert(text.includes("学生：张晨"));
assert(text.includes("一次函数图像与性质"));
assert(text.includes("完成专题试卷第 1-12 题"));
assert(text.includes("张晨今天画图规范"));
assert(!text.includes("{teacherComment}"));

console.log("template-engine ok");
