// Live network state: scans on a timer, remembers devices, and raises arrival alerts.
import type { Device, Snapshot, Traffic } from "../types/api";
import { createStore, loadSaved, save } from "./store";
import { displayName, nameFor, type Priority, type Role } from "./devices";
import { flashGlow, setGlow } from "./glow";
import { toast } from "./toast";

export type DeviceMeta = {
  firstSeen: number;
  lastSeen: number;
  trusted?: boolean;
  watch?: boolean; // the user flagged it to keep an eye on
  name?: string;
  arrivedLive?: boolean; // joined after Orbit started watching
  arrivedAt?: number;
  role?: Role;
  owner?: string;
  priority?: Priority;
  blocked?: boolean; // ejected by the user
  blockedAt?: number;
  routerBanUntil?: number; // the router confirmed a temporary removal
};
export type LogEvent = { id: number; at: number; kind: "arrived" | "left" | "info" | "warning"; text: string; mac?: string };
export type Quality = "auto" | "cinematic" | "high" | "balanced" | "low";
export type Prefs = {
  demo: boolean;
  alerts: boolean;
  intervalSec: number;
  quality: Quality;
  showFps: boolean;
  shields: boolean;
  mode: "user" | "admin";
  voiceOn: boolean;
  voiceId?: string;
  voiceName?: string;
  voiceRate?: number;
  paused?: boolean;
};

const desktop = typeof window !== "undefined" ? window.api : undefined;

export const [usePrefs, setPrefsRaw, getPrefs] = createStore<Prefs>(
  {
    demo: !desktop || desktop.platform !== "win32",
    alerts: true,
    intervalSec: 12,
    quality: "auto",
    showFps: true,
    shields: false,
    mode: "user",
    voiceOn: true,
    ...loadSaved<Partial<Prefs>>("prefs", {}),
  }
);
export function setPrefs(p: Partial<Prefs>) {
  setPrefsRaw((old) => {
    const next = { ...old, ...p };
    save("prefs", next);
    return next;
  });
}

const metaKey = () => (getPrefs().demo ? "meta-demo" : "meta");
export const [useMeta, setMetaRaw, getMeta] = createStore<Record<string, DeviceMeta>>(loadSaved(metaKey(), {}));
function setMeta(fn: (m: Record<string, DeviceMeta>) => Record<string, DeviceMeta>) {
  setMetaRaw((old) => {
    const next = fn(old);
    save(metaKey(), next);
    return next;
  });
}

export const [useLog, setLogRaw] = createStore<LogEvent[]>(loadSaved("log", []));
let logId = Date.now();
function log(kind: LogEvent["kind"], text: string, mac?: string) {
  setLogRaw((l) => {
    const next = [{ id: logId++, at: Date.now(), kind, text, mac }, ...l].slice(0, 150);
    save("log", next);
    return next;
  });
}

// The router's hardware address per network name. If it changes, something is wrong
// (or the router was replaced).
const gwKey = () => (getPrefs().demo ? "gw-demo" : "gw");
export const [useGatewayMemory, setGwRaw, getGw] = createStore<Record<string, string>>(loadSaved(gwKey(), {}));
function rememberGateway(ssid: string, mac: string) {
  setGwRaw((g) => {
    const next = { ...g, [ssid]: mac };
    save(gwKey(), next);
    return next;
  });
}
/** "Yes, I replaced my router": accept the new identity. */
export function acceptGateway() {
  const snap = getSnapshot();
  if (snap?.ok && snap.connection?.ssid && snap.gateway.mac) {
    rememberGateway(snap.connection.ssid, snap.gateway.mac);
    log("info", "New router identity accepted.");
  }
}

/** Devices (other than the router) that use the router's hardware address: ARP spoofing. */
export function impostors(snap: Snapshot): string[] {
  if (!snap.ok || !snap.gateway.mac) return [];
  return snap.devices.filter((d) => !d.isGateway && d.mac === snap.gateway.mac).map((d) => d.ip);
}

