import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, tasks } from '../api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';

const statusColor = { todo:'gray', in_progress:'blue', review:'yellow', done:'green' };
const priorityDot = { urgent:'var(--red)', high:'var(--yellow)', medium:'var(--blue)', low:'var(--green)' };
const ini = n => n?.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2)||'?';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myProjects, setMyProjects] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([projects.list({ limit:8 }), tasks.list({ limit:10 })])
      .then(([p, t]) => { setMyProjects(p.projects||[]); setMyTasks(t.tasks||[]); })
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    projects: myProjects.length,
    tasks: myTasks.length,
    inProgress: myTasks.filter(t => t.status==='in_progress').length,
    done: myTasks.filter(t => t.status==='done').length,
  };

  if (loading) return <Layout><div className="center-spin"><div className="spin spin-lg" /></div></Layout>;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom:32 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:30, fontWeight:900, letterSpacing:'-0.5px', marginBottom:4 }}>
          {greet}, {user?.name?.split(' ')[0]} 👋
        </div>
        <div className="muted" style={{ fontSize:14 }}>Here's what's happening across your workspace.</div>
      </div>

      {/* Stats */}
      <div className="g4" style={{ marginBottom:28 }}>
        {[
          { label:'Projects',   val:stats.projects,   note:'total', color:'var(--accent)' },
          { label:'Tasks',      val:stats.tasks,       note:'assigned', color:'var(--blue)' },
          { label:'In Progress',val:stats.inProgress,  note:'active', color:'var(--yellow)' },
          { label:'Completed',  val:stats.done,        note:'done', color:'var(--green)' },
        ].map(s => (
          <div key={s.label} className="stat" style={{ borderTop:`3px solid ${s.color}` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color:s.color }}>{s.val}</div>
            <div className="stat-note">{s.note}</div>
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div className="g2">
        {/* Projects */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:16 }}>Recent Projects</div>
            <button className="btn btn-ghost btn-xs" onClick={() => navigate('/projects')}>View all</button>
          </div>
          {myProjects.length === 0 ? (
            <div className="empty"><div className="empty-icon">◫</div><div className="empty-title">No projects yet</div></div>
          ) : (
            <div>
              {myProjects.slice(0,6).map((p,i) => (
                <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', cursor:'pointer', borderBottom: i<5 ? '1px solid var(--border)' : 'none', transition:'var(--transition)' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--bg-2)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  <div style={{ width:34, height:34, borderRadius:8, background:'var(--accent-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>◫</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="truncate" style={{ fontSize:13, fontWeight:600 }}>{p.title}</div>
                    <div style={{ fontSize:11, color:'var(--text-3)' }}>{p.owner_name}</div>
                  </div>
                  <span className={`badge badge-${p.status==='active'?'green':'gray'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:16 }}>My Tasks</div>
            <button className="btn btn-ghost btn-xs" onClick={() => navigate('/tasks')}>View board</button>
          </div>
          {myTasks.length === 0 ? (
            <div className="empty"><div className="empty-icon">◪</div><div className="empty-title">No tasks assigned</div></div>
          ) : (
            <div>
              {myTasks.slice(0,6).map((t,i) => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom: i<5 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:priorityDot[t.priority]||'var(--text-3)', flexShrink:0 }} />
                  <div className="truncate" style={{ flex:1, fontSize:13, fontWeight:500 }}>{t.title}</div>
                  <span className={`badge badge-${statusColor[t.status]||'gray'}`} style={{ flexShrink:0 }}>
                    {t.status?.replace('_',' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
