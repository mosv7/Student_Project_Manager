import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ name:'', email:'', password:'', bio:'' });
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === 'login') await login(form.email, form.password);
      else await register({ name: form.name, email: form.email, password: form.password, bio: form.bio });
      toast('Welcome to Nexus!', 'ok');
      navigate('/dashboard');
    } catch (err) {
      toast(err.message, 'err');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      {/* Left panel */}
      <div style={{
        flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        padding:48, maxWidth:480,
      }}>
        {/* Logo */}
        <div style={{ marginBottom:48, alignSelf:'flex-start' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width:36, height:36, background:'var(--accent)', borderRadius:10,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'var(--font-display)', fontWeight:900, fontSize:17, color:'#0c0c0f',
            }}>N</div>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:20 }}>Nexus</span>
          </div>
        </div>

        <div style={{ width:'100%', maxWidth:360 }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:32, fontWeight:900, letterSpacing:'-1px', marginBottom:8, lineHeight:1.1 }}>
            {tab === 'login' ? 'Welcome back.' : 'Get started.'}
          </h1>
          <p style={{ color:'var(--text-2)', fontSize:14, marginBottom:32 }}>
            {tab === 'login' ? 'Sign in to your workspace.' : 'Create your free account.'}
          </p>

          {/* Tabs */}
          <div style={{ display:'flex', gap:0, marginBottom:28, borderBottom:'1px solid var(--border)' }}>
            {['login','register'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:'8px 20px', background:'none', border:'none',
                borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab===t ? 'var(--accent)' : 'var(--text-3)',
                fontFamily:'var(--font-body)', fontWeight:600, fontSize:13,
                cursor:'pointer', transition:'var(--transition)', textTransform:'capitalize',
                marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {tab === 'register' && (
              <div className="field">
                <label className="label">Full name</label>
                <input className="input" placeholder="Alice Johnson" value={form.name} onChange={set('name')} required />
              </div>
            )}
            <div className="field">
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} required />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
            </div>
            {tab === 'register' && (
              <div className="field">
                <label className="label">Bio <span style={{ color:'var(--text-3)', textTransform:'none', fontWeight:400 }}>(optional)</span></label>
                <input className="input" placeholder="What do you do?" value={form.bio} onChange={set('bio')} />
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width:'100%', justifyContent:'center', padding:'12px', marginTop:6, fontSize:14 }}>
              {loading ? <span className="spin" /> : tab === 'login' ? 'Sign in →' : 'Create account →'}
            </button>
          </form>

          {tab === 'login' && (
            <div style={{ marginTop:24, padding:'14px 16px', background:'var(--bg-3)', borderRadius:10, fontSize:12, color:'var(--text-2)', lineHeight:1.7 }}>
              <div style={{ fontWeight:600, color:'var(--text)', marginBottom:4 }}>Demo accounts</div>
              <div>admin@example.com — admin123</div>
              <div>alice@example.com — user123</div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel - decorative */}
      <div style={{
        flex:1, background:'var(--surface)', borderLeft:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden',
      }}>
        {/* Decorative grid */}
        <div style={{
          position:'absolute', inset:0,
          backgroundImage:'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize:'32px 32px', opacity:0.4,
        }} />
        {/* Center glow */}
        <div style={{
          position:'absolute', width:400, height:400,
          background:'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
        }} />
        {/* Content */}
        <div style={{ position:'relative', textAlign:'center', padding:40 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:52, fontWeight:900, letterSpacing:'-2px', lineHeight:1, marginBottom:16, color:'var(--text)' }}>
            Project<br />
            <span style={{ color:'var(--accent)' }}>Management</span><br />
            Reimagined.
          </div>
          <p style={{ fontSize:14, color:'var(--text-2)', maxWidth:280, margin:'0 auto', lineHeight:1.7 }}>
            Tasks, teams, and timelines — all in one beautifully crafted workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
