import { cn } from "../../lib/cn";

/** Small on/off indicator with a plain-language label. */
export function StatusDot({ on, label, detail }: { on: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          on ? "bg-glow shadow-[0_0_10px_var(--color-glow)]" : "bg-ink-muted/50"
        )}
      />
      <div className="min-w-0">
        <div className="text-sm text-ink">{label}</div>
        {detail && <div className="truncate text-[13px] text-ink-muted">{detail}</div>}
      </div>
    </div>
  );
}
