import type {
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "./cn";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export const FieldShell = ({
  label,
  hint,
  error,
  children,
}: PropsWithChildren<FieldShellProps>) => (
  <label className="field-shell">
    <span className="field-label">
      <span>{label}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </span>
    {children}
    {error ? <span className="field-error">{error}</span> : null}
  </label>
);

export const TextField = ({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldShellProps) => (
  <FieldShell label={label} hint={hint} error={error}>
    <input
      className={cn(
        "field-control h-11",
        error && "field-control--error",
        className,
      )}
      {...props}
    />
  </FieldShell>
);

export const TextAreaField = ({
  label,
  hint,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShellProps) => (
  <FieldShell label={label} hint={hint} error={error}>
    <textarea
      className={cn(
        "field-control min-h-[144px] resize-none py-3 leading-6",
        error && "field-control--error",
        className,
      )}
      {...props}
    />
  </FieldShell>
);

export const SelectField = ({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldShellProps) => (
  <FieldShell label={label} hint={hint} error={error}>
    <span className="relative block">
      <select
        className={cn(
          "field-control h-11 appearance-none pr-10",
          error && "field-control--error",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78879a]"
      />
    </span>
  </FieldShell>
);
