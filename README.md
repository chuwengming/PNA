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
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PYTHON_API_URL=http://127.0.0.1:8000`

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

Manual schema: see `db/schema.sql`.
