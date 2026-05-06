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

## Data Model

FastAPI initializes these MySQL tables automatically:

- `users` — email/password or OAuth-linked accounts
- `node_tables` / `node_table_nodes` — editable Node Table workflow (review / graph source)
- `saved_networks` — **minimal persisted network** per user for redraw and future path logic:
  - `name` — network name
  - `node_count` — number of nodes `N`
  - `predecessors_json` — JSON array of length `N`: each entry is a list of predecessor node IDs for that node index (`[[],[0],…]`)
  - `mean_times_json` — JSON array of length `N`: mean time per node index
  - `graph` — cached PNG as `data:image/png;base64,...` for quick display
  - `source_node_table_id` — optional reference to the Node Table used when saving

`node_tables` are scoped by the authenticated user's id. Editing a Node Table resets `passFlag` to `false`, so changed tables must pass review again before graph generation.

Saved networks are keyed by `(owner_user_id, name)`; saving again with the same name updates the row.
