import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, reviews } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [reviewList, setReviewList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([projects.get(id), reviews.list(id)])
      .then(([p, r]) => { setProject(p.project); setReviewList(r.reviews||[]); })
      .catch(() => toast('Project not found','err'))
      .finally(() => setLoading(false));
  }, [id]);

  const submitReview = async e => {
    e.preventDefault(); setSubmitting(true);
    try {
      const r = await reviews.create({ project_id:id, rating, comment });
      setReviewList(prev => [r.review, ...prev.filter(x => x.reviewer_id!==user?.id)]);
      toast('Review submitted!','ok'); setComment('');
    } catch(err) { toast(err.message,'err'); }
    finally { setSubmitting(false); }
  };

  const avg = reviewList.length ? (reviewList.reduce((s,r)=>s+r.rating,0)/reviewList.length).toFixed(1) : null;

  if (loading) return <Layout><div className="center-spin"><div className="spin spin-lg" /></div></Layout>;
  if (!project) return <Layout><div className="empty"><div className="empty-title">Project not found</div></div></Layout>;

  return (
    <Layout>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')} style={{ marginBottom:20 }}>← Back to projects</button>

      {/* Header card */}
      <div className="card" style={{ padding:'24px 26px', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
          <div style={{ display:'flex', gap:16, alignItems:'flex-start', flex:1 }}>
            <div style={{ width:50, height:50, background:'var(--accent-bg)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>◫</div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:800, letterSpacing:'-0.5px', marginBottom:6 }}>{project.title}</div>
              <div style={{ fontSize:13, color:'var(--text-2)', marginBottom:14, lineHeight:1.6 }}>{project.description||'No description provided.'}</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                <span className={`badge badge-${project.status==='active'?'green':'gray'}`}>{project.status}</span>
                {project.category_name && <span className="badge badge-blue">{project.category_name}</span>}
                <span style={{ fontSize:12, color:'var(--text-3)' }}>by {project.owner_name}</span>
                {project.start_date && <span style={{ fontSize:12, color:'var(--text-3)' }}>{new Date(project.start_date).toLocaleDateString()} → {project.end_date ? new Date(project.end_date).toLocaleDateString() : '…'}</span>}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tasks?project=${id}`)}>View tasks</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20 }}>
        {/* Reviews list */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:16 }}>Reviews</div>
            {avg && (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ color:'var(--accent)', fontSize:18 }}>★</span>
                <span style={{ fontWeight:700, fontSize:16 }}>{avg}</span>
                <span style={{ fontSize:12, color:'var(--text-3)' }}>({reviewList.length})</span>
              </div>
            )}
          </div>
          {reviewList.length===0 ? (
            <div className="empty"><div className="empty-icon">★</div><div className="empty-title">No reviews yet</div><div className="empty-text">Be the first to leave a review</div></div>
          ) : (
            <div>
              {reviewList.map((r,i) => (
                <div key={r.id} style={{ padding:'16px 22px', borderBottom: i<reviewList.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{r.reviewer_name}</div>
                    <div style={{ color:'var(--accent)', letterSpacing:2 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</div>
                  </div>
                  {r.comment && <div style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>{r.comment}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit review */}
        <div className="card" style={{ padding:'22px', height:'fit-content' }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:16, marginBottom:18 }}>Leave a Review</div>
          <form onSubmit={submitReview} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="field">
              <label className="label">Rating</label>
              <div style={{ display:'flex', gap:4 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:26, transition:'var(--transition)', opacity: n<=rating ? 1 : 0.25, color:'var(--accent)' }}>★</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">Comment</label>
              <textarea className="input" placeholder="Share your thoughts…" value={comment} onChange={e => setComment(e.target.value)} style={{ minHeight:100 }} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ justifyContent:'center' }}>
              {submitting ? <span className="spin"/> : 'Submit review'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
