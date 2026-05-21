import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type AppData, type TaskFilters } from "../api/client";
import { ApiError } from "../api/errors";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

const empty: AppData = { teams: [], users: [], projects: [], tasks: [], summaries: [] };

interface AppDataApi {
  data: AppData;
  loading: boolean;
  filters: TaskFilters;
  setFilters: (next: TaskFilters) => void;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataApi | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { show } = useToast();
  const [data, setData] = useState<AppData>(empty);
  const [filters, setFiltersState] = useState<TaskFilters>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setData(empty); return; }
    setLoading(true);
    try {
      const next = await api.loadAppData(filters);
      setData(next);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load data";
      show(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [user, filters, show]);

  // Reload whenever user logs in/out or filters change.
  useEffect(() => { refresh(); }, [refresh]);

  const setFilters = useCallback((next: TaskFilters) => setFiltersState(next), []);

  const value = useMemo<AppDataApi>(
    () => ({ data, loading, filters, setFilters, refresh }),
    [data, loading, filters, setFilters, refresh]
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataApi {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}
