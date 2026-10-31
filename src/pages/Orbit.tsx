import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw, MapPin, X, ShieldCheck, Volume2, Pause, Play, RotateCcw, FlaskConical, Radio } from "lucide-react";
import { say, stopVoice } from "../lib/voice";
import { setMode } from "../lib/router";
import { OrbitMap } from "../components/OrbitMap";
import { DetailPanel } from "../components/DetailPanel";
import { Button } from "../components/ui/Button";
import { useMeta, useScanning, useSnapshot, scanNow, setDemo, useGatewayMemory, usePrefs, setPrefs, useShieldsUp, setShieldsUp, useSelected, setSelected, unblockAll } from "../lib/network";
import { toast } from "../lib/toast";
import { usePerf } from "../lib/perf";
import { TONES } from "../components/OrbitMap";
import { analyze, securityLevel, type Finding } from "../lib/risk";
import { briefingPrompt, summarize } from "../lib/commander";
import { useCommander } from "../lib/useCommander";
import { cn } from "../lib/cn";

function ScoreDial({ score, grade, findings }: { score: number; grade: string; findings: Finding[] }) {
  const [open, setOpen] = useState(false);
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? "var(--color-glow)" : score >= 65 ? "var(--color-sodium)" : "var(--color-danger)";
  const deductions = findings.filter((f) => (f.points ?? 0) > 0);
  return (
    <div className="relative">
    <button
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      title="How this score is calculated"
      className="flex items-center gap-3 rounded-[12px] px-2 py-1 transition-colors hover:bg-raised/60"
    >
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <motion.circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div>
        <div className="font-display text-[26px] leading-none font-bold tabular-nums">{score}</div>
        <div className="mt-1 text-left text-[12.5px]" style={{ color }}>
          {grade}
        </div>
      </div>
    </button>
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          className="absolute top-full right-0 z-30 mt-2 w-[320px] rounded-[var(--radius-panel)] border border-line bg-raised p-4 shadow-2xl shadow-black/40"
        >
          <div className="font-display text-[15px] font-semibold">How the score works</div>
          <p className="mt-1 text-[12.5px] text-ink-muted">Starts at 100. Each problem on your network takes points off.</p>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            <li className="flex justify-between text-ink-soft">
              <span>Starting score</span>
              <span className="tabular-nums">100</span>
            </li>
            {deductions.map((f) => (
              <li key={f.id} className="flex justify-between gap-3">
                <span className="text-ink">{f.title}</span>
                <span className="shrink-0 text-danger tabular-nums">−{f.points}</span>
              </li>
            ))}
            {!deductions.length && <li className="text-ink-muted">No deductions.</li>}
            <li className="flex justify-between border-t border-line/70 pt-1.5 font-semibold">
              <span>Score</span>
              <span className="tabular-nums">{score}</span>
            </li>
          </ul>
          <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">
            Critical −35, high −15, worth checking −6, low −2. Open networks nearby are shown but don't count against you.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}

export function Orbit() {
  const snap = useSnapshot();
  const meta = useMeta();
  const scanning = useScanning();
  const shieldsUp = useShieldsUp();
  const selected = useSelected();
  const cmd = useCommander();

  const gw = useGatewayMemory();
  const result = useMemo(() => (snap ? analyze(snap, meta, gw) : null), [snap, meta, gw]);

  if (!snap) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <div className="relative mx-auto mb-7 size-40">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute rounded-full border border-ink-muted/20 animate-spin"
                style={{ inset: `${i * 18}px`, animationDuration: `${3 + i * 1.6}s`, animationDirection: i % 2 ? "reverse" : "normal" }}
              >
                <span
                  className="absolute -top-[4px] left-1/2 size-2 -translate-x-1/2 rounded-full"
                  style={{ background: ["#4fe3d8", "#a6aed3", "#ffb547"][i], boxShadow: `0 0 10px ${["#4fe3d8", "#a6aed3", "#ffb547"][i]}` }}
                />
              </div>
            ))}
            <div className="absolute inset-[58px] animate-pulse rounded-full bg-[radial-gradient(circle_at_40%_35%,#fff3c4,#ffb547_45%,#e8662a)] shadow-[0_0_50px_10px_rgba(255,181,71,0.45)]" />
          </div>
          <p className="font-display text-[20px] font-semibold">Scanning your network</p>
          <p className="mt-1 text-ink-muted">Finding your router and every device around it.</p>
        </div>
      </div>
    );
  }

  if (!snap.ok) {
    return (
      <div className="grid h-full place-items-center px-10">
        <div className="max-w-md text-center">
          <p className="font-display text-[22px] font-semibold">No network to map</p>
          <p className="mt-2 text-ink-soft">{snap.error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" onClick={() => scanNow(true)}>
              Scan again
            </Button>
            <Button onClick={() => setDemo(true)}>Use demo network</Button>
          </div>
        </div>
      </div>
    );
  }

  const { findings, score, grade, threatened, sunUnderAttack } = result!;
  const c = snap.connection;
  const sec = c ? securityLevel(c.auth, c.cipher) : null;
  const nearbyCount = (snap.networks ?? []).filter((n) => !(c && n.bssids.some((b) => b.bssid === c.bssid))).length;
  const brief = async () => {
    const text = await cmd.run(briefingPrompt(summarize(snap, meta, findings, score)));
    if (text) say(text, { auto: true });
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col bg-[#05060f]">
        <div className="absolute inset-0">
          <OrbitMap snap={snap} threatened={threatened} sunUnderAttack={sunUnderAttack} />
        </div>
        <header className="pointer-events-none relative z-10 flex items-center gap-6 bg-gradient-to-b from-[#05060f]/85 to-transparent px-7 pt-6 pb-8 [&_button]:pointer-events-auto">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate font-display text-[28px] leading-tight font-bold tracking-[-0.03em]">
                {c?.ssid || "Your network"}
              </h1>
              <ModeSwitch />
              <SourceSwitch demo={!!snap.demo} busy={scanning} />
            </div>
            <p className="mt-0.5 text-[13.5px] text-ink-muted">
              {sec ? `${sec.label} security` : snap.permissionIssue ? "Wi-Fi details hidden by Windows" : "Wired connection"}, {snap.devices.length} devices in orbit, {nearbyCount} other networks nearby
            </p>
          </div>
          <ScoreDial score={score} grade={grade} findings={findings} />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="md"
              aria-label="Scan now"
              title="Scan now"
              onClick={() => scanNow(true)}
              className="w-10 px-0"
            >
              <RefreshCw size={17} className={cn(scanning && "animate-spin")} />
            </Button>
            <Button variant="primary" onClick={brief} disabled={cmd.busy}>
              {cmd.busy ? "Analyzing…" : "Brief me"}
            </Button>
          </div>
        </header>

        {shieldsUp && (
          <div className="relative z-10 mx-7 mt-4 flex items-start gap-3 rounded-[var(--radius-control)] border border-glow/35 bg-[#0b1a2a]/90 px-4 py-3 text-[13.5px] backdrop-blur">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-glow" />
            <p className="flex-1 text-ink-soft">
              <span className="text-ink">Shields up.</span>{" "}
              {shieldsUp.demo
                ? `Demo: on a real network, Wifinity would now disconnect this computer from "${shieldsUp.ssid}" so nothing can be intercepted.`
                : `Wifinity disconnected this computer from "${shieldsUp.ssid}" because a device was impersonating the router. Reconnect once the router has been restarted.`}
            </p>
            <button aria-label="Dismiss" onClick={() => setShieldsUp(null)} className="text-ink-muted hover:text-ink">
              <X size={15} />
            </button>
          </div>
        )}

        {snap.permissionIssue && (
          <div className="relative z-10 mx-7 mt-4 flex items-start gap-3 rounded-[var(--radius-control)] border border-sodium/30 bg-[#2a1f0b]/90 px-4 py-3 text-[13.5px] backdrop-blur">
            <MapPin size={16} className="mt-0.5 shrink-0 text-sodium" />
            <p className="text-ink-soft">
              Windows is hiding nearby networks. Turn on <span className="text-ink">Settings › Privacy & security › Location</span>, including
              "Let desktop apps access your location", then scan again.
            </p>
          </div>
        )}

        <div className="pointer-events-none relative min-h-0 flex-1 [&_button]:pointer-events-auto">

          <div className="pointer-events-none absolute bottom-4 left-7 flex gap-5 text-[12px] text-ink-muted">
            <Legend color={TONES.self} label="You" />
            <Legend color={TONES.crew} label="Crew" />
            <Legend color={TONES.systems} label="Systems" square />
            <Legend color={TONES.guest} label="Guest" />
            <Legend color={TONES.unassigned} label="Not sorted" />
            <Legend color={TONES.stranger} label="Stranger" />
          </div>
          <div className="absolute right-5 bottom-3.5 flex items-center gap-2">
            <RestoreAll />
            <PauseButton />
            <DetailLevel />
          </div>
          {(selected?.kind === "device" || selected?.kind === "home") && (
            <button
              onClick={() => setSelected(null)}
              className="absolute bottom-3.5 left-1/2 -translate-x-1/2 rounded-full border border-line/70 bg-night/75 px-4 py-1.5 text-[12.5px] text-ink-soft backdrop-blur transition-colors hover:text-ink"
            >
              Back to the whole system <span className="ml-1 text-ink-muted">Esc</span>
            </button>
          )}

          <AnimatePresence>
            {cmd.text && (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-3 left-7 max-w-[460px] rounded-[var(--radius-panel)] border border-glow/30 bg-night/85 px-5 py-4 shadow-2xl shadow-black/40 backdrop-blur"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12.5px] text-glow">Security briefing</span>
                  <span className="flex items-center gap-3">
                    {!cmd.busy && (
                      <button aria-label="Listen" title="Listen" onClick={() => say(cmd.text)} className="text-ink-muted hover:text-sodium">
                        <Volume2 size={15} />
                      </button>
                    )}
                    <button aria-label="Close briefing" onClick={() => (cmd.stop(), cmd.clear(), stopVoice())} className="text-ink-muted hover:text-ink">
                      <X size={15} />
                    </button>
                  </span>
                </div>
                <p className="text-[14.5px] leading-relaxed text-ink" data-selectable>
                  {cmd.text}
                  {cmd.busy && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-glow" />}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <DetailPanel snap={snap} findings={findings} score={score} />
    </div>
  );
}

function Legend({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2", square ? "rounded-[2px]" : "rounded-full")} style={{ background: color }} />
      {label}
    </span>
  );
}

const levelName = { cinematic: "Cinematic", high: "High detail", balanced: "Balanced", low: "Low detail" } as const;
const order = ["auto", "cinematic", "high", "balanced", "low"] as const;

/** Shows the live rendering level; click to cycle Auto / High / Balanced / Low. */
function DetailLevel() {
  const perf = usePerf();
  const prefs = usePrefs();
  if (!prefs.showFps) return null;
  const next = order[(order.indexOf(prefs.quality) + 1) % order.length];
  return (
    <button
      onClick={() => setPrefs({ quality: next })}
      title="Change detail level"
      className="rounded-full border border-line/70 bg-night/70 px-3 py-1 text-[11.5px] text-ink-muted tabular-nums backdrop-blur transition-colors hover:text-ink"
    >
      {prefs.quality === "auto" ? "Auto: " : ""}
      {levelName[perf.level]}
      {perf.level !== "low" && perf.fps ? `, ${perf.fps} fps` : ""}
    </button>
  );
}

/** User = "I'm on this Wi-Fi" (is it safe?). Admin = "I own this router" (manage devices). */
function ModeSwitch() {
  const prefs = usePrefs();
  const set = (mode: "user" | "admin") => {
    setPrefs({ mode });
    setMode(mode);
  };
  return (
    <div className="pointer-events-auto ml-2 flex rounded-full border border-line/70 bg-night/70 p-0.5 text-[12px] backdrop-blur" role="radiogroup" aria-label="Mode">
      {(["user", "admin"] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={prefs.mode === m}
          onClick={() => set(m)}
          title={m === "user" ? "I'm using this Wi-Fi: is it safe?" : "I own this router: manage its devices"}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            prefs.mode === m ? (m === "admin" ? "bg-sodium text-night" : "bg-raised text-ink") : "text-ink-muted hover:text-ink"
          )}
        >
          {m === "user" ? "User" : "Admin"}
        </button>
      ))}
    </div>
  );
}

/** Live = this computer's real network. Demo = the simulated network for presenting. */
function SourceSwitch({ demo, busy }: { demo: boolean; busy: boolean }) {
  return (
    <button
      disabled={busy}
      onClick={() => setDemo(!demo)}
      title={demo ? "Showing the simulated demo network. Click for your real network." : "Showing your real network. Click for the demo network."}
      className={cn(
        "pointer-events-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] backdrop-blur transition-colors disabled:opacity-50",
        demo ? "border-sodium/45 bg-sodium/10 text-sodium hover:bg-sodium/20" : "border-glow/35 bg-night/70 text-glow hover:bg-glow/10"
      )}
    >
      {demo ? <FlaskConical size={12} /> : <Radio size={12} />}
      {demo ? "Demo network" : "Live network"}
    </button>
  );
}

function PauseButton() {
  const prefs = usePrefs();
  const paused = !!prefs.paused;
  return (
    <button
      onClick={() => setPrefs({ paused: !paused })}
      aria-label={paused ? "Play orbits" : "Pause orbits"}
      title={paused ? "Play orbits" : "Pause orbits"}
      className={cn(
        "grid size-[26px] place-items-center rounded-full border bg-night/70 backdrop-blur transition-colors",
        paused ? "border-sodium/50 text-sodium" : "border-line/70 text-ink-muted hover:text-ink"
      )}
    >
      {paused ? <Play size={12} className="translate-x-px" /> : <Pause size={12} />}
    </button>
  );
}

/** One click brings back every ejected device (resets a demo). */
function RestoreAll() {
  const meta = useMeta();
  const prefs = usePrefs();
  const n = Object.values(meta).filter((m) => m.blocked).length;
  if (!n || prefs.mode !== "admin") return null;
  return (
    <button
      onClick={() => {
        unblockAll();
        toast(prefs.demo ? "Demo: ejected devices are back in orbit." : "Wifinity stopped treating those devices as ejected. Router bans still expire on their own.", "success");
      }}
      className="flex items-center gap-1.5 rounded-full border border-line/70 bg-night/70 px-3 py-1 text-[11.5px] text-ink-muted backdrop-blur transition-colors hover:text-ink"
    >
      <RotateCcw size={11} /> Restore {n} ejected
    </button>
  );
}
