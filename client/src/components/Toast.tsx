interface ToastProps {
  message: string;
  variant?: "info" | "error" | "success";
}

export function Toast({ message, variant = "info" }: ToastProps) {
  if (!message) return null;
  const bg = variant === "error" ? "var(--p-high)"
    : variant === "success" ? "var(--status-done-fg)"
    : "var(--surface-3)";
  const color = variant === "info" ? "var(--text)" : "white";
  return (
    <div className="toast" role="status" style={{ background: bg, color }}>
      {message}
    </div>
  );
}
