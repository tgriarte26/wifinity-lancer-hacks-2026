import { motion } from "motion/react";
import { pages, type PageId } from "../pages";
import { cn } from "../lib/cn";

export function Sidebar({ current, onChange }: { current: PageId; onChange(id: PageId): void }) {
  return (
    <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 border-r border-line/50 py-4" aria-label="Main">
      {pages.map((p) => {
        const active = p.id === current;
        const Icon = p.icon;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex w-[62px] flex-col items-center gap-1 rounded-[12px] py-2.5 text-[11.5px] transition-colors",
              active ? "text-ink" : "text-ink-muted hover:bg-raised/50 hover:text-ink"
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-[12px] bg-raised"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <Icon size={20} className={cn("relative", active && "text-sodium")} />
            <span className="relative">{p.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
