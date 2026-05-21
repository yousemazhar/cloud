import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@mini-jira/shared";
import { api } from "../api/client";
import { ApiError } from "../api/errors";

interface AuthApi {
  user: User | null;
  loading: boolean;
  loginDemo: (userId: string) => Promise<void>;
  loginCognito: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Tell the api client to nuke local state if a request comes back 401.
    api.setUnauthorizedHandler(() => setUser(null));

    if (!api.token) { setLoading(false); return; }
    api.me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loginDemo = useCallback(async (userId: string) => {
    const res = await api.demoLogin(userId);
    api.setToken(res.token);
    setUser(res.user);
  }, []);

  const loginCognito = useCallback(async (email: string, password: string) => {
    try {
      const res = await api.cognitoLogin(email, password);
      api.setToken(res.token);
      setUser(res.user);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    api.clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthApi>(() => ({ user, loading, loginDemo, loginCognito, logout }), [user, loading, loginDemo, loginCognito, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
