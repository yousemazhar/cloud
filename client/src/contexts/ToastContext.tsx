import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { Toaster, toast as sonnerToast } from "sonner";

type Variant = "info" | "error" | "success";

interface ToastApi {
  // `toast` is kept for backwards compatibility with any caller that still
  // reads the current message; with sonner we no longer maintain explicit
  // state, so the field is a no-op snapshot.
  toast: { message: string; variant: Variant };
  show: (message: string, variant?: Variant) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const show = useCallback((message: string, variant: Variant = "info") => {
    if (variant === "error") sonnerToast.error(message);
    else if (variant === "success") sonnerToast.success(message);
    else sonnerToast(message);
  }, []);

  const clear = useCallback(() => sonnerToast.dismiss(), []);

  const value = useMemo<ToastApi>(
    () => ({ toast: { message: "", variant: "info" }, show, clear }),
    [show, clear]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "!bg-surface-2 !border !border-border-strong !text-text !rounded-md",
            error: "!bg-priority-high !text-white",
            success: "!bg-status-done !text-white"
          }
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
