/* ─────────────────────────────────────────────────────────────
   päivän sana — daily push reminder (Vercel serverless, hit by cron)

   Once a day (vercel.json → "0 16 * * *") this function fetches
   today's word and sends it to every subscribed device.

   Uses the Supabase SERVICE ROLE key (bypasses RLS) because it must
   read every user's subscriptions. That key lives only in Vercel env vars.
   ───────────────────────────────────────────────────────────── */
const webpush = require("web-push");

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
}

function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const required = [
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "CRON_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ error: `Missing env vars: ${missing.join(", ")}` });
  }

  configureVapid();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const sbGet = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`Supabase GET ${r.status}: ${await r.text()}`);
    return r.json();
  };

  try {
    // today's word (already drawn by the first app-open of the day, or
    // drawn here if the cron runs before anyone opened the app)
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_daily_word`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
    });
    const words = rpc.ok ? await rpc.json() : [];
    const word = words && words[0];

    const subs = await sbGet("ps_push_subscriptions?select=user_id,endpoint,p256dh,auth");

    let sent = 0, expired = 0, failed = 0;

    const payload = JSON.stringify(
      word
        ? { title: "Dagens ord ✦", body: word.finnish, url: "./" }
        : { title: "päivän sana", body: "Inget ord i dag ännu — kön är tom.", url: "./" }
    );

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          expired++;
          await fetch(
            `${SUPABASE_URL}/rest/v1/ps_push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
            { method: "DELETE", headers }
          ).catch(() => {});
        } else {
          failed++;
          console.error("push failed", err.message);
        }
      }
    }

    return res.status(200).json({ today: todayISO(), word: word ? word.finnish : null, subs: subs.length, sent, expired, failed });
  } catch (err) {
    console.error("notify cron error", err);
    return res.status(500).json({ error: err.message });
  }
};
