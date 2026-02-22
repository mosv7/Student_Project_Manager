require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'project_mgmt',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'yourpassword',
});

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users
    const adminPass = await bcrypt.hash('admin123', 12);
    const userPass = await bcrypt.hash('user123', 12);

    const admin = await client.query(`
      INSERT INTO users (name, email, password, role, bio)
      VALUES ('Admin User', 'admin@example.com', $1, 'admin', 'System administrator')
      ON CONFLICT (email) DO UPDATE SET password = $1 RETURNING id
    `, [adminPass]);

    await client.query(`
      INSERT INTO users (name, email, password, role, bio)
      VALUES ('Moderator', 'mod@example.com', $1, 'moderator', 'Content moderator')
      ON CONFLICT (email) DO UPDATE SET password = $1 RETURNING id
    `, [userPass]);

    const user1 = await client.query(`
      INSERT INTO users (name, email, password, bio)
      VALUES ('Alice Johnson', 'alice@example.com', $1, 'Full-stack developer')
      ON CONFLICT (email) DO UPDATE SET password = $1 RETURNING id
    `, [userPass]);

    const user2 = await client.query(`
      INSERT INTO users (name, email, password, bio)
      VALUES ('Bob Smith', 'bob@example.com', $1, 'UX Designer')
      ON CONFLICT (email) DO UPDATE SET password = $1 RETURNING id
    `, [userPass]);

    // Category
    const cat = await client.query(`
      INSERT INTO categories (name, color, created_by)
      VALUES ('Development', '#3B82F6', $1)
      ON CONFLICT DO NOTHING RETURNING id
    `, [admin.rows[0].id]);

    // Tags
    await client.query(`
      INSERT INTO tags (name, color) VALUES
      ('urgent', '#EF4444'),
      ('backend', '#8B5CF6'),
      ('frontend', '#06B6D4')
      ON CONFLICT DO NOTHING
    `);

    // Project
    const project = await client.query(`
      INSERT INTO projects (title, description, owner_id, category_id, status, start_date, end_date)
      VALUES ('Project Alpha', 'Our main product development project', $1, $2, 'active', NOW(), NOW() + INTERVAL '90 days')
      RETURNING id
    `, [admin.rows[0].id, cat.rows[0]?.id]);

    const pid = project.rows[0].id;

    // Project members
    await client.query(`
      INSERT INTO project_members (project_id, user_id, role) VALUES
      ($1, $2, 'owner'),
      ($1, $3, 'member'),
      ($1, $4, 'member')
      ON CONFLICT DO NOTHING
    `, [pid, admin.rows[0].id, user1.rows[0].id, user2.rows[0].id]);

    // Tasks
    await client.query(`
      INSERT INTO tasks (title, description, project_id, assigned_to, created_by, status, priority, due_date) VALUES
      ('Set up CI/CD pipeline', 'Configure GitHub Actions', $1, $2, $3, 'in_progress', 'high', NOW() + INTERVAL '7 days'),
      ('Design landing page', 'Create responsive homepage', $1, $4, $3, 'todo', 'medium', NOW() + INTERVAL '14 days'),
      ('Write API documentation', 'Document all endpoints', $1, $2, $3, 'todo', 'low', NOW() + INTERVAL '30 days'),
      ('Fix auth bug', 'JWT refresh token issue', $1, $2, $3, 'review', 'urgent', NOW() + INTERVAL '2 days')
    `, [pid, user1.rows[0].id, admin.rows[0].id, user2.rows[0].id]);

    // Post
    await client.query(`
      INSERT INTO posts (title, content, author_id, project_id, is_published, published_at)
      VALUES ('Project Kickoff', 'Welcome to Project Alpha!', $1, $2, true, NOW())
    `, [admin.rows[0].id, pid]);

    // Review
    await client.query(`
      INSERT INTO reviews (reviewer_id, project_id, rating, comment)
      VALUES ($1, $2, 5, 'Great project structure!')
      ON CONFLICT DO NOTHING
    `, [user1.rows[0].id, pid]);

    // Chat room
    const room = await client.query(`
      INSERT INTO chat_rooms (name, project_id) VALUES ('Project Alpha Chat', $1) RETURNING id
    `, [pid]);

    await client.query(`
      INSERT INTO chat_room_members (room_id, user_id) VALUES
      ($1, $2), ($1, $3), ($1, $4)
      ON CONFLICT DO NOTHING
    `, [room.rows[0].id, admin.rows[0].id, user1.rows[0].id, user2.rows[0].id]);

    await client.query(`
      INSERT INTO messages (room_id, sender_id, content) VALUES
      ($1, $2, 'Hey team, project is live!'),
      ($1, $3, 'Awesome! Looking forward to it.')
    `, [room.rows[0].id, admin.rows[0].id, user1.rows[0].id]);

    await client.query('COMMIT');
    console.log('✅ Seed data inserted successfully!');
    console.log('-----------------------------------');
    console.log('Admin:  admin@example.com / admin123');
    console.log('User:   alice@example.com / user123');
    console.log('User:   bob@example.com   / user123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
};

seed();
