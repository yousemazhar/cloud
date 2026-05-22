import { useState } from "react";
import type { Priority } from "@mini-jira/shared";
import { PRIORITY_LABELS } from "@mini-jira/shared";
import { ApiError, asApiError } from "../api/errors";
import { api, type AppData, type CreateTaskPayload } from "../api/client";
import { useToast } from "../contexts/ToastContext";
import { FormField } from "../components/FormField";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";

const empty: CreateTaskPayload = {
  title: "", description: "", priority: "medium",
  deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  teamId: "", assigneeId: "", projectId: ""
};

export function CreateTaskModal({
  data,
  onClose,
  onCreated
}: { data: AppData; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CreateTaskPayload>(empty);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const { show } = useToast();

  const teamUsers = data.users.filter((u) => u.teamId === form.teamId);

  async function submit() {
    setErrors(new Map());
    setSubmitting(true);
    try {
      await api.createTask(form);
      show("Task created.", "success");
      onCreated();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : asApiError(err);
      if (apiErr.hasFieldErrors) {
        setErrors(apiErr.fieldErrors);
        show("Please fix the highlighted fields.", "error");
      } else {
        show(apiErr.message, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(620px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ color: "var(--text-2)", fontWeight: 600 }}>Create task</span>
          <span style={{ flex: 1 }}/>
          <Button variant="ghost" size="sm" onClick={onClose}><Icon name="x" size={16}/></Button>
        </div>
        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="modal-main">
            <FormField label="Title" required error={errors.get("title")}>
              <Input value={form.title}
                     onChange={(e) => setForm({ ...form, title: e.target.value })}/>
            </FormField>
            <FormField label="Description" required error={errors.get("description")}>
              <Textarea rows={3} value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}/>
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Priority" required error={errors.get("priority")}>
                <select className="input" value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                  {(["urgent", "high", "medium", "low"] as Priority[]).map((p) =>
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </FormField>
              <FormField label="Deadline" required error={errors.get("deadline")}>
                <Input type="date" value={form.deadline}
                       onChange={(e) => setForm({ ...form, deadline: e.target.value })}/>
              </FormField>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <FormField label="Project" required error={errors.get("projectId")}>
                <select className="input" value={form.projectId}
                        onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">Pick a project</option>
                  {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </FormField>
              <FormField label="Team" required error={errors.get("teamId")}>
                <select className="input" value={form.teamId}
                        onChange={(e) => setForm({ ...form, teamId: e.target.value, assigneeId: "" })}>
                  <option value="">Pick a team</option>
                  {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </FormField>
              <FormField label="Assignee" required error={errors.get("assigneeId")}>
                <select className="input" value={form.assigneeId}
                        onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                        disabled={!form.teamId}>
                  <option value="">{form.teamId ? "Pick an employee" : "Pick a team first"}</option>
                  {teamUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} &lt;{u.email}&gt;</option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
