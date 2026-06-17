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
function buildCommentMessages({ category, topic, classNote, tone, student }) {
  const system = [
    `你是一位资深的初高中数学老师，只负责初高中数学学科的课后反馈，擅长用真诚、专业的语言和家长沟通。`,
    `你只输出「老师点评及宝贵建议」这一段正文，不要输出标题、时间、作业等其他栏目，不要使用 Markdown 或编号。`,
    `严格的内容范围：只围绕初高中数学的知识点、解题方法、运算与书写规范、审题与建模、错题整理等展开；不要涉及其它学科，也不要脱离数学谈泛泛的学习态度。`,
    `称呼规则（重要）：`,
    `- 不要编造或假设家长的身份与性别，绝对不要出现"X妈妈""X爸爸""X妈""家长您好"等任何称呼或问候开头；`,
    `- 直接从点评内容写起，提到学生时用其姓名或"孩子"，不要带任何家长称谓。`,
    `写作要求：`,
    `1. 80-150 字，2-4 句话；`,
    `2. 先点名一个具体的数学亮点，再用鼓励的方式提一个可改进的数学点，最后给一句可执行的数学学习方法建议；`,
    `3. 紧扣老师提供的"今日表现关键词"，不要脱离关键词凭空发挥；`,
    `4. 语言适合初高中学生家长阅读，自然、不套话、不幼稚；`,
    `5. 不攀比、不制造焦虑、不夸大承诺（如"一定能考上重点"）。`,
  ].join("\n");

  const user = [
    `请按上述要求写这段点评。`,
    `语气：${tone}`,
    `今天主题：${topic || "（未填）"}`,
    `班级整体：${classNote || "（未填）"}`,
    `学生姓名：${student.name || "（未填）"}`,
    `今日表现关键词：${student.keywords || "（未填）"}`,
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

/**
 * 统一入口。UI 只调用它。
 * 开启「AI 智能生成」时优先走 DeepSeek；任何失败都自动回退本地模板，保证可用。
 */
async function generateFeedback(input) {
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
