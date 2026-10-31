import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw, ShieldCheck, Rocket, Warehouse, Coins, GraduationCap, SkipForward, Check } from "lucide-react";
import { buildLesson, localLesson, type Lesson } from "../lib/learn";
import { startGame, BOSSES, loadProfile, saveProfile, type GameEnd, type HudState, type Speaker, type Profile } from "../lib/roverGame";
import { Hangar } from "./Hangar";
import { clean } from "../lib/clean";
import { say, stopVoice, VOICES } from "../lib/voice";
import { getPrefs } from "../lib/network";

// What each boss really is, and how Wifinity catches it. Shown after the game.
const LESSONS = [
  { name: "Evil twin", color: "#ff6b7a", what: "A fake Wi-Fi network that copies the name of a real one, so phones and laptops join the attacker instead.", how: "Wifinity flags look-alike networks nearby and tells you which one is real." },
  { name: "ARP spoofing", color: "#b26bff", what: "A device on the network pretends to be the router, so everyone's traffic passes through it (a man-in-the-middle).", how: "Wifinity watches the router's identity and warns you if it changes. Shields up can disconnect this computer automatically." },
  { name: "DNS hijacking", color: "#ffb547", what: "Web lookups get answered by a malicious device that sends you to fake sites, like a copy of your bank.", how: "Wifinity checks that lookups go to a trusted server, not another device on your network." }
];

type Props = { texts: string[]; onClose(): void; source?: string; learn?: boolean; topic?: string };

