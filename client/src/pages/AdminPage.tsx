import { useState } from "react";
import type { Role } from "@mini-jira/shared";
import { api } from "../api/client";
import { ApiError, asApiError } from "../api/errors";
import { useAppData } from "../contexts/AppDataContext";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { useToast } from "../contexts/ToastContext";
import type { User } from "@mini-jira/shared";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { FormField } from "../components/FormField";
import { colorFor, initials } from "../utils/colors";
import { EditUserModal } from "../modals/EditUserModal";

const EMPTY_USER = { name: "", email: "", role: "employee" as Role, teamId: "", password: "" };

export function AdminPage() {
  const { data, refresh } = useAppData();
  const { user } = useAuth();
  const { config } = useConfig();
  const { show } = useToast();

  const canCreateTeam = user?.role === "manager" || user?.role === "admin";
  const canManageUsers = user?.role === "admin";
  const isAws = config?.backend === "aws";

  const [teamName, setTeamName] = useState("");
  const [teamError, setTeamError] = useState("");
  const [newUser, setNewUser] = useState(EMPTY_USER);
  const [userErrors, setUserErrors] = useState<Map<string, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  async function createTeam() {
    if (!teamName.trim()) { setTeamError("Team name is required."); return; }
    setSubmitting(true);
    setTeamError("");
    try {
      await api.createTeam(teamName.trim());
      setTeamName("");
      await refresh();
      show("Team created.", "success");
    } catch (err) {
      const e = err instanceof ApiError ? err : asApiError(err);
      setTeamError(e.get("name") ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function createUser() {
    setUserErrors(new Map());
    setSubmitting(true);
    try {
      await api.createUser({
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        role: newUser.role,
        teamId: newUser.teamId || undefined,
        password: newUser.password || undefined
      });
      setNewUser(EMPTY_USER);
      await refresh();
      show("User created.", "success");
    } catch (err) {
      const e = err instanceof ApiError ? err : asApiError(err);
      if (e.hasFieldErrors) {
        setUserErrors(e.fieldErrors);
        show("Please fix the highlighted fields.", "error");
      } else {
        show(e.message, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function moveUser(userId: string, teamId: string) {
    try {
      await api.updateUserTeam(userId, teamId || null);
      await refresh();
      show("User team updated.", "success");
    } catch (err) {
      show(asApiError(err).message, "error");
    }
  }

  return (
    <div style={{ padding: "16px 28px 32px", overflowY: "auto" }}>
      <div className="page-head" style={{ padding: 0, marginBottom: 16 }}>
        <div>
          <div className="crumbs"><a>Admin</a></div>
          <h1 className="page-title">Teams &amp; users</h1>
          <div style={{ color: "var(--text-3)", marginTop: 4, fontSize: 13 }}>
            {isAws
              ? "Creating a user provisions them in Cognito with the password you set, then mirrors a row into the Users table."
              : "Local mode — users are stored in-memory and persisted only for this session."}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* ===== Teams panel ===== */}
        <div className="panel">
          <div className="panel-head">
            <div><div className="panel-title">Teams</div><div className="panel-sub">{data.teams.length} total</div></div>
          </div>
          {data.teams.map((t) => {
            const members = data.users.filter((u) => u.teamId === t.id);
            return (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                borderBottom: "1px solid var(--border)"
              }}>
                <div className="proj-card-mark"
                     style={{ background: colorFor(t.id), width: 28, height: 28, fontSize: 12 }}>
                  {initials(t.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>{members.length} members</div>
                </div>
              </div>
            );
          })}
          {canCreateTeam && (
            <div style={{ marginTop: 12 }}>
              <FormField label="New team" required error={teamError}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" placeholder="e.g. DevOps" value={teamName}
                         onChange={(e) => { setTeamName(e.target.value); if (teamError) setTeamError(""); }}
                         style={{ flex: 1 }}/>
                  <button className="btn btn-primary sm" onClick={createTeam} disabled={submitting}>
                    <Icon name="plus" size={14}/> Add
                  </button>
                </div>
              </FormField>
            </div>
          )}
        </div>

        {/* ===== Users panel ===== */}
        <div className="panel">
          <div className="panel-head">
            <div><div className="panel-title">Users</div><div className="panel-sub">{data.users.length} total</div></div>
          </div>
          {data.users.map((u) => (
            <div key={u.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
              borderBottom: "1px solid var(--border)"
            }}>
              <Avatar user={u} size="sm"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 500, whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis"
                }}>
                  {u.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{u.email} · {u.role}</div>
              </div>
              {canManageUsers ? (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <select className="dropdown" value={u.teamId ?? ""}
                          onChange={(e) => moveUser(u.id, e.target.value)}>
                    <option value="">No team</option>
                    {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className="btn btn-ghost sm" title="Edit user / reset password"
                          onClick={() => setEditingUser(u)}>
                    <Icon name="edit" size={14}/>
                  </button>
                </span>
              ) : (
                <span className="label-chip">{data.teams.find((t) => t.id === u.teamId)?.name ?? "—"}</span>
              )}
            </div>
          ))}

          {canManageUsers && (
            <div style={{ marginTop: 12 }}>
              <div className="section-label" style={{ marginTop: 0 }}>Add a user</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <FormField label="Name" required error={userErrors.get("name")}>
                  <input className="input" value={newUser.name}
                         onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}/>
                </FormField>
                <FormField label="Email" required error={userErrors.get("email")}>
                  <input className="input" value={newUser.email}
                         onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}/>
                </FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <FormField label="Role" required error={userErrors.get("role")}>
                  <select className="input" value={newUser.role}
                          onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </FormField>
                <FormField label="Team" error={userErrors.get("teamId")}>
                  <select className="input" value={newUser.teamId}
                          onChange={(e) => setNewUser({ ...newUser, teamId: e.target.value })}>
                    <option value="">No team</option>
                    {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Password"
                         required={isAws}
                         hint={isAws
                           ? "Set the initial password (admin-set, permanent). The user can change it later."
                           : "Optional in local mode."}
                         error={userErrors.get("password")}>
                <input className="input" type="password" value={newUser.password}
                       onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}/>
              </FormField>
              <button className="btn btn-primary" onClick={createUser} disabled={submitting}>
                <Icon name="plus" size={14}/> {submitting ? "Adding…" : "Add user"}
              </button>
            </div>
          )}
        </div>
      </div>
      {editingUser && (
        <EditUserModal
          user={editingUser}
          teams={data.teams}
          onClose={() => setEditingUser(null)}
          onSaved={async () => { setEditingUser(null); await refresh(); }}
        />
      )}
    </div>
  );
}
