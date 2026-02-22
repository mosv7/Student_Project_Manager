import { useState, useEffect } from 'react';
import { projects, tasks } from '../api';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';

const COLS = [
  { id:'todo',        label:'To Do',       color:'var(--text-3)' },
  { id:'in_progress', label:'In Progress', color:'var(--blue)'   },
  { id:'review',      label:'Review',      color:'var(--yellow)' },
  { id:'done',        label:'Done',        color:'var(--green)'  },
];
const PCOLORS = { urgent:'red', high:'yellow', medium:'blue', low:'green' };

export default function Kanban() {
  const [projectList, setProjectList] = useState([]);
  const [pid, setPid] = useState('');
  const [taskList, setTaskList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title:'', description:'', priority:'medium', due_date:'' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    projects.list().then(p => {
      setProjectList(p.projects||[]);
      if (p.projects?.length) setPid(p.projects[0].id);
    });
  }, []);

  useEffect(() => {
    if (!pid) return;
    setLoading(true);
    tasks.list({ project_id:pid }).then(t => setTaskList(t.tasks||[])).finally(() => setLoading(false));
  }, [pid]);

  const colTasks = status => taskList.filter(t => t.status===status);

  const move = async (task, status) => {
    try {
      await tasks.update(task.id, { status });
      setTaskList(l => l.map(t => t.id===task.id ? {...t, status} : t));
    } catch(err) { toast(err.message,'err'); }
  };

  const create = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await tasks.create({ ...form, project_id:pid });
      setTaskList(l => [r.task, ...l]);
      toast('Task created!','ok'); setOpen(false);
      setForm({ title:'', description:'', priority:'medium', due_date:'' });
    } catch(err) { toast(err.message,'err'); }
    finally { setSaving(false); }
  };

  const del = async id => {
    if (!confirm('Delete task?')) return;
    try { await tasks.delete(id); setTaskList(l => l.filter(t=>t.id!==id)); toast('Deleted','ok'); }
    catch(err) { toast(err.message,'err'); }
  };

  const set = k => e => setForm(f => ({ ...f, [k]:e.target.value }));

  return (
    <Layout>
      <div className="ph">
        <div>
          <div className="ph-title">Kanban Board</div>
          <div className="ph-sub">Drag tasks between columns to update status</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <select className="input" style={{ width:200 }} value={pid} onChange={e => setPid(e.target.value)}>
            <option value="">Select project</option>
            {projectList.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={!pid}>+ Task</button>
        </div>
      </div>

      {loading ? <div className="center-spin"><div className="spin spin-lg" /></div> : (
        <div className="kanban" style={{ minHeight:'60vh' }}>
          {COLS.map(col => {
            const ct = colTasks(col.id);
            return (
              <div key={col.id} className="k-col">
                <div className="k-head">
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:col.color }} />
                    <span className="k-title" style={{ color:col.color }}>{col.label}</span>
                  </div>
                  <span className="k-count">{ct.length}</span>
                </div>
                <div className="k-cards">
                  {ct.length===0 && <div className="k-drop">Drop tasks here</div>}
                  {ct.map(task => (
                    <div key={task.id} className="k-card">
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div style={{ fontSize:13, fontWeight:600, lineHeight:1.4, flex:1 }}>{task.title}</div>
                        <button className="icon-btn" style={{ fontSize:11, flexShrink:0, marginLeft:4 }} onClick={() => del(task.id)}>✕</button>
                      </div>
                      {task.description && (
                        <div style={{ fontSize:12, color:'var(--text-2)', marginBottom:10, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', lineHeight:1.5 }}>
                          {task.description}
                        </div>
                      )}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                        <span className={`badge badge-${PCOLORS[task.priority]||'gray'}`}>{task.priority}</span>
                        {task.due_date && <span style={{ fontSize:11, color:'var(--text-3)' }}>{new Date(task.due_date).toLocaleDateString()}</span>}
                      </div>
                      {/* Move buttons */}
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap', paddingTop:10, borderTop:'1px solid var(--border)' }}>
                        {COLS.filter(c=>c.id!==col.id).map(c => (
                          <button key={c.id} className="btn btn-ghost btn-xs" onClick={() => move(task, c.id)} style={{ fontSize:10, padding:'3px 7px' }}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">New Task</div>
              <button className="icon-btn" onClick={() => setOpen(false)}>✕</button>
            </div>
            <form onSubmit={create}>
              <div className="modal-body">
                <div className="field"><label className="label">Task title *</label><input className="input" placeholder="What needs to be done?" value={form.title} onChange={set('title')} required /></div>
                <div className="field"><label className="label">Description</label><textarea className="input" placeholder="More details..." value={form.description} onChange={set('description')} /></div>
                <div className="g2" style={{ gap:12 }}>
                  <div className="field"><label className="label">Priority</label>
                    <select className="input" value={form.priority} onChange={set('priority')}>
                      <option value="low">Low</option><option value="medium">Medium</option>
                      <option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="field"><label className="label">Due date</label><input className="input" type="date" value={form.due_date} onChange={set('due_date')} /></div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spin"/> : 'Create task'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
