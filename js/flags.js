/* ─────────────────────────────────────────────────────────────
   päivän sana — feature flags
   Reads ps_feature_flags from Supabase once at boot and exposes
   a stable API for gating features:

     PsFlags.on("my_feature")   → boolean
     PsFlags.ready()            → promise resolving when loaded

   A flag is simply ON or OFF for everyone.
   ───────────────────────────────────────────────────────────── */
(function () {
  const api = window.PsAPI;
  const flags = {};      // key → { enabled }
  let loaded = null;     // promise

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
    on: (key) => !!(flags[key] && flags[key].enabled),
    all: () => flags,
  };
})();
