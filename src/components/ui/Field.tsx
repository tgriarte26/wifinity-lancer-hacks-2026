import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const base =
  "w-full rounded-[var(--radius-control)] border border-line bg-night/60 px-3.5 text-ink placeholder:text-ink-muted " +
  "outline-none transition-colors focus:border-glow/70 focus:bg-night";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-10", className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "resize-none py-3 leading-relaxed", className)} {...rest} />;
}
