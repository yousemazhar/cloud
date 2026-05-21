import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Variant = "info" | "error" | "success";
interface ToastState { message: string; variant: Variant }

interface ToastApi {
  toast: ToastState;
  show: (message: string, variant?: Variant) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({ message: "", variant: "info" });

  const show = useCallback((message: string, variant: Variant = "info") => {
    setToast({ message, variant });
  }, []);
  const clear = useCallback(() => setToast({ message: "", variant: "info" }), []);

  useEffect(() => {
    if (!toast.message) return;
    const id = setTimeout(() => setToast({ message: "", variant: "info" }), 4500);
    return () => clearTimeout(id);
  }, [toast.message]);

  const value = useMemo(() => ({ toast, show, clear }), [toast, show, clear]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
