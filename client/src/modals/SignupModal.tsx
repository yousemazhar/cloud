import { useState } from "react";
import { api } from "../api/client";
import { asApiError } from "../api/errors";
import { useToast } from "../contexts/ToastContext";
import { FormField } from "../components/FormField";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

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
          <span className="text-text-2 font-semibold">Create your account</span>
          <span className="flex-1"/>
          <Button variant="ghost" size="sm" onClick={onClose}><Icon name="x" size={16}/></Button>
        </div>
        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="modal-main">
            <FormField label="Full name" required error={errors.get("name")}>
              <Input value={name} onChange={(e) => setName(e.target.value)}/>
            </FormField>
            <FormField label="Email" required error={errors.get("email")}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}/>
            </FormField>
            <FormField label="Password"
                       required
                       hint="Min 8 chars, mixed case, digit, and symbol."
                       error={errors.get("password")}>
              <Input type="password" value={password}
                     onChange={(e) => setPassword(e.target.value)}/>
            </FormField>
            <div className="mt-3 flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? "Creating…" : "Sign up"}
              </Button>
            </div>
            <div className="field-hint mt-2">
              You will be created as an employee with no team. An admin will assign you to one.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
