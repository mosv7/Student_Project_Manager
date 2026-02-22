import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, categories } from '../api';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';

export default function Projects() {
  const [list, setList] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title:'', description:'', category_id:'', start_date:'', end_date:'' });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const load = () => Promise.all([projects.list(), categories.list()])
    .then(([p,c]) => { setList(p.projects||[]); setCats(c.categories||[]); })
    .finally(() => setLoading(false));

  useEffect(load, []);
  const set = k => e => setForm(f => ({ ...f, [k]:e.target.value }));

  const create = async e => {
    e.preventDefault(); setSaving(true);
    try { await projects.create(form); toast('Project created!','ok'); setOpen(false); setForm({ title:'',description:'',category_id:'',start_date:'',end_date:'' }); load(); }
    catch(err) { toast(err.message,'err'); }
    finally { setSaving(false); }
  };

  const del = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this project?')) return;
    try { await projects.delete(id); toast('Deleted','ok'); setList(l => l.filter(p=>p.id!==id)); }
    catch(err) { toast(err.message,'err'); }
  };

  if (loading) return <Layout><div className="center-spin"><div className="spin spin-lg" /></div></Layout>;

  return (
    <Layout>
      <div className="ph">
        <div>
          <div className="ph-title">Projects</div>
          <div className="ph-sub">{list.length} projects in your workspace</div>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ New project</button>
      </div>

      {list.length === 0 ? (
        <div className="card"><div className="empty">
          <div className="empty-icon">◫</div>
          <div className="empty-title">No projects yet</div>
          <div className="empty-text">Create your first project to get started</div>
          <button className="btn btn-primary" onClick={() => setOpen(true)}>Create project</button>
        </div></div>
      ) : (
        <div className="g3">
          {list.map(p => (
            <div key={p.id} className="card" style={{ cursor:'pointer', transition:'var(--transition)', overflow:'hidden', padding:0 }}
              onClick={() => navigate(`/projects/${p.id}`)}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='var(--shadow-accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
            >
              <div style={{ height:3, background:'var(--accent)' }} />
              <div style={{ padding:'18px 20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div style={{ width:38, height:38, background:'var(--accent-bg)', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>◫</div>
                  <button className="icon-btn" onClick={e => del(p.id, e)} style={{ fontSize:12 }}>✕</button>
                </div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:700, marginBottom:6 }}>{p.title}</div>
                <div style={{ fontSize:12, color:'var(--text-2)', marginBottom:14, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', lineHeight:1.5 }}>
                  {p.description || 'No description provided.'}
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span className={`badge badge-${p.status==='active'?'green':'gray'}`}>{p.status}</span>
                  <span style={{ fontSize:11, color:'var(--text-3)' }}>{p.category_name||'Uncategorized'}</span>
                </div>
                <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text-3)', display:'flex', justifyContent:'space-between' }}>
                  <span>{p.owner_name}</span>
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">New Project</div>
              <button className="icon-btn" onClick={() => setOpen(false)}>✕</button>
            </div>
            <form onSubmit={create}>
              <div className="modal-body">
                <div className="field"><label className="label">Project name *</label><input className="input" placeholder="My awesome project" value={form.title} onChange={set('title')} required /></div>
                <div className="field"><label className="label">Description</label><textarea className="input" placeholder="What is this project about?" value={form.description} onChange={set('description')} /></div>
                <div className="field"><label className="label">Category</label>
                  <select className="input" value={form.category_id} onChange={set('category_id')}>
                    <option value="">Select category</option>
                    {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="g2" style={{ gap:12 }}>
                  <div className="field"><label className="label">Start date</label><input className="input" type="date" value={form.start_date} onChange={set('start_date')} /></div>
                  <div className="field"><label className="label">End date</label><input className="input" type="date" value={form.end_date} onChange={set('end_date')} /></div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spin"/> : 'Create project'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
