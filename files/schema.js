require('dotenv').config();
const { buildSchema } = require('graphql');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'project_mgmt',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'yourpassword',
});

// ─── SCHEMA ───────────────────────────────────────────────────────────────────
const schema = buildSchema(`
  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    avatar: String
    bio: String
    created_at: String
  }

  type Project {
    id: ID!
    title: String!
    description: String
    status: String
    owner_id: ID
    owner_name: String
    category_name: String
    start_date: String
    end_date: String
    created_at: String
  }

  type Task {
    id: ID!
    title: String!
    description: String
    project_id: ID!
    assigned_to: ID
    assigned_to_name: String
    status: String!
    priority: String!
    due_date: String
    created_at: String
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    author_id: ID
    author_name: String
    project_id: ID
    is_published: Boolean
    published_at: String
    created_at: String
  }

  type Review {
    id: ID!
    reviewer_id: ID
    reviewer_name: String
    project_id: ID!
    rating: Int!
    comment: String
    created_at: String
  }

  type Category {
    id: ID!
    name: String!
    color: String
  }

  type Tag {
    id: ID!
    name: String!
    color: String
  }

  type Message {
    id: ID!
    room_id: ID!
    sender_id: ID
    sender_name: String
    content: String!
    created_at: String
  }

  type ProjectStats {
    total_tasks: Int
    todo: Int
    in_progress: Int
    review: Int
    done: Int
    avg_rating: Float
  }

  type Query {
    me: User
    users(search: String, page: Int, limit: Int): [User]
    user(id: ID!): User

    projects(status: String, page: Int, limit: Int): [Project]
    project(id: ID!): Project
    projectStats(id: ID!): ProjectStats

    tasks(project_id: ID, status: String, priority: String, assigned_to: ID): [Task]
    task(id: ID!): Task

    posts(project_id: ID, is_published: Boolean): [Post]
    post(id: ID!): Post

    reviews(project_id: ID!): [Review]

    categories: [Category]
    tags: [Tag]

    messages(room_id: ID!, limit: Int): [Message]
  }

  input CreateProjectInput {
    title: String!
    description: String
    category_id: ID
    start_date: String
    end_date: String
  }

  input CreateTaskInput {
    title: String!
    description: String
    project_id: ID!
    assigned_to: ID
    priority: String
    due_date: String
  }

  input UpdateTaskInput {
    title: String
    description: String
    status: String
    priority: String
    assigned_to: ID
    due_date: String
  }

  type Mutation {
    createProject(input: CreateProjectInput!): Project
    updateProjectStatus(id: ID!, status: String!): Project
    deleteProject(id: ID!): Boolean

    createTask(input: CreateTaskInput!): Task
    updateTask(id: ID!, input: UpdateTaskInput!): Task
    deleteTask(id: ID!): Boolean

    createReview(project_id: ID!, rating: Int!, comment: String): Review
    createCategory(name: String!, color: String): Category
    createTag(name: String!, color: String): Tag
  }
`);

