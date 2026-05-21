/**
 * Server-side password policy. Mirrors the Cognito User Pool default policy
 * (min 8, upper, lower, digit, symbol) so we fail fast with a 400 instead of
 * letting Cognito throw InvalidPasswordException after we've already started
 * the AdminCreateUser call.
 */
export interface PasswordRule {
  ok: boolean;
  message: string;
}

export function checkPasswordPolicy(password: string): PasswordRule[] {
  return [
    { ok: password.length >= 8, message: "password must be at least 8 characters" },
    { ok: /[a-z]/.test(password), message: "password must contain a lowercase letter" },
    { ok: /[A-Z]/.test(password), message: "password must contain an uppercase letter" },
    { ok: /[0-9]/.test(password), message: "password must contain a digit" },
    { ok: /[^A-Za-z0-9]/.test(password), message: "password must contain a symbol" }
  ];
}

export function passwordPolicyErrors(password: string): string[] {
  return checkPasswordPolicy(password).filter((rule) => !rule.ok).map((rule) => rule.message);
}

export function assertPasswordPolicy(password: string): void {
  const errors = passwordPolicyErrors(password);
  if (errors.length === 0) return;
  const error = new Error(errors[0]!) as Error & {
    status?: number;
    errors?: { field: string; message: string }[];
  };
  error.status = 400;
  error.errors = errors.map((message) => ({ field: "password", message }));
  throw error;
}
