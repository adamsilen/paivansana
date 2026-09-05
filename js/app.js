/* ─────────────────────────────────────────────────────────────
   päivän sana — app (views & interactions)
   ───────────────────────────────────────────────────────────── */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const T = window.PS_I18N;
  const api = window.PsAPI;

  let authMode = "signin";
  let currentTab = "today";
  let historyWords = [];
  let sortMode = "newest";

  // settings / push
  let pushSub = null; // this device's active push subscription

  // today
  let todayWord = null;
  let todaySide = "fi"; // which side is shown: 'fi' | 'sv'
  let todayChecked = false;

  // practice
  let practicePool = [];
  let practiceWord = null;
  let practiceDir = "sv_fi"; // 'sv_fi' (type finnish) | 'fi_sv' (reveal swedish)
  let practiceRevealed = false;
  let practiceChecked = false;
  let lastPracticeId = null;

  /* ── view switching ── */
  function showView(name) {
    $$(".view").forEach((v) => v.classList.add("hidden"));
    const el = $("#view-" + name);
    if (el) el.classList.remove("hidden");
  }

  const MORE_VIEWS = ["settings", "admin"]; // views reached via the Mer menu

  function closeMoreMenu() {
    $("#more-menu").classList.add("hidden");
  }

  function openMoreMenu() {
    const menu = $("#more-menu");
    const anchor = document.querySelector('#tabbar [data-tab="more"]');
    menu.classList.remove("hidden");
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.max(12, Math.min(r.right - 200, window.innerWidth - 212)) + "px";
    menu.style.top = (r.top - menu.offsetHeight - 10) + "px";
  }

  function switchTab(tab) {
    closeMoreMenu();
    if (tab === "signout") { doSignOut(); return; }
    if (tab === "more") { openMoreMenu(); return; } // menu, not a page
    currentTab = tab;
    const activeTab = MORE_VIEWS.includes(tab) ? "more" : tab;
    $$("#tabbar .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
    if (tab === "today") { showView("today"); loadToday(); }
    if (tab === "practice") { showView("practice"); loadPractice(); }
    if (tab === "history") { showView("history"); renderHistory(); }
    if (tab === "admin") { showView("admin"); renderAdmin(); }
    if (tab === "settings") { showView("settings"); renderSettings(); }
    window.scrollTo(0, 0);
  }

  /* ── auth ── */
  function renderAuth() {
    $("#tabbar").classList.add("hidden");
    showView("auth");
    $("#auth-submit").textContent = authMode === "signin" ? T.signIn : T.signUp;
    $("#auth-toggle").innerHTML = authMode === "signin"
      ? "Inget konto? <strong>Skapa ett här</strong>"
      : "Har du redan ett konto? <strong>Logga in</strong>";
  }

  async function doAuth(e) {
    e.preventDefault();
    const email = $("#auth-email").value.trim();
    const password = $("#auth-password").value;
    $("#auth-error").textContent = "";
    $("#auth-submit").disabled = true;
    try {
      if (authMode === "signin") await api.signIn(email, password);
      else await api.signUp(email, password);
      enterApp();
    } catch (err) {
      $("#auth-error").textContent = err.message || T.errorGeneric;
    }
    $("#auth-submit").disabled = false;
  }

  function doSignOut() {
    closeMoreMenu();
    api.signOut();
    $$("#tabbar .tab").forEach((t) => t.classList.remove("active"));
    renderAuth();
  }

  function enterApp() {
    $("#tabbar").classList.remove("hidden");
    $("#more-admin").classList.toggle("hidden", !api.isAdmin());
    switchTab("today");
  }

  /* ── correction: case-insensitive + trimmed, diacritics matter ── */
  function normalize(s) {
    return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function isCorrect(input, answer) {
    return normalize(input) === normalize(answer);
  }

  /* ════════════════════════ TODAY ════════════════════════ */
  async function loadToday() {
    $("#today-loading").classList.remove("hidden");
    $("#word-card").classList.add("hidden");
    $("#today-empty").classList.add("hidden");
    $("#push-onboarding").classList.add("hidden");

    const [word, savedSide] = await Promise.all([
      api.fetchDailyWord(),
      api.fetchState("today:" + api.todayISO()),
    ]);
    todayWord = word;
    todaySide = savedSide === "sv" ? "sv" : "fi";
    todayChecked = false;

    $("#today-loading").classList.add("hidden");
    if (!word) {
      $("#today-empty").classList.remove("hidden");
    } else {
      renderToday();
    }
    maybeShowPushOnboarding();
  }

  function renderToday() {
    const card = $("#word-card");
    card.classList.remove("hidden");
    const onSv = todaySide === "sv";
    card.classList.toggle("revealed", onSv);

    $("#word-side").textContent = onSv ? "Svenska" : "Finska";
    $("#word-text").textContent = onSv ? todayWord.swedish : todayWord.finnish;
    $("#word-hint").textContent = "";
    const ex = onSv ? todayWord.example_sv : todayWord.example_fi;
    $("#word-example").classList.toggle("hidden", !ex);
    if (ex) $("#word-example").textContent = ex;
  }

  function flipToday() {
    if (!todayWord) return;
    todaySide = todaySide === "fi" ? "sv" : "fi";
    renderToday();
    api.putState("today:" + api.todayISO(), todaySide);
  }

  /* ════════════════════════ PRACTICE ════════════════════════ */
  async function loadPractice() {
    $("#practice-loading").classList.remove("hidden");
    $("#practice-card").classList.add("hidden");
    $("#practice-exercise").classList.add("hidden");
    $("#practice-feedback").classList.add("hidden");
    $("#practice-next").classList.add("hidden");
    $("#practice-empty").classList.add("hidden");

    try {
      practicePool = await api.fetchHistory();
    } catch { practicePool = []; }

    $("#practice-loading").classList.add("hidden");
    if (!practicePool.length) {
      $("#practice-empty").classList.remove("hidden");
      return;
    }
    nextPractice();
  }

  function nextPractice() {
    if (!practicePool.length) return;
    // random word, avoid immediate repeat
    let w;
    do {
      w = practicePool[Math.floor(Math.random() * practicePool.length)];
    } while (practicePool.length > 1 && w.id === lastPracticeId);
    lastPracticeId = w.id;
    practiceWord = w;
    practiceDir = Math.random() < 0.5 ? "sv_fi" : "fi_sv";
    practiceRevealed = false;
    practiceChecked = false;
    renderPractice();
  }

  function renderPractice() {
    const card = $("#practice-card");
    card.classList.remove("hidden", "revealed");
    $("#practice-answer-wrap").classList.add("hidden");
    $("#practice-example").classList.add("hidden");
    $("#practice-feedback").classList.add("hidden");
    $("#practice-next").classList.add("hidden");

    const exFi = $("#practice-example-fi");
    exFi.classList.add("hidden");

    if (practiceDir === "sv_fi") {
      // Swedish shown → type the Finnish word
      $("#practice-side").textContent = "Svenska";
      $("#practice-text").textContent = practiceWord.swedish;
      const ex = practiceWord.example_sv;
      exFi.classList.toggle("hidden", !ex);
      if (ex) exFi.textContent = ex;
      $("#practice-hint").textContent = "";
      $("#practice-exercise").classList.remove("hidden");
      $("#practice-input").value = "";
      setTimeout(() => $("#practice-input").focus(), 50);
    } else {
      // Finnish shown → reveal the Swedish meaning
      $("#practice-side").textContent = "Finska";
      $("#practice-text").textContent = practiceWord.finnish;
      const ex = practiceWord.example_fi;
      exFi.classList.toggle("hidden", !ex);
      if (ex) exFi.textContent = ex;
      $("#practice-hint").textContent = "";
      $("#practice-exercise").classList.add("hidden");
    }
  }

  function revealPractice() {
    if (!practiceWord || practiceDir !== "fi_sv" || practiceRevealed) return;
    practiceRevealed = true;
    const card = $("#practice-card");
    card.classList.add("revealed");
    $("#practice-answer-wrap").classList.remove("hidden");
    $("#practice-answer").textContent = practiceWord.swedish;
    const ex = practiceWord.example_sv;
    $("#practice-example").classList.toggle("hidden", !ex);
    if (ex) $("#practice-example").textContent = ex;
    $("#practice-hint").textContent = "";
    api.logAttempt(practiceWord.id, "fi_sv", true); // reveal = attempt logged
    $("#practice-next").classList.remove("hidden");
  }

  function checkPractice() {
    if (!practiceWord || practiceChecked) return;
    const input = $("#practice-input").value;
    if (!input.trim()) return;
    const ok = isCorrect(input, practiceWord.finnish);
    practiceChecked = true;
    api.logAttempt(practiceWord.id, "sv_fi", ok);

    // the exercise is done — show the result instead
    $("#practice-exercise").classList.add("hidden");

    const fb = $("#practice-feedback");
    fb.classList.remove("hidden", "good", "bad");
    fb.classList.add(ok ? "good" : "bad");
    fb.querySelector(".practice-result-verdict").textContent = ok ? "Rätt! 🎉" : "Inte riktigt";
    const rows = fb.querySelectorAll(".practice-result-row .pr-value");
    rows[0].textContent = input.trim();
    rows[1].textContent = practiceWord.finnish;

    $("#practice-next").classList.remove("hidden");
  }

  /* ════════════════════════ HISTORY ════════════════════════ */
  async function renderHistory() {
    try {
      historyWords = await api.fetchHistory();
    } catch { historyWords = []; }
    renderHistoryList();
  }

  function renderHistoryList() {
    const q = $("#history-search").value.trim().toLowerCase();
    let list = historyWords.filter((w) =>
      w.finnish.toLowerCase().includes(q) || w.swedish.toLowerCase().includes(q));

    if (sortMode === "oldest") list = [...list].sort((a, b) => a.assigned_date.localeCompare(b.assigned_date));
    else if (sortMode === "newest") list = [...list].sort((a, b) => b.assigned_date.localeCompare(a.assigned_date));
    else if (sortMode === "az") list = [...list].sort((a, b) => a.finnish.localeCompare(b.finnish, "sv"));

    const el = $("#history-list");
    el.innerHTML = "";
    const empty = $("#history-empty");
    empty.textContent = q ? `Inget ord matchar “${$("#history-search").value.trim()}”.` : "Inga ord ännu.";
    empty.classList.toggle("hidden", list.length > 0);

    list.forEach((w) => {
      const btn = document.createElement("button");
      btn.className = "word-row";
      btn.type = "button";
      btn.innerHTML = `<span class="word-row-fi">${esc(w.finnish)}</span><span class="word-row-sep">→</span><span class="word-row-sv">${esc(w.swedish)}</span>`;
      btn.addEventListener("click", () => openModal(w));
      el.appendChild(btn);
    });
  }

  function cycleSort() {
    const modes = ["newest", "oldest", "az"];
    sortMode = modes[(modes.indexOf(sortMode) + 1) % modes.length];
    $("#history-sort").textContent =
      sortMode === "newest" ? T.sortNewest : sortMode === "oldest" ? T.sortOldest : T.sortAZ;
    renderHistoryList();
  }

  /* ── word detail modal ── */
  let modalWord = null;
  let modalRevealed = false;

  function openModal(w) {
    modalWord = w;
    modalRevealed = false;
    renderModal();
    $("#word-modal").classList.remove("hidden");
  }
  function closeModal() {
    $("#word-modal").classList.add("hidden");
    modalWord = null;
  }
  function renderModal() {
    const card = $("#modal-card");
    card.classList.toggle("revealed", modalRevealed);
    $("#modal-side").textContent = modalRevealed ? "Svenska" : "Finska";
    $("#modal-text").textContent = modalRevealed ? modalWord.swedish : modalWord.finnish;
    const ex = modalRevealed ? modalWord.example_sv : modalWord.example_fi;
    $("#modal-example").classList.toggle("hidden", !ex);
    if (ex) $("#modal-example").textContent = ex;
    $("#modal-hint").textContent = "";
  }

  /* ════════════════════════ ADMIN ════════════════════════ */
  async function renderAdmin() {
    if (!api.isAdmin()) return;
    $("#admin-error").textContent = "";
    const [queue, scheduled] = await Promise.all([
      api.fetchQueue().catch(() => []),
      api.fetchScheduled().catch(() => []),
    ]);
    renderWordRows("#queue-list", queue, "#queue-empty", true);
    renderWordRows("#scheduled-list", scheduled, "#scheduled-empty", false);
    $("#queue-count").textContent = queue.length ? "(" + queue.length + ")" : "";
  }

  function renderWordRows(listSel, words, emptySel, isQueue) {
    const el = $(listSel);
    el.innerHTML = "";
    $(emptySel).classList.toggle("hidden", words.length > 0);
    words.forEach((w) => {
      const row = document.createElement("div");
      row.className = "word-row admin-row";
      const dateHtml = isQueue ? "" : `<span class="word-row-date">${esc(w.assigned_date)}</span>`;
      const exParts = [w.example_sv, w.example_fi].filter(Boolean);
      const exHtml = exParts.length ? `<span class="word-row-ex">${exParts.map(esc).join(" · ")}</span>` : "";
      row.innerHTML = `<span class="row-text"><span class="word-row-fi">${esc(w.finnish)}</span><span class="word-row-sep">→</span><span class="word-row-sv">${esc(w.swedish)}</span>${exHtml}</span>${dateHtml}<button class="row-delete" title="Ta bort">×</button>`;
      row.querySelector(".row-delete").addEventListener("click", async () => {
        await api.deleteWord(w.id);
        renderAdmin();
      });
      el.appendChild(row);
    });
  }

  async function addWord(e) {
    e.preventDefault();
    const finnish = $("#word-finnish").value.trim();
    const swedish = $("#word-swedish").value.trim();
    const example_sv = $("#word-ex-sv").value.trim() || null;
    const example_fi = $("#word-ex-fi").value.trim() || null;
    const date = $("#word-date").value || null;
    $("#admin-error").textContent = "";
    try {
      await api.insertWord({ finnish, swedish, example_sv, example_fi, assigned_date: date, created_by: api.session.user.id });
      $("#word-finnish").value = "";
      $("#word-swedish").value = "";
      $("#word-ex-sv").value = "";
      $("#word-ex-fi").value = "";
      $("#word-date").value = "";
      renderAdmin();
    } catch (err) {
      $("#admin-error").textContent = err.message || T.errorGeneric;
    }
  }

  /* ════════════════════════ SETTINGS / PUSH ════════════════════════ */
  function isIos() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  function b64ToUint8(base64) {
    const pad = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  /* Onboarding: ask once (per user) on the Today view. Dismissal is
     stored server-side and snoozes the card for 14 days. */
  async function maybeShowPushOnboarding() {
    const card = $("#push-onboarding");
    if (!$("#push-optin")) return; // card replaced by success state
    card.classList.add("hidden");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;

    try {
      const reg = await navigator.serviceWorker.ready;
      if (await reg.pushManager.getSubscription()) return; // this device already subscribed
    } catch { return; }

    const dismissed = await api.fetchState("push:onboarding-dismissed");
    if (dismissed && dismissed !== "subscribed") {
      const days = (Date.now() - Date.parse(dismissed)) / 86400000;
      if (!isNaN(days) && days < 14) return;
    }

    const desc = card.querySelector(".onboarding-desc");
    const optin = $("#push-optin");
    if (isIos() && !isStandalone()) {
      optin.classList.add("hidden");
      desc.textContent = "Installera appen på hemskärmen (Safari → Dela → Lägg till på hemskärmen) så kan du få dagens ord som notis.";
    } else {
      optin.classList.remove("hidden");
      desc.textContent = "En liten påminnelse varje dag, så du aldrig missar ett ord.";
    }
    card.classList.remove("hidden");
  }

  async function optInPush() {
    const btn = $("#push-optin");
    const card = $("#push-onboarding");
    btn.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notiser är blockerade — tillåt dem i webbläsarens inställningar och försök igen.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(window.PS_CONFIG.VAPID_PUBLIC_KEY),
      });
      await api.saveSubscription(sub);
      pushSub = sub;
      api.putState("push:onboarding-dismissed", "subscribed");
      card.innerHTML = '<p class="onboarding-title">Klart! 🎉</p><p class="onboarding-desc">Du får dagens ord som notis varje dag.</p>';
      setTimeout(() => card.classList.add("hidden"), 2600);
    } catch (err) {
      const desc = card.querySelector(".onboarding-desc");
      if (desc) desc.textContent = err.message || "Något gick fel.";
      btn.disabled = false;
    }
  }

  function dismissPushOnboarding() {
    $("#push-onboarding").classList.add("hidden");
    api.putState("push:onboarding-dismissed", new Date().toISOString());
  }

  async function renderSettings() {
    const toggle = $("#push-toggle");
    const note = $("#push-note");
    toggle.checked = false;
    toggle.disabled = true;
    note.classList.add("hidden");

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      note.textContent = "Din webbläsare stödjer inte notiser.";
      note.classList.remove("hidden");
      return;
    }
    if (isIos() && !isStandalone()) {
      note.textContent = "På iPhone krävs att appen är installerad på hemskärmen: öppna i Safari → Dela → Lägg till på hemskärmen.";
      note.classList.remove("hidden");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      pushSub = await reg.pushManager.getSubscription();
      toggle.checked = !!pushSub;
      toggle.disabled = false;
    } catch {
      note.textContent = "Kunde inte läsa notisstatus.";
      note.classList.remove("hidden");
    }
  }

  async function togglePush() {
    const toggle = $("#push-toggle");
    const note = $("#push-note");
    toggle.disabled = true;
    note.classList.add("hidden");
    try {
      const reg = await navigator.serviceWorker.ready;
      if (toggle.checked) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") throw new Error("Notiser är blockerade — tillåt dem i webbläsarens inställningar.");
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToUint8(window.PS_CONFIG.VAPID_PUBLIC_KEY),
        });
        await api.saveSubscription(sub);
        pushSub = sub;
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api.deleteSubscription(sub.endpoint).catch(() => {});
          await sub.unsubscribe().catch(() => {});
        }
        pushSub = null;
      }
    } catch (err) {
      toggle.checked = !!pushSub;
      note.textContent = err.message || "Något gick fel.";
      note.classList.remove("hidden");
    }
    toggle.disabled = false;
  }

  /* ── helpers ── */
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  /* ── wire up ── */
  $("#auth-form").addEventListener("submit", doAuth);
  $("#auth-toggle").addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    renderAuth();
  });
  $("#tabbar").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    if (t.dataset.tab === "more" && !$("#more-menu").classList.contains("hidden")) {
      closeMoreMenu();
      const back = MORE_VIEWS.includes(currentTab) ? "more" : currentTab;
      $$("#tabbar .tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === back));
      return;
    }
    if (t.dataset.tab === "more") {
      $$("#tabbar .tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === "more"));
    }
    switchTab(t.dataset.tab);
  });

  // today
  $("#word-card").addEventListener("click", flipToday);

  // practice
  $("#practice-card").addEventListener("click", revealPractice);
  $("#practice-check").addEventListener("click", checkPractice);
  $("#practice-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); checkPractice(); } });
  $("#practice-next").addEventListener("click", nextPractice);

  // history
  $("#history-sort").addEventListener("click", cycleSort);
  const historySearch = $("#history-search");
  const historyClear = $("#history-search-clear");
  const syncHistoryClear = () => historyClear.classList.toggle("hidden", historySearch.value.length === 0);
  historySearch.addEventListener("input", () => { syncHistoryClear(); renderHistoryList(); });
  historyClear.addEventListener("click", () => {
    historySearch.value = "";
    syncHistoryClear();
    renderHistoryList();
    historySearch.focus();
  });

  // modal
  $("#modal-card").addEventListener("click", () => { modalRevealed = !modalRevealed; renderModal(); });
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-backdrop").addEventListener("click", closeModal);

  // Mer menu + settings + push onboarding
  $("#more-menu").addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) switchTab(nav.dataset.nav);
  });
  document.addEventListener("click", (e) => {
    // close the Mer menu when tapping anywhere outside it / its tab
    if (!$("#more-menu").classList.contains("hidden") &&
        !e.target.closest("#more-menu") && !e.target.closest('[data-tab="more"]')) {
      closeMoreMenu();
      const back = MORE_VIEWS.includes(currentTab) ? "more" : currentTab;
      $$("#tabbar .tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === back));
    }
  });
  $("#push-toggle").addEventListener("change", togglePush);
  $("#push-optin").addEventListener("click", optInPush);
  $("#push-dismiss").addEventListener("click", dismissPushOnboarding);

  // admin
  $("#add-word-form").addEventListener("submit", addWord);

  /* ── service worker (offline shell) ── */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  /* ── boot ── */
  api.init().then((session) => {
    if (session) enterApp();
    else renderAuth();
  });
})();
