import { useState } from "react";
import { api } from "../api/client";
import { asApiError } from "../api/errors";
import { useToast } from "../contexts/ToastContext";
import { FormField } from "../components/FormField";
import { Icon } from "../components/Icon";

export function SignupModal({ onClose, onSignedUp }: { onClose: () => void; onSignedUp: () => void }) {
  const { show } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErrors(new Map());
    setBusy(true);
    try {
      await api.signup(name.trim(), email.trim(), password);
      show("Account created. Sign in with the password you just chose.", "success");
      onSignedUp();
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
      <div className="modal" style={{ width: "min(440px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ color: "var(--text-2)", fontWeight: 600 }}>Create your account</span>
          <span style={{ flex: 1 }}/>
          <button className="btn btn-ghost sm" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="modal-main">
            <FormField label="Full name" required error={errors.get("name")}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}/>
            </FormField>
            <FormField label="Email" required error={errors.get("email")}>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}/>
            </FormField>
            <FormField label="Password"
                       required
                       hint="Min 8 chars, mixed case, digit, and symbol."
                       error={errors.get("password")}>
              <input className="input" type="password" value={password}
                     onChange={(e) => setPassword(e.target.value)}/>
            </FormField>
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Creating…" : "Sign up"}
              </button>
            </div>
            <div className="field-hint" style={{ marginTop: 8 }}>
              You will be created as an employee with no team. An admin will assign you to one.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
