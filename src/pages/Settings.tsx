import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { StatusDot } from "../components/ui/StatusDot";
import { keyStatus } from "../lib/api";
import { toast } from "../lib/toast";
import { say, stopVoice, setElevenReady, VOICES, DEFAULT_VOICE } from "../lib/voice";
import { resetBaseline, setDemo, setPrefs, simulateArrival, simulateAttack, usePrefs, useUnderAttack } from "../lib/network";
import { PageHeader } from "./PageHeader";
import { cn } from "../lib/cn";

function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-glow" : "bg-line")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function SettingRow({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line/50 py-4 first:pt-0 last:border-0 last:pb-0">
      <div>
        <div className="text-[14.5px] text-ink">{title}</div>
        <div className="mt-0.5 text-[13px] text-ink-muted">{detail}</div>
      </div>
      {children}
    </div>
  );
}

export function Settings() {
  const prefs = usePrefs();
  const attacked = useUnderAttack();
  const [keys, setKeys] = useState<{ ai: boolean; eleven?: boolean; elevenBad?: boolean; model: string }>();
  useEffect(() => {
    keyStatus().then(setKeys);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[760px] px-10 py-10">
      <PageHeader title="Settings">How Wifinity watches your network.</PageHeader>
      <div className="space-y-5">
        <Panel title="Watching">
          <SettingRow title="Desktop alerts" detail="Show a Windows notification when a new device joins or the router is impersonated.">
            <Toggle label="Desktop alerts" on={prefs.alerts} onChange={(v) => setPrefs({ alerts: v })} />
          </SettingRow>
          <SettingRow
            title="Shields up"
            detail="If a device starts impersonating your router, disconnect this computer from the Wi-Fi right away."
          >
            <Toggle label="Shields up" on={prefs.shields} onChange={(v) => setPrefs({ shields: v })} />
          </SettingRow>
          <SettingRow title="Scan every" detail="How often Wifinity checks for devices joining or leaving.">
            <div className="flex gap-1.5">
              {[6, 12, 30].map((s) => (
                <Button key={s} size="sm" variant={prefs.intervalSec === s ? "primary" : "secondary"} onClick={() => setPrefs({ intervalSec: s })}>
                  {s}s
                </Button>
              ))}
            </div>
          </SettingRow>
          <SettingRow title="Forget all devices" detail="Treat everything on the network right now as normal again.">
            <Button size="sm" variant="danger" onClick={resetBaseline}>
              Forget devices
            </Button>
          </SettingRow>
        </Panel>

        <Panel title="Performance">
          <SettingRow title="Detail level" detail="Cinematic is the sharpest view with spinning planets and sun rays. Auto starts at High and steps down if the laptop struggles. Low shows a still image.">
            <div className="flex gap-1.5">
              {(["auto", "cinematic", "high", "balanced", "low"] as const).map((q) => (
                <Button key={q} size="sm" variant={prefs.quality === q ? "primary" : "secondary"} onClick={() => setPrefs({ quality: q })}>
                  {q[0].toUpperCase() + q.slice(1)}
                </Button>
              ))}
            </div>
          </SettingRow>
          <SettingRow title="Show detail level on the map" detail="A small badge with the current level and frame rate.">
            <Toggle label="Show detail level" on={prefs.showFps} onChange={(v) => setPrefs({ showFps: v })} />
          </SettingRow>
        </Panel>

        <Panel title="Demo network">
          <SettingRow title="Use demo network" detail="Show a sample home network. Handy for rehearsing the demo.">
            <Toggle label="Use demo network" on={prefs.demo} onChange={(v) => setDemo(v)} />
          </SettingRow>
          {prefs.demo && (
            <SettingRow title="Simulate a stranger" detail="Adds an unknown device to the demo network to trigger an alert.">
              <Button size="sm" onClick={simulateArrival}>
                Add stranger
              </Button>
            </SettingRow>
          )}
          {prefs.demo && (
            <SettingRow title="Simulate an attack" detail="A demo device starts impersonating the router (ARP spoofing).">
              <Button size="sm" variant={attacked ? "secondary" : "danger"} onClick={() => simulateAttack(!attacked)}>
                {attacked ? "Stop attack" : "Start attack"}
              </Button>
            </SettingRow>
          )}
        </Panel>

        <p className="px-1 text-[12px] text-ink-muted">
          Planet maps and star field by Solar System Scope (solarsystemscope.com), licensed CC BY 4.0.
        </p>

        <VoicePanel keys={keys} onKeys={setKeys} />
      </div>
    </div>
  );
}

function VoicePanel({ keys, onKeys }: { keys?: { ai: boolean; eleven?: boolean; elevenBad?: boolean; model: string }; onKeys(k: { ai: boolean; eleven?: boolean; elevenBad?: boolean; model: string }): void }) {
  const prefs = usePrefs();
  const [claude, setClaude] = useState("");
  const [eleven, setEleven] = useState("");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const desktop = typeof window !== "undefined" ? window.api : undefined;

  useEffect(() => {
    setElevenReady(!!keys?.eleven);
  }, [keys?.eleven]);

  async function saveKeys() {
    if (!desktop) return;
    if (eleven.trim() && !eleven.replace(/["'\s]/g, "").replace(/^(xi-api-key|ELEVENLABS_API_KEY)[:=]/i, "").startsWith("sk_")) {
      toast("That isn't an ElevenLabs API key. Create one at elevenlabs.io → Developers → API Keys and copy the one starting with sk_.", "error");
      return;
    }
    setBusy(true);
    const res = await desktop.keys.save({ claude, eleven });
    setBusy(false);
    setClaude("");
    setEleven("");
    if (res.ok) {
      onKeys(res.value);
      toast("Keys saved and encrypted on this computer.", "success");
    } else toast(res.error, "error");
  }
  async function loadVoices() {
    if (!desktop) return;
    setBusy(true);
    const res = await desktop.voice.list();
    setBusy(false);
    if (res.ok) {
      setVoices(res.value);
      if (!res.value.length) toast("No voices found on this ElevenLabs account.", "info");
    } else toast(res.error, "error");
  }

  const field =
    "h-9 w-full rounded-[var(--radius-control)] border border-line bg-night/60 px-3 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-glow/70";
  return (
    <Panel title="AI and voice">
      <div className="grid grid-cols-2 gap-6">
        <StatusDot on={!!keys?.ai} label={keys?.ai ? "Claude connected" : "Claude not connected"} detail={keys?.ai ? keys.model : "Answers are simulated"} />
        <StatusDot on={!!keys?.eleven} label={keys?.eleven ? "ElevenLabs connected" : keys?.elevenBad ? "ElevenLabs key is wrong" : "ElevenLabs not connected"} detail={keys?.eleven ? (prefs.voiceName ?? "Daniel") : keys?.elevenBad ? "Paste a key that starts with sk_" : "Using the computer's voice"} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line/60 pt-4">
        <input type="password" value={claude} onChange={(e) => setClaude(e.target.value)} placeholder={keys?.ai ? "Claude key saved (paste to replace)" : "Claude API key (or use key.txt)"} className={field} aria-label="Claude API key" />
        <input type="password" value={eleven} onChange={(e) => setEleven(e.target.value)} placeholder={keys?.eleven ? "ElevenLabs key saved (paste to replace)" : "ElevenLabs API key"} className={field} aria-label="ElevenLabs API key" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[12px] text-ink-muted">{keys?.elevenBad && <span className="text-danger">The saved ElevenLabs key isn't an API key. Create one at elevenlabs.io → Developers → API Keys (starts with sk_). </span>}Saved keys are encrypted by Windows and never shown again. Blank fields keep the current key.</p>
        <Button size="sm" variant="primary" className="shrink-0 whitespace-nowrap" disabled={busy || (!claude.trim() && !eleven.trim())} onClick={saveKeys}>
          Save keys
        </Button>
      </div>

      <div className="mt-5 space-y-4 border-t border-line/60 pt-4">
        <SettingRow title="Speak alerts and briefings" detail="The officer reads briefings and calls out new devices and attacks.">
          <Toggle label="Speak alerts and briefings" on={prefs.voiceOn} onChange={(v) => setPrefs({ voiceOn: v })} />
        </SettingRow>
        <div>
          <div className="mb-1.5 text-[12.5px] text-ink-muted">Officer voice</div>
          <div className="flex items-center gap-2">
            <select
              value={prefs.voiceId ?? DEFAULT_VOICE}
              onChange={(e) => {
                const id = e.target.value;
                const v = [...VOICES, ...voices].find((x) => x.id === id);
                setPrefs({ voiceId: id, voiceName: id === "system" ? "Computer voice" : v?.name });
              }}
              className={field + " flex-1"}
              aria-label="Officer voice"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.note}
                </option>
              ))}
              {voices
                .filter((v) => !VOICES.some((x) => x.id === v.id))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} (my account)
                  </option>
                ))}
              <option value="system">Computer voice (no ElevenLabs)</option>
            </select>
            <Button size="sm" variant="secondary" onClick={() => say("Wifinity security officer online. All systems nominal. I'll warn you the moment anything unusual enters orbit.")}>
              Test voice
            </Button>
            <Button size="sm" variant="ghost" onClick={stopVoice}>
              Stop
            </Button>
          </div>
          {keys?.eleven && (
            <button onClick={loadVoices} disabled={busy} className="mt-2 text-[12px] text-ink-muted underline-offset-2 hover:text-ink hover:underline">
              Add voices from my ElevenLabs account
            </button>
          )}
          {!keys?.eleven && <p className="mt-2 text-[12px] text-ink-muted">Add an ElevenLabs key above to use these voices. Until then the computer voice is used.</p>}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-ink-muted">
            <span>Speaking speed</span>
            <span className="tabular-nums text-ink-soft">{(prefs.voiceRate ?? 1).toFixed(1)}×</span>
          </div>
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.1}
            value={prefs.voiceRate ?? 1}
            onChange={(e) => setPrefs({ voiceRate: Number(e.target.value) })}
            aria-label="Speaking speed"
            className="w-full accent-[var(--color-sodium)]"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-line/60 pt-4">
        <p className="text-[12.5px] text-ink-muted">You can also keep the Claude key in key.txt in the app folder.</p>
        {desktop && (
          <Button size="sm" variant="ghost" onClick={() => desktop.env.openKeyFile()}>
            Open key.txt
          </Button>
        )}
      </div>
    </Panel>
  );
}
