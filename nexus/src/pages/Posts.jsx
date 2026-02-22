import { useState, useEffect } from 'react';
import { posts } from '../api';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';

export default function Posts() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title:'', content:'', is_published:false });
  const [saving, setSaving] = useState(false);

  const load = () => posts.list().then(r => setList(r.posts||[])).finally(() => setLoading(false));
  useEffect(load, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type==='checkbox' ? e.target.checked : e.target.value }));

  const openCreate = () => { setEditing(null); setForm({ title:'', content:'', is_published:false }); setOpen(true); };
  const openEdit = p => { setEditing(p); setForm({ title:p.title, content:p.content, is_published:p.is_published }); setOpen(true); };

  const save = async e => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) { const r = await posts.update(editing.id, form); setList(l => l.map(p => p.id===editing.id ? r.post : p)); toast('Updated!','ok'); }
      else { const r = await posts.create(form); setList(l => [r.post, ...l]); toast('Post created!','ok'); }
      setOpen(false);
    } catch(err) { toast(err.message,'err'); }
    finally { setSaving(false); }
  };

  const del = async id => {
    if (!confirm('Delete this post?')) return;
    try { await posts.delete(id); setList(l => l.filter(p=>p.id!==id)); toast('Deleted','ok'); }
    catch(err) { toast(err.message,'err'); }
  };

  if (loading) return <Layout><div className="center-spin"><div className="spin spin-lg" /></div></Layout>;

  return (
    <Layout>
      <div className="ph">
        <div>
          <div className="ph-title">Posts</div>
          <div className="ph-sub">{list.length} articles in your workspace</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Write post</button>
      </div>

      {list.length===0 ? (
        <div className="card"><div className="empty">
          <div className="empty-icon">◧</div>
          <div className="empty-title">No posts yet</div>
          <div className="empty-text">Write your first article or update</div>
          <button className="btn btn-primary" onClick={openCreate}>Write post</button>
        </div></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {list.map(p => (
            <div key={p.id} className="card" style={{ padding:'22px 24px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700 }}>{p.title}</div>
                    <span className={`badge badge-${p.is_published?'green':'gray'}`}>{p.is_published?'Published':'Draft'}</span>
                  </div>
                  <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.7, marginBottom:14, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' }}>
                    {p.content}
                  </div>
                  <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--text-3)' }}>
                    <span>By {p.author_name||'Unknown'}</span>
                    <span>·</span>
                    <span>{new Date(p.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" style={{ maxWidth:600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{editing ? 'Edit Post' : 'New Post'}</div>
              <button className="icon-btn" onClick={() => setOpen(false)}>✕</button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body">
                <div className="field"><label className="label">Title *</label><input className="input" placeholder="Post title…" value={form.title} onChange={set('title')} required /></div>
                <div className="field"><label className="label">Content *</label><textarea className="input" style={{ minHeight:160 }} placeholder="Write your content…" value={form.content} onChange={set('content')} required /></div>
                <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:13, fontWeight:500 }}>
                  <input type="checkbox" checked={form.is_published} onChange={set('is_published')} style={{ width:15, height:15, accentColor:'var(--accent)' }} />
                  Publish immediately
                </label>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spin"/> : editing ? 'Save changes' : 'Create post'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
