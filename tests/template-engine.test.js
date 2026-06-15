const assert = require("assert");
const {
  DEFAULT_FEEDBACK_TEMPLATE,
  DEFAULT_TEMPLATE_CONFIG,
  renderTemplate,
  renderFromConfig,
  normalizeConfig,
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

/* ---------- 结构化配置渲染 ---------- */
// 默认配置：四个栏目按 一/二/三/四 编号
const configText = renderFromConfig(DEFAULT_TEMPLATE_CONFIG, context);
assert(configText.startsWith("课后反馈"));
assert(configText.includes("一. 基本信息"));
assert(configText.includes("时间：2026年6月15日"));
assert(configText.includes("二. 学习知识点"));
assert(configText.includes("三. 作业布置"));
assert(configText.includes("四. 老师点评及宝贵建议"));
assert(!configText.includes("{lessonTime}"));

// 关闭一个栏目后，编号自动重排，且不出现该栏目标题
const noHomework = {
  title: "课后反馈",
  sections: DEFAULT_TEMPLATE_CONFIG.sections.map((s) =>
    s.key === "homework" ? { ...s, enabled: false } : { ...s }
  ),
};
const noHomeworkText = renderFromConfig(noHomework, context);
assert(!noHomeworkText.includes("作业布置"));
assert(noHomeworkText.includes("三. 老师点评及宝贵建议"));

// 重排：把点评放到第一栏
const reordered = {
  title: "今日小结",
  sections: [
    { key: "comment", heading: "老师点评", enabled: true },
    { key: "lesson", heading: "基本信息", enabled: true },
  ],
};
const reorderedText = renderFromConfig(reordered, context);
assert(reorderedText.startsWith("今日小结"));
assert(reorderedText.includes("一. 老师点评"));
assert(reorderedText.indexOf("一. 老师点评") < reorderedText.indexOf("基本信息"));

// normalizeConfig 补回缺失栏目并过滤未知栏目
const normalized = normalizeConfig({
  title: "",
  sections: [{ key: "homework", heading: "作业", enabled: true }, { key: "unknown" }],
});
assert(normalized.title === "课后反馈");
assert(normalized.sections.length === 4);
assert(normalized.sections[0].key === "homework");
assert(!normalized.sections.some((s) => s.key === "unknown"));

console.log("template-engine ok");

