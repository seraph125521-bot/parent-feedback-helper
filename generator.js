/*
 * 反馈生成引擎（初高中数学）
 * ------------------------------------------------------------------
 * 当前为「初高中数学演示模式」：完全在本地用模板 + 词库生成，不需要任何 API Key。
 *
 * 接入真实大模型时：优先替换 buildTeacherComment() 或 generateFeedback()。
 * 老师自定义模板由 templateEngine.js 渲染，后续可继续复用。
 * ------------------------------------------------------------------
 */

const PHRASE = {
  数学: {
    praise: [
      "{kw}，这一点表现很好",
      "今天{kw}，比上节课更有进步",
      "{kw}，推导和表达都比较到位",
      "特别是在{kw}方面，课堂状态不错",
      "{kw}，能看出来在主动梳理解题方法",
    ],
    improveLead: [
      "{kw}，多加练习就会更稳",
      "接下来在{kw}上再加强一下",
      "建议把{kw}这个问题再针对性练一练",
      "{kw}，写步骤时再规范一点就好",
    ],
    homeTip: [
      "建议整理错题，标注错因和正确思路，比盲目刷题更有效。",
      "回家后可以让孩子把今天的一道典型题讲给您听，会讲才是真懂。",
      "函数、几何类题目，画图和写条件是基本功，回家练 2～3 道巩固即可。",
      "代数运算类题目，建议先写清楚已知条件和目标，再动笔，减少跳步。",
      "可以对照课本例题和课堂笔记，把今天的方法用自己的话复述一遍。",
    ],
    preview: [
      "下节课会进入更综合的题型，今天的基础打牢了衔接会更顺。",
      "下次课会做一些变式训练，期待他/她能灵活运用今天的方法。",
      "下节课有小测/阶段练习，建议重点回看今天的知识点和典型错因。",
      "下节课会继续强化解题规范和表达，期待他/她在综合题上更稳一点。",
    ],
    defaultPraise: [
      "今天听讲专注，能跟上课堂节奏",
      "课堂上愿意提问、思路跟得紧",
      "做题时能按步骤推进，学习状态不错",
    ],
  },
};

// 不同语气的称呼、亮点收尾与结束语
const TONE = {
  温暖鼓励: {
    open: (n) => `${n}家长好～`,
    warm: true,
    praiseEnd: "，这一步值得肯定",
    end: "继续加油，我们一起陪着孩子把基础打扎实。",
  },
  专业简洁: {
    open: (n) => `${n}家长，今日课堂反馈：`,
    warm: false,
    praiseEnd: "，表现符合预期",
    end: "感谢配合。",
  },
  活泼亲切: {
    open: (n) => `${n}家长，今天课堂状态不错～`,
    warm: true,
    praiseEnd: "，继续保持这个劲头",
    end: "下节课见，一起加油～",
  },
};

function pick(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}
function splitKeywords(raw) {
  if (!raw) return { highlight: "", improve: "" };
  const parts = raw.split(/[，,、。;；\/]+/).map((s) => s.trim()).filter(Boolean);
  return { highlight: parts[0] || "", improve: parts[1] || "" };
}

/**
 * 演示模式：本地模板生成「老师点评及宝贵建议」
 */
function buildTeacherComment({ category, topic, classNote, tone, student }) {
  const bank = PHRASE[category] || PHRASE["数学"];
  const t = TONE[tone] || TONE["温暖鼓励"];
  const seed = hash(student.name + student.keywords + topic);
  const { highlight, improve } = splitKeywords(student.keywords);

  const lines = [];
  if (classNote) lines.push(`结合今天班级整体情况来看，${classNote}。`);

  const praiseTpl = highlight
    ? pick(bank.praise, seed)
    : pick(bank.defaultPraise, seed);
  lines.push(`${student.name || "同学"}${praiseTpl.replace("{kw}", highlight)}${t.praiseEnd}。`);

  if (improve) {
    const impTpl = pick(bank.improveLead, seed >> 2);
    lines.push(impTpl.replace("{kw}", improve) + "，相信下次会更好。");
  }

  lines.push(pick(bank.homeTip, seed >> 3));
  lines.push(t.end);

  return lines.join(t.warm ? "\n" : "");
}