// ─── RESOLVERS ────────────────────────────────────────────────────────────────
const rootValue = {
  // Queries
  me: async (_, context) => context.user,

  users: async ({ search, page = 1, limit = 20 }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const offset = (page - 1) * limit;
    const params = search ? [`%${search}%`, limit, offset] : [limit, offset];
    const where = search ? `WHERE name ILIKE $1 OR email ILIKE $1` : '';
    const numOffset = search ? 3 : 2;
    const q = `SELECT id, name, email, role, avatar, bio, created_at FROM users ${where} LIMIT $${search ? 2 : 1} OFFSET $${search ? 3 : 2}`;
    const result = await pool.query(q, params);
    return result.rows;
  },

  user: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query('SELECT id, name, email, role, avatar, bio, created_at FROM users WHERE id = $1', [id]);
    return result.rows[0];
  },

  projects: async ({ status, page = 1, limit = 20 }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const offset = (page - 1) * limit;
    const params = [context.user.id, limit, offset];
    let where = `WHERE (p.owner_id = $1 OR pm.user_id = $1)`;
    if (status) { params.splice(1, 0, status); where += ` AND p.status = $2`; }
    const result = await pool.query(`
      SELECT DISTINCT p.*, u.name AS owner_name, c.name AS category_name
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN users u ON u.id = p.owner_id
      LEFT JOIN categories c ON c.id = p.category_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return result.rows;
  },

  project: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query(`
      SELECT p.*, u.name AS owner_name, c.name AS category_name
      FROM projects p LEFT JOIN users u ON u.id = p.owner_id LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1
    `, [id]);
    return result.rows[0];
  },

  projectStats: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const tasks = await pool.query(`
      SELECT status, COUNT(*) as count FROM tasks WHERE project_id = $1 GROUP BY status
    `, [id]);
    const reviews = await pool.query('SELECT AVG(rating) as avg FROM reviews WHERE project_id = $1', [id]);
    const stats = { total_tasks: 0, todo: 0, in_progress: 0, review: 0, done: 0, avg_rating: parseFloat((reviews.rows[0]?.avg || 0).toFixed(2)) };
    tasks.rows.forEach(r => {
      stats[r.status] = parseInt(r.count);
      stats.total_tasks += parseInt(r.count);
    });
    return stats;
  },

  tasks: async ({ project_id, status, priority, assigned_to }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const conditions = [];
    const params = [];
    if (project_id) { params.push(project_id); conditions.push(`t.project_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`t.status = $${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`t.priority = $${params.length}`); }
    if (assigned_to) { params.push(assigned_to); conditions.push(`t.assigned_to = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`
      SELECT t.*, u.name AS assigned_to_name FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to ${where} ORDER BY t.created_at DESC
    `, params);
    return result.rows;
  },

  task: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query('SELECT t.*, u.name AS assigned_to_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = $1', [id]);
    return result.rows[0];
  },

  posts: async ({ project_id, is_published }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const params = [];
    const conditions = [];
    if (project_id) { params.push(project_id); conditions.push(`p.project_id = $${params.length}`); }
    if (is_published !== undefined) { params.push(is_published); conditions.push(`p.is_published = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`SELECT p.*, u.name AS author_name FROM posts p LEFT JOIN users u ON u.id = p.author_id ${where} ORDER BY p.created_at DESC`, params);
    return result.rows;
  },

  post: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query('SELECT p.*, u.name AS author_name FROM posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.id = $1', [id]);
    return result.rows[0];
  },

  reviews: async ({ project_id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query('SELECT r.*, u.name AS reviewer_name FROM reviews r LEFT JOIN users u ON u.id = r.reviewer_id WHERE r.project_id = $1 ORDER BY r.created_at DESC', [project_id]);
    return result.rows;
  },

  categories: async (_, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    return result.rows;
  },

  tags: async (_, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query('SELECT * FROM tags ORDER BY name');
    return result.rows;
  },

  messages: async ({ room_id, limit = 50 }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query(`
      SELECT m.*, u.name AS sender_name FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = $1 ORDER BY m.created_at DESC LIMIT $2
    `, [room_id, limit]);
    return result.rows.reverse();
  },

  // Mutations
  createProject: async ({ input }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const { title, description, category_id, start_date, end_date } = input;
    const result = await pool.query(
      'INSERT INTO projects (title, description, owner_id, category_id, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, description, context.user.id, category_id, start_date, end_date]
    );
    await pool.query('INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3)', [result.rows[0].id, context.user.id, 'owner']);
    return result.rows[0];
  },

  updateProjectStatus: async ({ id, status }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query('UPDATE projects SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [status, id]);
    return result.rows[0];
  },

  deleteProject: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    await pool.query('DELETE FROM projects WHERE id=$1 AND owner_id=$2', [id, context.user.id]);
    return true;
  },

  createTask: async ({ input }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const { title, description, project_id, assigned_to, priority, due_date } = input;
    const result = await pool.query(
      'INSERT INTO tasks (title, description, project_id, assigned_to, created_by, priority, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [title, description, project_id, assigned_to, context.user.id, priority || 'medium', due_date]
    );
    return result.rows[0];
  },

  updateTask: async ({ id, input }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const { title, description, status, priority, assigned_to, due_date } = input;
    const result = await pool.query(`
      UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description),
      status=COALESCE($3,status), priority=COALESCE($4,priority), assigned_to=COALESCE($5,assigned_to),
      due_date=COALESCE($6,due_date), updated_at=NOW() WHERE id=$7 RETURNING *
    `, [title, description, status, priority, assigned_to, due_date, id]);
    return result.rows[0];
  },

  deleteTask: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    await pool.query('DELETE FROM tasks WHERE id=$1', [id]);
    return true;
  },

  createReview: async ({ project_id, rating, comment }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query(`
      INSERT INTO reviews (reviewer_id, project_id, rating, comment)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (reviewer_id, project_id) DO UPDATE SET rating=$3, comment=$4, updated_at=NOW()
      RETURNING *
    `, [context.user.id, project_id, rating, comment]);
    return result.rows[0];
  },

  createCategory: async ({ name, color }, context) => {
    if (!context.user || !['admin', 'moderator'].includes(context.user.role)) throw new Error('Forbidden');
    const result = await pool.query('INSERT INTO categories (name, color, created_by) VALUES ($1,$2,$3) RETURNING *', [name, color || '#3B82F6', context.user.id]);
    return result.rows[0];
  },

  createTag: async ({ name, color }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    const result = await pool.query('INSERT INTO tags (name, color) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET color=$2 RETURNING *', [name, color || '#6B7280']);
    return result.rows[0];
  },
};

module.exports = { schema, rootValue };
