import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../api';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    auth.me()
      .then(d => setUser(d.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const d = await auth.login(email, password);
    localStorage.setItem('token', d.token);
    setUser(d.user);
    return d;
  };

  const register = async (data) => {
    const d = await auth.register(data);
    localStorage.setItem('token', d.token);
    setUser(d.user);
    return d;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