function localGenerate(input) {
  const templateApi = window.PFH_TEMPLATE;
  const teacherComment = buildTeacherComment(input);
  const context = templateApi.buildTemplateContext({
    ...input,
    teacherComment,
  });

  // 优先用老师在「我的格式」里设置的结构化栏目配置
  if (input.templateConfig) {
    return templateApi.renderFromConfig(input.templateConfig, context);
  }
  return templateApi.renderTemplate(input.feedbackTemplate, context);
}

/**
 * 接入真实大模型时用：把这段 prompt 发给 LLM 即可。
 */
function buildPrompt({ category, topic, classNote, tone, student }) {
  return [
    `你是一位资深的初高中${category}老师，擅长跟家长沟通。`,
    `请根据信息为学生写一段「老师点评及宝贵建议」，语气：${tone}。`,
    `要求：80-150字；先点名一个具体亮点，再用鼓励方式提一个可改进点，`,
    `再给一句可执行的学习方法建议；`,
    `语言适合初高中学生家长阅读，不幼稚、不套话；`,
    `不攀比、不制造焦虑、不夸大承诺（如"一定能考上重点"）。`,
    `【今天主题】${topic || "（未填）"}`,
    `【班级整体】${classNote || "（未填）"}`,
    `【学生姓名】${student.name}`,
    `【今日表现关键词】${student.keywords || "（未填）"}`,
  ].join("\n");
}

/**
 * 给 DeepSeek 的对话消息：让大模型只产出「老师点评及宝贵建议」正文，
 * 其余栏目（时间/作业/标题等）仍由 templateEngine 按「我的格式」渲染，
 * 保证输出始终保持老师设定的模板结构。
 */
