import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type RuntimeConfig } from "../api/client";

interface ConfigApi {
  config: RuntimeConfig | null;
  loading: boolean;
}

const ConfigContext = createContext<ConfigApi>({ config: null, loading: true });

/**
 * Fetches /api/config once on mount and exposes it to descendants. The result
 * tells the upload helper whether to send multipart FormData (local) or use
 * the presigned-S3 dance (aws). This avoids the build-time VITE_BACKEND flag.
 */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.config()
      .then((c) => { if (alive) setConfig(c); })
      .catch(() => { if (alive) setConfig({ uploadMode: "multipart", backend: "local" }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const value = useMemo(() => ({ config, loading }), [config, loading]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigApi {
  return useContext(ConfigContext);
}
