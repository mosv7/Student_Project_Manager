# 🚀 Project Management Backend

A full-featured Node.js + Express + PostgreSQL backend with REST API, GraphQL, JWT Auth, File Uploads, Role-Based Access, and WebSockets.

---

## 📁 Project Structure

```
project-mgmt-backend/
├── src/
│   ├── server.js              # Entry point
│   ├── db/
│   │   ├── pool.js            # PostgreSQL connection pool
│   │   ├── migrate.js         # Database migration
│   │   └── seed.js            # Seed data
│   ├── middleware/
│   │   ├── auth.js            # JWT auth + role authorization
│   │   └── upload.js          # Multer file upload
│   ├── routes/
│   │   ├── auth.js            # Register / Login / Me
│   │   ├── users.js           # User CRUD + avatar upload
│   │   ├── projects.js        # Project CRUD + members
│   │   ├── tasks.js           # Task CRUD + file attachments
│   │   ├── content.js         # Posts, Reviews, Categories, Tags
│   │   └── messages.js        # Chat rooms + messages
│   ├── graphql/
│   │   └── schema.js          # GraphQL schema + resolvers
│   └── websocket/
│       └── index.js           # WebSocket server (real-time chat + task updates)
├── uploads/                   # Uploaded files (auto-created)
├── .env.example
├── package.json
└── README.md
```

---

## ⚙️ Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

### 3. Create PostgreSQL database
```sql
CREATE DATABASE project_mgmt;
```

### 4. Run migrations
```bash
npm run migrate
```

### 5. Seed sample data (optional)
```bash
npm run seed
```

### 6. Start the server
```bash
npm run dev     # development (with nodemon)
npm start       # production
```

---

## 🔐 Authentication

All protected routes require:
```
Authorization: Bearer <token>
```

### Roles
| Role      | Permissions                              |
|-----------|------------------------------------------|
| admin     | Full access, manage users/roles          |
| moderator | Manage content, view all users           |
| user      | Own data + project member access         |

---

## 🌐 REST API Endpoints

### Auth
| Method | Endpoint             | Description        |
|--------|----------------------|--------------------|
| POST   | `/api/auth/register` | Register new user  |
| POST   | `/api/auth/login`    | Login              |
| GET    | `/api/auth/me`       | Get current user   |

### Users
| Method | Endpoint                  | Auth      | Description          |
|--------|---------------------------|-----------|----------------------|
| GET    | `/api/users`              | Admin/Mod | List all users       |
| GET    | `/api/users/:id`          | Auth      | Get user             |
| PATCH  | `/api/users/:id`          | Auth      | Update profile       |
| POST   | `/api/users/:id/avatar`   | Auth      | Upload avatar        |
| PATCH  | `/api/users/:id/role`     | Admin     | Change user role     |
| DELETE | `/api/users/:id`          | Admin     | Deactivate user      |

### Projects
| Method | Endpoint                          | Description           |
|--------|-----------------------------------|-----------------------|
| GET    | `/api/projects`                   | List my projects      |
| POST   | `/api/projects`                   | Create project        |
| GET    | `/api/projects/:id`               | Get project details   |
| PATCH  | `/api/projects/:id`               | Update project        |
| DELETE | `/api/projects/:id`               | Delete project        |
| POST   | `/api/projects/:id/members`       | Add member            |
| DELETE | `/api/projects/:id/members/:uid`  | Remove member         |

### Tasks
| Method | Endpoint                  | Description             |
|--------|---------------------------|-------------------------|
| GET    | `/api/tasks`              | List tasks (filterable) |
| POST   | `/api/tasks`              | Create task             |
| GET    | `/api/tasks/:id`          | Get task with files     |
| PATCH  | `/api/tasks/:id`          | Update task             |
| DELETE | `/api/tasks/:id`          | Delete task             |
| POST   | `/api/tasks/:id/files`    | Upload file to task     |

### Posts
| Method | Endpoint          | Description    |
|--------|-------------------|----------------|
| GET    | `/api/posts`      | List posts     |
| POST   | `/api/posts`      | Create post    |
| GET    | `/api/posts/:id`  | Get post       |
| PATCH  | `/api/posts/:id`  | Update post    |
| DELETE | `/api/posts/:id`  | Delete post    |

