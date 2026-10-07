import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState({ languages: [], levels: [], timezones: ['UTC'] });
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    (async () => {
      try {
        setMeta(await api('/auth/meta'));
        if (getToken()) setUser((await api('/auth/me')).user);
      } catch {
        setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const authenticate = useCallback(async (path, body) => {
    const r = await api(path, { method: 'POST', body });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const value = useMemo(() => {
    const langName = (code) => (meta.languages.find((l) => l.code === code) || {}).name || code;
    const levelLabel = (code) => (meta.levels.find((l) => l.code === code) || {}).label || code;
    return {
      user,
      meta,
      ready,
      logout,
      langName,
      levelLabel,
      login: (b) => authenticate('/auth/login', b),
      register: (b) => authenticate('/auth/register', b),
    };
  }, [user, meta, ready, logout, authenticate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
