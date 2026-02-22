import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV = [
  { to: '/dashboard', icon: '⊞', label: 'Dashboard' },
  { to: '/projects',  icon: '◫', label: 'Projects'  },
  { to: '/tasks',     icon: '◪', label: 'Kanban'    },
  { to: '/posts',     icon: '◧', label: 'Posts'     },
  { to: '/messages',  icon: '◩', label: 'Messages'  },
  { to: '/team',      icon: '◨', label: 'Team'      },
];

const ini = name => name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2) || '?';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '22px 18px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#0c0c0f', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 15,
          }}>N</div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, letterSpacing: '-0.3px' }}>Nexus</span>
        </div>
      </div>

      {/* User card */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="av av-md">{ini(user?.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>{user?.role}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 8px 8px' }}>Menu</div>
        {NAV.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-icon">{icon}</span>
            {label}
          </NavLink>
        ))}

        {['admin','moderator'].includes(user?.role) && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '16px 8px 8px' }}>Admin</div>
            <NavLink to="/team" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-icon">⚙</span>
              Manage Users
            </NavLink>
          </>
        )}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '10px 10px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button className="nav-link" onClick={toggle}>
          <span className="nav-icon">{theme === 'dark' ? '○' : '●'}</span>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button className="nav-link" onClick={() => { logout(); navigate('/login'); }} style={{ color: 'var(--red)' }}>
          <span className="nav-icon" style={{ color: 'var(--red)' }}>→</span>
          Sign out
        </button>
      </div>
    </aside>
  );
}
