(function () {
  "use strict";

  const STORAGE_KEY = "pfh_math_sec_state_v1";

  const state = {
    category: "数学",
    tone: "温暖鼓励",
    topic: "",
    classNote: "",
    students: [],
  };

  const $ = (sel) => document.querySelector(sel);
  const studentList = $("#studentList");
  const studentCount = $("#studentCount");

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
    state.topic = $("#topic").value.trim();
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

    for (const student of valid) {
      const text = await window.generateFeedback({
        category: state.category,
        topic: state.topic,
        classNote: state.classNote,
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
        topic: $("#topic").value,
        classNote: $("#classNote").value,
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
      $("#topic").value = s.topic || "";
      $("#classNote").value = s.classNote || "";
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
    $("#backToEdit").addEventListener("click", () => {
      $("#resultPanel").classList.add("hidden");
      $("#inputPanel").classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("#topic").addEventListener("input", saveState);
    $("#classNote").addEventListener("input", saveState);

    const restored = loadState();
    if (!restored) {
      // 预填示例，方便老师演示时立刻看到效果
      $("#topic").value = "一次函数图像与性质";
      $("#classNote").value = "基础题完成度不错，综合题里定义域和取值范围还容易混";
      addStudent("张晨", "画图标注很规范，求交点坐标时偶尔跳步");
      addStudent("李思远", "能主动归纳 k 对图像的影响，应用题建模还需加强");
    }
    syncStudents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
