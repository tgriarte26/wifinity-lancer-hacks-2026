// Right-hand panel: findings when nothing is selected, otherwise details for the selection.
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShieldCheck, ShieldAlert, Radio, X } from "lucide-react";
import type { Snapshot } from "../types/api";
import { setSelected, trust, rename, useMeta, useSelected, setRole, setOwner, setPriority, acceptGateway, eject, unblock, usePrefs, setTrustLevel } from "../lib/network";
import { WifiVerdict } from "./WifiVerdict";
import { RouterCard } from "./RouterCard";
import { Checklist } from "./Checklist";
import { kick, useRouter } from "../lib/router";
import { say } from "../lib/voice";
import { toast } from "../lib/toast";
import { Volume2 } from "lucide-react";
import type { Finding, Severity } from "../lib/risk";
import { nearbyKey, securityLevel } from "../lib/risk";
import {
  nameFor,
  kindLabel,
  kindOf,
  makerText,
  priorityOf,
  roleOf,
  suggestRole,
  roleLabel,
  roleHint,
  priorityLabel,
  type Role,
  type Priority,
} from "../lib/devices";
import { blockPrompt, explainPrompt, planPrompt, summarize } from "../lib/commander";
import { channelAdvice } from "../lib/channels";
import { useCommander } from "../lib/useCommander";
import { Button } from "./ui/Button";
import { KindIcon } from "./KindIcon";
import { cn } from "../lib/cn";

type Ok = Extract<Snapshot, { ok: true }>;

export const sevColor: Record<Severity, string> = {
  critical: "bg-danger",
  high: "bg-danger/80",
  medium: "bg-sodium",
  low: "bg-ink-muted",
  good: "bg-glow",
};
const sevText: Record<Severity, string> = {
  critical: "Critical",
  high: "High risk",
  medium: "Worth checking",
  low: "Low risk",
  good: "Good",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/50 py-2.5 text-[13.5px] last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right text-ink" data-selectable>
        {children}
      </span>
    </div>
  );
}

function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

