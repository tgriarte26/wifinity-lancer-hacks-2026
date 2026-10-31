// User mode: "Is this Wi-Fi safe to use?" in one glance, plus a way to get off it.
import { useState } from "react";
import { Check, X, Minus, WifiOff } from "lucide-react";
import type { Snapshot } from "../types/api";
import type { Finding } from "../lib/risk";
import { securityLevel } from "../lib/risk";
import { Button } from "./ui/Button";
import { toast } from "../lib/toast";
import { getPrefs } from "../lib/network";
import { cn } from "../lib/cn";

type Ok = Extract<Snapshot, { ok: true }>;
type State = "pass" | "warn" | "fail" | "unknown";

export function WifiVerdict({ snap, findings, attacked }: { snap: Ok; findings: Finding[]; attacked: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const c = snap.connection;
  const sec = c ? securityLevel(c.auth, c.cipher) : null;
  const has = (p: string) => findings.some((f) => f.id.startsWith(p));

  const checks: { label: string; state: State; note: string }[] = [
    {
      label: "Encryption",
      state: !sec ? "unknown" : sec.level === "critical" ? "fail" : sec.level === "good" ? "pass" : "warn",
      note: !sec ? "Hidden by Windows (turn on Location)" : sec.label,
    },
    {
      label: "Real router",
      state: attacked ? "fail" : has("gw-changed") ? "warn" : "pass",
      note: attacked ? "Someone is impersonating it" : has("gw-changed") ? "Its identity changed" : "No impersonation seen",
    },
    {
      label: "Safe web lookups",
      state: has("dns-") ? "fail" : snap.dns?.length ? "pass" : "unknown",
      note: has("dns-") ? "Lookups go to another device" : snap.dns?.length ? "Using the router or a known service" : "Not checked yet",
    },
    {
      label: "No fake copies",
      state: has("twin-") ? "fail" : snap.networks ? "pass" : "unknown",
      note: has("twin-") ? "A look-alike network is nearby" : snap.networks ? "No look-alike networks" : "Nearby networks hidden",
    },
  ];
  const verdict = checks.some((x) => x.state === "fail") ? "fail" : checks.some((x) => x.state === "warn") ? "warn" : "pass";
  const title = { fail: "Don't trust this Wi-Fi", warn: "Use this Wi-Fi with care", pass: "This Wi-Fi looks safe" }[verdict];

  async function disconnect() {
    setConfirm(false);
    if (getPrefs().demo || !window.api) return toast("Demo: this is where Wifinity disconnects you from the network.", "info");
    const res = await window.api.wifi.disconnect();
    toast(res.ok ? "Disconnected this computer from the Wi-Fi." : res.error, res.ok ? "success" : "error");
  }

  return (
    <div
      className={cn(
        "mb-5 rounded-[var(--radius-panel)] border p-4",
        verdict === "fail" ? "border-danger/40 bg-danger/8" : verdict === "warn" ? "border-sodium/35 bg-sodium/6" : "border-glow/30 bg-glow/5"
      )}
    >
      <div className="text-[12px] text-ink-muted">Is this Wi-Fi safe?</div>
      <div className={cn("font-display text-[17px] font-semibold", verdict === "fail" ? "text-[#ff9aa4]" : verdict === "warn" ? "text-sodium" : "text-glow")}>
        {title}
      </div>
      <ul className="mt-3 space-y-2">
        {checks.map((x) => (
          <li key={x.label} className="flex items-start gap-2.5 text-[13px]">
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                x.state === "pass" && "bg-glow/20 text-glow",
                x.state === "fail" && "bg-danger/25 text-danger",
                x.state === "warn" && "bg-sodium/20 text-sodium",
                x.state === "unknown" && "bg-line text-ink-muted"
              )}
            >
              {x.state === "pass" ? <Check size={11} /> : x.state === "unknown" ? <Minus size={11} /> : <X size={11} />}
            </span>
            <span>
              <span className="text-ink">{x.label}</span>
              <span className="text-ink-muted"> · {x.note}</span>
            </span>
          </li>
        ))}
      </ul>
      {!confirm ? (
        <Button size="sm" variant={verdict === "fail" ? "danger" : "ghost"} className="mt-3 -ml-1" icon={<WifiOff size={14} />} onClick={() => setConfirm(true)}>
          Disconnect this computer
        </Button>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-soft">
          Leave this Wi-Fi now?
          <Button size="sm" variant="danger" onClick={disconnect}>
            Disconnect
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
