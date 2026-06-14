/*
 * 反馈生成引擎（初高中数学）
 * ------------------------------------------------------------------
 * 当前为「初高中数学演示模式」：完全在本地用模板 + 词库生成，不需要任何 API Key。
 *
 * 接入真实大模型时：只改下面的 generateFeedback() 一个函数即可。
 * 已经预留好了 buildPrompt()，把它发给 DeepSeek / 通义 / 豆包 的
 * chat completions 接口，拿回文本填进每个学员即可。其余 UI 不用动。
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
 * 演示模式：本地模板生成一段家长反馈
 */
function localGenerate({ category, topic, classNote, tone, student }) {
  const bank = PHRASE[category] || PHRASE["数学"];
  const t = TONE[tone] || TONE["温暖鼓励"];
  const seed = hash(student.name + student.keywords + topic);
  const { highlight, improve } = splitKeywords(student.keywords);

  const lines = [];
  lines.push(t.open(student.name || "同学"));

  if (topic) lines.push(`今天的课程内容是「${topic}」。`);

  if (classNote) lines.push(`班级整体情况：${classNote}。`);

  const praiseTpl = highlight
    ? pick(bank.praise, seed)
    : pick(bank.defaultPraise, seed);
  lines.push(praiseTpl.replace("{kw}", highlight) + t.praiseEnd + "。");

  if (improve) {
    const impTpl = pick(bank.improveLead, seed >> 2);
    lines.push(impTpl.replace("{kw}", improve) + "，相信下次会更好。");
  }

  lines.push(pick(bank.homeTip, seed >> 3));
  lines.push(pick(bank.preview, seed >> 4));
  lines.push(t.end);

  return lines.join(t.warm ? "\n" : "");
}

/**
 * 接入真实大模型时用：把这段 prompt 发给 LLM 即可。
 */
function buildPrompt({ category, topic, classNote, tone, student }) {
  return [
    `你是一位资深的初高中${category}老师，擅长跟家长沟通。`,
    `请根据信息为学生写一段发给家长的课后反馈，语气：${tone}。`,
    `要求：120-180字；先点名一个具体亮点，再用鼓励方式提一个可改进点，`,
    `再给一句在家可配合的小建议，最后一句对下节课的期待；`,
    `语言适合初高中学生家长阅读，不幼稚、不套话；`,
    `不攀比、不制造焦虑、不夸大承诺（如"一定能考上重点"）。`,
    `【今天主题】${topic || "（未填）"}`,
    `【班级整体】${classNote || "（未填）"}`,
    `【学生姓名】${student.name}`,
    `【今日表现关键词】${student.keywords || "（未填）"}`,
  ].join("\n");
}

/**
 * 统一入口。UI 只调用它。
 */
async function generateFeedback(input) {
  await new Promise((r) => setTimeout(r, 120));
  return localGenerate(input);

  // === 接入真实大模型时（示例，届时取消注释并实现 callLLM）===
  // const prompt = buildPrompt(input);
  // return await callLLM(prompt);
}

window.generateFeedback = generateFeedback;
