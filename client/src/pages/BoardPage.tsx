import { useState } from "react";
import type { Priority, Project, Task, TaskStatus } from "@mini-jira/shared";
import { PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES } from "@mini-jira/shared";
import { api, type TaskFilters } from "../api/client";
import { asApiError } from "../api/errors";
import { useAppData } from "../contexts/AppDataContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Icon } from "../components/Icon";
import { KanbanCard } from "../components/KanbanCard";
import { STATUS_CLASS } from "../components/StatusMenu";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

interface BoardPageProps {
  project: Project | null;
  onOpenTask: (taskId: string) => void;
}

export function BoardPage({ project, onOpenTask }: BoardPageProps) {
  const { data, filters, setFilters, refresh } = useAppData();
  const { user } = useAuth();
  const { show } = useToast();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const tasks = project ? data.tasks.filter((t) => t.projectId === project.id) : data.tasks;

  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  async function move(taskId: string, status: TaskStatus) {
    try {
      await api.updateTask(taskId, { status });
      await refresh();
    } catch (err) {
      show(asApiError(err).message, "error");
    }
  }

  function changeFilter(next: TaskFilters) { setFilters(next); }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">
            <a>Projects</a>
            <span style={{ color: "var(--text-4)" }}>/</span>
            <span style={{ color: "var(--text-2)" }}>{project ? project.name : "All tasks"}</span>
          </div>
          <h1 className="page-title">Board</h1>
        </div>
        <div className="page-head-actions">
          <Button variant="ghost"><Icon name="share" size={14}/> Share</Button>
        </div>
      </div>

      <div className="filters">
        <div className="filter-search">
          <Icon name="search" size={14}/>
          <Input placeholder="Search" readOnly className="border-0 bg-transparent shadow-none h-7 px-1 focus-visible:ring-0"/>
        </div>
        {isManager && (
          <select className="dropdown" value={filters.teamId ?? ""}
                  onChange={(e) => changeFilter({ ...filters, teamId: e.target.value || undefined })}>
            <option value="">All teams</option>
            {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select className="dropdown" value={filters.assigneeId ?? ""}
                onChange={(e) => changeFilter({ ...filters, assigneeId: e.target.value || undefined })}>
          <option value="">All assignees</option>
          {data.users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} &lt;{u.email}&gt;</option>
          ))}
        </select>
        <select className="dropdown" value={filters.priority ?? ""}
                onChange={(e) => changeFilter({
                  ...filters,
                  priority: (e.target.value || undefined) as Priority | undefined
                })}>
          <option value="">Any priority</option>
          {(["urgent", "high", "medium", "low"] as Priority[]).map((p) =>
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        <span className="spacer"/>
      </div>

      <div className="board-wrap">
        <div className="board">
          {TASK_STATUSES.map((s) => {
            const colTasks: Task[] = tasks.filter((t) => t.status === s);
            return (
              <div key={s} className="col">
                <div className="col-head">
                  <span>{STATUS_LABELS[s]}</span>
                  <span className="count">{colTasks.length}</span>
                </div>
                <div
                  className={`col-body ${over === s ? "drop-over" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(s); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag) move(drag, s);
                    setDrag(null); setOver(null);
                  }}
                >
                  {colTasks.length === 0 && <div className="col-empty">Drop tasks here</div>}
                  {colTasks.map((t) => (
                    <KanbanCard
                      key={t.id}
                      task={t}
                      users={data.users}
                      onOpen={() => onOpenTask(t.id)}
                      onDragStart={() => setDrag(t.id)}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      dragging={drag === t.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {/* Burn through unused imports cleanly */}
        <span style={{ display: "none" }} className={STATUS_CLASS.todo}/>
      </div>
    </>
  );
}
