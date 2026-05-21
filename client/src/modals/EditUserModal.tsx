import { useState } from "react";
import type { Role, Team, User } from "@mini-jira/shared";
import { api } from "../api/client";
import { asApiError } from "../api/errors";
import { useToast } from "../contexts/ToastContext";
import { FormField } from "../components/FormField";
import { Icon } from "../components/Icon";

export function EditUserModal({
  user,
  teams,
  onClose,
  onSaved
}: { user: User; teams: Team[]; onClose: () => void; onSaved: () => void }) {
  const { show } = useToast();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [teamId, setTeamId] = useState(user.teamId ?? "");
  const [resetPassword, setResetPassword] = useState("");
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);

  async function save() {
    setErrors(new Map());
    setBusy(true);
    try {
      await api.updateUser(user.id, {
        name: name.trim(),
        role,
        teamId: teamId === "" ? null : teamId
      });
      if (resetPassword) {
        await api.resetUserPassword(user.id, resetPassword);
      }
      show(resetPassword ? "User updated and password reset." : "User updated.", "success");
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
          <span style={{ color: "var(--text-2)", fontWeight: 600 }}>Edit user</span>
          <span style={{ flex: 1 }}/>
          <button className="btn btn-ghost sm" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="modal-main">
            <FormField label="Name" required error={errors.get("name")}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}/>
            </FormField>
            <FormField label="Email">
              <input className="input" value={user.email} disabled/>
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <FormField label="Role" required error={errors.get("role")}>
                <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </FormField>
              <FormField label="Team" error={errors.get("teamId")}>
                <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Reset password (optional)"
                       hint="Leave blank to keep the current password. Otherwise must meet the policy (min 8, mixed case, digit, symbol)."
                       error={errors.get("password") ?? errors.get("newPassword")}>
              <input className="input" type="password" value={resetPassword}
                     onChange={(e) => setResetPassword(e.target.value)}/>
            </FormField>
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
