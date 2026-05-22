import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { useToast } from "../contexts/ToastContext";
import { asApiError } from "../api/errors";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { MJLogo } from "../components/MJLogo";
import { FormField } from "../components/FormField";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { SignupModal } from "../modals/SignupModal";

const DEMO_PERSONAS = [
  { id: "user-ali", name: "Ali Hassan", role: "Manager · all teams" },
  { id: "user-sara", name: "Sara Mostafa", role: "Employee · Frontend" },
  { id: "user-omar", name: "Omar Khaled", role: "Employee · Backend" },
  { id: "user-jess", name: "Jess Admin", role: "Admin" }
];

export function LoginPage() {
  const { loginDemo, loginCognito } = useAuth();
  const { config } = useConfig();
  const { show } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [signingUp, setSigningUp] = useState(false);

  const isAws = config?.backend === "aws";

  async function submitCognito() {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Email is required.";
    if (!password) next.password = "Password is required.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await loginCognito(email.trim(), password);
    } catch (err) {
      const e = asApiError(err);
      if (e.hasFieldErrors) {
        setErrors({
          email: e.get("email"),
          password: e.get("password")
        });
      } else {
        show(e.message, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function demo(userId: string) {
    setBusy(true);
    try {
      await loginDemo(userId);
    } catch (err) {
      show(asApiError(err).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-mark"><MJLogo size={44}/></div>
        <h1 className="login-title">Sign in to Mini-Jira</h1>
        <div className="login-sub">
          {isAws ? "Sign in with your AWS Cognito account." : "Local development mode — pick a demo persona below."}
        </div>

        {isAws && (
          <>
            <FormField label="Email" required error={errors.email}>
              <Input type="email" placeholder="you@minijira.io" value={email}
                     onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: undefined }); }}
                     disabled={busy}/>
            </FormField>
            <FormField label="Password" required error={errors.password}>
              <Input type="password" placeholder="••••••••" value={password}
                     onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: undefined }); }}
                     disabled={busy}/>
            </FormField>
            <Button className="w-full mt-2" size="lg" onClick={submitCognito} disabled={busy}>
              {busy ? "Signing in…" : "Continue"}
            </Button>
            <div className="mt-3 text-center text-[13px] text-text-3">
              No account yet?{" "}
              <a className="cursor-pointer text-brand-2 hover:underline" onClick={() => setSigningUp(true)}>
                Sign up
              </a>
            </div>
          </>
        )}

        {signingUp && (
          <SignupModal onClose={() => setSigningUp(false)} onSignedUp={() => setSigningUp(false)}/>
        )}

        {/* Demo personas hit /api/auth/demo-login, which only exists in local mode.
            Hide them in AWS so we don't dangle dead buttons in front of real users. */}
        {!isAws && (
          <div className="login-personas">
            <div className="login-personas-title">Demo personas</div>
            {DEMO_PERSONAS.map((u) => (
              <div key={u.id} className="persona-row" onClick={() => !busy && demo(u.id)}>
                <Avatar user={u}/>
                <div className="persona-info">
                  <div className="persona-name">{u.name}</div>
                  <div className="persona-meta">{u.role}</div>
                </div>
                <Icon name="chevron-right" size={14}/>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
