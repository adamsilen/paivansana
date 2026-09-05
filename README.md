# päivän sana ✦

Ett finskt ord eller uttryck om dagen. Samma designsystem och tekniska setup som tidy — statisk PWA utan build-step, Supabase-backend (delat projekt med tidy/homey/leafy), Vercel-deploy.

## Setup

### 1. Databas

Kör [`supabase/schema.sql`](supabase/schema.sql) i Supabase SQL Editor (samma projekt som tidy). Det skapar:

* `profiles` — roller (`elev` / `admin`), seedas automatiskt vid signup
* `words` — finska/svenska + `assigned_date` (null = kö)
* `attempts` — elevens övningsförsök
* `user_state` — per-användare UI-state (t.ex. vilken sida av dagens ord som visades)
* `get_daily_word()` — atomisk daglig dragning (första anropet drar ett slumpat kö-ord; samtidiga klienter kan aldrig få olika ord tack vare `FOR UPDATE SKIP LOCKED`)

Gör sedan herrsilen@gmail.com till admin (efter att kontot skapats):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'herrsilen@gmail.com');
```

### 2. Kör lokalt

```bash
cd paivansana
python3 -m http.server 8080
# öppna http://localhost:8080
```

### 3. Deploy

Vercel — statisk sajt, ingen build. Samma env-vars som tidy behövs inte (ingen serverless-funktion ännu).

## Push-påminnelser (valfritt)

Daglig notis med dagens ord, via Vercel cron (`0 16 * * *`) → `api/notify.js`.

1. **Databas** — kör [`supabase/migration-push.sql`](supabase/migration-push.sql) (egen tabell `ps_push_subscriptions`, separat från tidys).
2. **Vercel env vars** — Project → Settings → Environment Variables:

   | Variabel | Värde |
   | --- | --- |
   | `SUPABASE_URL` | projekt-URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret-nyckel (`sb_secret_…`) — bara server! |
   | `VAPID_SUBJECT` | `mailto:din@epost.se` |
   | `VAPID_PUBLIC_KEY` | samma som i `js/config.js` |
   | `VAPID_PRIVATE_KEY` | privat nyckel — bara server! |
   | `CRON_SECRET` | valfri lång slumpsträng |

3. **Deploy** — cron aktiveras vid deploy.
4. **Testa** — `curl -H "Authorization: Bearer <CRON_SECRET>" https://<din-sajt>/api/notify`

På iPhone krävs att appen är installerad på hemskärmen (iOS 16.4+). Användare slår på per enhet via kugghjulet på I dag-sidan.

## Roller

* **Admin** — lägger till ord (med eller utan datum), ser kön, ser schemalagda ord, kan ta bort.
* **Elev** — ser dagens ord, historik, övar. Ser aldrig kön eller framtida schemalagda ord (RLS).

## Struktur

```
paivansana/
├── index.html
├── manifest.webmanifest
├── sw.js
├── css/style.css        # tidys designsystem + päivän sana-komponenter
├── js/
│   ├── config.js        # Supabase-nycklar (samma projekt som tidy)
│   ├── api.js           # fetch-baserad Supabase-klient + RPC
│   ├── i18n.js          # svenska strängar
│   └── app.js           # vyer & interaktioner
└── supabase/schema.sql
```
