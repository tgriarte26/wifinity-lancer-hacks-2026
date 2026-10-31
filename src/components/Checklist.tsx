import { useState } from "react";
import { Check } from "lucide-react";
import { loadSaved, save } from "../lib/store";
import { cn } from "../lib/cn";

const TASKS = {
  user: {
    title: "Protect this computer",
    items: [
      ["updates", "Keep Windows and your browser updated", "Most attacks use holes that updates already fixed."],
      ["public", "Set this Wi-Fi to Public network", "Windows Settings → Network → Wi-Fi → Public hides your PC from others here."],
      ["https", "Only sign in on HTTPS sites", "Look for the lock and the right address before typing a password."],
      ["vpn", "Use a VPN on open Wi-Fi", "It encrypts everything, even on networks with no password."],
    ],
  },
  admin: {
    title: "Harden your router",
    items: [
      ["firmware", "Update the router firmware", "Use the maker's official update page. Wifinity can't see the firmware version."],
      ["wps", "Turn off WPS and remote admin", "Both are common ways in. Switch them off if you don't use them."],
      ["guest", "Put guests and smart devices on a guest network", "Keeps cameras and visitors away from your laptops."],
      ["pass", "Change the router admin password", "Never leave the default. Use WPA2 or WPA3 with a long Wi-Fi password."],
    ],
  },
} as const;

/** Manual checks the user ticks off, saved per network and mode. They don't change the score. */
export function Checklist({ mode, network }: { mode: "user" | "admin"; network: string }) {
  const key = `checklist:${mode}:${network}`;
  return <List key={key} storageKey={key} mode={mode} />;
}

function List({ storageKey, mode }: { storageKey: string; mode: "user" | "admin" }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => loadSaved(storageKey, {}));
  const t = TASKS[mode];
  const count = t.items.filter(([id]) => done[id]).length;
  return (
    <section className="mt-6 border-t border-line/60 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-[14px] font-semibold">{t.title}</span>
        <span className={cn("text-[12px] tabular-nums", count === t.items.length ? "text-glow" : "text-ink-muted")}>
          {count}/{t.items.length} done
        </span>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-glow transition-[width] duration-500" style={{ width: `${(count / t.items.length) * 100}%` }} />
      </div>
      <ul className="space-y-1">
        {t.items.map(([id, title, detail]) => (
          <li key={id}>
            <button
              onClick={() => {
                const next = { ...done, [id]: !done[id] };
                setDone(next);
                save(storageKey, next);
              }}
              className="-mx-2 flex w-[calc(100%+16px)] gap-3 rounded-[var(--radius-control)] px-2 py-2 text-left hover:bg-raised/60"
              aria-pressed={!!done[id]}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
                  done[id] ? "border-glow bg-glow text-night" : "border-line"
                )}
              >
                {done[id] && <Check size={12} strokeWidth={3} />}
              </span>
              <span>
                <span className={cn("block text-[13.5px] leading-snug", done[id] ? "text-ink-muted line-through decoration-ink-muted/50" : "text-ink")}>{title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">{detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-ink-muted">Your own checks. Wifinity can't verify these, so they don't change the score.</p>
    </section>
  );
}