function buildCommentMessages({ category, topic, classNote, tone, student, previousFeedback }) {
  const system = [
    `你要模仿"我"——一位资深初高中数学老师——的口吻，写"老师点评及宝贵建议"这一段正文。`,
    `你只输出这一段点评正文，不要输出标题、时间、作业等其他栏目，不要使用 Markdown、编号或表情符号。`,
    ``,
    `【我的写作风格，务必模仿】`,
    `1. 称呼：从不写"X家长/X妈妈/X爸爸/家长您好"，直接从内容写起；提到学生统一用"孩子"，不要带任何家长称谓，也不要写学生姓名当开头。`,
    `2. 语感：短句、口语、朴实，不堆砌形容词，像微信里随手发给家长的大白话。`,
    `3. 篇幅：40-90 字，2-3 句话，宁可短而实在，不要长而空。`,
    `4. 行文：按"本节课讲了什么/孩子表现 → 存在的小问题或难点 → 具体可执行的建议"自然展开，不要写成一二三分点。`,
    `5. 客观：可以如实点出小毛病（如偶尔算错、熟练度不够、复杂图形处理还吃力），但要温和。`,
    `6. 我的常用词：表现上爱说"思考认真/思考积极/计算认真/能独立完成/很不错"；建议上爱说"多做题/多练习/多总结题型/归纳知识点/错题及时复习总结/多积攒解题经验"；收尾爱说"继续加油/不断进步/不断提高"；合适时会点一句考试相关性（如"这部分高考几乎必考""马上期中考试了"）。`,
    `7. 只谈初高中数学：知识点、解题方法、运算与书写规范、审题建模、错题整理等；不涉及其它学科，不空谈学习态度。`,
    `8. 紧扣"今日表现关键词"，不要脱离关键词凭空发挥；不攀比、不制造焦虑、不夸大承诺。`,
    ``,
    `【我本人写过的真实范例，模仿这种语感（不要照抄内容）】`,
    `例1：孩子计算认真，但有的时候偶尔会算错，平时还要多总结题型，归纳知识点，计算还要更加严谨。`,
    `例2：孩子上课思考积极，碰到不会的问题主动去解决。今天讲了模拟卷上几道比较难的题目，孩子能自己独立完成，很不错，希望继续加油，不断进步。`,
    `例3：本节课带孩子讲解了空间几何平行、垂直关系的经典例题，孩子对常见题型处理起来很快，但碰到一些复杂的空间图形还比较棘手，还要多加练习。`,
  ].join("\n");

  const toneHint = {
    温暖鼓励: "在我的务实风格上，多一点肯定和陪伴感。",
    专业简洁: "在我的务实风格上，更精炼、更客观，少寒暄。",
    活泼亲切: "在我的务实风格上，语气稍微轻松一点，但不要油腻、不要用表情。",
  };

  const user = [
    `请用"我"的口吻和风格写这段点评。`,
    `语气微调：${toneHint[tone] || toneHint["温暖鼓励"]}`,
    `今天主题：${topic || "（未填）"}`,
    `班级整体：${classNote || "（未填）"}`,
    `学生姓名：${student.name || "（未填）"}`,
    `今日表现关键词：${student.keywords || "（未填）"}`,
    previousFeedback ? `上次反馈参考：${previousFeedback}` : "",
    previousFeedback ? `请体现连续跟进感，但必须结合本节新情况，不要复述或改写上次反馈。` : "",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 大模型模式：用 DeepSeek 生成点评正文，再走老师的模板配置渲染。
 */
async function llmGenerate(input) {
  const templateApi = window.PFH_TEMPLATE;
  const messages = buildCommentMessages(input);
  const teacherComment = await window.PFH_LLM.complete(messages);

  const context = templateApi.buildTemplateContext({
    ...input,
    teacherComment,
  });

  if (input.templateConfig) {
    return templateApi.renderFromConfig(input.templateConfig, context);
  }
  return templateApi.renderTemplate(input.feedbackTemplate, context);
}

function buildFeedbackPrompt(input) {
  const templateApi = window.PFH_TEMPLATE;
  const sectionGuide = input.templateConfig
    ? templateApi.describeSections(input.templateConfig)
    : templateApi.describePlaceholders();
  return [
    `你是一名初高中数学老师的课后反馈助手。`,
    `请严格按照老师设置的栏目顺序输出完整课后反馈。`,
    `不要改变栏目结构，不要新增老师之外的大段栏目。`,
    `老师设置的栏目如下（按顺序）：`,
    sectionGuide,
    ``,
    `本次课程信息：`,
    `时间：${input.lessonTime || "（未填）"}`,
    `课次：${input.lessonNo || "（未填）"}`,
    `学生：${input.student.name || "（未填）"}`,
    `学习知识点：${input.topic || "（未填）"}`,
    `作业布置：${input.homework || "（未填）"}`,
    `班级整体：${input.classNote || "（未填）"}`,
    `课堂表现关键词：${input.student.keywords || "（未填）"}`,
  ].join("\n");
}

/* ==================================================================
 * 一对一辅导模式
 * 与大班课的区别：单个学生、更完整的服务汇报式反馈。
 * 大模型只负责写「老师点评及建议」正文，其余栏目（基本信息 / 本节内容 /
 * 作业 / 下次课计划）由本地按结构拼接，保证输出稳定。
 * ================================================================== */

/**
 * 本地模式：把一对一的结构化输入拼成一段口语化的点评正文。
 */
function buildOneOnOneComment(input) {
  const topic = input.topic || "";
  const mastered = input.mastered || "";
  const weakness = input.weakness || "";
  const practiceAdvice = input.practiceAdvice || "";

  const sentences = [];
  if (topic) {
    sentences.push(`本节课主要带孩子梳理了${topic}，并做了相关练习。`);
  } else if (input.classContent) {
    sentences.push("本节课带孩子讲解了典型题，并做了相关练习。");
  } else {
    sentences.push("本节课带孩子做了系统梳理和练习。");
  }

  if (mastered && weakness) {
    sentences.push(`孩子${mastered}还不错，但${weakness}还不够稳。`);
  } else if (weakness) {
    sentences.push(`${weakness}这块还不够稳，后面要多练习。`);
  } else if (mastered) {
    sentences.push(`孩子${mastered}这块做得不错。`);
  }

  if (practiceAdvice) {
    sentences.push("课后重点整理错题，写清楚条件和步骤，多总结题型。");
  } else if (weakness) {
    sentences.push("课后把典型题多练 2～3 道，注意步骤和运算，多总结题型。");
  } else {
    sentences.push("课后把今天的题目及时巩固，多做题、多总结题型。");
  }

  return sentences.slice(0, 3).join("");
}

/**
 * 给 DeepSeek 的对话消息：一对一点评正文（掌握情况 + 卡点 + 课后建议）。
 */
function buildOneOnOneMessages(input) {
  const student = input.student || {};
  const system = [
    `你要模仿"我"——一位资深初高中数学一对一辅导老师——的口吻，写一段发给家长的"课后点评及建议"正文。`,
    `你只输出这一段点评正文，不要输出标题、时间、下次计划等其它栏目，不要使用 Markdown、编号或表情符号。`,
    ``,
    `【我的写作风格，务必模仿】`,
    `1. 称呼：从不写"X家长/家长您好"，直接从内容写起；提到学生统一用"孩子"，不要把姓名当开头。`,
    `2. 语感：短句、口语、朴实，像微信里随手发给家长的大白话；不堆砌形容词，不空泛套话。`,
    `3. 篇幅：40-90 字，2-3 句话，宁可短而实在，不要长而空；如果发现超过 90 字，请自己重写得更短。`,
    `4. 信息选择：只挑 2-3 个最关键点写（一个亮点 + 一个小问题 + 一个可执行建议）。不要把我给你的每个字段都复述一遍。`,
    `5. 行文：按"本节课讲了什么/孩子表现 → 小问题或难点 → 具体建议"自然展开，不要写成一二三分点。`,
    `6. 客观：可以如实点出小毛病（偶尔算错/熟练度不够/复杂图形处理吃力），但要温和，不制造焦虑，不夸大承诺。`,
    `7. 只谈初高中数学：知识点、解题方法、运算与书写规范、审题建模、错题整理等；不涉及其它学科。`,
    ``,
    `【我本人写过的真实范例，模仿这种语感（不要照抄内容）】`,
    `例1：孩子计算认真，但有的时候偶尔会算错，平时还要多总结题型，归纳知识点，计算还要更加严谨。`,
    `例2：孩子上课思考积极，碰到不会的问题主动去解决。今天讲了几道比较难的题目，孩子能自己独立完成，很不错，希望继续加油，不断进步。`,
    `例3：这部分内容对计算能力要求比较高，孩子整体还不错，但复杂题型还要多练习，多积攒解题经验。`,
  ].join("\n");

  const toneHint = {
    温暖鼓励: "多一点肯定和陪伴感。",
    专业简洁: "更精炼、更客观，少寒暄。",
    活泼亲切: "语气轻松一点，但不要油腻、不要用表情。",
  };

  const user = [
    `请用"我"的口吻写这段一对一课后点评。`,
    `语气微调：${toneHint[input.tone] || toneHint["温暖鼓励"]}`,
    `学生：${student.name || "（未填）"}${student.grade ? `（${student.grade}）` : ""}`,
    `本节主题：${input.topic || "（未填）"}`,
    `课堂练习/讲解：${input.classContent || "（未填）"}`,
    `已掌握：${input.mastered || "（未填）"}`,
    `主要卡点：${input.weakness || "（未填）"}`,
    `课后练习建议：${input.practiceAdvice || "（未填）"}`,
    `家长配合建议：${input.parentAdvice || "（未填）"}`,
    input.previousFeedback ? `上次反馈参考：${input.previousFeedback}` : "",
    input.previousFeedback ? `请体现连续跟进感，但必须结合本节新情况，不要复述或改写上次反馈。` : "",
    `再次强调：只写 2-3 句话，40-90 字，不要分点；不要为了完整覆盖字段而写长。`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function cleanTeacherComment(raw) {
  let text = typeof raw === "string" ? raw : "";
  text = text.replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  // 去掉常见分点/编号前缀（尽量保守，只处理开头）
  text = text.replace(/^\s*(?:\d+|[一二三四五六七八九十]+)\s*[、.．)\]]\s*/u, "");
  text = text.replace(/^\s*[-*]\s*/u, "");

  // 只做格式清理，不做字数截断，避免破坏老师口吻和句子完整性
  text = text.replace(/[ \t]+/g, "").replace(/\n{2,}/g, "\n").trim();
  return text;
}

/**
 * 把一对一的点评正文与结构化栏目拼成完整反馈（自动按 一、二、三… 编号）。
 */
function assembleOneOnOne(input, comment) {
  const CN_NUM = ["一", "二", "三", "四", "五", "六"];
  const student = input.student || {};
  const cfg = input.templateConfig;
  const title = (cfg && cfg.title) || "课后反馈";
  const blocks = [title];
  let index = 0;
  const push = (heading, body) => {
    const text = (body || "").trim();
    if (!text) return;
    index += 1;
    blocks.push(`${CN_NUM[index - 1] || index}. ${heading}\n${text}`);
  };

  const info = [];
  if (input.lessonTime) info.push(`时间：${input.lessonTime}`);
  if (input.lessonNo) info.push(`课次：${input.lessonNo}`);
  if (student.name) info.push(`学生：${student.name}${student.grade ? `（${student.grade}）` : ""}`);
  push("基本信息", info.join("\n"));

  const content = [];
  if (input.topic) content.push(input.topic);
  if (input.classContent) content.push(input.classContent);
  push("本节内容", content.join("；"));

  push("作业布置", input.homework);
  push("老师点评及建议", comment);
  push("下次课计划", input.nextPlan);

  return blocks.join("\n\n");
}

/**
 * 一对一统一生成：优先 DeepSeek 写点评正文，失败回退本地，再拼接结构化栏目。
 */
async function generateOneOnOne(input) {
  let comment = "";
  if (window.PFH_LLM && window.PFH_LLM.isEnabled()) {
    try {
      comment = await window.PFH_LLM.complete(buildOneOnOneMessages(input), {
        temperature: 0.6,
        max_tokens: 180,
      });
    } catch (err) {
      console.warn("[PFH] 一对一大模型生成失败，已回退本地模板：", err);
      if (typeof input.onFallback === "function") input.onFallback(err);
    }
  }
  if (!comment || !comment.trim()) {
    await new Promise((r) => setTimeout(r, 120));
    comment = buildOneOnOneComment(input);
  }
  comment = cleanTeacherComment(comment);
  return assembleOneOnOne(input, comment);
}

/**
 * 统一入口。UI 只调用它。
 * 大班课：逐个学生生成简短反馈；一对一：生成单条更完整的服务汇报。
 * 开启「AI 智能生成」时优先走 DeepSeek；任何失败都自动回退本地模板，保证可用。
 */
async function generateFeedback(input) {
  if (input && input.mode === "one") {
    return generateOneOnOne(input);
  }
  if (window.PFH_LLM && window.PFH_LLM.isEnabled()) {
    try {
      return await llmGenerate(input);
    } catch (err) {
      console.warn("[PFH] 大模型生成失败，已回退本地模板：", err);
      if (typeof input.onFallback === "function") input.onFallback(err);
    }
  }
  await new Promise((r) => setTimeout(r, 120));
  return localGenerate(input);
}

window.generateFeedback = generateFeedback;
window.buildFeedbackPrompt = buildFeedbackPrompt;
window.buildCommentMessages = buildCommentMessages;
window.buildOneOnOneMessages = buildOneOnOneMessages;
