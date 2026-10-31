import type { ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 max-w-[640px]">
      <h1 className="font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance">{title}</h1>
      {children && <p className="mt-3 text-[15.5px] text-ink-soft text-pretty">{children}</p>}
    </header>
  );
}
