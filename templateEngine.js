(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PFH_TEMPLATE = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULT_FEEDBACK_TEMPLATE = [
    "课后反馈",
    "一. 时间：{lessonTime}",
    "   课次：{lessonNo}",
    "   学生：{studentName}",
    "",
    "二. 学习知识点：",
    "{knowledgePoints}",
    "",
    "三. 作业布置：",
    "{homework}",
    "",
    "四. 老师点评及宝贵建议：",
    "{teacherComment}",
  ].join("\n");

  const PLACEHOLDER_LABELS = [
    ["{lessonTime}", "上课时间"],
    ["{lessonNo}", "课次"],
    ["{studentName}", "学生姓名"],
    ["{knowledgePoints}", "学习知识点"],
    ["{homework}", "作业布置"],
    ["{teacherComment}", "老师点评及宝贵建议"],
  ];

  function clean(value, fallback = "") {
    const text = value == null ? "" : String(value).trim();
    return text || fallback;
  }

  function buildTemplateContext(input) {
    const student = input.student || {};
    return {
      lessonTime: clean(input.lessonTime, "本次课"),
      lessonNo: clean(input.lessonNo, "本次课"),
      studentName: clean(student.name, "同学"),
      knowledgePoints: clean(input.topic, "本节课知识点已在课堂同步"),
      homework: clean(input.homework, "按老师课堂要求完成对应练习"),
      teacherComment: clean(input.teacherComment, "课堂表现已完成记录"),
    };
  }

  function renderTemplate(template, context) {
    const source = clean(template, DEFAULT_FEEDBACK_TEMPLATE);
    return source.replace(/\{(lessonTime|lessonNo|studentName|knowledgePoints|homework|teacherComment)\}/g, (match, key) => {
      return clean(context[key]);
    });
  }

  function describePlaceholders() {
    return PLACEHOLDER_LABELS.map(([token, label]) => `${token}：${label}`).join("\n");
  }

  return {
    DEFAULT_FEEDBACK_TEMPLATE,
    buildTemplateContext,
    renderTemplate,
    describePlaceholders,
  };
});
