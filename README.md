# EndBox

End-to-end encrypted messaging. Messages are encrypted with ECDH P-256 + AES-GCM-256 — no one can read them, not even the server.

## Project Structure

```
EndBox/
├── frontend/   ← React + Vite (deploy to Netlify)
└── backend/    ← Node.js + Express + Socket.io (deploy to Railway / Render)
```

---

## Frontend — Deploy to Netlify

1. Push this repo to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
3. Set these build settings:
   - **Base directory:** `frontend`
   - **Build command:** `npm run build`
   - **Publish directory:** `frontend/dist`
4. Add environment variable:
   - `VITE_API_URL` → your backend URL (e.g. `https://endbox-api.railway.app`)
5. Click **Deploy**

---

## Backend — Deploy to Railway (recommended) or Render

### Railway
1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Select this repo, set **Root Directory** to `backend`
3. Add a PostgreSQL plugin (Railway does this in one click)
4. Set environment variables:
   - `DATABASE_URL` → auto-filled by Railway Postgres plugin
   - `SESSION_SECRET` → any long random string (e.g. `openssl rand -hex 32`)
   - `PORT` → `4000`
5. Deploy — Railway auto-runs `npm start`

### Render
1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect repo, set **Root Directory** to `backend`
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add a free PostgreSQL database from Render dashboard
6. Set `DATABASE_URL`, `SESSION_SECRET`, `PORT=4000`

---

## Local Development

### Backend
```bash
cd backend
npm install
cp .env.example .env        # fill in DATABASE_URL and SESSION_SECRET
npm run db:push             # create tables
npm run dev
```

### Frontend
```bash
cd frontend
npm install
# Create frontend/.env.local:
# VITE_API_URL=http://localhost:4000
npm run dev
```

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | JWT signing secret (keep this private!) |
| `PORT` | Server port (default: `4000`) |

### Frontend (`frontend/.env.local`)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL. Leave empty if same origin. |
