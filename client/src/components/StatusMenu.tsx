import { useState } from "react";
import type { TaskStatus } from "@mini-jira/shared";
import { STATUS_LABELS, TASK_STATUSES } from "@mini-jira/shared";
import { Icon } from "./Icon";

const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: "status-todo",
  in_progress: "status-prog",
  in_review: "status-review",
  done: "status-done"
};

export { STATUS_CLASS };

export function StatusMenu({
  value,
  onChange
}: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <span
        className={`status-pill ${STATUS_CLASS[value]}`}
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer" }}
      >
        {STATUS_LABELS[value]}<Icon name="chevron-down" size={12} strokeWidth={2.2}/>
      </span>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setOpen(false)}/>
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4,
            background: "var(--surface)", border: "1px solid var(--border-strong)",
            borderRadius: 6, padding: 4, boxShadow: "var(--shadow-2)", zIndex: 201, minWidth: 160
          }}>
            {TASK_STATUSES.map((s) => (
              <div key={s} style={{ padding: "6px 8px", cursor: "pointer", borderRadius: 4 }}
                   onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false); }}>
                <span className={`status-pill ${STATUS_CLASS[s]}`}>{STATUS_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
