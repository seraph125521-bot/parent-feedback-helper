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

  const CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

  /*
   * 栏目库：老师在「我的格式」里看到的就是这些栏目，
   * 用大白话描述，不需要理解 {占位符}。
   */
  const SECTION_LIBRARY = {
    lesson: {
      name: "基本信息",
      hint: "时间、课次、学生姓名",
      defaultHeading: "基本信息",
      render(ctx) {
        const lines = [];
        if (ctx.lessonTime) lines.push(`时间：${ctx.lessonTime}`);
        if (ctx.lessonNo) lines.push(`课次：${ctx.lessonNo}`);
        if (ctx.studentName) lines.push(`学生：${ctx.studentName}`);
        return lines.join("\n");
      },
    },
    knowledge: {
      name: "学习知识点",
      hint: "这节课讲了什么",
      defaultHeading: "学习知识点",
      render(ctx) {
        return clean(ctx.knowledgePoints);
      },
    },
    homework: {
      name: "作业布置",
      hint: "课后要完成的作业",
      defaultHeading: "作业布置",
      render(ctx) {
        return clean(ctx.homework);
      },
    },
    comment: {
      name: "老师点评及建议",
      hint: "亮点 + 待加强 + 学习建议",
      defaultHeading: "老师点评及宝贵建议",
      render(ctx) {
        return clean(ctx.teacherComment);
      },
    },
  };

  const SECTION_ORDER = ["lesson", "knowledge", "homework", "comment"];

  const DEFAULT_TEMPLATE_CONFIG = {
    title: "课后反馈",
    sections: SECTION_ORDER.map((key) => ({
      key,
      heading: SECTION_LIBRARY[key].defaultHeading,
      enabled: true,
    })),
  };

  // 给 UI 渲染用的栏目元数据（顺序即推荐顺序）
  const SECTION_META = SECTION_ORDER.map((key) => ({
    key,
    name: SECTION_LIBRARY[key].name,
    hint: SECTION_LIBRARY[key].hint,
    defaultHeading: SECTION_LIBRARY[key].defaultHeading,
  }));

  function clean(value, fallback = "") {
    const text = value == null ? "" : String(value).trim();
    return text || fallback;
  }

  function buildTemplateContext(input) {
    const student = input.student || {};
    return {
      lessonTime: clean(input.lessonTime),
      lessonNo: clean(input.lessonNo),
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

  /*
   * 把老师设置的「栏目配置」补全成安全可用的结构：
   * 过滤未知/重复栏目，补回缺失栏目，标题与小标题填默认值。
   */
  function normalizeConfig(config) {
    const base = config && typeof config === "object" ? config : {};
    const title = clean(base.title, DEFAULT_TEMPLATE_CONFIG.title);
    const rawSections = Array.isArray(base.sections) ? base.sections : [];
    const seen = new Set();
    const sections = [];

    rawSections.forEach((sec) => {
      if (!sec || !SECTION_LIBRARY[sec.key] || seen.has(sec.key)) return;
      seen.add(sec.key);
      sections.push({
        key: sec.key,
        heading: clean(sec.heading, SECTION_LIBRARY[sec.key].defaultHeading),
        enabled: sec.enabled !== false,
      });
    });

    // 补回配置里缺失的已知栏目（默认开启，排在后面）
    SECTION_ORDER.forEach((key) => {
      if (seen.has(key)) return;
      seen.add(key);
      sections.push({
        key,
        heading: SECTION_LIBRARY[key].defaultHeading,
        enabled: true,
      });
    });

    return { title, sections };
  }

  /*
   * 用结构化配置渲染整段反馈，启用的栏目自动按 一、二、三… 编号；
   * 内容为空的栏目自动跳过，不会留下空标题。
   */
  function renderFromConfig(config, context) {
    const safe = normalizeConfig(config);
    const blocks = [];
    if (safe.title) blocks.push(safe.title);

    let index = 0;
    safe.sections.forEach((sec) => {
      if (!sec.enabled) return;
      const def = SECTION_LIBRARY[sec.key];
      if (!def) return;
      const body = clean(def.render(context));
      if (!body) return;
      index += 1;
      const num = CN_NUM[index - 1] || String(index);
      const heading = clean(sec.heading, def.defaultHeading);
      blocks.push(`${num}. ${heading}\n${body}`);
    });

    return blocks.join("\n\n");
  }

  function describePlaceholders() {
    return PLACEHOLDER_LABELS.map(([token, label]) => `${token}：${label}`).join("\n");
  }

  // 用配置生成给大模型看的「栏目说明」，未来接入 LLM 时复用
  function describeSections(config) {
    const safe = normalizeConfig(config);
    return safe.sections
      .filter((s) => s.enabled)
      .map((s, i) => `${CN_NUM[i] || i + 1}. ${s.heading}（${SECTION_LIBRARY[s.key].hint}）`)
      .join("\n");
  }

  return {
    DEFAULT_FEEDBACK_TEMPLATE,
    DEFAULT_TEMPLATE_CONFIG,
    SECTION_META,
    SECTION_LIBRARY,
    buildTemplateContext,
    renderTemplate,
    renderFromConfig,
    normalizeConfig,
    describePlaceholders,
    describeSections,
  };
});
