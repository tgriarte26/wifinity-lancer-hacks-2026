// Admin mode: connect an OpenWrt router you administer, and ask it to remove devices.
import type { KickResult, RouterState } from "../types/api";
import { createStore } from "./store";
import { getPrefs, getSnapshot } from "./network";

const desktop = typeof window !== "undefined" ? window.api : undefined;
export const [useRouter, setRouter, getRouter] = createStore<(RouterState & { demo?: boolean }) | null>(null);

export async function connectRouter(input: { url: string; username: string; password: string; allowHttp: boolean }) {
  if (getPrefs().demo || !desktop) {
    await new Promise((r) => setTimeout(r, 700));
    const snap = getSnapshot();
    const n = snap?.ok ? snap.devices.filter((d) => !d.isGateway).length : 6;
    setRouter({ connected: true, interfaces: ["hostapd.wlan0", "hostapd.wlan1"], host: "192.168.1.1 (demo)", demo: true, clients: Array(n).fill(0).map(() => ({ mac: "", radio: "hostapd.wlan0", authorized: true, signal: -50 })) });
    return { ok: true as const };
  }
  const res = await desktop.router.connect(input);
  if (res.ok) setRouter(res.value);
  return res;
}

export async function disconnectRouter() {
  setRouter(null);
  await desktop?.router.disconnect();
}

/** Ask the router to remove a device for five minutes, then verify. */
export async function kick(mac: string): Promise<{ ok: true; value: KickResult } | { ok: false; error: string }> {
  const r = getRouter();
  if (!r?.connected) return { ok: false, error: "Connect your router first (Admin mode)." };
  if (r.demo || !desktop) {
    await new Promise((res) => setTimeout(res, 600));
    return { ok: true, value: { ok: true, seconds: 300, radios: ["hostapd.wlan0"], verified: true, checks: [{ radio: "hostapd.wlan0", absent: true, banListed: true }] } };
  }
  return desktop.router.kick({ mac, seconds: 300 });
}

export async function setMode(mode: "user" | "admin") {
  if (mode === "user") setRouter(null);
  await desktop?.mode.set(mode);
}

// Keep the router's client list fresh while connected (a real router session also stays alive).
let refreshTimer: ReturnType<typeof setInterval> | null = null;
export function startRouterRefresh() {
  if (refreshTimer) return;
  refreshTimer = setInterval(async () => {
    const r = getRouter();
    if (!r?.connected || r.demo || !desktop || getPrefs().mode !== "admin") return;
    const res = await desktop.router.refresh();
    if (res.ok) setRouter(res.value);
    else setRouter({ ...r, connected: false });
  }, 15000);
}

/** Does the router's own client list include this device? null = no router to ask. */
export function routerSees(mac: string): boolean | null {
  const r = getRouter();
  if (!r?.connected) return null;
  if (r.demo) return true;
  return r.clients.some((c) => c.mac.toLowerCase() === mac.toLowerCase());
}