### Reviews
| Method | Endpoint             | Description             |
|--------|----------------------|-------------------------|
| GET    | `/api/reviews`       | Get reviews (project)   |
| POST   | `/api/reviews`       | Create/update review    |
| DELETE | `/api/reviews/:id`   | Delete review           |

### Categories & Tags
| Method | Endpoint            | Description      |
|--------|---------------------|------------------|
| GET    | `/api/categories`   | List categories  |
| POST   | `/api/categories`   | Create category  |
| GET    | `/api/tags`         | List tags        |
| POST   | `/api/tags`         | Create tag       |

### Messages
| Method | Endpoint                                | Description      |
|--------|-----------------------------------------|------------------|
| GET    | `/api/messages/rooms`                   | My chat rooms    |
| POST   | `/api/messages/rooms`                   | Create room      |
| GET    | `/api/messages/rooms/:id/messages`      | Get messages     |
| POST   | `/api/messages/rooms/:id/messages`      | Send message     |
| DELETE | `/api/messages/:id`                     | Delete message   |

---

## 🔮 GraphQL API

**Endpoint:** `GET/POST /graphql`  
**GraphiQL UI:** Available in development at `http://localhost:5000/graphql`

### Example Queries

```graphql
# Get current user + their projects
query {
  me { id name email role }
  projects(status: "active") {
    id title status owner_name created_at
  }
}

# Get project stats
query {
  projectStats(id: "uuid-here") {
    total_tasks todo in_progress review done avg_rating
  }
}

# Get tasks filtered
query {
  tasks(project_id: "uuid", status: "in_progress", priority: "high") {
    id title assigned_to_name due_date
  }
}
```

### Example Mutations

```graphql
# Create a project
mutation {
  createProject(input: { title: "New Project", description: "Description" }) {
    id title status
  }
}

# Update task status
mutation {
  updateTask(id: "task-uuid", input: { status: "done" }) {
    id title status updated_at
  }
}
```

---

## 🔌 WebSocket Events

**URL:** `ws://localhost:5000/ws`

### Client → Server

```json
// Authenticate
{ "type": "auth", "token": "Bearer jwt-token" }

// Join a chat room
{ "type": "join_room", "room_id": "room-uuid" }

// Send message
{ "type": "message", "room_id": "uuid", "content": "Hello!" }

// Typing indicator
{ "type": "typing", "room_id": "uuid", "is_typing": true }

// Broadcast task update (for real-time kanban)
{ "type": "task_update", "project_id": "uuid", "task": { ... } }
```

### Server → Client

```json
{ "type": "auth_success", "user": { "id": "...", "name": "..." } }
{ "type": "new_message", "message": { "id": "...", "content": "...", "sender_name": "..." } }
{ "type": "typing", "user_id": "...", "name": "Alice", "is_typing": true }
{ "type": "user_joined", "user_id": "...", "name": "Alice" }
{ "type": "task_updated", "task": { ... }, "updated_by": "..." }
```

---

## 📤 File Uploads

- **Max size:** 10MB (configurable via `MAX_FILE_SIZE` env)
- **Allowed types:** Images, PDF, Word, Excel, CSV, TXT
- **Storage:** Local disk (`/uploads/` directory)
- **Access:** `GET /uploads/:filename`

To upload a task file:
```
POST /api/tasks/:id/files
Content-Type: multipart/form-data
Body: file=<file>
```

---

## 🗄️ Database Schema

**Tables:** `users`, `categories`, `tags`, `projects`, `project_members`, `project_tags`, `tasks`, `task_tags`, `posts`, `post_tags`, `reviews`, `chat_rooms`, `chat_room_members`, `messages`, `file_uploads`

---

## 🔑 Default Seed Credentials

| Role      | Email               | Password   |
|-----------|---------------------|------------|
| Admin     | admin@example.com   | admin123   |
| Moderator | mod@example.com     | user123    |
| User      | alice@example.com   | user123    |
| User      | bob@example.com     | user123    |
