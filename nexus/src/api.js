const BASE = '/api';
const tok = () => localStorage.getItem('token');
const h = (x = {}) => ({ 'Content-Type': 'application/json', ...(tok() ? { Authorization: `Bearer ${tok()}` } : {}), ...x });
const handle = async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Request failed'); return d; };

export const auth = {
  login:    (email, password) => fetch(`${BASE}/auth/login`,    { method:'POST', headers:h(), body:JSON.stringify({email,password}) }).then(handle),
  register: (data)            => fetch(`${BASE}/auth/register`, { method:'POST', headers:h(), body:JSON.stringify(data) }).then(handle),
  me:       ()                => fetch(`${BASE}/auth/me`,       { headers:h() }).then(handle),
};

export const users = {
  list:       (p={})       => fetch(`${BASE}/users?${new URLSearchParams(p)}`, { headers:h() }).then(handle),
  get:        (id)         => fetch(`${BASE}/users/${id}`, { headers:h() }).then(handle),
  update:     (id,data)    => fetch(`${BASE}/users/${id}`, { method:'PATCH', headers:h(), body:JSON.stringify(data) }).then(handle),
  updateRole: (id,role)    => fetch(`${BASE}/users/${id}/role`, { method:'PATCH', headers:h(), body:JSON.stringify({role}) }).then(handle),
};

export const projects = {
  list:         (p={})        => fetch(`${BASE}/projects?${new URLSearchParams(p)}`, { headers:h() }).then(handle),
  get:          (id)          => fetch(`${BASE}/projects/${id}`, { headers:h() }).then(handle),
  create:       (data)        => fetch(`${BASE}/projects`, { method:'POST', headers:h(), body:JSON.stringify(data) }).then(handle),
  update:       (id,data)     => fetch(`${BASE}/projects/${id}`, { method:'PATCH', headers:h(), body:JSON.stringify(data) }).then(handle),
  delete:       (id)          => fetch(`${BASE}/projects/${id}`, { method:'DELETE', headers:h() }).then(handle),
  addMember:    (id,user_id)  => fetch(`${BASE}/projects/${id}/members`, { method:'POST', headers:h(), body:JSON.stringify({user_id}) }).then(handle),
  removeMember: (id,uid)      => fetch(`${BASE}/projects/${id}/members/${uid}`, { method:'DELETE', headers:h() }).then(handle),
};

export const tasks = {
  list:   (p={})     => fetch(`${BASE}/tasks?${new URLSearchParams(p)}`, { headers:h() }).then(handle),
  get:    (id)       => fetch(`${BASE}/tasks/${id}`, { headers:h() }).then(handle),
  create: (data)     => fetch(`${BASE}/tasks`, { method:'POST', headers:h(), body:JSON.stringify(data) }).then(handle),
  update: (id,data)  => fetch(`${BASE}/tasks/${id}`, { method:'PATCH', headers:h(), body:JSON.stringify(data) }).then(handle),
  delete: (id)       => fetch(`${BASE}/tasks/${id}`, { method:'DELETE', headers:h() }).then(handle),
};

export const posts = {
  list:   (p={})    => fetch(`${BASE}/posts?${new URLSearchParams(p)}`, { headers:h() }).then(handle),
  get:    (id)      => fetch(`${BASE}/posts/${id}`, { headers:h() }).then(handle),
  create: (data)    => fetch(`${BASE}/posts`, { method:'POST', headers:h(), body:JSON.stringify(data) }).then(handle),
  update: (id,data) => fetch(`${BASE}/posts/${id}`, { method:'PATCH', headers:h(), body:JSON.stringify(data) }).then(handle),
  delete: (id)      => fetch(`${BASE}/posts/${id}`, { method:'DELETE', headers:h() }).then(handle),
};

export const reviews = {
  list:   (project_id) => fetch(`${BASE}/reviews?project_id=${project_id}`, { headers:h() }).then(handle),
  create: (data)       => fetch(`${BASE}/reviews`, { method:'POST', headers:h(), body:JSON.stringify(data) }).then(handle),
  delete: (id)         => fetch(`${BASE}/reviews/${id}`, { method:'DELETE', headers:h() }).then(handle),
};

export const categories = {
  list:   ()     => fetch(`${BASE}/categories`, { headers:h() }).then(handle),
  create: (data) => fetch(`${BASE}/categories`, { method:'POST', headers:h(), body:JSON.stringify(data) }).then(handle),
};

export const messages = {
  rooms:      ()          => fetch(`${BASE}/messages/rooms`, { headers:h() }).then(handle),
  createRoom: (data)      => fetch(`${BASE}/messages/rooms`, { method:'POST', headers:h(), body:JSON.stringify(data) }).then(handle),
  getMessages:(roomId)    => fetch(`${BASE}/messages/rooms/${roomId}/messages`, { headers:h() }).then(handle),
  send:       (roomId,content) => fetch(`${BASE}/messages/rooms/${roomId}/messages`, { method:'POST', headers:h(), body:JSON.stringify({content}) }).then(handle),
  delete:     (id)        => fetch(`${BASE}/messages/${id}`, { method:'DELETE', headers:h() }).then(handle),
};
