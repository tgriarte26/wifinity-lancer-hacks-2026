import { createStore } from "./store";

// The underglow under the title bar shows what the app is doing.
// Call setGlow("thinking") before slow work and setGlow("idle") after.
export type GlowState = "idle" | "thinking" | "success" | "error";

export const [useGlow, setGlow] = createStore<GlowState>("idle");

let resetTimer: ReturnType<typeof setTimeout> | undefined;

// Show a state briefly, then return to idle (used for success/error flashes).
export function flashGlow(state: GlowState, ms = 1600) {
  clearTimeout(resetTimer);
  setGlow(state);
  resetTimer = setTimeout(() => setGlow("idle"), ms);
}
