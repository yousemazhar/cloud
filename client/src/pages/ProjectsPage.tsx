import { useState } from "react";
import type { Project } from "@mini-jira/shared";
import { api } from "../api/client";
import { ApiError, asApiError } from "../api/errors";
import { useAppData } from "../contexts/AppDataContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Icon } from "../components/Icon";
import { FormField } from "../components/FormField";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { colorFor, initials } from "../utils/colors";
import { EditProjectModal } from "../modals/EditProjectModal";

export function ProjectsPage({ onOpenProject }: { onOpenProject: (p: Project) => void }) {
  const { data, refresh } = useAppData();
  const { user } = useAuth();
  const { show } = useToast();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", teamId: "" });
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  async function submit() {
    setErrors(new Map());
    setSubmitting(true);
    try {
      await api.createProject({
        name: form.name.trim(),
        description: form.description.trim(),
        teamId: form.teamId || undefined
      });
      setCreating(false);
      setForm({ name: "", description: "", teamId: "" });
      await refresh();
      show("Project created.", "success");
    } catch (err) {
      const e = err instanceof ApiError ? err : asApiError(err);
      if (e.hasFieldErrors) {
        setErrors(e.fieldErrors);
        show("Please fix the highlighted fields.", "error");
      } else {
        show(e.message, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(p: Project) {
    if (!confirm(`Delete project "${p.name}"?`)) return;
    try {
      await api.deleteProject(p.id);
      await refresh();
      show("Project deleted.", "success");
    } catch (err) {
      show(asApiError(err).message, "error");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><a>Projects</a></div>
          <h1 className="page-title">Projects</h1>
        </div>
        <div className="page-head-actions">
          {isManager && (
            <Button onClick={() => setCreating((c) => !c)}>
              <Icon name="plus" size={14}/> {creating ? "Cancel" : "Create project"}
            </Button>
          )}
        </div>
      </div>

      {creating && (
        <div style={{ padding: "0 28px 16px" }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">New project</div>
                <div className="panel-sub">Skip the team to keep this project visible to everyone.</div>
              </div>
            </div>
            <FormField label="Name" required error={errors.get("name")}>
              <Input value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })}/>
            </FormField>
            <FormField label="Description" required error={errors.get("description")}>
              <Input value={form.description}
                     onChange={(e) => setForm({ ...form, description: e.target.value })}/>
            </FormField>
            <FormField label="Team (optional)" error={errors.get("teamId")}>
              <select className="input" value={form.teamId}
                      onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                <option value="">All teams</option>
                {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FormField>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      )}

      <div className="proj-grid">
        {data.projects.length === 0 && (
          <div style={{ padding: 28, color: "var(--text-3)" }}>No projects yet.</div>
        )}
        {data.projects.map((p) => {
          const team = data.teams.find((t) => t.id === p.teamId);
          const pTasks = data.tasks.filter((t) => t.projectId === p.id);
          const done = pTasks.filter((t) => t.status === "done").length;
          const pct = pTasks.length ? Math.round((done / pTasks.length) * 100) : 0;
          return (
            <div key={p.id} className="proj-card">
              <div className="proj-card-head" onClick={() => onOpenProject(p)}>
                <div className="proj-card-mark" style={{ background: colorFor(p.id) }}>{initials(p.name)}</div>
                <div>
                  <div className="proj-card-name">{p.name}</div>
                  <div className="proj-card-team">{team?.name ?? "All teams"}</div>
                </div>
              </div>
              <div style={{ color: "var(--text-2)", fontSize: 13, margin: "8px 0", minHeight: 36 }}>
                {p.description}
              </div>
              <div className="progress"><div className="progress-fill" style={{ width: `${pct}%` }}/></div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8
              }}>
                <span style={{ color: "var(--text-3)", fontSize: 12 }}>{done}/{pTasks.length} done</span>
                {isManager && (
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)} title="Edit">
                      <Icon name="edit" size={14}/>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p)} title="Delete">
                      <Icon name="trash" size={14}/>
                    </Button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editing && (
        <EditProjectModal
          project={editing}
          teams={data.teams}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }}
        />
      )}
    </>
  );
}
