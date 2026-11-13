# CP Student Tracker: Frontend

React frontend for the Competitive Programming Student Tracker (teachers/admins).
Backend: Flask + SQLite (see the backend API documentation).

## Run locally

```bash
cd frontend
cp .env.example .env     # API address
npm install
npm run dev              # http://localhost:5173
```

The backend must be running at `VITE_API_URL` (default `http://localhost:5000`) and
allows only `http://localhost:3000` / `http://localhost:5173` as origins. Open the app
at `http://localhost:5173` (not `127.0.0.1`).

Default admin (development only): `admin@example.com` / `admin123`

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the build on port 5173 |
| `npm run lint` | ESLint |

## Pages and the API they use

| Page | Route | API |
|---|---|---|
| Login | `/login` | `POST /api/auth/login`, `/logout` |
| Dashboard | `/` | `GET /api/dashboard/summary` |
| Leaderboard | `/leaderboard` | `GET /api/leaderboard?period=` |
| Students | `/students` | `GET/POST/PUT/DELETE /api/students` |
| Student detail | `/students/:id` | `GET /api/students/<id>/statistics` |
| Excel import | `/import` | `POST /api/students/excel/upload`, `/import` |
| Sync (top bar) | all | `POST /api/sync`, `GET /api/sync/status` |

## Structure

```
src/
  api/          all backend calls (client.js handles cookies + errors)
  context/      Auth, Sync, Toast
  components/   layout/ (masthead, routes) and ui/ (button, input, modal, ...)
  features/     leaderboard/, students/, import/, sync/
  pages/        one file per route
  styles/       tokens.css (design tokens) + global.css
```

## Notes

- Auth uses the backend's cookie session; every request sends `credentials: "include"`.
- Platform solved counts only change when **Sync** runs. Day/week/month counts start at 0
  after the first sync and grow with later syncs.
- beecrowd usernames are stored but beecrowd is not synced yet (backend).
- Dates are Asia/Dhaka (computed by the backend).
- Changing or removing a platform username deletes that account's solved data (backend rule).

## Deploying

`npm run build`, then serve `dist/` as a static site with a rewrite of all routes to
`index.html` (single-page app). Set `VITE_API_URL` to the real backend URL **before**
building, and ask the backend team to allow the deployed origin in CORS.