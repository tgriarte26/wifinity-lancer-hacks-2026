// The Hangar: spend VC earned in the training sim on vehicles, paint, trails, toppers, weapons and upgrades.
import { useEffect, useRef, useState } from "react";
import { Coins, Lock, Check, Volume2 } from "lucide-react";
import { SHOP, UPGRADES, PACK_LINES, drawVehicle, makeVehicle, saveProfile, owns, type Cat, type Profile, type UpKey } from "../lib/roverGame";
import { VOICES, say } from "../lib/voice";
import { getPrefs, setPrefs } from "../lib/network";
import { cn } from "../lib/cn";

const TABS: { id: string; label: string; cats: Cat[] }[] = [
  { id: "ride", label: "Ride", cats: ["skin", "weapon"] },
  { id: "style", label: "Style", cats: ["color", "trail", "topper"] },
  { id: "voice", label: "Voice", cats: ["pack"] },
  { id: "up", label: "Upgrades", cats: [] }
];

type Props = { profile: Profile; onChange(p: Profile): void };

export function Hangar({ profile, onChange }: Props) {
  const [tab, setTab] = useState("ride");
  const [flash, setFlash] = useState("");
  const preview = useRef<HTMLCanvasElement>(null);
  const [voiceId, setVoiceId] = useState(getPrefs().voiceId || VOICES[0].id);

  // spinning preview of the current loadout
  useEffect(() => {
    const cv = preview.current; if (!cv) return;
    const c = cv.getContext("2d")!, d = window.devicePixelRatio || 1;
    cv.width = 260 * d; cv.height = 150 * d; c.setTransform(d, 0, 0, d, 0, 0);
    const v = makeVehicle(130, 85, 1);
    let raf = 0;
    const loop = (t: number) => {
      c.clearRect(0, 0, 260, 150);
      v.moving = true; v.wheelA = t / 200; v.face = Math.sin(t / 2500) > 0 ? 1 : -1;
      drawVehicle(c, v, t, { skin: profile.loadout.skin, color: profile.loadout.color, topper: profile.loadout.topper });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [profile.loadout.skin, profile.loadout.color, profile.loadout.topper]);

  const update = (p: Profile) => { saveProfile(p); onChange(p); };
  const note = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(""), 1600); };

  function pick(cat: Cat, id: string, price: number) {
    const p: Profile = structuredClone(profile);
    if (!owns(p, cat, id)) {
      if (p.vc < price) return note(`Need ${price - p.vc} more VC`);
      p.vc -= price; p.owned.push(id);
    }
    p.loadout[cat] = id;
    update(p);
    if (cat === "pack") sample(id);
  }
  function upgrade(k: UpKey) {
    const p: Profile = structuredClone(profile);
    const lvl = p.upgrades[k], u = UPGRADES[k], price = u.base * (lvl + 1);
    if (lvl >= u.max) return;
    if (p.vc < price) return note(`Need ${price - p.vc} more VC`);
    p.vc -= price; p.upgrades[k] = lvl + 1;
    update(p);
  }
  function sample(pack = profile.loadout.pack) {
    const l = PACK_LINES[pack]?.sample?.[0];
    if (l) say(l, { voice: voiceId === "system" ? undefined : voiceId });
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="flex flex-col gap-3">
        <div className="rounded-[var(--radius-control)] border border-line bg-night/60">
          <canvas ref={preview} style={{ width: 260, height: 150 }} className="block" />
        </div>
        <label className="text-[11px] font-semibold tracking-[0.14em] text-ink-muted">CALL SIGN</label>
        <input
          value={profile.name}
          maxLength={14}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => update({ ...profile, name: e.target.value.replace(/[^\w\- ]/g, "").toUpperCase() })}
          className="rounded-[var(--radius-control)] border border-line bg-night/60 px-3 py-2 font-display text-[15px] font-semibold tracking-wide text-ink outline-none focus:border-sodium/60"
        />
        <div
          className="flex select-none items-center gap-2 rounded-[var(--radius-control)] border border-sodium/30 bg-sodium/10 px-3 py-2 text-sodium"
          title="Earn VC by playing the training sim"
          onClick={(e) => { if (e.shiftKey) { update({ ...profile, vc: profile.vc + 500 }); note("+500 VC (demo boost)"); } }}
        >
          <Coins size={16} /> <b className="font-display text-[18px]">{profile.vc.toLocaleString()}</b> VC
        </div>
        {flash && <div className="text-[12.5px] text-danger">{flash}</div>}
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex gap-1 rounded-full border border-line bg-night/50 p-1 text-[13px]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex-1 rounded-full px-3 py-1.5", tab === t.id ? "bg-sodium font-semibold text-night" : "text-ink-soft hover:text-ink")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="max-h-[340px] space-y-4 overflow-y-auto pr-1">
          {TABS.find((t) => t.id === tab)!.cats.map((cat) => (
            <div key={cat}>
              <div className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-ink-muted">{SHOP[cat].title.toUpperCase()}</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {SHOP[cat].items.map((it) => {
                  const have = owns(profile, cat, it.id), on = profile.loadout[cat] === it.id;
                  return (
                    <button key={it.id} onClick={() => pick(cat, it.id, it.price)}
                      className={cn("flex items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-left text-[13px]",
                        on ? "border-sodium bg-sodium/15 text-ink" : "border-line/80 bg-night/40 text-ink-soft hover:border-sodium/50")}>
                      <span className="truncate">{it.name}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[11.5px]">
                        {on ? <Check size={13} className="text-sodium" /> : have ? "owned" : <><Lock size={11} /> {it.price}</>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {tab === "voice" && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-ink-muted">ACCENT (ELEVENLABS VOICE)</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {[...VOICES, { id: "system", name: "Computer", note: "No ElevenLabs needed" }].map((v) => (
                  <button key={v.id}
                    onClick={() => { setVoiceId(v.id); setPrefs({ voiceId: v.id, voiceName: v.name }); }}
                    className={cn("rounded-[var(--radius-control)] border px-3 py-2 text-left", voiceId === v.id ? "border-sodium bg-sodium/15" : "border-line/80 bg-night/40 hover:border-sodium/50")}>
                    <div className="text-[13px] text-ink">{v.name}</div>
                    <div className="truncate text-[11px] text-ink-muted">{v.note}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => sample()} className="mt-2 flex items-center gap-1.5 text-[12.5px] text-sodium hover:underline">
                <Volume2 size={13} /> Hear it
              </button>
              <p className="mt-1 text-[11.5px] text-ink-muted">Bosses always keep their own voices. Every line is family-friendly.</p>
            </div>
          )}
          {tab === "up" && (
            <div className="grid gap-1.5">
              {(Object.keys(UPGRADES) as UpKey[]).map((k) => {
                const u = UPGRADES[k], lvl = profile.upgrades[k], maxed = lvl >= u.max;
                return (
                  <div key={k} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line/80 bg-night/40 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] text-ink">{u.name} <span className="text-sodium">{"■".repeat(lvl)}<span className="text-line">{"■".repeat(u.max - lvl)}</span></span></div>
                      <div className="truncate text-[11.5px] text-ink-muted">{u.desc}</div>
                    </div>
                    <button disabled={maxed} onClick={() => upgrade(k)}
                      className="shrink-0 rounded-[var(--radius-control)] border border-sodium/40 px-3 py-1 text-[12.5px] font-semibold text-sodium hover:bg-sodium/15 disabled:opacity-40">
                      {maxed ? "MAX" : `${u.base * (lvl + 1)} VC`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
