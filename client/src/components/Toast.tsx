// Legacy Toast component — kept as a no-op so existing callers like
// `<Toast message={...} />` still compile while sonner (mounted by
// ToastProvider) renders the actual toast UI.
interface ToastProps {
  message?: string;
  variant?: "info" | "error" | "success";
}

export function Toast(_props: ToastProps) {
  return null;
}