export function RoverGame({ texts, onClose, source = "INTERCEPTED TRANSMISSIONS", learn: startLearn = false, topic = "" }: Props) {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  // learn mode launches straight away on autopilot; the game opens in the Hangar
  const [learn, setLearn] = useState(startLearn);
  const [phase, setPhase] = useState<"hangar" | "play" | "debrief">(startLearn ? "play" : "hangar");
  const [lesson, setLesson] = useState<Lesson>(() => localLesson(texts));
  const [lessonReady, setLessonReady] = useState(false);
  const lessonRef = useRef(lesson);
  lessonRef.current = lesson;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const arena = useRef<HTMLDivElement>(null);
  const game = useRef<ReturnType<typeof startGame> | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [caption, setCaption] = useState<{ text: string; who: string; color: string } | null>(null);
  const [result, setResult] = useState<GameEnd | null>(null);
  const [round, setRound] = useState(0);
  const capTimer = useRef<number>(0);
  const close = useRef(onClose);
  close.current = onClose;

  // Esc leaves from any screen (hangar, game or summary)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  // Claude writes the lesson (takeaways, terms, quiz) while the rover is already reading
  useEffect(() => {
    if (!learn || lessonReady) return;
    let live = true;
    buildLesson(texts, topic).then((l) => {
      if (!live) return;
      setLesson(l); setLessonReady(true);
      game.current?.setTerms(l.terms.map((t) => t.term));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learn]);

  useEffect(() => {
    if (phase !== "play" || !canvas.current || !arena.current) return;
    setResult(null); setAnswers({});
    const voiceOn = getPrefs().voiceOn;
    game.current = startGame(canvas.current, arena.current, {
      say(raw: string, s: Speaker) {
        const text = clean(raw);
        setCaption({ text, who: s.who, color: s.color });
        window.clearTimeout(capTimer.current);
        capTimer.current = window.setTimeout(() => setCaption(null), Math.min(6000, 1600 + text.length * 55));
        // Bosses get their own ElevenLabs voices; the officer keeps yours.
        if (voiceOn) say(text, s.voice != null ? { voice: VOICES[s.voice % VOICES.length].id } : {});
      },
      onSection(i) {
        const take = lessonRef.current.takeaways[i];
        if (!take) return;
        const text = clean(take);
        setCaption({ text, who: `TAKEAWAY ${i + 1}`, color: "#ffb547" });
        window.clearTimeout(capTimer.current);
        capTimer.current = window.setTimeout(() => setCaption(null), Math.min(9000, 2500 + text.length * 60));
        if (voiceOn) say(text);
        return Math.min(6000, 1800 + text.length * 40); // rover waits while you read it
      },
      onEnd(r) {
        const p = loadProfile();
        p.vc += r.vc; p.best = Math.max(p.best, r.score);
        saveProfile(p); setProfile(p);
        setResult(r); setPhase("debrief");
      }
    }, loadProfile(), { auto: learn, terms: lessonRef.current.terms.map((t) => t.term) });
    const iv = window.setInterval(() => game.current && setHud(game.current.hud()), 100);
    return () => {
      window.clearInterval(iv);
      game.current?.stop();
      stopVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase === "play", learn]);

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-hidden bg-night text-ink" style={{ cursor: result ? "default" : "crosshair" }}>
      {/* the intercepted transmissions the rover eats */}
      <div ref={arena} className="pointer-events-none absolute inset-x-0 top-[96px] bottom-[70px] columns-[300px] gap-10 px-12 text-[15px] leading-[1.75] text-ink-soft select-none">
        <div className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-sodium/80">{source}</div>
        {texts.map((t, i) => (
          <p key={i} className="mb-4 break-inside-avoid">{t}</p>
        ))}
      </div>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-6 pt-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-sodium/90">{learn ? "LEARN MODE · AUTOPILOT" : "OFFICER TRAINING SIM"}</div>
          {learn ? <div className="mt-1 text-[12.5px] text-ink-muted">{profile.name || "The rover"} reads it for you and collects the key terms in gold · a takeaway after every paragraph · Esc to leave</div> : <div className="mt-1 text-[12.5px] text-ink-muted">Mouse to steer · it eats packets on its own · {profile.loadout.weapon === "rapid" ? "hold to blast" : profile.loadout.weapon === "shotgun" ? "click for plasma shotgun" : "click to fire words"} · Space fires words · Esc to leave</div>}
        </div>
        {hud && phase === "play" && (
          <div className="flex gap-5 rounded-[var(--radius-panel)] border border-line bg-asphalt/85 px-5 py-2 text-center backdrop-blur">
            {(learn
              ? [["READ", `${hud.progress}%`], ["PARAGRAPH", `${Math.min(hud.section, hud.sections)}/${hud.sections}`], ["KEY TERMS", hud.learned], ["WORDS", hud.words]]
              : [["SCORE", hud.score], ["TIME", hud.time], ["PACKETS", hud.words], ["AMMO", hud.ammo], ["HEAT", hud.hot ? "HOT" : `${hud.heat}%`], ["BEST", hud.best]]).map(([k, v]) => (
              <div key={k as string}>
                <div className={`font-display text-[22px] font-semibold leading-tight ${k === "TIME" || k === "KEY TERMS" ? "text-sodium" : k === "HEAT" && hud.hot ? "text-danger" : "text-ink"}`}>{v}</div>
                <div className="text-[10px] tracking-[0.14em] text-ink-muted">{k}</div>
              </div>
            ))}
          </div>
        )}
        {learn && phase === "play" && (
          <button onClick={() => game.current?.finish()} className="ml-auto flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-asphalt/80 px-3 py-2 text-[12.5px] text-ink-soft hover:text-ink">
            <SkipForward size={13} /> Skip to summary
          </button>
        )}
        <button onClick={onClose} aria-label="Leave the training sim" className="grid size-9 place-items-center rounded-[var(--radius-control)] border border-line bg-asphalt/80 text-ink-soft hover:text-ink">
          <X size={16} />
        </button>
      </div>
      {hud?.msg && !result && (
        <div className="absolute left-1/2 top-[86px] -translate-x-1/2 rounded-full border border-danger/40 bg-danger/10 px-4 py-1 text-[12.5px] font-semibold tracking-wide text-danger">{hud.msg}</div>
      )}

      {/* captions for everything spoken */}
      {caption && !result && (
        <div className="absolute bottom-6 left-1/2 max-w-[640px] -translate-x-1/2 rounded-[var(--radius-control)] border border-line bg-asphalt/95 px-4 py-2.5 text-center text-[14px]" aria-live="polite">
          <b style={{ color: caption.color }}>{caption.who}: </b>{caption.text}
        </div>
      )}

      {/* hangar: pick your loadout, then launch */}
      {phase === "hangar" && (
        <div className="absolute inset-0 grid place-items-center bg-night/85 p-6 backdrop-blur-sm">
          <div className="w-full max-w-[820px] rounded-[var(--radius-panel)] border border-line bg-asphalt p-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.18em] text-sodium/90">HANGAR</div>
                <h2 className="mt-1 font-display text-[24px] font-semibold tracking-[-0.02em]">Gear up, {profile.name || "officer"}.</h2>
                <p className="text-[13px] text-ink-muted">Earn VC every round. Spend it on rides, paint, weapons and upgrades.</p>
              </div>
              <div className="flex shrink-0 gap-2">
              <button onClick={() => { setLearn(true); setRound(r => r + 1); setPhase("play"); }} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-sodium/40 px-4 py-2.5 text-[14px] text-sodium hover:bg-sodium/10">
                <GraduationCap size={16} /> Autopilot: learn it
              </button>
              <button onClick={() => { setLearn(false); setRound(r => r + 1); setPhase("play"); }} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-sodium px-5 py-2.5 text-[15px] font-semibold text-night hover:bg-sodium-deep">
                <Rocket size={16} /> Play
              </button>
              </div>
            </div>
            <Hangar profile={profile} onChange={setProfile} />
          </div>
        </div>
      )}

      {/* learn mode: what you learned */}
      {result && phase === "debrief" && learn && (
        <div className="absolute inset-0 flex items-start justify-center overflow-y-auto bg-night/80 p-6 backdrop-blur-sm">
          <div className="my-auto w-full max-w-[780px] rounded-[var(--radius-panel)] border border-line bg-asphalt p-7">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-sodium/90">WHAT YOU LEARNED</div>
            <h2 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em]">{topic ? `You just learned about ${topic}.` : "Here's the short version."}</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink">{lesson.summary}</p>
            <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold text-sodium"><Coins size={14} /> +{result.vc} VC · {result.terms.length} key terms collected</p>
            {!lessonReady && <p className="mt-1 animate-pulse text-[12.5px] text-ink-muted">Claude is still writing the full lesson…</p>}

            <div className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-ink-muted">TAKEAWAYS</div>
            <ol className="mt-2 space-y-1.5 text-[13.5px] text-ink-soft">
              {lesson.takeaways.map((t, i) => <li key={i}><b className="text-sodium">{i + 1}.</b> {t}</li>)}
            </ol>

            {!!lesson.terms.length && (<>
              <div className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-ink-muted">KEY TERMS</div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {lesson.terms.map((t) => {
                  const got = result.terms.some((x) => x.toLowerCase() === t.term.toLowerCase());
                  return (
                    <div key={t.term} className={`rounded-[var(--radius-control)] border px-3 py-2 ${got ? "border-sodium/50 bg-sodium/10" : "border-line/80 bg-night/40"}`}>
                      <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">{got && <Check size={13} className="text-sodium" />}{t.term}</div>
                      {t.meaning && <div className="text-[12.5px] text-ink-soft">{t.meaning}</div>}
                    </div>
                  );
                })}
              </div>
            </>)}

            {!!lesson.quiz.length && (<>
              <div className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-ink-muted">QUICK CHECK · +20 VC EACH</div>
              <div className="mt-2 space-y-3">
                {lesson.quiz.map((q, qi) => (
                  <div key={qi}>
                    <div className="text-[14px] text-ink">{q.q}</div>
                    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                      {q.options.map((o, oi) => {
                        const picked = answers[qi], done = picked != null;
                        const cls = !done ? "border-line/80 hover:border-sodium/50" : oi === q.answer ? "border-glow/60 bg-glow/10 text-glow" : oi === picked ? "border-danger/60 bg-danger/10 text-danger" : "border-line/50 opacity-60";
                        return (
                          <button key={oi} disabled={done} onClick={() => {
                            setAnswers((a) => ({ ...a, [qi]: oi }));
                            if (oi === q.answer) { const p = loadProfile(); p.vc += 20; saveProfile(p); setProfile(p); }
                          }} className={`rounded-[var(--radius-control)] border px-3 py-2 text-left text-[13px] ${cls}`}>{o}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>)}

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-[var(--radius-control)] border border-line px-4 py-2 text-[14px] text-ink-soft hover:text-ink">Done</button>
              <button onClick={() => setPhase("hangar")} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-sodium/40 px-4 py-2 text-[14px] text-sodium hover:bg-sodium/10"><Warehouse size={14} /> Hangar</button>
              <button onClick={() => { setLearn(false); setRound(r => r + 1); setPhase("play"); }} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-sodium px-4 py-2 text-[14px] font-semibold text-night hover:bg-sodium-deep">
                <Rocket size={14} /> Now play it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* debrief */}
      {result && phase === "debrief" && !learn && (
        <div className="absolute inset-0 grid place-items-center bg-night/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-[760px] rounded-[var(--radius-panel)] border border-line bg-asphalt p-7">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-sodium/90">DEBRIEF</div>
            <h2 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.02em]">
              {result.kills === BOSSES.length ? "Network secure. All 3 attacks blocked." : result.kills ? `You blocked ${result.kills} of 3 attacks.` : "The attackers got through this time."}
            </h2>
            <p className="mt-1 text-[14px] text-ink-soft">
              Score {result.score.toLocaleString()} · {result.words} packets eaten{result.newBest ? " · new best!" : ` · best ${result.best.toLocaleString()}`}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold text-sodium"><Coins size={15} /> +{result.vc} VC earned · {profile.vc.toLocaleString()} VC in the bank</p>
            <div className="mt-6 text-[11px] font-semibold tracking-[0.18em] text-ink-muted">WHAT YOU JUST FOUGHT</div>
            <div className="mt-3 grid gap-3">
              {LESSONS.map((l, i) => (
                <div key={l.name} className={`rounded-[var(--radius-control)] border border-line/80 bg-night/50 p-4 ${i >= Math.max(1, result.kills + 1) ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-2 font-display text-[16px] font-semibold" style={{ color: l.color }}>
                    {i < result.kills && <ShieldCheck size={15} />} {l.name}
                  </div>
                  <p className="mt-1 text-[13.5px] text-ink-soft">{l.what}</p>
                  <p className="mt-1 text-[13.5px] text-glow">{l.how}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-[var(--radius-control)] border border-line px-4 py-2 text-[14px] text-ink-soft hover:text-ink">Back to the officer</button>
              <button onClick={() => setPhase("hangar")} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-sodium/40 px-4 py-2 text-[14px] text-sodium hover:bg-sodium/10">
                <Warehouse size={14} /> Hangar
              </button>
              <button onClick={() => { setRound(r => r + 1); setPhase("play"); }} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-sodium px-4 py-2 text-[14px] font-semibold text-night hover:bg-sodium-deep">
                <RotateCcw size={14} /> Play again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