export const [useUnderAttack, setUnderAttack, getUnderAttack] = createStore(false);

// "Shields up": set when Orbit disconnected this computer to protect it.
export const [useShieldsUp, setShieldsUp] = createStore<{ at: number; ssid: string; demo: boolean } | null>(null);
export const [useTraffic, setTraffic] = createStore<Traffic | null>(null);

async function raiseShields(ssid: string) {
  const demo = getPrefs().demo;
  try {
    const res = desktop ? await desktop.shields.disconnect({ demo }) : { ok: true, demo: true };
    setShieldsUp({ at: Date.now(), ssid, demo: !!res.demo });
    log("warning", res.demo ? `Shields up (demo): Wifinity would disconnect from "${ssid}" now.` : `Shields up: disconnected from "${ssid}" to protect this computer.`);
    notify("Shields up", res.demo ? "Demo: this is where Wifinity disconnects you from the network." : `Disconnected from "${ssid}" to protect this computer.`);
  } catch (err) {
    log("warning", `Shields could not disconnect: ${(err as Error).message}`);
  }
}

async function refreshTraffic() {
  try {
    const t = desktop
      ? await desktop.shields.traffic({ demo: getPrefs().demo })
      : await import("./demoBrowser").then((m) => m.browserTraffic());
    setTraffic(t);
  } catch {}
}
export { refreshTraffic };

export const [useSnapshot, setSnapshot, getSnapshot] = createStore<Snapshot | null>(null);
export const [useScanning, setScanning] = createStore(false);
export const [useSelected, setSelected] = createStore<import("./risk").Target | null>(null);

export function trust(mac: string, trusted = true) {
  setMeta((m) => ({ ...m, [mac]: { ...m[mac], trusted, watch: trusted ? false : m[mac]?.watch, arrivedLive: trusted ? false : m[mac]?.arrivedLive } }));
  const d = (getSnapshot() as Extract<Snapshot, { ok: true }> | null)?.devices.find((x) => x.mac === mac && !x.isGateway);
  if (d && trusted) log("info", `${nameFor(d, getMeta()[mac])} marked as trusted`, mac);
}
/** Trusted, watch list, or undecided. */
export function setTrustLevel(mac: string, level: "trusted" | "watch" | "unsure") {
  if (level === "trusted") return trust(mac, true);
  setMeta((m) => ({ ...m, [mac]: { ...m[mac], trusted: false, watch: level === "watch" } }));
  const d = (getSnapshot() as Extract<Snapshot, { ok: true }> | null)?.devices.find((x) => x.mac === mac && !x.isGateway);
  if (d && level === "watch") log("warning", `${nameFor(d, getMeta()[mac])} added to the watch list`, mac);
}
/** Bring back every ejected device (handy for resetting a demo). */
export function unblockAll() {
  const n = Object.values(getMeta()).filter((m) => m.blocked).length;
  setMeta((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.blocked ? { ...v, blocked: false, blockedAt: undefined, routerBanUntil: undefined } : v])));
  if (n) log("info", `${n} ejected device${n > 1 ? "s" : ""} restored.`);
  return n;
}
/** Giving a device a role means you've identified it, so it's trusted too. */
export function setRole(mac: string, role: Role | undefined) {
  setMeta((m) => ({ ...m, [mac]: { ...m[mac], role, trusted: role ? true : m[mac]?.trusted, arrivedLive: role ? false : m[mac]?.arrivedLive } }));
}
/** Eject: the planet explodes, Orbit treats the device as banned and alerts if it shows up again. */
export function eject(mac: string, viaRouter = false) {
  const d = (getSnapshot() as Extract<Snapshot, { ok: true }> | null)?.devices.find((x) => x.mac === mac && !x.isGateway);
  setMeta((m) => ({
    ...m,
    [mac]: { ...m[mac], blocked: true, blockedAt: Date.now(), trusted: false, routerBanUntil: viaRouter ? Date.now() + 5 * 60_000 : undefined },
  }));
  log("warning", `${d ? nameFor(d, getMeta()[mac]) : "A device"} ejected. Block it on the router to keep it off for good.`, mac);
}
export function unblock(mac: string) {
  setMeta((m) => ({ ...m, [mac]: { ...m[mac], blocked: false, blockedAt: undefined } }));
  log("info", "Device unblocked.", mac);
}

