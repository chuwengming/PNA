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

- `DATABASE_URL` or `MYSQL_URL`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PYTHON_API_URL=http://127.0.0.1:8000`

The Railway start command runs FastAPI on `127.0.0.1:8000` and Next.js on Railway's public port. Next.js rewrites `/api/python/*` requests to FastAPI through `PYTHON_API_URL`.

## Data Model

FastAPI initializes these MySQL tables automatically:

- `users`
- `node_tables`
- `node_table_nodes`
- `networks`

`node_tables` and `networks` are scoped by the authenticated user's id. Editing a `Node Table` resets `passFlag` to `false`, so changed tables must pass review again before graph generation.
