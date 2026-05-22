import { useMemo } from "react";
import type { Task } from "@mini-jira/shared";
import { STATUS_LABELS } from "@mini-jira/shared";
import { useAppData } from "../contexts/AppDataContext";
import { useAuth } from "../contexts/AuthContext";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { STATUS_CLASS } from "../components/StatusMenu";
import { Button } from "../components/ui/Button";

export function DashboardPage({ onOpenTask, onGoBoard }: {
  onOpenTask: (taskId: string) => void;
  onGoBoard: () => void;
}) {
  const { data } = useAppData();
  const { user } = useAuth();
  if (!user) return null;

  const isManager = user.role === "manager" || user.role === "admin";
  const tasks = data.tasks;
  const counts = useMemo(() => ({
    todo: tasks.filter((t) => t.status === "todo").length,
    progress: tasks.filter((t) => t.status === "in_progress").length,
    review: tasks.filter((t) => t.status === "in_review").length,
    done: tasks.filter((t) => t.status === "done").length
  }), [tasks]);
  const myTasks = tasks.filter((t) => t.assigneeId === user.id);
  const list: Task[] = isManager ? tasks : myTasks;

  return (
    <div className="dash">
      <div>
        <div className="crumbs"><a>Your work</a></div>
        <h1 className="page-title" style={{ marginTop: 4 }}>
          {isManager ? "Manager overview" : `Welcome back, ${user.name.split(" ")[0]}`}
        </h1>
        <div style={{ color: "var(--text-3)", marginTop: 4 }}>
          {isManager
            ? `${data.teams.length} teams · ${data.projects.length} projects · ${tasks.length} tasks`
            : `${data.teams.find((t) => t.id === user.teamId)?.name ?? "No team"} · ${myTasks.length} assigned to you`}
        </div>
      </div>
      <div className="dash-grid">
        <Stat label="To Do" value={counts.todo} hint="across visible teams"/>
        <Stat label="In Progress" value={counts.progress} color="var(--brand-2)" hint="active work"/>
        <Stat label="In Review" value={counts.review} color="var(--status-review-fg)" hint="awaiting sign-off"/>
        <Stat label="Done" value={counts.done} color="var(--status-done-fg)" hint="closed"/>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">{isManager ? "All tasks" : "Assigned to you"}</div>
              <div className="panel-sub">Most recent activity</div>
            </div>
            <Button variant="secondary" size="sm" onClick={onGoBoard}>
              Open board <Icon name="chevron-right" size={14}/>
            </Button>
          </div>
          {list.slice(0, 7).map((t) => {
            const assignee = data.users.find((u) => u.id === t.assigneeId);
            return (
              <div key={t.id} className="list-row" onClick={() => onOpenTask(t.id)}>
                <span className="card-id-mark"><Icon name="check" size={9} strokeWidth={3}/></span>
                <span className="row-id">{t.id.slice(0, 8)}</span>
                <span style={{
                  color: "var(--text)", whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis"
                }}>
                  {t.title}
                </span>
                <span className={`status-pill ${STATUS_CLASS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                <Avatar user={assignee} size="sm"/>
              </div>
            );
          })}
          {list.length === 0 && (
            <div style={{ color: "var(--text-4)", padding: "12px 0", fontSize: 13 }}>
              Nothing to show — create a task or wait for one to be assigned.
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Team summary</div>
              <div className="panel-sub">Tasks by status</div>
            </div>
          </div>
          {data.summaries.length === 0 && (
            <div style={{ color: "var(--text-4)", padding: "12px 0", fontSize: 13 }}>No teams visible.</div>
          )}
          {data.summaries.map((s) => {
            const team = data.teams.find((t) => t.id === s.teamId);
            return (
              <div key={s.teamId} style={{ padding: "10px 4px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 500 }}>{team?.name ?? s.teamId}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {s.total} total · {s.todo} todo · {s.inProgress} in progress · {s.inReview} in review · {s.done} done
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: number; hint: string; color?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-trend" style={{ color: "var(--text-3)" }}>{hint}</div>
    </div>
  );
}
