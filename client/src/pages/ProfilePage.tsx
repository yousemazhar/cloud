import { useState } from "react";
import { api } from "../api/client";
import { asApiError } from "../api/errors";
import { useAuth } from "../contexts/AuthContext";
import { useAppData } from "../contexts/AppDataContext";
import { useToast } from "../contexts/ToastContext";
import { Avatar } from "../components/Avatar";
import { FormField } from "../components/FormField";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { data, refresh } = useAppData();
  const { show } = useToast();
  if (!user) return null;

  const team = data.teams.find((t) => t.id === user.teamId);
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [pwErrors, setPwErrors] = useState<Map<string, string>>(new Map());
  const [savingPw, setSavingPw] = useState(false);

  async function saveName() {
    if (!name.trim() || name.trim() === user!.name) { show("Nothing to save.", "error"); return; }
    setSavingName(true);
    try {
      await api.updateMe({ name: name.trim() });
      await refreshUser();
      await refresh();
      show("Profile updated.", "success");
    } catch (err) {
      show(asApiError(err).message, "error");
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword() {
    setPwErrors(new Map());
    if (newPassword !== confirmPassword) {
      setPwErrors(new Map([["confirmPassword", "Passwords do not match."]]));
      return;
    }
    setSavingPw(true);
    try {
      await api.changeMyPassword(currentPassword, newPassword);
      setCurrent(""); setNew(""); setConfirm("");
      show("Password updated.", "success");
    } catch (err) {
      const e = asApiError(err);
      if (e.hasFieldErrors) setPwErrors(e.fieldErrors);
      else show(e.message, "error");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div style={{ padding: "16px 28px 32px", overflowY: "auto" }}>
      <div className="page-head" style={{ padding: 0, marginBottom: 16 }}>
        <div>
          <div className="crumbs"><a>Profile</a></div>
          <h1 className="page-title">Your profile</h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Account details</div>
              <div className="panel-sub">Email, role, and team are managed by an admin.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <Avatar user={user}/>
            <div>
              <div style={{ fontWeight: 500 }}>{user.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>{user.email}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>{user.role} · {team?.name ?? "No team"}</div>
            </div>
          </div>
          <FormField label="Display name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)}/>
          </FormField>
          <Button onClick={saveName} disabled={savingName}>
            <Icon name="check" size={14}/> {savingName ? "Saving…" : "Save name"}
          </Button>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Change password</div>
              <div className="panel-sub">Min 8 chars, mixed case, digit, and symbol.</div>
            </div>
          </div>
          <FormField label="Current password" required error={pwErrors.get("currentPassword")}>
            <Input type="password" value={currentPassword}
                   onChange={(e) => setCurrent(e.target.value)}/>
          </FormField>
          <FormField label="New password" required error={pwErrors.get("newPassword") ?? pwErrors.get("password")}>
            <Input type="password" value={newPassword}
                   onChange={(e) => setNew(e.target.value)}/>
          </FormField>
          <FormField label="Confirm new password" required error={pwErrors.get("confirmPassword")}>
            <Input type="password" value={confirmPassword}
                   onChange={(e) => setConfirm(e.target.value)}/>
          </FormField>
          <Button onClick={changePassword}
                  disabled={savingPw || !currentPassword || !newPassword}>
            {savingPw ? "Updating…" : "Update password"}
          </Button>
        </div>
      </div>
    </div>
  );
}
