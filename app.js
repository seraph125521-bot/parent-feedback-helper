(function () {
  "use strict";

  const STORAGE_KEY = "pfh_math_sec_state_v2";
  const templateApi = window.PFH_TEMPLATE;

  const state = {
    category: "数学",
    tone: "温暖鼓励",
    lessonTime: "",
    lessonNo: "",
    topic: "",
    homework: "",
    classNote: "",
    templateConfig: deepClone(templateApi.DEFAULT_TEMPLATE_CONFIG),
    students: [],
  };

  // 「我的格式」预览用的示例数据
  const PREVIEW_SAMPLE = {
    lessonTime: "2026年6月15日",
    lessonNo: "第8次课",
    studentName: "张晨",
    knowledgePoints: "一次函数图像与性质",
    homework: "完成一次函数专题试卷第 1-12 题，整理课堂错题 2 道",
    teacherComment:
      "张晨家长好～\n张晨今天画图标注很规范，这一步值得肯定。\n求交点坐标时偶尔跳步，建议把步骤写完整，相信下次会更好。\n继续加油，我们一起陪着孩子把基础打扎实。",
  };

  const VIEW_META = {
    write: { title: "写反馈", tagline: "填几句课堂观察，自动生成发给家长的初高中数学课反馈" },
    format: { title: "我的格式", tagline: "调好一次发送格式，之后每次生成都按它来" },
    result: { title: "生成结果", tagline: "逐条复制，或一键复制全部发给家长" },
  };

  const $ = (sel) => document.querySelector(sel);
  const studentList = $("#studentList");
  const studentCount = $("#studentCount");

  /* ---------- 视图路由 ---------- */
  function showView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    const view = $(`#view-${name}`);
    if (view) view.classList.remove("hidden");

    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.view === name);
    });

    const meta = VIEW_META[name] || VIEW_META.write;
    $("#viewTitle").textContent = meta.title;
    $("#viewTagline").textContent = meta.tagline;

    // 结果页隐藏底部主导航，避免误触
    $("#tabbar").classList.toggle("hidden", name === "result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- 学员行 ---------- */
  function makeStudentRow(name = "", keywords = "") {
    const row = document.createElement("div");
    row.className = "student-row";
    row.innerHTML = `
      <input type="text" class="name" placeholder="姓名" value="${escapeAttr(name)}" />
      <input type="text" class="kw" placeholder="课堂表现，逗号分隔：亮点在前，待加强在后" value="${escapeAttr(keywords)}" />
      <button type="button" class="del" title="删除">×</button>
    `;
    row.querySelector(".del").addEventListener("click", () => {
      row.remove();
      syncStudents();
    });
    row.querySelectorAll("input").forEach((inp) =>
      inp.addEventListener("input", syncStudents)
    );
    return row;
  }

  function addStudent(name = "", keywords = "") {
    studentList.appendChild(makeStudentRow(name, keywords));
    syncStudents();
  }

  function syncStudents() {
    const rows = [...studentList.querySelectorAll(".student-row")];
    state.students = rows.map((r) => ({
      name: r.querySelector(".name").value.trim(),
      keywords: r.querySelector(".kw").value.trim(),
    }));
    const filled = state.students.filter((s) => s.name).length;
    studentCount.textContent = `${filled} 名`;
    saveState();
  }

  /* ---------- 分段控件 ---------- */
  function bindSeg(containerSel, dataKey, stateKey) {
    const container = $(containerSel);
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      container.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state[stateKey] = btn.dataset[dataKey];
      saveState();
    });
  }

  /* ---------- 我的格式：可视化构建器 ---------- */
  function renderBuilder() {
    const cfg = templateApi.normalizeConfig(state.templateConfig);
    state.templateConfig = cfg; // 回写规范化后的配置
    $("#tplTitle").value = cfg.title;

    const builder = $("#sectionBuilder");
    builder.innerHTML = "";

    const metaByKey = {};
    templateApi.SECTION_META.forEach((m) => (metaByKey[m.key] = m));

    cfg.sections.forEach((sec, idx) => {
      const meta = metaByKey[sec.key] || { name: sec.key, hint: "" };
      const item = document.createElement("div");
      item.className = "sec-item" + (sec.enabled ? "" : " off");
      item.dataset.key = sec.key;
      item.innerHTML = `
        <div class="sec-top">
          <label class="switch" title="开启 / 关闭这一栏">
            <input type="checkbox" class="sec-toggle" ${sec.enabled ? "checked" : ""} />
            <span class="slider"></span>
          </label>
          <div class="sec-info">
            <div class="sec-name">${escapeHtml(meta.name)}</div>
            <div class="sec-hint">${escapeHtml(meta.hint)}</div>
          </div>
          <div class="sec-move">
            <button type="button" class="mv mv-up" ${idx === 0 ? "disabled" : ""} aria-label="上移">↑</button>
            <button type="button" class="mv mv-down" ${idx === cfg.sections.length - 1 ? "disabled" : ""} aria-label="下移">↓</button>
          </div>
        </div>
        <div class="sec-heading-row">
          <span class="sec-heading-label">小标题</span>
          <input type="text" class="sec-heading" value="${escapeAttr(sec.heading)}" placeholder="这一栏在反馈里显示的标题" />
        </div>
      `;

      item.querySelector(".sec-toggle").addEventListener("change", (e) => {
        sec.enabled = e.target.checked;
        item.classList.toggle("off", !sec.enabled);
        saveState();
        updatePreview();
      });
      item.querySelector(".sec-heading").addEventListener("input", (e) => {
        sec.heading = e.target.value;
        saveState();
        updatePreview();
      });
      item.querySelector(".mv-up").addEventListener("click", () => moveSection(idx, -1));
      item.querySelector(".mv-down").addEventListener("click", () => moveSection(idx, 1));

      builder.appendChild(item);
    });

    updatePreview();
  }

  function moveSection(index, delta) {
    const sections = state.templateConfig.sections;
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const [moved] = sections.splice(index, 1);
    sections.splice(target, 0, moved);
    saveState();
    renderBuilder();
  }

  function updatePreview() {
    const text = templateApi.renderFromConfig(state.templateConfig, PREVIEW_SAMPLE);
    $("#tplPreview").textContent = text;
  }

  function resetTemplate() {
    state.templateConfig = deepClone(templateApi.DEFAULT_TEMPLATE_CONFIG);
    saveState();
    renderBuilder();
    toast("已恢复推荐格式");
  }

  /* ---------- AI 智能生成开关 ---------- */
  function bindAiToggle() {
    const toggle = $("#aiToggle");
    if (!toggle || !window.PFH_LLM) return;
    toggle.checked = window.PFH_LLM.isEnabled();
    updateMockNote(toggle.checked);
    toggle.addEventListener("change", (e) => {
      const on = e.target.checked;
      window.PFH_LLM.setEnabled(on);
      updateMockNote(on);
      toast(on ? "已开启 AI 智能生成（DeepSeek）" : "已切换回本地模板生成");
    });
  }

  function updateMockNote(aiOn) {
    const note = $("#mockNote");
    if (!note) return;
    note.textContent = aiOn
      ? "已开启 AI 智能生成：点评由 DeepSeek 撰写，仍按你的「我的格式」排版；服务异常会自动回退本地模板。"
      : "当前为本地模板生成模式。打开上方「AI 智能生成」可让大模型写出更自然、更个性化的点评。";
  }

  /* ---------- 生成 ---------- */
  async function generate() {
    syncStudents();
    state.lessonTime = $("#lessonTime").value.trim();
    state.lessonNo = $("#lessonNo").value.trim();
    state.topic = $("#topic").value.trim();
    state.homework = $("#homework").value.trim();
    state.classNote = $("#classNote").value.trim();

    const valid = state.students.filter((s) => s.name);
    if (valid.length === 0) {
      toast("请先至少添加一名学员（填上姓名）");
      return;
    }

    const btn = $("#generate");
    btn.disabled = true;
    btn.textContent = "正在生成…";

    const results = $("#results");
    results.innerHTML = "";

    let aiFellBack = false;
    const aiOn = !!(window.PFH_LLM && window.PFH_LLM.isEnabled());

    for (const student of valid) {
      const text = await window.generateFeedback({
        category: state.category,
        lessonTime: state.lessonTime,
        lessonNo: state.lessonNo,
        topic: state.topic,
        homework: state.homework,
        classNote: state.classNote,
        templateConfig: state.templateConfig,
        tone: state.tone,
        student,
        onFallback: () => { aiFellBack = true; },
      });
      results.appendChild(makeResultCard(student.name, text));
    }

    $("#resultCount").textContent = `${valid.length} 条`;
    showView("result");

    if (aiOn && aiFellBack) toast("AI 暂不可用，已用本地模板生成");

    btn.disabled = false;
    btn.textContent = "一键生成全班反馈";
  }

  function makeResultCard(name, text) {
    const card = document.createElement("div");
    card.className = "fb-card";
    const nameEl = document.createElement("div");
    nameEl.className = "fb-name";
    nameEl.textContent = name;
    const textEl = document.createElement("div");
    textEl.className = "fb-text";
    textEl.textContent = text;
    const actions = document.createElement("div");
    actions.className = "fb-actions";
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-copy";
    copyBtn.textContent = "复制";
    copyBtn.addEventListener("click", () => {
      copyText(text);
      copyBtn.textContent = "已复制 ✓";
      copyBtn.classList.add("done");
      setTimeout(() => {
        copyBtn.textContent = "复制";
        copyBtn.classList.remove("done");
      }, 1500);
    });
    actions.appendChild(copyBtn);
    card.append(nameEl, textEl, actions);
    return card;
  }

  function copyAll() {
    const cards = [...document.querySelectorAll("#results .fb-card")];
    const text = cards
      .map((c) => `【${c.querySelector(".fb-name").textContent}】\n${c.querySelector(".fb-text").textContent}`)
      .join("\n\n— — — — —\n\n");
    copyText(text);
    toast("已复制全部反馈");
  }

  /* ---------- 工具 ---------- */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 1800);
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------- 本地缓存（防止误刷丢内容） ---------- */
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tone: state.tone,
        lessonTime: $("#lessonTime").value,
        lessonNo: $("#lessonNo").value,
        topic: $("#topic").value,
        homework: $("#homework").value,
        classNote: $("#classNote").value,
        templateConfig: state.templateConfig,
        students: state.students,
      }));
    } catch (e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (s.tone) {
        state.tone = s.tone;
        setActiveSeg("#tone", "tone", s.tone);
      }
      $("#lessonTime").value = s.lessonTime || "";
      $("#lessonNo").value = s.lessonNo || "";
      $("#topic").value = s.topic || "";
      $("#homework").value = s.homework || "";
      $("#classNote").value = s.classNote || "";
      if (s.templateConfig) {
        state.templateConfig = templateApi.normalizeConfig(s.templateConfig);
      }
      if (Array.isArray(s.students) && s.students.length) {
        s.students.forEach((st) => addStudent(st.name, st.keywords));
        return true;
      }
    } catch (e) {}
    return false;
  }

  function setActiveSeg(containerSel, dataKey, value) {
    const container = $(containerSel);
    container.querySelectorAll(".seg-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset[dataKey] === value);
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    bindSeg("#tone", "tone", "tone");
    $("#addStudent").addEventListener("click", () => addStudent());
    $("#generate").addEventListener("click", generate);
    $("#copyAll").addEventListener("click", copyAll);
    $("#resetTemplate").addEventListener("click", resetTemplate);
    $("#backToEdit").addEventListener("click", () => showView("write"));
    $("#regenerate").addEventListener("click", () => showView("write"));

    // AI 智能生成开关（DeepSeek）
    bindAiToggle();

    // 栏目折叠
    $("#builderToggle").addEventListener("click", () => {
      const wrap = $("#sectionBuilderWrap");
      const icon = $("#foldIcon");
      const isHidden = wrap.classList.toggle("hidden");
      icon.textContent = isHidden ? "▼" : "▲";
    });

    // 底部导航
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => showView(tab.dataset.view));
    });

    // 标题 + 课程信息输入自动保存
    $("#tplTitle").addEventListener("input", (e) => {
      state.templateConfig.title = e.target.value;
      saveState();
      updatePreview();
    });
    ["#lessonTime", "#lessonNo", "#topic", "#homework", "#classNote"].forEach((sel) => {
      $(sel).addEventListener("input", saveState);
    });

    const restored = loadState();
    if (!restored) {
      // 预填示例，方便老师演示时立刻看到效果
      $("#lessonTime").value = "2026年6月15日";
      $("#lessonNo").value = "第8次课";
      $("#topic").value = "一次函数图像与性质";
      $("#homework").value = "完成一次函数专题试卷第 1-12 题，整理课堂错题 2 道";
      $("#classNote").value = "基础题完成度不错，综合题里定义域和取值范围还容易混";
      addStudent("张晨", "画图标注很规范，求交点坐标时偶尔跳步");
      addStudent("李思远", "能主动归纳 k 对图像的影响，应用题建模还需加强");
    }
    syncStudents();
    renderBuilder();
    showView("write");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
