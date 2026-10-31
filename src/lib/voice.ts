// The security officer's voice: ElevenLabs when a key and voice are set, the computer's own
// voice otherwise. Text always stays on screen too.
import { getPrefs } from "./network";
import { toast } from "./toast";
import { createStore } from "./store";
import { cleanForVoice } from "./clean";

/** idle | loading (waiting for ElevenLabs) | speaking */
export const [useSpeaking, setSpeaking] = createStore<"idle" | "loading" | "speaking">("idle");

const desktop = typeof window !== "undefined" ? window.api : undefined;
let audio: HTMLAudioElement | null = null;
let token = 0;
let elevenReady: boolean | null = null;

// A few good ElevenLabs default voices, available on every account.
export const VOICES = [
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", note: "British broadcaster, mission control" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", note: "Warm British narrator" },
  { id: "EXAVITQu4vr4xnJyN9lr", name: "Sarah", note: "Calm and confident" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", note: "Deep American" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", note: "Clear British" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", note: "Relaxed Australian" },
];
export const DEFAULT_VOICE = VOICES[0].id;
/** The voice to use: the person's pick, Daniel by default, or the computer voice ("system"). */
export function currentVoice() {
  const v = getPrefs().voiceId;
  if (v === "system") return null;
  return v || DEFAULT_VOICE;
}

export function setElevenReady(v: boolean) {
  elevenReady = v;
}

export function stopVoice() {
  token++;
  audio?.pause();
  audio = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  setSpeaking("idle");
}

/** Speak text. `auto` calls (alerts, briefings) only speak when voice is switched on. */
export async function say(text: string, { auto = false, voice: pick }: { auto?: boolean; voice?: string } = {}) {
  const prefs = getPrefs();
  if (auto && !prefs.voiceOn) return;
  stopVoice();
  const mine = ++token;
  const clean = cleanForVoice(text.replace(/[*_#`>]/g, "")).slice(0, 2500);
  const voice = pick ?? currentVoice();
  const rate = Math.min(1.6, Math.max(0.7, prefs.voiceRate ?? 1));
  const done = () => { if (mine === token) setSpeaking("idle"); };
  if (desktop && voice && elevenReady) {
    setSpeaking("loading");
    const res = await desktop.voice.speak({ text: clean, voice });
    if (mine !== token) return; // stopped while the request was in flight
    if (res.ok) {
      audio = new Audio(`data:audio/mpeg;base64,${res.value}`);
      audio.playbackRate = rate;
      audio.onended = done;
      audio.onerror = done;
      setSpeaking("speaking");
      await audio.play().catch(done);
      return;
    }
    if (!auto) toast(res.error, "error");
  }
  if (typeof speechSynthesis === "undefined") return done();
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1.02 * rate;
  u.onend = done;
  u.onerror = done;
  setSpeaking("speaking");
  speechSynthesis.speak(u);
}
