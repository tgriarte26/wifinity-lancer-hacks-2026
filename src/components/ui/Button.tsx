import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
};

const variants = {
  primary:
    "bg-sodium text-night hover:bg-[#ffc266] active:bg-sodium-deep shadow-[0_6px_24px_-8px_rgba(255,181,71,0.6)]",
  secondary: "bg-raised text-ink border border-line hover:border-ink-muted/60 hover:bg-[#222d5c]",
  ghost: "text-ink-soft hover:text-ink hover:bg-raised/70",
  danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
};
const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2.5",
};

export function Button({ variant = "secondary", size = "md", icon, className, children, ...rest }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-control)] font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-45 cursor-default",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
