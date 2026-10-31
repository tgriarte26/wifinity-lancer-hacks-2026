import { useEffect } from "react";
import { Lock, LockOpen } from "lucide-react";
import { refreshTraffic, useTraffic } from "../lib/network";
import { PageHeader } from "./PageHeader";
import { cn } from "../lib/cn";

export function Traffic() {
  const traffic = useTraffic();

  useEffect(() => {
    refreshTraffic();
    const id = setInterval(refreshTraffic, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[820px] px-10 py-10">
      <PageHeader title="Transmissions">
        Every app on this computer that's connected to the outside world, and whether the connection is encrypted. Other
        devices' traffic is private to them, so Wifinity only shows yours.
      </PageHeader>

      {!traffic ? (
        <p className="text-ink-muted">Reading this computer's connections…</p>
      ) : (
        <>
          <div className="mb-8 flex gap-10">
            <Stat value={traffic.total} label="open connections" />
            <Stat value={traffic.apps.length} label="apps online" />
            <Stat value={traffic.unencrypted} label="unencrypted" warn={traffic.unencrypted > 0} />
          </div>

          <ul className="border-t border-line/60" data-selectable>
            {traffic.apps.map((app) => (
              <li key={app.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 border-b border-line/60 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("size-2 rounded-full", app.unencrypted ? "bg-sodium" : "bg-glow")} />
                    <span className="font-display text-[16px] font-semibold">{app.name}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-[18px] text-[12.5px] text-ink-muted">
                    {app.destinations.map((d) => (
                      <span key={d.ip + d.port} className={cn("inline-flex items-center gap-1", d.plain && "text-sodium")}>
                        {d.plain ? <LockOpen size={12} /> : <Lock size={12} />}
                        {d.ip} · {d.service}
                        {d.local && " (your network)"}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-[18px] font-semibold tabular-nums">{app.connections}</div>
                  <div className={cn("text-[12px]", app.unencrypted ? "text-sodium" : "text-ink-muted")}>
                    {app.unencrypted ? `${app.unencrypted} unencrypted` : "all encrypted"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {traffic.unencrypted > 0 && (
            <p className="mt-5 max-w-[600px] text-[13.5px] text-ink-soft">
              Unencrypted connections can be read by anyone who can see the network traffic, like someone impersonating your router.
              Avoid typing passwords into sites that don't show a lock in the address bar.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
  return (
    <div>
      <div className={cn("font-display text-[34px] leading-none font-bold tabular-nums", warn && "text-sodium")}>{value}</div>
      <div className="mt-1.5 text-[13px] text-ink-muted">{label}</div>
    </div>
  );
}
