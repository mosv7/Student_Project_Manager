import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Kanban from './pages/Kanban';
import Messages from './pages/Messages';
import Posts from './pages/Posts';
import Team from './pages/Team';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)' }}>
      <div className="spin spin-lg" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function Public({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Public><Login /></Public>} />
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/projects" element={<Protected><Projects /></Protected>} />
              <Route path="/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
              <Route path="/tasks" element={<Protected><Kanban /></Protected>} />
              <Route path="/messages" element={<Protected><Messages /></Protected>} />
              <Route path="/posts" element={<Protected><Posts /></Protected>} />
              <Route path="/team" element={<Protected><Team /></Protected>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
