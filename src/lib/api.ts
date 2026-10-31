// Use these helpers from pages. They work in the desktop app, and fall back to
// simulated answers when opened in a plain browser.
import type { AiRequest } from "../types/api";
import { setGlow, flashGlow } from "./glow";

const desktop = typeof window !== "undefined" ? window.api : undefined;

export const isDesktop = Boolean(desktop);

export async function keyStatus() {
  if (desktop) return desktop.env.status();
  return { ai: false, eleven: false, model: "simulated (browser)" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fake = (req: AiRequest) => {
  const asked = (req.prompt ?? req.messages?.at(-1)?.content ?? "").slice(0, 80);
  return `Simulated answer (browser preview). You asked: "${asked}". Run the desktop app with a Claude key for real answers.`;
};

/** Ask Claude and get the full answer back. */
export async function ask(req: AiRequest) {
  setGlow("thinking");
  try {
    const out = desktop ? await desktop.ai.ask(req) : { text: fake(req) };
    flashGlow("success", 900);
    return out;
  } catch (err) {
    flashGlow("error");
    throw err;
  }
}

/** Ask Claude for JSON. Describe the shape you want in the prompt. */
export async function askJson<T = unknown>(prompt: string, system?: string): Promise<T> {
  const out = await ask({ prompt, system, json: true });
  return out.data as T;
}

/** Stream Claude's answer piece by piece. Returns a cancel function and a done promise. */
export function stream(req: AiRequest, onText: (chunk: string) => void) {
  setGlow("thinking");
  let handle: { done: Promise<void>; cancel(): void };
  if (desktop) {
    handle = desktop.ai.stream(req, onText);
  } else {
    let stop = false;
    handle = {
      cancel: () => (stop = true),
      done: (async () => {
        for (const w of fake(req).split(/(?<= )/)) {
          if (stop) return;
          onText(w);
          await sleep(35);
        }
      })(),
    };
  }
  const done = handle.done.then(
    () => flashGlow("success", 900),
    (err) => {
      flashGlow("error");
      throw err;
    }
  );
  return { done, cancel: handle.cancel };
}
