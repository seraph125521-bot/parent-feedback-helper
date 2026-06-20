(function () {
  "use strict";

  const STORAGE_KEY = "pfh_math_sec_state_v3";
  const HISTORY_KEY = "pfh_history_v1";
  const STUDENT_ASSETS_KEY = "pfh_student_assets_v1";
  const PAYMENT_PROMPT_KEY = "pfh_payment_prompt_v1";
  const ASSET_FOLD_KEY = "pfh_asset_fold_v1";
  const HISTORY_FOLD_KEY = "pfh_history_fold_v1";
  const MAX_HISTORY = 30;
  const templateApi = window.PFH_TEMPLATE;
  const assetsApi = window.PFH_STUDENT_ASSETS;
  const copyApi = window.PFH_COPY_FORMAT;

  const state = {
    category: "数学",
    tone: "温暖鼓励",
    lessonMode: "class",
    lessonTime: "",
    lessonNo: "",
    topic: "",
    homework: "",
    classNote: "",
    templateConfig: deepClone(templateApi.DEFAULT_TEMPLATE_CONFIG),
    students: [],
  };

  // 授课类型对应的页面说明与主按钮文案
  const MODE_META = {
    class: {
      tagline: "填几句课堂观察，自动生成发给家长的初高中数学课反馈",
      btn: "一键生成全班反馈",
    },
    one: {
      tagline: "记录孩子本节掌握情况、主要卡点和下次辅导计划",
      btn: "生成一对一反馈",
    },
  };

  const ONE_FIELDS = ["#ooName", "#ooGrade", "#ooMastered", "#ooWeakness", "#ooPractice", "#ooParent", "#ooNextPlan"];

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
  let currentResults = [];
  let studentAssets = assetsApi ? assetsApi.createEmptyAssets() : { students: [], groups: [] };
  let copySuccessTimer = null;
  let historyFilterName = "";
  let pendingReference = null;
  // 折叠状态：true = 折叠（收起），false = 展开，默认折叠
  let assetCollapsed = true;
  let historyCollapsed = true;

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

    // 写反馈页根据授课类型同步表单、说明与按钮文案
    if (name === "write") {
      applyMode(state.lessonMode);
      syncOutputFieldStates();
      updateReferenceNotice();
    }

    // 结果页隐藏底部主导航，避免误触
    $("#tabbar").classList.toggle("hidden", name === "result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- 授课类型切换 ---------- */
  function genLabel() {
    if (state.lessonMode === "class") {
      const count = state.students.filter((s) => s.name).length;
      return count ? `大班 ${count} 名，生成反馈` : MODE_META.class.btn;
    }
    return (MODE_META[state.lessonMode] || MODE_META.class).btn;
  }

  function updateGenerateLabel() {
    const btn = $("#generate");
    if (btn && !btn.disabled) btn.textContent = genLabel();
  }

  function applyMode(mode) {
    const meta = MODE_META[mode] || MODE_META.class;
    document.querySelectorAll("[data-mode-block]").forEach((el) => {
      el.classList.toggle("hidden", el.dataset.modeBlock !== mode);
    });
    const gen = $("#generate");
    updateGenerateLabel();
    // 写反馈页时，副标题随模式变化
    const view = $("#view-write");
    if (view && !view.classList.contains("hidden")) {
      $("#viewTagline").textContent = meta.tagline;
    }
  }

  function bindModeSwitch() {
    const container = $("#lessonMode");
    if (!container) return;
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      container.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.lessonMode = btn.dataset.mode;
      applyMode(state.lessonMode);
      saveState();
    });
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
    updateGenerateLabel();
    renderStudentAssets();
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

  /* ---------- 我的格式 ↔ 写反馈弱联动 ---------- */
  const OUTPUT_SECTION_HINTS = {
    lesson: "当前不会输出时间/课次/学生信息",
    knowledge: "当前不会输出学习知识点栏目",
    homework: "我的格式中已关闭，填写后也不会出现在反馈里",
    comment: "当前不会输出老师点评栏目，生成结果可能缺少核心内容",
  };

  function isSectionEnabled(key) {
    const cfg = templateApi.normalizeConfig(state.templateConfig);
    const section = cfg.sections.find((s) => s.key === key);
    return !section || section.enabled !== false;
  }

  function syncOutputFieldStates() {
    document.querySelectorAll("[data-output-section]").forEach((el) => {
      const key = el.dataset.outputSection;
      const enabled = isSectionEnabled(key);
      el.classList.toggle("output-off", !enabled);

      el.querySelectorAll(".output-status-tag, .output-hint").forEach((node) => node.remove());
      if (enabled) return;

      const tag = document.createElement("span");
      tag.className = "output-status-tag";
      tag.textContent = "不输出";

      const label = el.querySelector("label") || el.querySelector(".card-title h2");
      if (label) label.appendChild(tag);

      const hint = document.createElement("div");
      hint.className = "output-hint";
      hint.textContent = OUTPUT_SECTION_HINTS[key] || "当前栏目不会出现在生成结果中";
      el.appendChild(hint);
    });
  }

  function warnHiddenOutputFields() {
    if (!isSectionEnabled("homework") && $("#homework").value.trim()) {
      toast("作业布置当前不会输出，可在「我的格式」中开启");
    }
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
        syncOutputFieldStates();
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
    syncOutputFieldStates();
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

  function exportConfig() {
    const data = {
      app: "parent-feedback-helper",
      version: 1,
      exportedAt: new Date().toISOString(),
      templateConfig: templateApi.normalizeConfig(state.templateConfig),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `课后反馈格式-${formatDateForFile(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("已导出我的格式");
  }

  function importConfigFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ""));
        const cfg = data.templateConfig || data;
        if (!cfg || !Array.isArray(cfg.sections)) throw new Error("bad config");
        state.templateConfig = templateApi.normalizeConfig(cfg);
        saveState();
        renderBuilder();
        updatePreview();
        syncOutputFieldStates();
        toast("格式已导入");
      } catch (e) {
        toast("导入失败，请选择正确的格式文件");
      } finally {
        $("#configFile").value = "";
      }
    };
    reader.onerror = () => toast("导入失败，请稍后重试");
    reader.readAsText(file);
  }

  function parseBatchStudents(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[\t,，]/).map((p) => p.trim()).filter(Boolean);
        return { name: parts[0] || "", keywords: parts.slice(1).join("，") };
      })
      .filter((item) => item.name);
  }

  function updateBatchPreview() {
    const items = parseBatchStudents($("#batchText").value);
    $("#batchPreview").textContent = `将添加 ${items.length} 名学员`;
  }

  function confirmBatchImport() {
    const items = parseBatchStudents($("#batchText").value);
    if (!items.length) {
      toast("请先粘贴学员名单");
      return;
    }
    const existing = new Set(state.students.map((s) => s.name).filter(Boolean));
    let added = 0;
    items.forEach((item) => {
      if (!existing.has(item.name)) {
        addStudent(item.name, item.keywords);
        existing.add(item.name);
        added += 1;
      }
    });
    $("#batchText").value = "";
    updateBatchPreview();
    $("#batchPanel").classList.add("hidden");
    toast(added ? `已导入 ${added} 名学员` : "名单里没有新的学员");
  }

  function loadStudentAssets() {
    if (!assetsApi) return;
    try {
      const raw = localStorage.getItem(STUDENT_ASSETS_KEY);
      studentAssets = assetsApi.normalizeAssets(raw ? JSON.parse(raw) : null);
    } catch (e) {
      studentAssets = assetsApi.createEmptyAssets();
    }
  }

  function saveStudentAssets() {
    if (!assetsApi) return;
    try {
      localStorage.setItem(STUDENT_ASSETS_KEY, JSON.stringify(studentAssets));
    } catch (e) {}
  }

  /* ---------- 折叠：常用学生 / 班级 ---------- */
  function applyAssetFold() {
    const body = $("#assetBody");
    const icon = $("#assetFoldIcon");
    if (!body || !icon) return;
    body.classList.toggle("hidden", assetCollapsed);
    icon.textContent = assetCollapsed ? "▼" : "▲";
  }

  function toggleAssetCard() {
    assetCollapsed = !assetCollapsed;
    applyAssetFold();
    try { localStorage.setItem(ASSET_FOLD_KEY, assetCollapsed ? "1" : "0"); } catch (e) {}
  }

  function updateAssetSummary() {
    const el = $("#assetSummary");
    if (!el || !assetsApi) return;
    const groups = assetsApi.getRecentGroups(studentAssets, 1);
    const students = assetsApi.getRecentStudents(studentAssets, 8);
    if (groups.length) {
      el.textContent = groups[0].name;
    } else if (students.length) {
      el.textContent = `${students.length} 位最近学生`;
    } else {
      el.textContent = "点击展开";
    }
  }

  /* ---------- 折叠：最近生成 ---------- */
  function applyHistoryFold() {
    const body = $("#historyBody");
    const icon = $("#historyFoldIcon");
    if (!body || !icon) return;
    body.classList.toggle("hidden", historyCollapsed);
    icon.textContent = historyCollapsed ? "▼" : "▲";
  }

  function toggleHistoryCard() {
    historyCollapsed = !historyCollapsed;
    applyHistoryFold();
    try { localStorage.setItem(HISTORY_FOLD_KEY, historyCollapsed ? "1" : "0"); } catch (e) {}
  }

  function updateHistorySummary() {
    const el = $("#historySummary");
    if (!el) return;
    const history = loadHistory();
    if (!history.length) { el.textContent = ""; return; }
    const latest = history[0];
    const topic = latest.topic || "未填写主题";
    el.textContent = `${topic} · ${formatDisplayTime(latest.createdAt)}`;
  }

  function renderStudentAssets() {
    if (!assetsApi) return;
    updateAssetSummary();
    renderStudentChips();
    renderGroupChips();
  }

  function renderStudentChips() {
    const wrap = $("#studentChips");
    if (!wrap) return;
    const students = assetsApi.getRecentStudents(studentAssets, 8);
    if (!students.length) {
      wrap.className = "chip-list empty-note";
      wrap.textContent = "生成一次反馈后，会自动出现在这里";
      return;
    }
    wrap.className = "chip-list";
    wrap.innerHTML = "";
    const currentNames = new Set(state.students.map((s) => s.name).filter(Boolean));
    students.forEach((student) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asset-chip" + (currentNames.has(student.name) ? " selected" : "");
      btn.textContent = student.name;
      btn.title = student.lastKeywords || student.defaultKeywords || "加入本次名单";
      btn.addEventListener("click", () => addAssetStudent(student));
      wrap.appendChild(btn);
    });
  }

  function renderGroupChips() {
    const wrap = $("#groupChips");
    if (!wrap) return;
    const groups = assetsApi.getRecentGroups(studentAssets, 3);
    if (!groups.length) {
      wrap.className = "chip-list empty-note";
      wrap.textContent = "还没有常用班级";
      return;
    }
    wrap.className = "chip-list";
    wrap.innerHTML = "";
    groups.forEach((group) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asset-chip group-chip";
      btn.textContent = `${group.name} · ${group.studentIds.length}人`;
      btn.addEventListener("click", () => addGroupStudents(group.id));
      wrap.appendChild(btn);
    });
  }

  function addAssetStudent(student) {
    if (state.students.some((s) => s.name === student.name)) {
      toast("已在本次名单中");
      return;
    }
    addStudent(student.name, student.lastKeywords || student.defaultKeywords || "");
    renderStudentAssets();
  }

  function addGroupStudents(groupId) {
    const students = assetsApi.getGroupStudents(studentAssets, groupId);
    if (!students.length) {
      toast("这个班级里还没有可带入的学生");
      return;
    }
    const existing = new Set(state.students.map((s) => s.name).filter(Boolean));
    let added = 0;
    students.forEach((student) => {
      if (existing.has(student.name)) return;
      addStudent(student.name, student.keywords || "");
      existing.add(student.name);
      added += 1;
    });
    toast(added ? `已带入 ${added} 名学员` : "班级学生已在本次名单中");
    renderStudentAssets();
  }

  function saveCurrentGroup() {
    syncStudents();
    const valid = state.students.filter((s) => s.name);
    if (!valid.length) {
      toast("请先添加学员名单");
      return;
    }
    const name = prompt("给这组学生起个名字", state.topic ? `${state.topic}班` : "我的班级");
    if (!name || !name.trim()) return;
    studentAssets = assetsApi.saveGroupFromStudents(studentAssets, name.trim(), valid);
    saveStudentAssets();
    renderStudentAssets();
    toast("已保存为常用班级");
  }

  function trackCurrentStudentsUsage(students) {
    if (!assetsApi) return;
    studentAssets = assetsApi.trackStudentUsage(studentAssets, students || []);
    saveStudentAssets();
    renderStudentAssets();
  }

  function clearExampleForm() {
    ["#lessonTime", "#lessonNo", "#topic", "#homework", "#classNote", "#classContent"]
      .concat(ONE_FIELDS)
      .forEach((sel) => { $(sel).value = ""; });
    studentList.innerHTML = "";
    addStudent();
    $("#sampleCard").classList.add("hidden");
    saveState();
    toast("已清空示例，可以开始填写");
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
    if (state.lessonMode === "one") return generateOne();
    return generateClass();
  }

  async function generateClass() {
    syncStudents();
    state.lessonTime = $("#lessonTime").value.trim();
    state.lessonNo = $("#lessonNo").value.trim();
    state.topic = $("#topic").value.trim();
    state.homework = $("#homework").value.trim();
    state.classNote = $("#classNote").value.trim();
    warnHiddenOutputFields();

    const valid = state.students.filter((s) => s.name);
    if (valid.length === 0) {
      toast("请先至少添加一名学员（填上姓名）");
      return;
    }

    const btn = $("#generate");
    btn.disabled = true;
    btn.textContent = `正在生成 0/${valid.length}`;

    const results = $("#results");
    results.innerHTML = "";
    currentResults = [];

    let aiFellBack = false;
    const aiOn = !!(window.PFH_LLM && window.PFH_LLM.isEnabled());

    for (let i = 0; i < valid.length; i += 1) {
      const student = valid[i];
      btn.textContent = `正在生成 ${i + 1}/${valid.length}`;
      const input = {
        category: state.category,
        mode: "class",
        lessonTime: state.lessonTime,
        lessonNo: state.lessonNo,
        topic: state.topic,
        homework: state.homework,
        classNote: state.classNote,
        templateConfig: state.templateConfig,
        tone: state.tone,
        student,
        previousFeedback: pendingReference && pendingReference.name === student.name ? pendingReference.text : "",
        onFallback: () => { aiFellBack = true; },
      };
      const text = await window.generateFeedback(input);
      const sourceInput = { ...input, student: { ...student }, onFallback: undefined };
      currentResults.push({ name: student.name, text, input: sourceInput });
      results.appendChild(makeResultCard(student.name, text, "", sourceInput));
    }

    $("#resultCount").textContent = `${valid.length} 条`;
    saveHistory({
      lessonMode: "class",
      topic: state.topic,
      studentCount: valid.length,
      formSnapshot: createFormSnapshot(),
      results: currentResults.map(({ name, text }) => ({ name, text })),
    });
    trackCurrentStudentsUsage(valid);
    showView("result");

    if (aiOn && aiFellBack) toast("AI 暂不可用，已用本地模板生成");

    btn.disabled = false;
    btn.textContent = genLabel();
  }

  async function generateOne() {
    const name = $("#ooName").value.trim();
    if (!name) {
      toast("请先填写学生姓名");
      return;
    }
    warnHiddenOutputFields();
    saveState();

    const btn = $("#generate");
    btn.disabled = true;
    btn.textContent = "正在生成…";

    const results = $("#results");
    results.innerHTML = "";
    currentResults = [];

    let aiFellBack = false;
    const aiOn = !!(window.PFH_LLM && window.PFH_LLM.isEnabled());

    const input = {
      category: state.category,
      mode: "one",
      templateConfig: state.templateConfig,
      tone: state.tone,
      lessonTime: $("#lessonTime").value.trim(),
      lessonNo: $("#lessonNo").value.trim(),
      topic: $("#topic").value.trim(),
      homework: $("#homework").value.trim(),
      classContent: $("#classContent").value.trim(),
      student: { name, grade: $("#ooGrade").value.trim() },
      mastered: $("#ooMastered").value.trim(),
      weakness: $("#ooWeakness").value.trim(),
      practiceAdvice: $("#ooPractice").value.trim(),
      parentAdvice: $("#ooParent").value.trim(),
      nextPlan: $("#ooNextPlan").value.trim(),
      previousFeedback: pendingReference && pendingReference.name === name ? pendingReference.text : "",
      onFallback: () => { aiFellBack = true; },
    };

    const text = await window.generateFeedback(input);
    const sourceInput = { ...input, student: { ...input.student }, onFallback: undefined };

    currentResults.push({ name, text, tag: "一对一", input: sourceInput });
    results.appendChild(makeResultCard(name, text, "一对一", sourceInput));
    $("#resultCount").textContent = "1 条";
    saveHistory({
      lessonMode: "one",
      topic: input.topic,
      studentCount: 1,
      formSnapshot: createFormSnapshot(),
      results: currentResults.map(({ name, text }) => ({ name, text })),
    });
    trackCurrentStudentsUsage([{ name, keywords: input.weakness || input.mastered || input.topic || "" }]);
    showView("result");

    if (aiOn && aiFellBack) toast("AI 暂不可用，已用本地模板生成");

    btn.disabled = false;
    btn.textContent = genLabel();
  }

  function makeResultCard(name, text, tag, sourceInput) {
    const card = document.createElement("div");
    card.className = "fb-card";
    card._pfhInput = sourceInput ? deepClone(sourceInput) : null;
    const nameEl = document.createElement("div");
    nameEl.className = "fb-name";
    nameEl.textContent = name;
    if (tag) {
      const tagEl = document.createElement("span");
      tagEl.className = "fb-tag";
      tagEl.textContent = tag;
      nameEl.appendChild(tagEl);
    }
    const textEl = document.createElement("div");
    textEl.className = "fb-text";
    textEl.textContent = text;
    const actions = document.createElement("div");
    actions.className = "fb-actions";
    const rewriteBtn = document.createElement("button");
    rewriteBtn.className = "btn-copy btn-rewrite";
    rewriteBtn.textContent = "换一版";
    rewriteBtn.addEventListener("click", () => rewriteResultCard(card, textEl, rewriteBtn));
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-copy";
    copyBtn.textContent = "复制";
    copyBtn.addEventListener("click", () => {
      copyText(formatResultsForCopy([{ name, text: textEl.textContent }], { mode: tag ? "one" : "class", includeName: !tag }));
      copyBtn.textContent = "已复制，可粘贴到微信";
      copyBtn.classList.add("done");
      setTimeout(() => {
        copyBtn.textContent = "复制";
        copyBtn.classList.remove("done");
      }, 2800);
    });
    actions.append(rewriteBtn, copyBtn);
    card.append(nameEl, textEl, actions);
    return card;
  }

  async function rewriteResultCard(card, textEl, btn) {
    if (!card._pfhInput) return;
    const oldText = textEl.textContent;
    btn.disabled = true;
    btn.textContent = "重写中…";
    let fellBack = false;
    try {
      const nextText = await window.generateFeedback({
        ...deepClone(card._pfhInput),
        onFallback: () => { fellBack = true; },
      });
      textEl.textContent = nextText;
      if (fellBack) toast("AI 忙，已用本地模板重写");
    } catch (e) {
      textEl.textContent = oldText;
      toast("AI 忙，原反馈已保留");
    } finally {
      btn.disabled = false;
      btn.textContent = "换一版";
    }
  }

  function copyAll() {
    const cards = [...document.querySelectorAll("#results .fb-card")];
    const text = formatResultsForCopy(cards.map((c) => ({
      name: getResultName(c),
      text: c.querySelector(".fb-text").textContent,
    })), { mode: state.lessonMode });
    copyText(text);
    showCopySuccess("已复制全部，可直接粘贴到微信");
    revealPaymentAfterCopy();
    toast("已复制全部反馈");
  }

  function saveHistory(entry) {
    try {
      const history = loadHistory();
      const results = entry.results || [];
      history.unshift({
        id: Date.now(),
        createdAt: new Date().toISOString(),
        studentNames: results.map((r) => r.name).filter(Boolean),
        studentIds: [],
        ...entry,
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
      renderHistory();
    } catch (e) {}
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return assetsApi ? assetsApi.migrateHistoryEntries(data) : (Array.isArray(data) ? data : []);
    } catch (e) {
      return [];
    }
  }

  function renderHistory() {
    const card = $("#historyCard");
    const list = $("#historyList");
    if (!card || !list) return;
    const history = loadHistory();
    card.classList.toggle("hidden", history.length === 0);
    updateHistorySummary();
    applyHistoryFold();
    renderHistoryFilters(history);
    const visible = historyFilterName
      ? history.filter((item) => (item.studentNames || []).includes(historyFilterName))
      : history;
    list.innerHTML = "";
    visible.slice(0, 3).forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-item";
      const topic = item.topic || "未填写主题";
      const mode = item.lessonMode === "one" ? "一对一" : "大班课";
      const studentText = historyFilterName ? ` · ${historyFilterName}` : "";
      row.innerHTML = `
        <div class="history-topic">${escapeHtml(topic)}</div>
        <div class="history-meta">${escapeHtml(mode)} · ${item.studentCount || 0} 条${escapeHtml(studentText)} · ${escapeHtml(formatDisplayTime(item.createdAt))}</div>
        <div class="history-actions">
          <button type="button" class="btn-ghost" data-action="restore">恢复填写</button>
          <button type="button" class="btn-ghost" data-action="copy">复制结果</button>
          <button type="button" class="btn-ghost" data-action="continue">参考生成</button>
          <button type="button" class="btn-danger-text" data-action="delete">删除</button>
        </div>
      `;
      row.querySelector('[data-action="restore"]').addEventListener("click", () => restoreHistory(item));
      row.querySelector('[data-action="copy"]').addEventListener("click", () => copyHistory(item));
      row.querySelector('[data-action="continue"]').addEventListener("click", () => continueFromHistory(item));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteHistory(item.id));
      list.appendChild(row);
    });
  }

  function renderHistoryFilters(history) {
    const wrap = $("#historyFilters");
    if (!wrap) return;
    const names = Array.from(new Set(history.flatMap((item) => item.studentNames || []))).filter(Boolean).slice(0, 12);
    wrap.innerHTML = "";
    if (!names.length) return;
    const all = document.createElement("button");
    all.type = "button";
    all.className = "asset-chip" + (!historyFilterName ? " selected" : "");
    all.textContent = "全部";
    all.addEventListener("click", () => {
      historyFilterName = "";
      renderHistory();
    });
    wrap.appendChild(all);
    names.forEach((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asset-chip" + (historyFilterName === name ? " selected" : "");
      btn.textContent = name;
      btn.addEventListener("click", () => {
        historyFilterName = name;
        renderHistory();
      });
      wrap.appendChild(btn);
    });
  }

  function restoreHistory(item) {
    applySnapshot(item.formSnapshot || {});
    saveState();
    syncStudents();
    showView("write");
    toast("已恢复到这次填写");
  }

  function continueFromHistory(item) {
    const results = item.results || [];
    const target = historyFilterName
      ? results.find((result) => result.name === historyFilterName)
      : results[0];
    if (!target) {
      toast("这条历史里没有可参考的反馈");
      return;
    }
    applySnapshot(item.formSnapshot || {});
    pendingReference = { name: target.name, text: target.text };
    updateReferenceNotice();
    saveState();
    syncStudents();
    showView("write");
    toast("已带入上次反馈作为参考");
  }

  function copyHistory(item) {
    const results = historyFilterName
      ? (item.results || []).filter((result) => result.name === historyFilterName)
      : (item.results || []);
    const text = formatResultsForCopy(results, { mode: item.lessonMode || "class", includeName: item.lessonMode !== "one" });
    copyText(text);
    showCopySuccess("已复制历史反馈，可直接粘贴到微信");
    toast("已复制历史反馈");
  }

  function deleteHistory(id) {
    const history = loadHistory().filter((item) => item.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
    toast("已删除这条记录");
  }

  function clearHistory() {
    if (!confirm("确定清空最近生成记录吗？")) return;
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    toast("已清空历史记录");
  }

  function updateReferenceNotice() {
    const el = $("#referenceNotice");
    if (!el) return;
    if (!pendingReference) {
      el.classList.add("hidden");
      return;
    }
    el.firstChild.textContent = `正在参考 ${pendingReference.name || "学生"} 的上次反馈`;
    el.classList.remove("hidden");
  }

  function clearReference() {
    pendingReference = null;
    updateReferenceNotice();
    toast("已取消参考上次反馈");
  }

  function createFormSnapshot() {
    return {
      lessonMode: state.lessonMode,
      tone: state.tone,
      lessonTime: $("#lessonTime").value,
      lessonNo: $("#lessonNo").value,
      topic: $("#topic").value,
      homework: $("#homework").value,
      classNote: $("#classNote").value,
      classContent: $("#classContent").value,
      students: deepClone(state.students),
      oneOnOne: {
        name: $("#ooName").value,
        grade: $("#ooGrade").value,
        mastered: $("#ooMastered").value,
        weakness: $("#ooWeakness").value,
        practice: $("#ooPractice").value,
        parent: $("#ooParent").value,
        nextPlan: $("#ooNextPlan").value,
      },
    };
  }

  function applySnapshot(snapshot) {
    if (snapshot.tone) {
      state.tone = snapshot.tone;
      setActiveSeg("#tone", "tone", snapshot.tone);
    }
    if (snapshot.lessonMode) {
      state.lessonMode = snapshot.lessonMode;
      setActiveSeg("#lessonMode", "mode", snapshot.lessonMode);
    }
    $("#lessonTime").value = snapshot.lessonTime || "";
    $("#lessonNo").value = snapshot.lessonNo || "";
    $("#topic").value = snapshot.topic || "";
    $("#homework").value = snapshot.homework || "";
    $("#classNote").value = snapshot.classNote || "";
    $("#classContent").value = snapshot.classContent || "";
    const oo = snapshot.oneOnOne || {};
    $("#ooName").value = oo.name || "";
    $("#ooGrade").value = oo.grade || "";
    $("#ooMastered").value = oo.mastered || "";
    $("#ooWeakness").value = oo.weakness || "";
    $("#ooPractice").value = oo.practice || "";
    $("#ooParent").value = oo.parent || "";
    $("#ooNextPlan").value = oo.nextPlan || "";
    studentList.innerHTML = "";
    (snapshot.students || []).forEach((st) => addStudent(st.name, st.keywords));
    applyMode(state.lessonMode);
  }

  function updatePaymentVisibility() {
    const card = $("#paymentCard");
    if (!card) return;
    const hidden = localStorage.getItem(PAYMENT_PROMPT_KEY) === "hidden";
    card.classList.remove("is-muted");
    if (hidden) $("#paymentDetail").classList.add("hidden");
  }

  function revealPaymentAfterCopy() {
    try {
      if (localStorage.getItem(PAYMENT_PROMPT_KEY) === "hidden") return;
      $("#paymentDetail").classList.remove("hidden");
    } catch (e) {}
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

  function formatResultsForCopy(results, options) {
    if (copyApi && copyApi.formatResultsForCopy) {
      return copyApi.formatResultsForCopy(results, options);
    }
    return (results || []).map((item) => `【${item.name || "学生"}】\n${item.text || ""}`).join("\n\n");
  }

  function showCopySuccess(message) {
    const el = $("#copySuccess");
    if (!el) return;
    el.textContent = message || "已复制，可直接粘贴到微信";
    el.classList.remove("hidden");
    clearTimeout(copySuccessTimer);
    copySuccessTimer = setTimeout(() => el.classList.add("hidden"), 3000);
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
  function formatDateForFile(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }
  function formatDisplayTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function getResultName(card) {
    const nameEl = card.querySelector(".fb-name");
    return nameEl && nameEl.childNodes[0] ? nameEl.childNodes[0].textContent.trim() : "学生";
  }

  /* ---------- 本地缓存（防止误刷丢内容） ---------- */
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tone: state.tone,
        lessonMode: state.lessonMode,
        lessonTime: $("#lessonTime").value,
        lessonNo: $("#lessonNo").value,
        topic: $("#topic").value,
        homework: $("#homework").value,
        classNote: $("#classNote").value,
        classContent: $("#classContent").value,
        templateConfig: state.templateConfig,
        students: state.students,
        oneOnOne: {
          name: $("#ooName").value,
          grade: $("#ooGrade").value,
          mastered: $("#ooMastered").value,
          weakness: $("#ooWeakness").value,
          practice: $("#ooPractice").value,
          parent: $("#ooParent").value,
          nextPlan: $("#ooNextPlan").value,
        },
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
      if (s.lessonMode) {
        state.lessonMode = s.lessonMode;
        setActiveSeg("#lessonMode", "mode", s.lessonMode);
      }
      $("#lessonTime").value = s.lessonTime || "";
      $("#lessonNo").value = s.lessonNo || "";
      $("#topic").value = s.topic || "";
      $("#homework").value = s.homework || "";
      $("#classNote").value = s.classNote || "";
      $("#classContent").value = s.classContent || "";
      const oo = s.oneOnOne || {};
      $("#ooName").value = oo.name || "";
      $("#ooGrade").value = oo.grade || "";
      $("#ooMastered").value = oo.mastered || "";
      $("#ooWeakness").value = oo.weakness || "";
      $("#ooPractice").value = oo.practice || "";
      $("#ooParent").value = oo.parent || "";
      $("#ooNextPlan").value = oo.nextPlan || "";
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
    bindModeSwitch();
    $("#addStudent").addEventListener("click", () => addStudent());
    $("#generate").addEventListener("click", generate);
    $("#copyAll").addEventListener("click", copyAll);
    $("#resetTemplate").addEventListener("click", resetTemplate);
    $("#backToEdit").addEventListener("click", () => showView("write"));
    $("#regenerate").addEventListener("click", () => showView("write"));
    $("#clearExample").addEventListener("click", clearExampleForm);
    $("#showBatchImport").addEventListener("click", () => {
      $("#batchPanel").classList.toggle("hidden");
      updateBatchPreview();
    });
    $("#batchText").addEventListener("input", updateBatchPreview);
    $("#cancelBatchImport").addEventListener("click", () => $("#batchPanel").classList.add("hidden"));
    $("#confirmBatchImport").addEventListener("click", confirmBatchImport);
    $("#exportConfig").addEventListener("click", exportConfig);
    $("#importConfig").addEventListener("click", () => $("#configFile").click());
    $("#configFile").addEventListener("change", (e) => importConfigFile(e.target.files && e.target.files[0]));
    $("#showPaymentDetail").addEventListener("click", () => $("#paymentDetail").classList.toggle("hidden"));
    $("#hidePayment").addEventListener("click", () => {
      localStorage.setItem(PAYMENT_PROMPT_KEY, "hidden");
      updatePaymentVisibility();
    });
    $("#clearHistory").addEventListener("click", clearHistory);
    $("#saveCurrentGroup").addEventListener("click", saveCurrentGroup);
    $("#clearReference").addEventListener("click", clearReference);

    // 常用学生 / 班级折叠
    $("#assetHeader").addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      toggleAssetCard();
    });

    // 最近生成折叠
    $("#historyHeader").addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      toggleHistoryCard();
    });

    loadStudentAssets();

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
    ["#lessonTime", "#lessonNo", "#topic", "#homework", "#classNote", "#classContent"]
      .concat(ONE_FIELDS)
      .forEach((sel) => {
        $(sel).addEventListener("input", saveState);
      });

    const restored = loadState();
    if (restored) $("#sampleCard").classList.add("hidden");
    if (!restored) {
      // 预填示例，方便老师演示时立刻看到效果
      $("#lessonTime").value = "2026年6月15日";
      $("#lessonNo").value = "第8次课";
      $("#topic").value = "一次函数图像与性质";
      $("#homework").value = "完成一次函数专题试卷第 1-12 题，整理课堂错题 2 道";
      $("#classNote").value = "基础题完成度不错，综合题里定义域和取值范围还容易混";
      addStudent("张晨", "画图标注很规范，求交点坐标时偶尔跳步");
      addStudent("李思远", "能主动归纳 k 对图像的影响，应用题建模还需加强");

      // 一对一示例数据
      $("#classContent").value = "精讲一次函数与几何结合的压轴题 2 道";
      $("#ooName").value = "张晨";
      $("#ooGrade").value = "初二";
      $("#ooMastered").value = "基础图像判断、k 与 b 对图像的影响，常规题型能独立完成";
      $("#ooWeakness").value = "综合题里条件整理不够清晰，容易跳步";
      $("#ooPractice").value = "把今天错的两道题重做一遍，写清已知条件和每步推导";
      $("#ooParent").value = "请家长提醒孩子做题先列条件再动笔";
      $("#ooNextPlan").value = "下次课继续做一次函数与几何结合题型，强化综合分析";
    }
    syncStudents();
    renderBuilder();
    // 恢复折叠状态（"0" = 用户上次主动展开；否则默认折叠）
    assetCollapsed = localStorage.getItem(ASSET_FOLD_KEY) !== "0";
    historyCollapsed = localStorage.getItem(HISTORY_FOLD_KEY) !== "0";
    applyAssetFold();
    renderHistory();
    renderStudentAssets();
    updatePaymentVisibility();
    showView("write");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
