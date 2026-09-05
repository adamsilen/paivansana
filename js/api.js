/* ─────────────────────────────────────────────────────────────
   päivän sana — minimal Supabase client (fetch only, no SDK)
   Auth (email+password), sessions, REST CRUD, RPC.
   ───────────────────────────────────────────────────────────── */
(function () {
  const CFG = window.PS_CONFIG;
  const AUTH = CFG.SUPABASE_URL + "/auth/v1";
  const REST = CFG.SUPABASE_URL + "/rest/v1";
  const STORE_KEY = "ps.session";

  const api = { session: null, profile: null, onAuthChange: null };

  /* ── session persistence ── */
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; }
  }
  function saveSession(s) {
    api.session = s;
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  }
  function headers() {
    return {
      apikey: CFG.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + (api.session ? api.session.access_token : CFG.SUPABASE_ANON_KEY),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  async function request(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { ...headers(), ...(opts.headers || {}) },
    });
    if (!res.ok) {
      let msg = res.status + " " + res.statusText;
      try { const j = await res.json(); msg = j.msg || j.message || j.error_description || msg; } catch {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /* ── auth ── */
  async function tokenRequest(params, body) {
    const res = await fetch(AUTH + "/token?" + new URLSearchParams(params).toString(), {
      method: "POST",
      headers: { apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.error_description || "Inloggningen misslyckades");
    return data;
  }

  api.signIn = async function (email, password) {
    const data = await tokenRequest({ grant_type: "password" }, { email, password });
    saveSession(data);
    await api.fetchProfile();
  };

  api.signUp = async function (email, password) {
    const res = await fetch(AUTH + "/signup", {
      method: "POST",
      headers: { apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || data.error_description || "Kontot kunde inte skapas");
    if (data.access_token) { saveSession(data); await api.fetchProfile(); }
    return data;
  };

  api.signOut = function () { saveSession(null); api.profile = null; };

  api.refreshIfNeeded = async function () {
    if (!api.session) return false;
    const expiresIn = (api.session.expires_at || 0) * 1000 - Date.now();
    if (expiresIn > 60_000) return true;
    try {
      const data = await tokenRequest({ grant_type: "refresh_token" }, { refresh_token: api.session.refresh_token });
      saveSession(data);
      return true;
    } catch {
      saveSession(null);
      if (api.onAuthChange) api.onAuthChange(null);
      return false;
    }
  };

  api.init = async function () {
    api.session = loadSession();
    if (api.session) {
      const ok = await api.refreshIfNeeded();
      if (ok) {
        await api.fetchProfile().catch(() => {});
        if (!api.profile) await api.fetchProfile().catch(() => {}); // one retry
      }
    }
    return api.session;
  };

  api.isAdmin = () => !!(api.profile && api.profile.role === "admin");

  /* ── profile ── */
  api.fetchProfile = async function () {
    const uid = api.session.user.id;
    const rows = await request(REST + "/profiles?id=eq." + uid + "&select=id,role");
    let prof = rows && rows[0];
    if (!prof) {
      // missing profile row (t.ex. konto skapat före triggern) — återskapa som 'elev'
      try {
        const ins = await request(REST + "/profiles", { method: "POST", body: JSON.stringify({ id: uid, role: "elev" }) });
        prof = Array.isArray(ins) ? ins[0] : ins;
      } catch (e) { prof = null; }
    }
    api.profile = prof || null;
    return api.profile;
  };

  /* ── words ── */
  // Today's word — atomic server-side draw (first caller of the day draws).
  api.fetchDailyWord = (date) =>
    request(REST + "/rpc/get_daily_word", {
      method: "POST",
      body: JSON.stringify(date ? { p_date: date } : {}),
    }).then((rows) => (rows && rows[0]) || null);

  // History: words whose date has passed (or is today)
  api.fetchHistory = () =>
    request(REST + "/words?assigned_date=not.is.null&select=id,finnish,swedish,example_sv,example_fi,assigned_date&order=assigned_date.desc");

  /* ── admin ── */
  api.fetchQueue = () =>
    request(REST + "/words?assigned_date=is.null&select=id,finnish,swedish,example_sv,example_fi,created_at&order=created_at");

  api.fetchScheduled = () =>
    request(REST + "/words?assigned_date=gt." + todayISO() + "&select=id,finnish,swedish,example_sv,example_fi,assigned_date&order=assigned_date");

  api.insertWord = (row) =>
    request(REST + "/words", { method: "POST", body: JSON.stringify(row) });

  api.updateWord = (id, patch) =>
    request(REST + "/words?id=eq." + id, { method: "PATCH", body: JSON.stringify(patch) });

  api.deleteWord = (id) =>
    request(REST + "/words?id=eq." + id, { method: "DELETE" });

  /* ── attempts ── */
  api.logAttempt = (wordId, direction, correct) =>
    request(REST + "/attempts", {
      method: "POST",
      body: JSON.stringify({ user_id: api.session.user.id, word_id: wordId, direction, correct }),
    }).catch((e) => console.warn("attempt log failed", e));

  /* ── user_state (per-user UI state, e.g. today's revealed side) ── */
  api.fetchState = (key) =>
    request(REST + "/user_state?user_id=eq." + api.session.user.id + "&key=eq." + key + "&select=value")
      .then((rows) => (rows && rows[0] ? rows[0].value : null))
      .catch(() => null);

  api.putState = (key, value) =>
    request(REST + "/user_state?on_conflict=user_id,key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ user_id: api.session.user.id, key, value: String(value), updated_at: new Date().toISOString() }),
    }).catch((e) => console.warn("state save failed", e));

  /* ── push subscriptions (päivän sana's own table — not to be confused
        with tidy's push_subscriptions in the same project) ── */
  api.fetchSubscriptions = () => request(REST + "/ps_push_subscriptions?select=id,endpoint");

  api.saveSubscription = (sub) => {
    // Safari/iOS doesn't expose sub.keys — read the raw key bytes instead.
    const key = sub.getKey ? sub.getKey("p256dh") : null;
    const auth = sub.getKey ? sub.getKey("auth") : null;
    if (!key || !auth) return Promise.reject(new Error("Kunde inte läsa prenumerationens nycklar."));
    return request(REST + "/ps_push_subscriptions", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: api.session.user.id,
        endpoint: sub.endpoint,
        p256dh: uint8ToB64(key),
        auth: uint8ToB64(auth),
        user_agent: (navigator.userAgent || "").slice(0, 200),
      }),
    });
  };

  api.deleteSubscription = (endpoint) =>
    request(REST + "/ps_push_subscriptions?endpoint=eq." + encodeURIComponent(endpoint), { method: "DELETE" });

  function uint8ToB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  /* ── helpers ── */
  function todayISO() {
    return new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD in local tz
  }
  api.todayISO = todayISO;

  window.PsAPI = api;
})();
