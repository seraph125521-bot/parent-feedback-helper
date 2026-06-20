const assert = require("assert");

const templateApi = require("../templateEngine.js");
global.window = { PFH_TEMPLATE: templateApi };
require("../generator.js");

async function main() {
  const text = await window.generateFeedback({
    category: "数学",
    lessonTime: "2026年6月15日",
    lessonNo: "第8次课",
    topic: "一次函数图像与性质",
    homework: "完成一次函数专题试卷第 1-12 题，整理课堂错题 2 道",
    classNote: "基础题完成度不错，综合题里定义域和取值范围还容易混",
    templateConfig: templateApi.DEFAULT_TEMPLATE_CONFIG,
    tone: "温暖鼓励",
    student: {
      name: "张晨",
      keywords: "画图标注很规范，求交点坐标时偶尔跳步",
    },
  });

  assert(text.startsWith("课后反馈"));
  assert(text.includes("一. 基本信息"));
  assert(text.includes("时间：2026年6月15日"));
  assert(text.includes("课次：第8次课"));
  assert(text.includes("学生：张晨"));
  assert(text.includes("二. 学习知识点"));
  assert(text.includes("一次函数图像与性质"));
  assert(text.includes("三. 作业布置"));
  assert(text.includes("完成一次函数专题试卷第 1-12 题"));
  assert(text.includes("四. 老师点评及宝贵建议"));
  assert(text.includes("画图标注很规范"));
  assert(!text.includes("{lessonTime}"));
  assert(!text.includes("{teacherComment}"));

  // 兼容旧的字符串模板路径（未提供 templateConfig 时）
  const legacy = await window.generateFeedback({
    category: "数学",
    lessonTime: "2026年6月15日",
    lessonNo: "第8次课",
    topic: "一次函数图像与性质",
    homework: "完成专题试卷",
    feedbackTemplate: templateApi.DEFAULT_FEEDBACK_TEMPLATE,
    tone: "温暖鼓励",
    student: { name: "李思远", keywords: "归纳能力强" },
  });
  assert(legacy.includes("一. 时间：2026年6月15日"));
  assert(!legacy.includes("{teacherComment}"));

  // 一对一模式：点评必须短（40-90 字，2-3 句）
  const one = await window.generateFeedback({
    mode: "one",
    category: "数学",
    lessonTime: "2026年6月15日",
    lessonNo: "第8次课",
    topic: "一次函数图像与性质",
    classContent: "做了 3 道典型题并讲了常见陷阱",
    mastered: "基础图像判断",
    weakness: "综合题条件整理不够清晰",
    practiceAdvice: "把今天错的两道题重新整理一遍，写清楚已知条件和步骤",
    parentAdvice: "提醒孩子写步骤别跳步",
    nextPlan: "继续做一次函数与几何结合题型",
    homework: "完成一次函数专题试卷第 1-8 题",
    tone: "温暖鼓励",
    student: { name: "张晨", grade: "高一" },
  });
  assert(one.startsWith("课后反馈"));
  assert(one.includes("一. 基本信息"));
  assert(one.includes("四. 老师点评及建议"));

  const m = one.match(/四\.\s*老师点评及建议\n([\s\S]*?)(?:\n\n五\.|$)/);
  assert(m && m[1], "未能提取一对一点评段落");
  const comment = String(m[1]).trim();
  assert(comment.length <= 90, `一对一点评过长：${comment.length} 字`);
  assert(comment.length >= 20, `一对一点评过短：${comment.length} 字`);
  assert(!comment.includes("家长您好") && !comment.includes("家长好"), "一对一点评不应包含家长称谓");
  assert(/[。！？；]$/.test(comment), "一对一点评应以中文标点结尾");

  console.log("generator-template ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