export function setOwner(mac: string, owner: string) {
  setMeta((m) => ({ ...m, [mac]: { ...m[mac], owner: owner.trim() || undefined } }));
}
export function setPriority(mac: string, priority: Priority) {
  setMeta((m) => ({ ...m, [mac]: { ...m[mac], priority } }));
}

export function rename(mac: string, name: string) {
  setMeta((m) => ({ ...m, [mac]: { ...m[mac], name: name.trim() || undefined } }));
}

/** Forget every device and treat the current network as the new normal. */
export function resetBaseline() {
  setMeta(() => ({}));
  setGwRaw(() => ({}));
  save(gwKey(), {});
  baselined = false;
  log("info", "Device memory cleared. The next scan becomes the new normal.");
  scanNow(true);
}

let baselined = Object.keys(getMeta()).length > 0;
let gwWarned = false;
let misses: Record<string, number> = {};
let scanCount = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

/** Windows notification, so alerts still reach you when Orbit is minimized. */
let lastNotice = 0;
let heldBack = 0;
function notify(title: string, body: string, urgent = false) {
  if (!getPrefs().alerts || typeof Notification === "undefined") return;
  // Busy networks (campus, cafe) have people joining all the time: at most one
  // notification a minute, summarising the rest. Attacks always get through.
  const now = Date.now();
  if (!urgent && now - lastNotice < 60_000) {
    heldBack++;
    return;
  }
  if (!urgent && heldBack) {
    body = `${body} (+${heldBack} more since the last alert, see the Log)`;
    heldBack = 0;
  }
  lastNotice = now;
  try {
    const n = new Notification(title, { body, silent: false });
    n.onclick = () => window.focus();
  } catch {}
}

async function announce(d: Device) {
  const name = displayName(d);
  toast(`New device joined: ${name}`, "error", 6000);
  flashGlow("error", 2500);
  if (!getPrefs().alerts) return;
  if (getUnderAttack()) return;
  const who = d.hostname
    ? `It calls itself ${d.hostname.replace(/[-_]/g, " ")}.`
    : d.randomized
      ? "It's hiding its hardware identity."
      : "It has no name.";
  notify("New device joined your network", `${name} (${d.ip}). ${who}`);
  import("./voice").then((v) => v.say(`Alert. Unidentified craft entering orbit. ${who}`, { auto: true }));
}

