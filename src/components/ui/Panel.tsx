import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Props = HTMLAttributes<HTMLDivElement> & { title?: ReactNode; action?: ReactNode };

/** A surface for grouping related content. Use sparingly; not everything needs a box. */
export function Panel({ title, action, className, children, ...rest }: Props) {
  return (
    <section
      className={cn("rounded-[var(--radius-panel)] border border-line/70 bg-asphalt/80 p-5", className)}
      {...rest}
    >
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
