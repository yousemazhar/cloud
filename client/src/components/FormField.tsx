import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/**
 * Wraps any input with a label, optional required asterisk, optional hint, and
 * an inline server-side error message. Error styling is applied through a
 * .has-error class on the wrapper so child inputs can opt into the red border.
 */
export function FormField({ label, required, error, hint, children }: FormFieldProps) {
  return (
    <div className={`field-stack ${error ? "has-error" : ""}`}>
      <label>
        {label}{required && <span style={{ color: "var(--p-high)", marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {error
        ? <div className="field-error" role="alert">{error}</div>
        : hint
          ? <div className="field-hint">{hint}</div>
          : null}
    </div>
  );
}
