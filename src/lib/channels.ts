// Finds the least crowded Wi-Fi channel from the networks Windows can see.
import type { Snapshot } from "../types/api";

type Ok = Extract<Snapshot, { ok: true }>;
export type ChannelAdvice = {
  band: "2.4 GHz" | "5 GHz";
  current: number;
  currentLoad: number; // roughly "how many strong networks you share airtime with"
  best: number;
  bestLoad: number;
  loads: { channel: number; load: number }[];
  worthSwitching: boolean;
};

const CANDIDATES_24 = [1, 6, 11];
const CANDIDATES_5 = [36, 40, 44, 48, 149, 153, 157, 161];

export function channelAdvice(snap: Ok): ChannelAdvice | null {
  const c = snap.connection;
  const current = parseInt(c?.channel ?? "", 10);
  if (!c || !current) return null;
  const band = current <= 14 ? "2.4 GHz" : "5 GHz";
  const aps = (snap.networks ?? []).flatMap((n) =>
    n.bssids
      .filter((b) => b.bssid !== c.bssid)
      .map((b) => ({ ch: parseInt(b.channel, 10), w: Math.max(0.15, b.signal / 100) }))
      .filter((a) => a.ch && (band === "2.4 GHz" ? a.ch <= 14 : a.ch > 14))
  );
  if (!aps.length) return null;

  // 2.4 GHz channels overlap their neighbours (about 4 channels each side); 5 GHz channels don't.
  const load = (ch: number) =>
    aps.reduce((sum, a) => {
      const diff = Math.abs(a.ch - ch);
      if (band === "2.4 GHz") return diff <= 4 ? sum + a.w * (1 - diff / 5) : sum;
      return diff === 0 ? sum + a.w : sum;
    }, 0);

  const cands = band === "2.4 GHz" ? CANDIDATES_24 : CANDIDATES_5;
  const loads = cands.map((channel) => ({ channel, load: Math.round(load(channel) * 10) / 10 }));
  const best = loads.reduce((a, b) => (b.load < a.load ? b : a));
  const currentLoad = Math.round(load(current) * 10) / 10;
  return {
    band,
    current,
    currentLoad,
    best: best.channel,
    bestLoad: best.load,
    loads,
    worthSwitching: best.channel !== current && currentLoad >= 1 && currentLoad > best.load * 1.8 + 0.3,
  };
}
