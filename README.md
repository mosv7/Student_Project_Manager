# 📋 Student Project Manager — Nexus

A full-stack project management platform for students and teams. Manage projects, track tasks on a Kanban board, chat in real-time, publish posts, and review projects — all in one place.

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router v6, Vite |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| API | REST + GraphQL (`graphql-http`) |
| Real-time | WebSocket (`ws`) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| File Upload | Multer |

---

## ✅ Prerequisites

Before running the project, make sure you have installed:

- **[Node.js](https://nodejs.org/)** v18 or higher
- **[PostgreSQL](https://www.postgresql.org/download/)** v14 or higher
- **npm** (comes with Node.js)

---

## ⚙️ Environment Setup

The backend needs a `.env` file. One is already provided at `files/.env`. Update it with your PostgreSQL credentials:

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=project_mgmt
DB_USER=postgres
DB_PASSWORD=your_postgres_password   # ← change this

JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d

UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
```

> **Important:** Create the database first in PostgreSQL before running migrations:
> ```sql
> CREATE DATABASE project_mgmt;
> ```

---

## 📦 Install Dependencies

Run `npm install` in **both** the backend and frontend folders:

```bash
# Backend
cd files
npm install

# Frontend
cd ../nexus
npm install
```

---

## 🗄️ Database Setup (First Time Only)

```bash
cd files

# Create all tables
node migrate.js

# (Optional) Seed with sample data
node seed.js
```

---

## 🚀 Running the Project

You need **two terminals** running at the same time.

### Terminal 1 — Backend
```bash
cd files
npm run dev
```
Starts on **http://localhost:5000**

| Endpoint | URL |
|---|---|
| REST API | http://localhost:5000/api |
| GraphQL (UI) | http://localhost:5000/graphql |
| WebSocket | ws://localhost:5000/ws |

### Terminal 2 — Frontend
```bash
cd nexus
npm run dev
```
Opens on **http://localhost:3000** → the Vite dev server proxies all `/api` requests to the backend automatically.

---

## 📁 Project Structure

```
Student_Project_Manager/
├── files/                  # Backend (Node.js / Express)
│   ├── server.js           # Main entry point (REST + GraphQL + WebSocket)
│   ├── migrate.js          # Database schema migrations
│   ├── seed.js             # Sample data seeder
│   ├── schema.js           # GraphQL schema & resolvers (standalone)
│   ├── index.js            # WebSocket logic (standalone)
│   ├── .env                # Environment variables
│   └── uploads/            # Uploaded files (git-ignored)
│
└── nexus/                  # Frontend (React / Vite)
    ├── src/
    │   ├── main.jsx        # App entry point
    │   ├── App.jsx         # Routes
    │   ├── api.js          # API client (fetch wrappers)
    │   ├── components/     # Layout, Sidebar
    │   ├── context/        # Auth, Theme, Toast providers
    │   └── pages/          # Dashboard, Projects, Kanban, Messages, Posts, Team
    ├── index.html
    └── vite.config.js      # Dev proxy config
```

---

## ✨ Features

- 🔐 **Authentication** — Register / Login with JWT
- 📂 **Projects** — Create, view, and manage projects with categories
- ✅ **Kanban Board** — Drag-style task management (To Do → In Progress → Review → Done)
- 💬 **Real-time Chat** — WebSocket-powered messaging rooms
- 📝 **Posts** — Publish articles linked to projects
- ⭐ **Reviews** — Rate and review projects
- 👥 **Team** — User management with role-based access (admin / moderator / user)
- 🌙 **Dark / Light mode** — Persistent theme toggle
