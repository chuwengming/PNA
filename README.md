This project uses Next.js for the web UI and FastAPI for Python network-generation and analysis APIs.

## Getting Started

Configure MySQL first. The FastAPI service accepts either `DATABASE_URL` / `MYSQL_URL` or separate MySQL environment variables:

```bash
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DATABASE
# or
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=network
```

Then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Railway Deployment

Create a Railway MySQL service and expose its connection string to this app as `DATABASE_URL` or `MYSQL_URL`.

Set the app service start command to:

```bash
npm run railway-start
```

Required environment variables:

- `DATABASE_URL` or `MYSQL_URL` — paste the **private** connection string from your Railway MySQL service (**Variables** tab → Reference Variable). Do not commit credentials to GitHub.
- `AUTH_SECRET`
- `AUTH_URL` and `NEXTAUTH_URL` — **must match the exact URL in your browser** (e.g. `https://your-app.up.railway.app`). Do not use a raw Railway IP for Google login.
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PYTHON_API_URL=http://127.0.0.1:8000`

### Google OAuth on Railway (`redirect_uri_mismatch`)

In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → your OAuth client:

1. **Authorized JavaScript origins:** `https://your-app.up.railway.app`
2. **Authorized redirect URIs:** `https://your-app.up.railway.app/api/auth/callback/google`

Set Railway Variables `AUTH_URL` and `NEXTAUTH_URL` to the same `https://your-app.up.railway.app` (no trailing slash). Redeploy after changing variables.

### Registration `fetch failed` on Railway

Usually means the Next.js server cannot reach FastAPI inside the container. Check:

1. Start command: `npm run railway-start`
2. `PYTHON_API_URL=http://127.0.0.1:8000` on the **app** service
3. Deploy logs: FastAPI should show `Uvicorn running on http://127.0.0.1:8000` and no MySQL startup crash

If a database password has appeared in chat or logs, rotate it in Railway (MySQL → reset credentials) and update `DATABASE_URL`.

The Railway start command runs FastAPI on `127.0.0.1:8000` and Next.js on Railway's public port. Next.js rewrites `/api/python/*` requests to FastAPI through `PYTHON_API_URL`.

## Data Model (MySQL, 2 tables)

FastAPI initializes these tables on startup (or run `db/schema.sql` on Railway):

| Table | Purpose |
|-------|---------|
| `users` | Login accounts (email / Google OAuth) |
| `saved_networks` | Persisted networks per user (`user_id` → `users.id`) |

**`saved_networks` columns:** `name`, `node_count`, `predecessors_json`, `mean_times_json`, `pass_review` (must be true before **Graph Network**). Network images are generated on demand (not stored in MySQL).

**Workflow:** Create Network / Edit Network / Review Network / Graph Network / Random Generate all persist to `saved_networks`. Reload the page and use **Edit Network** to continue editing.

**Local vs Railway:** The app binds networks to numeric `users.id` in **one MySQL database**. Your laptop (`npm run dev`) and `https://pna-production.up.railway.app` use **separate** Railway/local `DATABASE_URL` instances unless you point both to the same server. Same Google email on both sites gets the same email in `users`, but **user id and networks are per database**. The dashboard header shows `DB user id` so you can confirm which account the API is using.

Manual schema: see `db/schema.sql`.