function ingest(snap: Snapshot) {
  if (!snap.ok) return;
  const now = snap.at;
  const meta = getMeta();
  const arrivals: Device[] = [];
  const next = { ...meta };
  const present = new Set(snap.devices.map((d) => d.mac).filter(Boolean));

  for (const d of snap.devices) {
    if (!d.mac) continue;
    if (meta[d.mac]?.blocked && (misses[d.mac] ?? 0) >= 3) {
      log("warning", `Ejected device is back: ${nameFor(d, meta[d.mac])} (${d.ip})`, d.mac);
      notify("Ejected device is back", `${nameFor(d, meta[d.mac])} rejoined your network. Block it on your router.`, true);
      flashGlow("error", 3000);
    }
    misses[d.mac] = 0;
    const m = next[d.mac];
    if (!m) {
      const live = baselined && !d.isSelf && !d.isGateway;
      next[d.mac] = { firstSeen: now, lastSeen: now, arrivedLive: live, arrivedAt: live ? now : undefined };
      if (live) arrivals.push(d);
    } else next[d.mac] = { ...m, lastSeen: now };
  }
  // Devices that stop answering for 3 scans in a row are logged as gone.
  for (const mac of Object.keys(meta)) {
    if (present.has(mac)) continue;
    misses[mac] = (misses[mac] ?? 0) + 1;
    if (misses[mac] === 3) log("left", `${meta[mac].name ?? "A device"} left the network`, mac);
  }
  setMeta(() => next);

  // Router impersonation check
  const fakes = impostors(snap);
  const ssid = snap.connection?.ssid;
  const knownGw = ssid ? getGw()[ssid] : undefined;
  const gwChanged = !!(ssid && knownGw && snap.gateway.mac && knownGw !== snap.gateway.mac);
  const attacked = fakes.length > 0;
  if (ssid && snap.gateway.mac && !knownGw && !attacked) rememberGateway(ssid, snap.gateway.mac);
  if (attacked && !getUnderAttack()) {
    setUnderAttack(true);
    setGlow("error");
    log("warning", `Router impersonation detected: ${fakes.join(", ")} is answering as your router.`);
    toast("Someone is impersonating your router", "error", 8000);
    notify("Router impersonation detected", `${fakes.join(", ")} is answering as your router. Traffic may be intercepted.`, true);
    import("./voice").then((v) =>
      v.say("Warning. Hull breach. A device on your network is impersonating your router and may be intercepting traffic.", { auto: true })
    );
    if (getPrefs().shields) raiseShields(ssid ?? "this network");
  } else if (!attacked && getUnderAttack()) {
    setUnderAttack(false);
    setGlow("idle");
    log("info", "Router impersonation stopped.");
  }
  if (gwChanged && !attacked && !gwWarned) {
    gwWarned = true;
    log("warning", "Your router's hardware identity changed since last time.");
  }

  if (!baselined) {
    baselined = true;
    log("info", `Watching "${snap.connection?.ssid ?? "this network"}". ${snap.devices.length} devices are now the baseline.`);
  }
  for (const d of arrivals) {
    log("arrived", `New device joined: ${displayName(d)} (${d.ip})`, d.mac);
    announce(d);
  }
}

export async function scanNow(full = false) {
  if (running) return;
  running = true;
  setScanning(true);
  const prefs = getPrefs();
  try {
    const wifi = full || scanCount % 3 === 0;
    const prev = getSnapshot();
    const snap: Snapshot = desktop
      ? await desktop.scan.run({ demo: prefs.demo, sweepFirst: true, wifi })
      : await import("./demoBrowser").then((m) => m.browserDemo());
    // Keep the last nearby-network list between quick scans.
    if (snap.ok && !snap.networks && prev?.ok) snap.networks = prev.networks;
    if (snap.ok && snap.dns == null && prev?.ok) snap.dns = prev.dns;
    refreshTraffic();
    scanCount++;
    if (!snap.ok) log("warning", snap.error);
    setSnapshot(snap);
    ingest(snap);
  } catch (err) {
    toast(`Scan failed: ${(err as Error).message}`, "error");
  } finally {
    running = false;
    setScanning(false);
  }
}

/** Start the background scan loop (call once). */
export function startWatching() {
  const loop = async () => {
    await scanNow(scanCount === 0);
    timer = setTimeout(loop, getPrefs().intervalSec * 1000);
  };
  clearTimeout(timer);
  loop();
}

/** Switch between the real network and the demo network. */
export function setDemo(demo: boolean) {
  setPrefs({ demo });
  setMetaRaw(loadSaved(metaKey(), {}));
  setGwRaw(loadSaved(gwKey(), {}));
  setUnderAttack(false);
  setShieldsUp(null);
  setTraffic(null);
  gwWarned = false;
  baselined = Object.keys(getMeta()).length > 0;
  misses = {};
  setSnapshot(null);
  setSelected(null);
  scanNow(true);
}

export function simulateAttack(on: boolean) {
  if (desktop) desktop.scan.demoAttack(on);
  else import("./demoBrowser").then((m) => m.browserAttack(on));
  setTimeout(() => scanNow(), 300);
}

export function simulateArrival() {
  if (desktop) desktop.scan.demoArrive();
  else import("./demoBrowser").then((m) => m.browserArrive());
  setTimeout(() => scanNow(), 300);
}
