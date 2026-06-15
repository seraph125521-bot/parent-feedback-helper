(function () {
  "use strict";

  const STORAGE_KEY = "pfh_math_sec_state_v1";

  const state = {
    category: "数学",
    tone: "温暖鼓励",
    lessonTime: "",
    lessonNo: "",
    topic: "",
    homework: "",
    classNote: "",
    feedbackTemplate: "",
    students: [],
  };

  const $ = (sel) => document.querySelector(sel);
  const studentList = $("#studentList");
  const studentCount = $("#studentCount");
  const templateApi = window.PFH_TEMPLATE;

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

  /* ---------- 生成 ---------- */
  async function generate() {
    syncStudents();
    state.lessonTime = $("#lessonTime").value.trim();
    state.lessonNo = $("#lessonNo").value.trim();
    state.topic = $("#topic").value.trim();
    state.homework = $("#homework").value.trim();
    state.classNote = $("#classNote").value.trim();
    state.feedbackTemplate = $("#feedbackTemplate").value.trim();

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

    for (const student of valid) {
      const text = await window.generateFeedback({
        category: state.category,
        lessonTime: state.lessonTime,
        lessonNo: state.lessonNo,
        topic: state.topic,
        homework: state.homework,
        classNote: state.classNote,
        feedbackTemplate: state.feedbackTemplate,
        tone: state.tone,
        student,
      });
      results.appendChild(makeResultCard(student.name, text));
    }

    $("#resultCount").textContent = `${valid.length} 条`;
    $("#inputPanel").classList.add("hidden");
    $("#resultPanel").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

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
    return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
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
        feedbackTemplate: $("#feedbackTemplate").value,
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
      $("#feedbackTemplate").value = s.feedbackTemplate || templateApi.DEFAULT_FEEDBACK_TEMPLATE;
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
    $("#resetTemplate").addEventListener("click", () => {
      $("#feedbackTemplate").value = templateApi.DEFAULT_FEEDBACK_TEMPLATE;
      saveState();
      toast("已恢复默认反馈格式");
    });
    $("#backToEdit").addEventListener("click", () => {
      $("#resultPanel").classList.add("hidden");
      $("#inputPanel").classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    ["#lessonTime", "#lessonNo", "#topic", "#homework", "#classNote", "#feedbackTemplate"].forEach((sel) => {
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
      $("#feedbackTemplate").value = templateApi.DEFAULT_FEEDBACK_TEMPLATE;
      addStudent("张晨", "画图标注很规范，求交点坐标时偶尔跳步");
      addStudent("李思远", "能主动归纳 k 对图像的影响，应用题建模还需加强");
    }
    syncStudents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
