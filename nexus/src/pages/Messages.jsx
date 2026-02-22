import { useState, useEffect, useRef } from 'react';
import { messages as api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';

const ini = n => n?.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2)||'?';
const fmt = d => d ? new Date(d).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';

export default function Messages() {
  const { user } = useAuth();
  const toast = useToast();
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  const [showNew, setShowNew] = useState(false);
  const bottom = useRef(null);
  const ws = useRef(null);

  // Load rooms
  useEffect(() => {
    api.rooms().then(r => { setRooms(r.rooms||[]); if(r.rooms?.length) setRoom(r.rooms[0]); }).finally(() => setLoading(false));
  }, []);

  // WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = new WebSocket('ws://localhost:5000/ws');
    ws.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type:'auth', token }));
    socket.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'new_message') setMsgs(prev => [...prev, msg.message]);
    };
    socket.onerror = () => {}; // silent fail
    return () => socket.close();
  }, []);

  // Load messages on room change
  useEffect(() => {
    if (!room) return;
    api.getMessages(room.id).then(r => setMsgs(r.messages||[]));
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type:'join_room', room_id:room.id }));
    }
  }, [room]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  const send = async e => {
    e.preventDefault();
    if (!input.trim() || !room) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    try {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type:'message', room_id:room.id, content }));
      } else {
        const r = await api.send(room.id, content);
        setMsgs(prev => [...prev, { ...r.message, sender_name:user?.name, sender_id:user?.id }]);
      }
    } catch(err) { toast(err.message,'err'); }
    finally { setSending(false); }
  };

  const createRoom = async () => {
    if (!newRoom.trim()) return;
    try {
      const r = await api.createRoom({ name:newRoom.trim() });
      setRooms(prev => [r.room, ...prev]);
      setRoom(r.room);
      setNewRoom(''); setShowNew(false);
      toast('Room created!','ok');
    } catch(err) { toast(err.message,'err'); }
  };

  const isMe = msg => msg.sender_id === user?.id;

  return (
    <Layout>
      <div style={{ height:'calc(100vh - 96px)', display:'flex', background:'var(--surface)', borderRadius:'var(--radius)', border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow)' }}>

        {/* Rooms sidebar */}
        <div style={{ width:260, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'16px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:15 }}>Messages</span>
            <button className="icon-btn" onClick={() => setShowNew(v => !v)} title="New room" style={{ fontSize:18, fontWeight:300 }}>+</button>
          </div>

          {showNew && (
            <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}>
              <input className="input" style={{ fontSize:12 }} placeholder="Room name…" value={newRoom} onChange={e => setNewRoom(e.target.value)} onKeyDown={e => e.key==='Enter' && createRoom()} />
              <button className="btn btn-primary btn-sm" onClick={createRoom}>+</button>
            </div>
          )}

          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? <div className="center-spin"><div className="spin" /></div>
            : rooms.length===0 ? <div className="empty" style={{ padding:24 }}><div className="empty-icon">◩</div><div className="small muted">No rooms yet</div></div>
            : rooms.map(r => (
              <div key={r.id} onClick={() => setRoom(r)}
                style={{
                  padding:'13px 14px', cursor:'pointer', transition:'var(--transition)',
                  background: room?.id===r.id ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: room?.id===r.id ? '3px solid var(--accent)' : '3px solid transparent',
                }}
                onMouseEnter={e => { if(room?.id!==r.id) e.currentTarget.style.background='var(--bg-2)'; }}
                onMouseLeave={e => { if(room?.id!==r.id) e.currentTarget.style.background='transparent'; }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--accent-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0, color:'var(--accent)' }}>◩</div>
                  <div style={{ minWidth:0 }}>
                    <div className="truncate" style={{ fontSize:13, fontWeight:600, color: room?.id===r.id ? 'var(--accent)' : 'var(--text)' }}>{r.name||'Chat'}</div>
                    <div style={{ fontSize:11, color:'var(--text-3)' }}>{r.is_direct?'Direct':'Group'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        {!room ? (
          <div className="empty" style={{ flex:1 }}>
            <div className="empty-icon">◩</div>
            <div className="empty-title">Select a room to start chatting</div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
            {/* Header */}
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--accent-bg)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--accent)', fontSize:14 }}>◩</div>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>{room.name||'Chat'}</div>
                <div style={{ fontSize:11, color:'var(--text-3)' }}>Real-time</div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 18px', display:'flex', flexDirection:'column', gap:14 }}>
              {msgs.length===0 ? (
                <div className="empty"><div className="empty-icon">👋</div><div className="empty-title">No messages yet</div><div className="empty-text">Be the first to say something!</div></div>
              ) : msgs.map((m,i) => (
                <div key={m.id||i} style={{ display:'flex', flexDirection:isMe(m)?'row-reverse':'row', gap:8, alignItems:'flex-end' }}>
                  {!isMe(m) && <div className="av av-sm" style={{ flexShrink:0, marginBottom:2 }}>{ini(m.sender_name)}</div>}
                  <div style={{ maxWidth:'65%' }}>
                    {!isMe(m) && <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:4, paddingLeft:2 }}>{m.sender_name}</div>}
                    <div className={`chat-bubble ${isMe(m)?'chat-me':'chat-them'}`}>{m.content}</div>
                    <div style={{ fontSize:10, color:'var(--text-3)', marginTop:3, textAlign:isMe(m)?'right':'left', paddingLeft:2 }}>{fmt(m.created_at)}</div>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>

            {/* Input */}
            <form onSubmit={send} style={{ padding:'14px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:10 }}>
              <input className="input" placeholder="Type a message…" value={input} onChange={e => setInput(e.target.value)} style={{ flex:1 }} />
              <button className="btn btn-primary" type="submit" disabled={sending||!input.trim()}>
                {sending ? <span className="spin" /> : 'Send'}
              </button>
            </form>
          </div>
        )}
      </div>
    </Layout>
  );
}
