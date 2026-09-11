/* ─────────────────────────────────────────────────────────────
   päivän sana — feature flags
   Reads ps_feature_flags from Supabase once at boot and exposes
   a stable API for gating features:

     PsFlags.on("new_practice_mode")  → boolean
     PsFlags.ready()                  → promise resolving when loaded

   A flag is ON when enabled = true, or when the user falls in
   the rollout percentage (stable per user via hashed user id,
   so the same user always gets the same answer).
   ───────────────────────────────────────────────────────────── */
(function () {
  const api = window.PsAPI;
  const flags = {};      // key → { enabled, rollout }
  let loaded = null;     // promise

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
  }

  function resolve(f) {
    if (!f) return false;
    if (f.enabled) return true;
    const pct = f.rollout || 0;
    if (pct <= 0) return false;
    const uid = (api.session && api.session.user && api.session.user.id) || "anon";
    return (hash(uid + ":" + f.key) % 100) < pct;
  }

  async function load() {
    if (!loaded) {
      loaded = api.fetchFlags().then((rows) => {
        rows.forEach((r) => { flags[r.key] = r; });
      });
    }
    return loaded;
  }

  window.PsFlags = {
    load,
    ready: () => loaded || Promise.resolve(),
    on: (key) => resolve(flags[key]),
    all: () => flags,
  };
})();