export function DetailPanel({ snap, findings, score }: { snap: Ok; findings: Finding[]; score: number }) {
  const selected = useSelected();
  const meta = useMeta();
  const cmd = useCommander();
  const prefs = usePrefs();
  const admin = prefs.mode === "admin";
  const router = useRouter();
  const attacked = findings.some((f) => f.id.startsWith("spoof-"));

  // Admin eject: through the router when connected, otherwise a local ban plus router steps.
  async function doEject(mac: string) {
    if (router?.connected) {
      const res = await kick(mac);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      eject(mac, true);
      const v = res.value.verified;
      toast(v ? "Router removed the device for 5 minutes (verified)." : "Router accepted the removal; verification pending.", "success", 5000);
      say(v ? "Target ejected. The router confirmed it is gone." : "Removal sent to the router.", { auto: true });
      return;
    }
    eject(mac);
    say("Target ejected from the map. Block it on your router to keep it out.", { auto: true });
    cmd.run(blockPrompt(snap, mac, meta));
  }
  const selKey = JSON.stringify(selected);

  useEffect(() => cmd.stop(), [selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = () => {
    if (!selected) return;
    cmd.run(explainPrompt(summarize(snap, meta, findings, score), selected, snap, meta));
  };

  let body: ReactNode;
  let title = "Findings";
  let icon: ReactNode = <ShieldCheck size={18} className="text-glow" />;

  if (!selected) {
    const issues = findings.filter((f) => f.severity !== "good");
    body = (
      <div>
        {admin ? <RouterCard compact /> : <WifiVerdict snap={snap} findings={findings} attacked={attacked} />}
        <p className="mb-4 text-[13.5px] text-ink-muted">
          {issues.length ? `${issues.length} thing${issues.length > 1 ? "s" : ""} to look at.` : "Nothing needs attention."} Click any planet or
          star for details.
        </p>
        <ul className="space-y-1">
          {findings.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => setSelected(f.target)}
                className="-mx-2 flex w-[calc(100%+16px)] gap-3 rounded-[var(--radius-control)] px-2 py-2.5 text-left transition-colors hover:bg-raised/70"
              >
                <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", sevColor[f.severity])} />
                <span>
                  <span className="block text-[14px] leading-snug text-ink">{f.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted">{f.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (selected.kind === "device") {
    const d = snap.devices.find((x) => x.mac === selected.mac && !x.isGateway) ?? snap.devices.find((x) => x.mac === selected.mac);
    const m = meta[selected.mac];
    if (!d) body = <p className="text-ink-muted">This device has left the network.</p>;
    else {
      const kind = kindOf(d);
      title = nameFor(d, m);
      icon = <KindIcon kind={kind} size={18} className={m?.arrivedLive && !m?.trusted ? "text-danger" : "text-glow"} />;
      const f = findings.find((x) => x.target.kind === "device" && x.target.mac === d.mac);
      body = (
        <div>
          {f && <FindingBox f={f} />}
          {!d.isGateway && (
            <div className="mb-4 space-y-3">
              {!d.isSelf && (
                <Segmented<Role>
                  label="Role"
                  value={m?.role ?? null}
                  hint={!m?.role && suggestRole(d) ? `Looks like ${roleLabel[suggestRole(d)!]}` : m?.role ? roleHint[m.role] : "Who or what is this?"}
                  options={(["crew", "systems", "guest"] as Role[]).map((r) => ({ value: r, label: roleLabel[r] }))}
                  onChange={(r) => setRole(d.mac, r === m?.role ? undefined : r)}
                />
              )}
              {roleOf(d, m) === "crew" && !d.isSelf && <OwnerField mac={d.mac} current={m?.owner ?? ""} />}
              {!d.isSelf && (
                <Segmented<"trusted" | "watch" | "unsure">
                  label={admin ? "Decision" : "Trust"}
                  value={m?.trusted ? "trusted" : m?.watch ? "watch" : "unsure"}
                  hint={
                    m?.trusted
                      ? admin ? "Approved on your network" : "You recognize this device"
                      : m?.watch
                        ? "Kept in the outer ring"
                        : "Names can be faked"
                  }
                  options={[
                    { value: "trusted", label: admin ? "Approve" : "Trusted" },
                    { value: "watch", label: "Watch" },
                    { value: "unsure", label: admin ? "Unreviewed" : "Not sure" },
                  ]}
                  onChange={(v) => setTrustLevel(d.mac, v ?? "unsure")}
                />
              )}
              {admin && (
                <Segmented<Priority>
                  label="Wi-Fi priority"
                  value={priorityOf(d, m)}
                  hint="Higher priority sits closer to the router"
                  options={(["high", "normal", "low"] as Priority[]).map((p) => ({ value: p, label: priorityLabel[p] }))}
                  onChange={(p) => setPriority(d.mac, p)}
                />
              )}
            </div>
          )}
          <Row label="Type">{kindLabel[kind]}</Row>
          <Row label="Maker">{makerText(d)}</Row>
          {admin && router?.connected && !d.isGateway && !d.isSelf && (
            <Row label="Router says">
              {router.demo || router.clients.some((c) => c.mac.toLowerCase() === d.mac.toLowerCase()) ? (
                <span className="text-glow">Connected Wi-Fi client</span>
              ) : (
                <span className="text-ink-muted">Not in its Wi-Fi list (wired or gone)</span>
              )}
            </Row>
          )}
          <Row label="IP address">{d.ip}</Row>
          <Row label="Hardware address">{d.mac.toUpperCase()}</Row>
          {m && <Row label="First seen">{ago(m.firstSeen)}</Row>}
          {!d.isSelf && !d.isGateway && (
            <div className="mt-4 flex gap-2">
              <RenameButton mac={d.mac} current={m?.name ?? ""} />
            </div>
          )}
          {admin && !d.isSelf && !d.isGateway && (
            <EjectBox
              blocked={!!m?.blocked}
              viaRouter={!!router?.connected}
              onEject={() => doEject(d.mac)}
              onUnblock={() => unblock(d.mac)}
              onSteps={() => cmd.run(blockPrompt(snap, d.mac, meta))}
            />
          )}
        </div>
      );
    }
  } else if (selected.kind === "nearby") {
    const n = (snap.networks ?? []).find((x) => nearbyKey(x) === selected.key);
    title = n ? n.ssid || "Hidden network" : "Network out of range";
    icon = <Radio size={18} className="text-sodium" />;
    if (n) {
      const sec = securityLevel(n.auth, n.encryption);
      const f = findings.find((x) => x.target.kind === "nearby" && x.target.key === selected.key);
      body = (
        <div>
          {f && <FindingBox f={f} />}
          <Row label="Security">
            <span className="inline-flex items-center gap-2">
              <span className={cn("size-2 rounded-full", sevColor[sec.level])} />
              {sec.label}
            </span>
          </Row>
          <Row label="Signal">{n.maxSignal}%</Row>
          <Row label="Access points">{n.bssids.length}</Row>
          {n.bssids[0]?.band && <Row label="Band">{n.bssids[0].band}</Row>}
          {n.bssids[0]?.channel && <Row label="Channel">{n.bssids[0].channel}</Row>}
        </div>
      );
    }
  } else {
    const c = snap.connection;
    title = c?.ssid || "Your network";
    icon = <ShieldAlert size={18} className="text-sodium" />;
    const sec = c ? securityLevel(c.auth, c.cipher) : null;
    const homeFindings = findings.filter((f) => f.target.kind === "home" && f.severity !== "good");
    body = (
      <div>
        {admin ? <RouterCard /> : <WifiVerdict snap={snap} findings={findings} attacked={attacked} />}
        {homeFindings.map((f) => (
          <FindingBox key={f.id} f={f} />
        ))}
        {sec && (
          <Row label="Security">
            <span className="inline-flex items-center gap-2">
              <span className={cn("size-2 rounded-full", sevColor[sec.level])} />
              {sec.label}
            </span>
          </Row>
        )}
        <Row label="Router">{snap.gateway.ip}</Row>
        {snap.dns?.length ? <Row label="DNS servers">{snap.dns.join(", ")}</Row> : null}
        <Row label="Devices">{snap.devices.length}</Row>
        {c && <Row label="Signal">{c.signal}%</Row>}
        {c?.band && <Row label="Band">{c.band}{c.channel ? `, channel ${c.channel}` : ""}</Row>}
        {c?.radio && <Row label="Wi-Fi standard">{c.radio}</Row>}
        <ChannelSection snap={snap} />
        {findings.some((f) => f.id === "gw-changed") && (
          <Button size="sm" className="mt-4" onClick={acceptGateway}>
            I replaced my router
          </Button>
        )}
        <Checklist mode={admin ? "admin" : "user"} network={`${snap.demo ? "demo" : "live"}:${c?.ssid || snap.gateway.ip}`} />
      </div>
    );
  }

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line/50 bg-asphalt/40">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        {icon}
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
        {selected && (
          <button aria-label="Close details" onClick={() => setSelected(null)} className="text-ink-muted hover:text-ink">
            <X size={17} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <AnimatePresence mode="wait">
          <motion.div key={selKey} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            {body}
            {selected && (
              <div className="mt-6 border-t border-line/60 pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[14px] font-semibold">Security officer</span>
                  {cmd.text && !cmd.busy && (
                    <span className="flex items-center gap-3">
                      <button onClick={() => say(cmd.text)} className="flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-sodium">
                        <Volume2 size={13} /> Listen
                      </button>
                      <button onClick={ask} className="text-[12.5px] text-ink-muted hover:text-sodium">
                        Ask again
                      </button>
                    </span>
                  )}
                </div>
                {cmd.text ? (
                  <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-wrap text-ink-soft" data-selectable>
                    {cmd.text}
                    {cmd.busy && <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-glow" />}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    <Button className="w-full" variant="secondary" onClick={ask} disabled={cmd.busy}>
                      {cmd.busy ? "Analyzing…" : "Ask what this means"}
                    </Button>
                    {selected.kind === "home" && admin && (
                      <Button className="w-full" variant="ghost" onClick={() => cmd.run(planPrompt(snap, meta))} disabled={cmd.busy}>
                        Make a Wi-Fi priority plan for my router
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

function FindingBox({ f }: { f: Finding }) {
  return (
    <div
      className={cn(
        "mb-4 rounded-[var(--radius-control)] border px-3.5 py-3",
        f.severity === "good" ? "border-glow/30 bg-glow/5" : f.severity === "medium" || f.severity === "low" ? "border-sodium/30 bg-sodium/5" : "border-danger/35 bg-danger/8"
      )}
    >
      <div className="text-[12px] text-ink-muted">{sevText[f.severity]}</div>
      <div className="mt-0.5 text-[14px] text-ink">{f.title}</div>
      <div className="mt-1 text-[12.5px] leading-snug text-ink-soft">{f.detail}</div>
    </div>
  );
}

function RenameButton({ mac, current }: { mac: string; current: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  if (!editing)
    return (
      <Button size="sm" variant="ghost" onClick={() => (setValue(current), setEditing(true))}>
        Rename
      </Button>
    );
  return (
    <form
      className="flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        rename(mac, value);
        setEditing(false);
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => (rename(mac, value), setEditing(false))}
        placeholder="Name"
        aria-label="Device name"
        className="h-8 w-full rounded-[var(--radius-control)] border border-line bg-night/60 px-2.5 text-[13px] text-ink outline-none focus:border-glow/70"
      />
    </form>
  );
}

function Segmented<T extends string>(props: {
  label: string;
  value: T | null;
  hint?: string;
  options: { value: T; label: string }[];
  onChange(v: T): void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-ink-muted">{props.label}</span>
        {props.hint && <span className="truncate text-[11.5px] text-ink-muted/80">{props.hint}</span>}
      </div>
      <div className="grid grid-flow-col gap-1 rounded-[var(--radius-control)] bg-night/60 p-1" role="radiogroup" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={props.value === o.value}
            onClick={() => props.onChange(o.value)}
            className={cn(
              "h-8 rounded-[7px] text-[13px] transition-colors",
              props.value === o.value ? "bg-raised text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OwnerField({ mac, current }: { mac: string; current: string }) {
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [mac, current]);
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-ink-muted">Belongs to</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setOwner(mac, value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Name, e.g. Asad"
        className="h-9 w-full rounded-[var(--radius-control)] border border-line bg-night/60 px-3 text-[13.5px] text-ink outline-none placeholder:text-ink-muted focus:border-glow/70"
      />
    </label>
  );
}

function ChannelSection({ snap }: { snap: Ok }) {
  const ch = channelAdvice(snap);
  if (!ch) return null;
  const max = Math.max(1, ...ch.loads.map((l) => l.load), ch.currentLoad);
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-display text-[14px] font-semibold">Channel traffic ({ch.band})</span>
        <span className="text-[12px] text-ink-muted">lower is better</span>
      </div>
      <div className="space-y-1.5">
        {ch.loads.map((l) => (
          <div key={l.channel} className="flex items-center gap-2.5 text-[12.5px]">
            <span className={cn("w-9 tabular-nums", l.channel === ch.current ? "text-sodium" : "text-ink-muted")}>{l.channel}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-night/70">
              <div
                className={cn("h-full rounded-full", l.channel === ch.best ? "bg-glow" : l.channel === ch.current ? "bg-sodium" : "bg-line")}
                style={{ width: `${Math.max(4, (l.load / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[12.5px] text-ink-muted">
        {ch.worthSwitching
          ? `You're on channel ${ch.current}. Channel ${ch.best} is the least crowded nearby.`
          : `Channel ${ch.current} is a good choice right now.`}
      </p>
    </div>
  );
}

function EjectBox(props: { blocked: boolean; viaRouter: boolean; onEject(): void; onUnblock(): void; onSteps(): void }) {
  const [confirm, setConfirm] = useState(false);
  if (props.blocked)
    return (
      <div className="mt-4 rounded-[var(--radius-control)] border border-danger/35 bg-danger/8 px-3.5 py-3">
        <div className="text-[14px] text-ink">Ejected</div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">
          Off your map, and Wifinity alerts you if it comes back. To keep it off the Wi-Fi for good, block it on your router.
        </p>
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" variant="secondary" onClick={props.onSteps}>
            Router steps
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onUnblock}>
            Unblock
          </Button>
        </div>
      </div>
    );
  if (!confirm)
    return (
      <Button size="sm" variant="danger" className="mt-3 w-full" onClick={() => setConfirm(true)}>
        Eject device
      </Button>
    );
  return (
    <div className="mt-3 rounded-[var(--radius-control)] border border-danger/35 bg-danger/8 px-3.5 py-3">
      <p className="text-[13px] leading-snug text-ink-soft">
        {props.viaRouter
          ? "Eject this device? Your router will remove it from the Wi-Fi for 5 minutes, and Wifinity alerts you if it comes back."
          : "Eject this device? Wifinity marks it as banned and alerts you if it returns. Claude will write the steps to block it on your router."}
      </p>
      <div className="mt-2.5 flex gap-2">
        <Button size="sm" variant="danger" onClick={props.onEject}>
          Eject
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
