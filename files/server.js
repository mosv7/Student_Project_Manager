require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Pool } = require('pg');
const { buildSchema } = require('graphql');
const { createHandler } = require('graphql-http/lib/use/express');
const { ruruHTML } = require('ruru/server');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'project_mgmt',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'yourpassword',
  max: 20,
});
pool.on('connect', () => console.log('✅ Connected to PostgreSQL'));
pool.on('error', (err) => console.error('❌ PostgreSQL error:', err));

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','application/pdf',
      'application/msword','text/plain','text/csv'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

const generateToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
    const decoded = verifyToken(header.split(' ')[1]);
    const result = await pool.query('SELECT id, name, email, role, avatar, is_active FROM users WHERE id = $1', [decoded.id]);
    if (!result.rows[0] || !result.rows[0].is_active) return res.status(401).json({ error: 'Invalid user' });
    req.user = result.rows[0];
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role))
    return res.status(403).json({ error: 'Access forbidden' });
  next();
};

const getAuthUser = async (req) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    const decoded = verifyToken(header.split(' ')[1]);
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1 AND is_active = true', [decoded.id]);
    return result.rows[0] || null;
  } catch { return null; }
};

// ─── EXPRESS APP ──────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, uploadDir)));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api', limiter);
app.use('/api/auth', authLimiter);

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, bio } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, bio) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role, avatar, bio, created_at',
      [name, email, hashed, bio || null]
    );
    const user = result.rows[0];
    res.status(201).json({ user, token: generateToken({ id: user.id, role: user.role }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const { password: _, ...userData } = user;
    res.json({ user: userData, token: generateToken({ id: user.id, role: user.role }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

// ─── USER ROUTES ──────────────────────────────────────────────────────────────
app.get('/api/users', authenticate, authorize('admin', 'moderator'), async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = search ? [`%${search}%`, limit, offset] : [limit, offset];
    const where = search ? 'WHERE name ILIKE $1 OR email ILIKE $1' : '';
    const result = await pool.query(
      `SELECT id, name, email, role, avatar, bio, is_active, created_at FROM users ${where} ORDER BY created_at DESC LIMIT $${search?2:1} OFFSET $${search?3:2}`,
      params
    );
    res.json({ users: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, avatar, bio, created_at FROM users WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id', authenticate, async (req, res) => {
  try {
    if (req.user.id !== req.params.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, bio } = req.body;
    const result = await pool.query(
      'UPDATE users SET name=COALESCE($1,name), bio=COALESCE($2,bio), updated_at=NOW() WHERE id=$3 RETURNING id,name,email,role,avatar,bio',
      [name, bio, req.params.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/:id/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    const result = await pool.query('UPDATE users SET avatar=$1, updated_at=NOW() WHERE id=$2 RETURNING id, avatar', [url, req.params.id]);
    res.json({ user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id/role', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin','moderator','user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const result = await pool.query('UPDATE users SET role=$1 WHERE id=$2 RETURNING id, name, email, role', [role, req.params.id]);
    res.json({ user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ message: 'User deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PROJECT ROUTES ───────────────────────────────────────────────────────────
app.get('/api/projects', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.id];
    let where = 'WHERE (p.owner_id=$1 OR pm.user_id=$1)';
    if (status) { params.push(status); where += ` AND p.status=$${params.length}`; }
    params.push(limit, offset);
    const result = await pool.query(`
      SELECT DISTINCT p.*, u.name AS owner_name, c.name AS category_name
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id=p.id
      LEFT JOIN users u ON u.id=p.owner_id
      LEFT JOIN categories c ON c.id=p.category_id
      ${where} ORDER BY p.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}
    `, params);
    res.json({ projects: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/projects', authenticate, async (req, res) => {
  try {
    const { title, description, category_id, start_date, end_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const result = await pool.query(
      'INSERT INTO projects (title,description,owner_id,category_id,start_date,end_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, description, req.user.id, category_id, start_date, end_date]
    );
    await pool.query('INSERT INTO project_members (project_id,user_id,role) VALUES ($1,$2,$3)', [result.rows[0].id, req.user.id, 'owner']);
    res.status(201).json({ project: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/projects/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.name AS owner_name, c.name AS category_name
      FROM projects p
      LEFT JOIN users u ON u.id=p.owner_id
      LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.id=$1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json({ project: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/projects/:id', authenticate, async (req, res) => {
  try {
    const { title, description, category_id, status, start_date, end_date } = req.body;
    const result = await pool.query(`
      UPDATE projects SET title=COALESCE($1,title), description=COALESCE($2,description),
      category_id=COALESCE($3,category_id), status=COALESCE($4,status),
      start_date=COALESCE($5,start_date), end_date=COALESCE($6,end_date), updated_at=NOW()
      WHERE id=$7 RETURNING *
    `, [title, description, category_id, status, start_date, end_date, req.params.id]);
    res.json({ project: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/projects/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/projects/:id/members', authenticate, async (req, res) => {
  try {
    const { user_id, role = 'member' } = req.body;
    await pool.query('INSERT INTO project_members (project_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id, user_id, role]);
    res.status(201).json({ message: 'Member added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/projects/:id/members/:userId', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TASK ROUTES ──────────────────────────────────────────────────────────────
app.get('/api/tasks', authenticate, async (req, res) => {
  try {
    const { project_id, status, priority, assigned_to, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];
    if (project_id) { params.push(project_id); conditions.push(`t.project_id=$${params.length}`); }
    if (status) { params.push(status); conditions.push(`t.status=$${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`t.priority=$${params.length}`); }
    if (assigned_to) { params.push(assigned_to); conditions.push(`t.assigned_to=$${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);
    const result = await pool.query(`
      SELECT t.*, u.name AS assigned_to_name FROM tasks t
      LEFT JOIN users u ON u.id=t.assigned_to
      ${where} ORDER BY t.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}
    `, params);
    res.json({ tasks: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tasks', authenticate, async (req, res) => {
  try {
    const { title, description, project_id, assigned_to, status, priority, due_date } = req.body;
    if (!title || !project_id) return res.status(400).json({ error: 'Title and project_id required' });
    const result = await pool.query(
      'INSERT INTO tasks (title,description,project_id,assigned_to,created_by,status,priority,due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [title, description, project_id, assigned_to, req.user.id, status||'todo', priority||'medium', due_date]
    );
    res.status(201).json({ task: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tasks/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT t.*, u.name AS assigned_to_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE t.id=$1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' });
    res.json({ task: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/tasks/:id', authenticate, async (req, res) => {
  try {
    const { title, description, assigned_to, status, priority, due_date } = req.body;
    const result = await pool.query(`
      UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description),
      assigned_to=COALESCE($3,assigned_to), status=COALESCE($4,status),
      priority=COALESCE($5,priority), due_date=COALESCE($6,due_date), updated_at=NOW()
      WHERE id=$7 RETURNING *
    `, [title, description, assigned_to, status, priority, due_date, req.params.id]);
    res.json({ task: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tasks/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tasks/:id/files', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    const result = await pool.query(
      'INSERT INTO file_uploads (original_name,stored_name,mime_type,size,url,uploaded_by,task_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, url, req.user.id, req.params.id]
    );
    res.status(201).json({ file: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POSTS ────────────────────────────────────────────────────────────────────
app.get('/api/posts', authenticate, async (req, res) => {
  try {
    const { project_id, is_published } = req.query;
    const params = [];
    const conditions = [];
    if (project_id) { params.push(project_id); conditions.push(`p.project_id=$${params.length}`); }
    if (is_published !== undefined) { params.push(is_published==='true'); conditions.push(`p.is_published=$${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`SELECT p.*, u.name AS author_name FROM posts p LEFT JOIN users u ON u.id=p.author_id ${where} ORDER BY p.created_at DESC`, params);
    res.json({ posts: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/posts', authenticate, async (req, res) => {
  try {
    const { title, content, project_id, category_id, is_published } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const result = await pool.query(
      'INSERT INTO posts (title,content,author_id,project_id,category_id,is_published,published_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [title, content, req.user.id, project_id, category_id, is_published||false, is_published ? new Date() : null]
    );
    res.status(201).json({ post: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/posts/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT p.*, u.name AS author_name FROM posts p LEFT JOIN users u ON u.id=p.author_id WHERE p.id=$1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Post not found' });
    res.json({ post: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/posts/:id', authenticate, async (req, res) => {
  try {
    const { title, content, is_published } = req.body;
    const result = await pool.query(`
      UPDATE posts SET title=COALESCE($1,title), content=COALESCE($2,content),
      is_published=COALESCE($3,is_published), updated_at=NOW()
      WHERE id=$4 RETURNING *
    `, [title, content, is_published, req.params.id]);
    res.json({ post: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/posts/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    res.json({ message: 'Post deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── REVIEWS ─────────────────────────────────────────────────────────────────
app.get('/api/reviews', authenticate, async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const result = await pool.query('SELECT r.*, u.name AS reviewer_name FROM reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE r.project_id=$1 ORDER BY r.created_at DESC', [project_id]);
    const avg = result.rows.reduce((s, r) => s + r.rating, 0) / (result.rows.length || 1);
    res.json({ reviews: result.rows, avg_rating: parseFloat(avg.toFixed(2)), total: result.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reviews', authenticate, async (req, res) => {
  try {
    const { project_id, rating, comment } = req.body;
    const result = await pool.query(`
      INSERT INTO reviews (reviewer_id,project_id,rating,comment) VALUES ($1,$2,$3,$4)
      ON CONFLICT (reviewer_id,project_id) DO UPDATE SET rating=$3, comment=$4, updated_at=NOW()
      RETURNING *
    `, [req.user.id, project_id, rating, comment]);
    res.status(201).json({ review: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/reviews/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM reviews WHERE id=$1 AND reviewer_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Review deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CATEGORIES & TAGS ────────────────────────────────────────────────────────
app.get('/api/categories', authenticate, async (req, res) => {
  const result = await pool.query('SELECT * FROM categories ORDER BY name');
  res.json({ categories: result.rows });
});

app.post('/api/categories', authenticate, authorize('admin','moderator'), async (req, res) => {
  try {
    const { name, color } = req.body;
    const result = await pool.query('INSERT INTO categories (name,color,created_by) VALUES ($1,$2,$3) RETURNING *', [name, color||'#3B82F6', req.user.id]);
    res.status(201).json({ category: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tags', authenticate, async (req, res) => {
  const result = await pool.query('SELECT * FROM tags ORDER BY name');
  res.json({ tags: result.rows });
});

app.post('/api/tags', authenticate, async (req, res) => {
  try {
    const { name, color } = req.body;
    const result = await pool.query('INSERT INTO tags (name,color) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET color=$2 RETURNING *', [name, color||'#6B7280']);
    res.status(201).json({ tag: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
app.get('/api/messages/rooms', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cr.* FROM chat_rooms cr
      JOIN chat_room_members crm ON crm.room_id=cr.id
      WHERE crm.user_id=$1 ORDER BY cr.created_at DESC
    `, [req.user.id]);
    res.json({ rooms: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/messages/rooms', authenticate, async (req, res) => {
  try {
    const { name, project_id, member_ids = [], is_direct = false } = req.body;
    const room = await pool.query('INSERT INTO chat_rooms (name,project_id,is_direct) VALUES ($1,$2,$3) RETURNING *', [name, project_id, is_direct]);
    const roomId = room.rows[0].id;
    const members = [...new Set([req.user.id, ...member_ids])];
    for (const uid of members) {
      await pool.query('INSERT INTO chat_room_members (room_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roomId, uid]);
    }
    res.status(201).json({ room: room.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/messages/rooms/:roomId/messages', authenticate, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const result = await pool.query(`
      SELECT m.*, u.name AS sender_name FROM messages m
      LEFT JOIN users u ON u.id=m.sender_id
      WHERE m.room_id=$1 ORDER BY m.created_at DESC LIMIT $2
    `, [req.params.roomId, limit]);
    res.json({ messages: result.rows.reverse() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/messages/rooms/:roomId/messages', authenticate, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const result = await pool.query('INSERT INTO messages (room_id,sender_id,content) VALUES ($1,$2,$3) RETURNING *', [req.params.roomId, req.user.id, content]);
    res.status(201).json({ message: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/messages/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM messages WHERE id=$1 AND sender_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Message deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GRAPHQL ──────────────────────────────────────────────────────────────────
const schema = buildSchema(`
  type User { id: ID! name: String! email: String! role: String! avatar: String bio: String }
  type Project { id: ID! title: String! description: String status: String owner_name: String created_at: String }
  type Task { id: ID! title: String! status: String! priority: String! assigned_to_name: String due_date: String }
  type Post { id: ID! title: String! content: String! author_name: String is_published: Boolean }
  type Review { id: ID! project_id: ID! rating: Int! comment: String reviewer_name: String }
  type Category { id: ID! name: String! color: String }
  type Tag { id: ID! name: String! color: String }
  type ProjectStats { total_tasks: Int todo: Int in_progress: Int review: Int done: Int avg_rating: Float }

  type Query {
    me: User
    projects(status: String): [Project]
    project(id: ID!): Project
    projectStats(id: ID!): ProjectStats
    tasks(project_id: ID, status: String, priority: String): [Task]
    task(id: ID!): Task
    posts(project_id: ID, is_published: Boolean): [Post]
    reviews(project_id: ID!): [Review]
    categories: [Category]
    tags: [Tag]
  }

  type Mutation {
    createProject(title: String!, description: String): Project
    updateTask(id: ID!, status: String, priority: String): Task
    createTask(title: String!, project_id: ID!, priority: String): Task
    deleteTask(id: ID!): Boolean
    createReview(project_id: ID!, rating: Int!, comment: String): Review
  }
`);

const rootValue = {
  me: async (_, ctx) => ctx.user,
  projects: async ({ status }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const params = [ctx.user.id];
    let where = 'WHERE (p.owner_id=$1 OR pm.user_id=$1)';
    if (status) { params.push(status); where += ` AND p.status=$2`; }
    const r = await pool.query(`SELECT DISTINCT p.*, u.name AS owner_name FROM projects p LEFT JOIN project_members pm ON pm.project_id=p.id LEFT JOIN users u ON u.id=p.owner_id ${where} ORDER BY p.created_at DESC`, params);
    return r.rows;
  },
  project: async ({ id }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const r = await pool.query('SELECT p.*, u.name AS owner_name FROM projects p LEFT JOIN users u ON u.id=p.owner_id WHERE p.id=$1', [id]);
    return r.rows[0];
  },
  projectStats: async ({ id }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const tasks = await pool.query('SELECT status, COUNT(*) as count FROM tasks WHERE project_id=$1 GROUP BY status', [id]);
    const reviews = await pool.query('SELECT AVG(rating) as avg FROM reviews WHERE project_id=$1', [id]);
    const stats = { total_tasks: 0, todo: 0, in_progress: 0, review: 0, done: 0, avg_rating: parseFloat((reviews.rows[0]?.avg || 0).toFixed(2)) };
    tasks.rows.forEach(r => { stats[r.status] = parseInt(r.count); stats.total_tasks += parseInt(r.count); });
    return stats;
  },
  tasks: async ({ project_id, status, priority }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const params = []; const conditions = [];
    if (project_id) { params.push(project_id); conditions.push(`t.project_id=$${params.length}`); }
    if (status) { params.push(status); conditions.push(`t.status=$${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`t.priority=$${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await pool.query(`SELECT t.*, u.name AS assigned_to_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to ${where} ORDER BY t.created_at DESC`, params);
    return r.rows;
  },
  task: async ({ id }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const r = await pool.query('SELECT t.*, u.name AS assigned_to_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE t.id=$1', [id]);
    return r.rows[0];
  },
  posts: async ({ project_id, is_published }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const params = []; const conditions = [];
    if (project_id) { params.push(project_id); conditions.push(`p.project_id=$${params.length}`); }
    if (is_published !== undefined) { params.push(is_published); conditions.push(`p.is_published=$${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await pool.query(`SELECT p.*, u.name AS author_name FROM posts p LEFT JOIN users u ON u.id=p.author_id ${where} ORDER BY p.created_at DESC`, params);
    return r.rows;
  },
  reviews: async ({ project_id }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const r = await pool.query('SELECT r.*, u.name AS reviewer_name FROM reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE r.project_id=$1', [project_id]);
    return r.rows;
  },
  categories: async (_, ctx) => { if (!ctx.user) throw new Error('Unauthorized'); const r = await pool.query('SELECT * FROM categories ORDER BY name'); return r.rows; },
  tags: async (_, ctx) => { if (!ctx.user) throw new Error('Unauthorized'); const r = await pool.query('SELECT * FROM tags ORDER BY name'); return r.rows; },
  createProject: async ({ title, description }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const r = await pool.query('INSERT INTO projects (title,description,owner_id) VALUES ($1,$2,$3) RETURNING *', [title, description, ctx.user.id]);
    await pool.query('INSERT INTO project_members (project_id,user_id,role) VALUES ($1,$2,$3)', [r.rows[0].id, ctx.user.id, 'owner']);
    return r.rows[0];
  },
  createTask: async ({ title, project_id, priority }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const r = await pool.query('INSERT INTO tasks (title,project_id,created_by,priority) VALUES ($1,$2,$3,$4) RETURNING *', [title, project_id, ctx.user.id, priority||'medium']);
    return r.rows[0];
  },
  updateTask: async ({ id, status, priority }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const r = await pool.query('UPDATE tasks SET status=COALESCE($1,status), priority=COALESCE($2,priority), updated_at=NOW() WHERE id=$3 RETURNING *', [status, priority, id]);
    return r.rows[0];
  },
  deleteTask: async ({ id }, ctx) => { if (!ctx.user) throw new Error('Unauthorized'); await pool.query('DELETE FROM tasks WHERE id=$1', [id]); return true; },
  createReview: async ({ project_id, rating, comment }, ctx) => {
    if (!ctx.user) throw new Error('Unauthorized');
    const r = await pool.query('INSERT INTO reviews (reviewer_id,project_id,rating,comment) VALUES ($1,$2,$3,$4) ON CONFLICT (reviewer_id,project_id) DO UPDATE SET rating=$3,comment=$4,updated_at=NOW() RETURNING *', [ctx.user.id, project_id, rating, comment]);
    return r.rows[0];
  },
};

if (process.env.NODE_ENV !== 'production') {
  app.get('/graphql', (req, res) => { res.type('html'); res.end(ruruHTML({ endpoint: '/graphql' })); });
}
app.use('/graphql', async (req, res, next) => {
  const user = await getAuthUser(req);
  createHandler({ schema, rootValue, context: { user } })(req, res, next);
});

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
const clients = new Map();
const rooms = new Map();

const broadcast = (roomId, message, excludeUserId = null) => {
  const roomMembers = rooms.get(roomId);
  if (!roomMembers) return;
  const payload = JSON.stringify(message);
  roomMembers.forEach((userId) => {
    if (userId === excludeUserId) return;
    const userClients = clients.get(userId);
    if (userClients) userClients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(payload); });
  });
};

const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', (ws) => {
  let user = null;
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'auth') {
        try {
          const decoded = verifyToken(msg.token);
          const result = await pool.query('SELECT id, name, role FROM users WHERE id=$1 AND is_active=true', [decoded.id]);
          if (!result.rows[0]) return ws.send(JSON.stringify({ type: 'error', message: 'Invalid user' }));
          user = result.rows[0];
          if (!clients.has(user.id)) clients.set(user.id, new Set());
          clients.get(user.id).add(ws);
          ws.send(JSON.stringify({ type: 'auth_success', user: { id: user.id, name: user.name } }));
        } catch { ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' })); }
        return;
      }
      if (!user) return ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
      if (msg.type === 'join_room') {
        if (!rooms.has(msg.room_id)) rooms.set(msg.room_id, new Set());
        rooms.get(msg.room_id).add(user.id);
        ws.currentRoom = msg.room_id;
        ws.send(JSON.stringify({ type: 'joined_room', room_id: msg.room_id }));
        broadcast(msg.room_id, { type: 'user_joined', user_id: user.id, name: user.name }, user.id);
      }
      if (msg.type === 'message') {
        const result = await pool.query('INSERT INTO messages (room_id,sender_id,content) VALUES ($1,$2,$3) RETURNING *', [msg.room_id, user.id, msg.content]);
        const newMsg = { type: 'new_message', message: { ...result.rows[0], sender_name: user.name } };
        ws.send(JSON.stringify(newMsg));
        broadcast(msg.room_id, newMsg, user.id);
      }
      if (msg.type === 'typing') broadcast(msg.room_id, { type: 'typing', user_id: user.id, name: user.name, is_typing: msg.is_typing }, user.id);
      if (msg.type === 'task_update') broadcast(msg.project_id, { type: 'task_updated', task: msg.task, updated_by: user.id }, user.id);
    } catch { ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' })); }
  });
  ws.on('close', () => {
    if (user) {
      const uc = clients.get(user.id);
      if (uc) { uc.delete(ws); if (!uc.size) clients.delete(user.id); }
      if (ws.currentRoom) broadcast(ws.currentRoom, { type: 'user_left', user_id: user.id, name: user.name }, user.id);
    }
  });
});

// ─── HEALTH & ERRORS ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`REST API  -> http://localhost:${PORT}/api`);
  console.log(`GraphQL   -> http://localhost:${PORT}/graphql`);
  console.log(`WebSocket -> ws://localhost:${PORT}/ws`);
});
