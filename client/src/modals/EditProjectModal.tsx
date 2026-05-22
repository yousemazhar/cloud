import { useState } from "react";
import type { Project, Team } from "@mini-jira/shared";
import { api } from "../api/client";
import { asApiError } from "../api/errors";
import { useToast } from "../contexts/ToastContext";
import { FormField } from "../components/FormField";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

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
          <span className="text-text-2 font-semibold">Edit project</span>
          <span className="flex-1"/>
          <Button variant="ghost" size="sm" onClick={onClose}><Icon name="x" size={16}/></Button>
        </div>
        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="modal-main">
            <FormField label="Name" required error={errors.get("name")}>
              <Input value={name} onChange={(e) => setName(e.target.value)}/>
            </FormField>
            <FormField label="Description" required error={errors.get("description")}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}/>
            </FormField>
            <FormField label="Team (optional)" error={errors.get("teamId")}>
              <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">All teams</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FormField>
            <div className="mt-3 flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
