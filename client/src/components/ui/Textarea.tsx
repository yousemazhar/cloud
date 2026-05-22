import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text shadow-sm transition-colors",
        "placeholder:text-text-3",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-y min-h-[80px]",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
