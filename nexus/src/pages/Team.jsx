import { useState, useEffect } from 'react';
import { users } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';

const roleColor = { admin:'red', moderator:'purple', user:'blue' };
const ini = n => n?.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2)||'?';

export default function Team() {
  const { user:me } = useAuth();
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = (s='') => {
    setLoading(true);
    users.list({ search:s, limit:50 }).then(r => setList(r.users||[])).finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const handleSearch = e => {
    setSearch(e.target.value);
    clearTimeout(window._st);
    window._st = setTimeout(() => load(e.target.value), 400);
  };

  const changeRole = async (id, role) => {
    try { await users.updateRole(id, role); setList(l => l.map(u => u.id===id ? {...u,role} : u)); toast('Role updated!','ok'); }
    catch(err) { toast(err.message,'err'); }
  };

  return (
    <Layout>
      <div className="ph">
        <div>
          <div className="ph-title">Team</div>
          <div className="ph-sub">{list.length} members in your workspace</div>
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <input className="input" style={{ maxWidth:320 }} placeholder="Search members…" value={search} onChange={handleSearch} />
      </div>

      {loading ? <div className="center-spin"><div className="spin spin-lg" /></div>
      : list.length===0 ? <div className="card"><div className="empty"><div className="empty-icon">◨</div><div className="empty-title">No members found</div></div></div>
      : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Bio</th>
                <th>Joined</th>
                {me?.role==='admin' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div className="av av-md">{ini(u.name)}</div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                        <div style={{ fontSize:11, color:'var(--text-3)' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge badge-${roleColor[u.role]||'gray'}`}>{u.role}</span></td>
                  <td style={{ color:'var(--text-2)', fontSize:12, maxWidth:200 }}>
                    {u.bio || <span style={{ color:'var(--text-3)' }}>—</span>}
                  </td>
                  <td style={{ color:'var(--text-3)', fontSize:12 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  {me?.role==='admin' && (
                    <td>
                      {u.id===me.id
                        ? <span style={{ fontSize:12, color:'var(--text-3)' }}>You</span>
                        : (
                          <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                            style={{ fontSize:12, padding:'5px 10px', border:'1px solid var(--border)', borderRadius:6, background:'var(--bg-2)', color:'var(--text)', cursor:'pointer', outline:'none' }}
                          >
                            <option value="user">User</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
