import { useState } from "react";
import type { Project, Team } from "@mini-jira/shared";
import { api } from "../api/client";
import { asApiError } from "../api/errors";
import { useToast } from "../contexts/ToastContext";
import { FormField } from "../components/FormField";
import { Icon } from "../components/Icon";

export function EditProjectModal({
  project,
  teams,
  onClose,
  onSaved
}: { project: Project; teams: Team[]; onClose: () => void; onSaved: () => void }) {
  const { show } = useToast();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [teamId, setTeamId] = useState(project.teamId ?? "");
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErrors(new Map());
    setBusy(true);
    try {
      await api.updateProject(project.id, {
        name: name.trim(),
        description: description.trim(),
        teamId: teamId || undefined
      });
      show("Project updated.", "success");
      onSaved();
    } catch (err) {
      const e = asApiError(err);
      if (e.hasFieldErrors) setErrors(e.fieldErrors);
      else show(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(520px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ color: "var(--text-2)", fontWeight: 600 }}>Edit project</span>
          <span style={{ flex: 1 }}/>
          <button className="btn btn-ghost sm" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="modal-main">
            <FormField label="Name" required error={errors.get("name")}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}/>
            </FormField>
            <FormField label="Description" required error={errors.get("description")}>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}/>
            </FormField>
            <FormField label="Team (optional)" error={errors.get("teamId")}>
              <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">All teams</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FormField>
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
