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
    feedbackTemplate: templateApi.DEFAULT_FEEDBACK_TEMPLATE,
    tone: "温暖鼓励",
    student: {
      name: "张晨",
      keywords: "画图标注很规范，求交点坐标时偶尔跳步",
    },
  });

  assert(text.includes("一. 时间：2026年6月15日"));
  assert(text.includes("课次：第8次课"));
  assert(text.includes("学生：张晨"));
  assert(text.includes("二. 学习知识点："));
  assert(text.includes("一次函数图像与性质"));
  assert(text.includes("三. 作业布置："));
  assert(text.includes("完成一次函数专题试卷第 1-12 题"));
  assert(text.includes("四. 老师点评及宝贵建议："));
  assert(text.includes("画图标注很规范"));
  assert(!text.includes("{lessonTime}"));
  assert(!text.includes("{teacherComment}"));

  console.log("generator-template ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
