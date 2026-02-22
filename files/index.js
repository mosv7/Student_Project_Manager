require('dotenv').config();
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'project_mgmt',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'yourpassword',
});

const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET || 'supersecret');

const clients = new Map(); // userId -> Set<ws>
const rooms = new Map();   // roomId -> Set<userId>

const broadcast = (roomId, message, excludeUserId = null) => {
  const roomMembers = rooms.get(roomId);
  if (!roomMembers) return;
  const payload = JSON.stringify(message);
  roomMembers.forEach((userId) => {
    if (userId === excludeUserId) return;
    const userClients = clients.get(userId);
    if (userClients) {
      userClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      });
    }
  });
};

const setupWebSocket = (server) => {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    let user = null;

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);

        // AUTH
        if (msg.type === 'auth') {
          try {
            const decoded = verifyToken(msg.token);
            const result = await pool.query(
              'SELECT id, name, role FROM users WHERE id = $1 AND is_active = true',
              [decoded.id]
            );
            if (!result.rows[0]) return ws.send(JSON.stringify({ type: 'error', message: 'Invalid user' }));
            user = result.rows[0];
            if (!clients.has(user.id)) clients.set(user.id, new Set());
            clients.get(user.id).add(ws);
            ws.send(JSON.stringify({ type: 'auth_success', user: { id: user.id, name: user.name } }));
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
          }
          return;
        }

        if (!user) return ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));

        // JOIN ROOM
        if (msg.type === 'join_room') {
          const { room_id } = msg;
          // Verify membership
          const member = await pool.query(
            'SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
            [room_id, user.id]
          );
          if (!member.rows.length) return ws.send(JSON.stringify({ type: 'error', message: 'Not a member of this room' }));
          if (!rooms.has(room_id)) rooms.set(room_id, new Set());
          rooms.get(room_id).add(user.id);
          ws.currentRoom = room_id;
          ws.send(JSON.stringify({ type: 'joined_room', room_id }));
          broadcast(room_id, { type: 'user_joined', user_id: user.id, name: user.name, room_id }, user.id);
          return;
        }

        // SEND MESSAGE
        if (msg.type === 'message') {
          const { room_id, content } = msg;
          if (!content || !room_id) return;
          const result = await pool.query(
            'INSERT INTO messages (room_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *',
            [room_id, user.id, content]
          );
          const newMsg = {
            type: 'new_message',
            message: { ...result.rows[0], sender_name: user.name },
          };
          // Send to sender too
          ws.send(JSON.stringify(newMsg));
          broadcast(room_id, newMsg, user.id);
          return;
        }

        // TYPING INDICATOR
        if (msg.type === 'typing') {
          const { room_id, is_typing } = msg;
          broadcast(room_id, { type: 'typing', user_id: user.id, name: user.name, is_typing, room_id }, user.id);
          return;
        }

        // TASK UPDATE BROADCAST (for real-time kanban)
        if (msg.type === 'task_update') {
          const { project_id, task } = msg;
          broadcast(project_id, { type: 'task_updated', task, updated_by: user.id }, user.id);
          return;
        }

      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      if (user) {
        const userClients = clients.get(user.id);
        if (userClients) {
          userClients.delete(ws);
          if (!userClients.size) clients.delete(user.id);
        }
        if (ws.currentRoom) {
          broadcast(ws.currentRoom, { type: 'user_left', user_id: user.id, name: user.name }, user.id);
        }
      }
    });

    ws.on('error', (err) => console.error('WS error:', err));
  });

  console.log('✅ WebSocket server initialized at /ws');
  return wss;
};

module.exports = { setupWebSocket, broadcast };
