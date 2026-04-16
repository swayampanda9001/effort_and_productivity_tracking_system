# TriNova — Agile Sprint & Productivity Tracking System

> _The Future of Agile Management_

TriNova is a full-stack web application for managing Agile sprints, tracking team effort, and measuring productivity. It supports three distinct roles — **Team Members**, **Project Managers (PM)**, **Scrum Masters (SM)** — plus a dedicated **Admin Panel**. The system features real-time notifications, automated productivity scoring, task commenting, effort log approvals, and file attachments.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Admin Panel Setup](#admin-panel-setup)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [Productivity Score](#productivity-score)
- [Deployment](#deployment)

---

## Features

### Team Members

- Personal dashboard with task summary and productivity score
- View and filter assigned tasks (by status, priority, stage)
- Log daily effort per task (hours, stage, daily update, next-day plan, blockers)
- Task detail page with threaded comments
- Calendar view for deadline tracking

### Managers (PM / SM)

- Team-wide dashboard with charts and analytics
- Sprint management — create, edit, track sprints; add/remove members
- Task management — create, assign, and edit tasks with multiple role-based assignees (developer, tester, reviewer, PM, team lead)
- Team overview with per-member and per-sprint productivity scores
- Import tasks from external sources via CSV
- Action items tracking (loaded from CSV data)
- Custom alerts to team members

### All Users

- Real-time notifications via WebSocket
- Email OTP verification on registration
- Forgot password / reset password flow
- Profile management
- Light / dark theme toggle

### Admin Panel (separate app)

- Secured admin dashboard with charts
- Sprint, task, and team member list/detail views

---

## Tech Stack

| Layer                | Technology                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Frontend**         | React 19, TypeScript, Vite 7, TailwindCSS, shadcn/ui (Radix UI), React Router v7, TanStack Query v5, Zustand, Recharts, React Big Calendar |
| **Admin Panel**      | React 19, TypeScript, Vite 7, TailwindCSS, Recharts, Axios                                                                                 |
| **Backend**          | Python 3.11, FastAPI 0.116, Uvicorn, aiomysql (async)                                                                                      |
| **Database**         | MySQL 8.0 (cloud-hosted on Aiven)                                                                                                          |
| **Auth**             | JWT (HS256 via python-jose), bcrypt password hashing, Email OTP                                                                            |
| **File Storage**     | Cloudflare R2 (S3-compatible)                                                                                                              |
| **Background Jobs**  | APScheduler                                                                                                                                |
| **Real-time**        | FastAPI WebSockets                                                                                                                         |
| **Email**            | Outlook SMTP (`smtp-mail.outlook.com:587`)                                                                                                 |
| **Containerization** | Docker + Docker Compose                                                                                                                    |
| **Deployment**       | Vercel (frontend & backend), Docker (backend alternative)                                                                                  |

---

## Project Structure

```
├── frontend/           # Main React app (team members & managers)
│   └── src/
│       ├── pages/      # Route-level page components
│       ├── components/ # Shared UI components
│       ├── contexts/   # Auth, theme, notification contexts
│       ├── services/   # API client functions
│       ├── types/      # TypeScript type definitions
│       └── utils/      # Helpers and utilities
│
├── admin/              # Admin Panel React app (separate Vite app)
│   └── src/
│       ├── components/ # Dashboard, sprint/task list views
│       ├── contexts/   # Admin auth context
│       └── services/   # Admin API + mock API
│
├── backend/            # FastAPI backend
│   ├── app/
│   │   ├── main.py         # App entry point, CORS, router registration
│   │   ├── api/v1/         # All API route handlers
│   │   ├── core/           # Config, DB pool, security, WebSocket manager
│   │   ├── models/         # Pydantic request/response schemas
│   │   ├── services/       # Business logic (productivity, notifications)
│   │   └── utils/          # DB stored procedures, email sender
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
│
└── db/                 # Database scripts
    ├── tables.sql      # Full schema (all CREATE TABLE statements)
    ├── triggers.sql    # MySQL triggers for productivity auto-calculation
    ├── queries.sql     # Useful reference queries
    └── hotfix_*.sql    # Migration / hotfix scripts
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **MySQL** 8.0 (or use Docker Compose for local dev)
- A `.env` file in `backend/` (see [Environment Variables](#environment-variables))

---

### Backend Setup

**Option 1 — Direct (with a running MySQL instance)**

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Option 2 — Docker Compose (spins up MySQL + API together)**

```bash
cd backend
docker-compose up --build
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

### Frontend Setup

```bash
cd frontend
npm install
npm run dev        # Development server → http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

---

### Admin Panel Setup

```bash
cd admin
npm install
npm run dev        # Development server → http://localhost:5174
npm run build
```

Alternatively, use the provided convenience scripts:

```bash
# Windows
admin\start.bat

# macOS/Linux
bash admin/start.sh
```

---

## Environment Variables

Create a `.env` file inside the `backend/` directory:

```env
# Database (Aiven MySQL or local)
DATABASE_HOST=your-mysql-host
DATABASE_PORT=3306
DATABASE_USER=your-db-user
DATABASE_PASSWORD=your-db-password
DATABASE_NAME=sprint_sync

# JWT
SECRET_KEY=your-very-long-random-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
ACCESS_TOKEN_EXPIRE_DAYS=5

# Email (Outlook SMTP)
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-email-password
OTP_EXPIRATION_MINUTES=10

# Cloudflare R2 Storage
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET=sprint-sync
R2_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com

# App
DEBUG=True
```

> **Security note:** Never commit your `.env` file. Add it to `.gitignore`.

---

## Database

The database is named `sprint_sync` and uses MySQL 8.0.

### Core Tables

| Table              | Description                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `users`            | Authentication — roles: `team_member`, `pm`, `sm`, `admin`; OTP verification                              |
| `team_members`     | Extended user profile — department, position, skills (JSON), productivity score                           |
| `sprints`          | Sprint lifecycle: `planning → active → completed / cancelled / on_hold`                                   |
| `sprint_members`   | Many-to-many sprint ↔ team member with per-sprint productivity score                                      |
| `tasks`            | Tasks within sprints; statuses: `new / in_progress / on_hold / completed / overdue / blocked / cancelled` |
| `task_assignments` | Multi-role assignment per task; JSON columns for `completed_by` + timestamps                              |
| `effort_logs`      | Daily effort entries per task per member; includes approval workflow                                      |
| `task_comments`    | Threaded comments; types: `general / review / feedback / question / blocker / status_update`              |
| `alerts`           | Manager-to-member alerts                                                                                  |
| `notifications`    | Real-time notification records with JSON payload                                                          |

### Applying the Schema

```sql
-- Run in order:
source db/tables.sql
source db/triggers.sql
```

For hotfixes / migrations, apply scripts in `db/hotfix_*.sql` and `db/migration_*.sql` as needed.

---

## API Reference

All routes are prefixed with `/api/v1/`.

| Prefix                  | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `/api/v1/auth`          | Register, login, OTP verify, forgot/reset password         |
| `/api/v1/users`         | User profile CRUD                                          |
| `/api/v1/team-members`  | Team member management, productivity scores                |
| `/api/v1/sprints`       | Sprint CRUD, member management                             |
| `/api/v1/tasks`         | Task CRUD, status updates, external CSV sync               |
| `/api/v1/effort-logs`   | Daily effort log creation and manager approval             |
| `/api/v1/comments`      | Threaded task comments                                     |
| `/api/v1/dashboard`     | Aggregated stats for all dashboard types                   |
| `/api/v1/alerts`        | Manager alerts to team members                             |
| `/api/v1/notifications` | Notification CRUD                                          |
| `/api/v1/ws`            | WebSocket endpoint for real-time notifications             |
| `/api/v1/r2storage`     | Cloudflare R2 file upload/download                         |
| `/api/v1/admin`         | Admin-only operations                                      |
| `GET /health`           | Health check — returns DB pool stats and connection status |

Full interactive documentation is available at `/docs` (Swagger UI) and `/redoc` when the server is running.

---

## Authentication

1. **Register** — provide name, email, password, role → receive OTP email
2. **Verify OTP** — submit 6-digit OTP (valid 10 minutes)
3. **Login** — receive a signed JWT (HS256)
4. **Authorize** — attach the token as `Authorization: Bearer <token>` on all protected requests

Token lifetime: **30 minutes** (short-lived) or **5 days** (extended, configurable).

Role-based access is enforced on both the backend (`get_current_user` dependency) and frontend (`RoleGuard` component). Supported roles: `team_member`, `pm`, `sm`, `admin`.

---

## Productivity Score

Productivity is automatically calculated by MySQL triggers whenever a task is completed, an effort log is submitted, or an assignment changes.

$$\text{Score} = 0.60 \times \text{TaskCompletion} + 0.35 \times \text{TimeEfficiency} + 0.05 \times \text{EffortLogging}$$

- **Task Completion (60%)** — ratio of tasks completed on time vs. all assigned tasks
- **Time Efficiency (35%)** — ratio of estimated hours to actual logged hours
- **Effort Logging (5%)** — consistency of daily effort log submissions

Two scopes are maintained:

- **Overall** (`team_members.productivity_score`) — across all sprints
- **Per-sprint** (`sprint_members.productivity_score`) — scoped to a single sprint

A `NULL` score means no tasks have been assigned yet; `0` indicates tasks were assigned but none completed. See [db/PRODUCTIVITY_SCORE_EXPLANATION.md](db/PRODUCTIVITY_SCORE_EXPLANATION.md) for full details.

---

## Deployment

### Frontend & Admin Panel — Vercel

Both apps include a `vercel.json` with a wildcard SPA rewrite to support client-side routing:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

Deploy by pushing to a Vercel-linked repository or using the Vercel CLI:

```bash
npx vercel --prod
```

**Live URLs:**

- Frontend: https://sprintsync.adambaba.app
- Admin Panel: https://sprint-sync-admin.vercel.app

### Backend — Vercel (Serverless)

`backend/vercel.json` routes Python requests to `app/main.py` via `@vercel/python`.

### Backend — Docker

```bash
# Build and run the API container
docker build -t trinova-api ./backend
docker run -p 8000:8000 --env-file backend/.env trinova-api

# Or use Docker Compose (API + MySQL)
docker-compose -f backend/docker-compose.yml up --build
```

The Docker image uses `python:3.11-slim`, runs as a non-root user, and exposes port `8000`.

### Database

The production database is cloud-hosted on **Aiven** (MySQL 8.0). The Docker Compose MySQL service is intended for local development only.
