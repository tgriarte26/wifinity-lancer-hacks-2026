// Turns a scan into plain-language findings and a 0-100 health score. No AI needed.
import type { Snapshot } from "../types/api";
import type { DeviceMeta } from "./network";
import { nameFor } from "./devices";
import { channelAdvice } from "./channels";

export type Severity = "critical" | "high" | "medium" | "low" | "good";
export type Target = { kind: "home" } | { kind: "device"; mac: string } | { kind: "nearby"; key: string };
export type Finding = { id: string; severity: Severity; title: string; detail: string; target: Target; points?: number };

export const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, good: 4 };
const penalty: Record<Severity, number> = { critical: 35, high: 15, medium: 6, low: 2, good: 0 };

export const nearbyKey = (n: { ssid: string; bssids: { bssid: string }[] }) => `${n.ssid}|${n.bssids[0]?.bssid ?? ""}`;

/** How strong a Wi-Fi security setting is, in plain words. */
export function securityLevel(auth: string, cipher = ""): { level: Severity; label: string } {
  const a = auth.toLowerCase();
  const c = cipher.toLowerCase();
  if (!a || a === "open" || c === "none") return { level: "critical", label: "No password" };
  if (a.includes("wep") || c.includes("wep")) return { level: "critical", label: "WEP (broken)" };
  if (a.includes("wpa3")) return { level: "good", label: "WPA3" };
  if (a.includes("enterprise")) return { level: "good", label: a.includes("wpa2") ? "WPA2 Enterprise" : "Enterprise" };
  if (a.includes("wpa2")) return c.includes("tkip") ? { level: "medium", label: "WPA2 (TKIP)" } : { level: "good", label: "WPA2" };
  if (a.includes("wpa")) return { level: "high", label: "WPA (outdated)" };
  return { level: "medium", label: auth };
}

export function analyze(snap: Snapshot, meta: Record<string, DeviceMeta>, knownGateway?: Record<string, string>) {
  const findings: Finding[] = [];
  const threatened = new Set<string>(); // device MACs that get an asteroid belt
  let sunUnderAttack = false;
  if (!snap.ok) return { findings, score: 0, grade: "Offline", threatened, sunUnderAttack };

  // Router impersonation (ARP spoofing): another device answers with the router's address.
  const gwMac = snap.gateway.mac;
  const fakes = gwMac ? snap.devices.filter((d) => !d.isGateway && d.mac === gwMac) : [];
  if (fakes.length) {
    sunUnderAttack = true;
    for (const f of fakes) {
      threatened.add(f.mac);
      findings.push({
        id: `spoof-${f.ip}`,
        severity: "critical",
        title: "Someone is impersonating your router",
        detail: `The device at ${f.ip} is answering as your router, so traffic may be flowing through it (ARP spoofing). Disconnect it, then restart your router and change the Wi-Fi password.`,
        target: { kind: "device", mac: f.mac },
      });
    }
  } else {
    const ssid = snap.connection?.ssid;
    const known = ssid ? knownGateway?.[ssid] : undefined;
    if (known && gwMac && known !== gwMac)
      findings.push({
        id: "gw-changed",
        severity: "high",
        title: "Your router's identity changed",
        detail: "The router answering now has a different hardware address than before. If you didn't replace your router, someone may be pretending to be it.",
        target: { kind: "home" },
      });
  }

  // DNS hijack: web lookups sent to some other device on your own network
  const dnsSelf = snap.self.ip;
  const rogueDns = (snap.dns ?? []).filter(
    (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) && ip !== snap.gateway.ip && ip !== dnsSelf
  );
  for (const ip of rogueDns) {
    const dev = snap.devices.find((d) => d.ip === ip);
    if (dev) threatened.add(dev.mac);
    findings.push({
      id: `dns-${ip}`,
      severity: "high",
      title: "Your web lookups go to another device",
      detail: `Websites are being looked up through ${ip} instead of your router. A device doing this can send you to fake versions of real sites (DNS hijacking). Restart the router, and if it continues, check the router's DNS settings.`,
      target: dev ? { kind: "device", mac: dev.mac } : { kind: "home" },
    });
  }

  // Two devices with one hardware address
  const byMac = new Map<string, string[]>();
  for (const d of snap.devices) if (d.mac && !d.isGateway && d.mac !== gwMac) byMac.set(d.mac, [...(byMac.get(d.mac) ?? []), d.ip]);
  for (const [mac, ips] of byMac)
    if (ips.length > 1) {
      threatened.add(mac);
      findings.push({
        id: `dup-${mac}`,
        severity: "high",
        title: "One device is using several addresses",
        detail: `The same hardware is answering at ${ips.join(" and ")}. This can be harmless, but it's also a sign of someone redirecting traffic.`,
        target: { kind: "device", mac },
      });
    }

  const home = snap.connection;
  if (home) {
    const sec = securityLevel(home.auth, home.cipher);
    if (sec.level === "critical")
      findings.push({
        id: "home-sec",
        severity: "critical",
        title: sec.label === "No password" ? "Your Wi-Fi has no password" : "Your Wi-Fi uses broken encryption",
        detail: "Anyone nearby can join or read traffic. Switch the router to WPA2 or WPA3 with a strong password.",
        target: { kind: "home" },
      });
    else if (sec.level === "high" || sec.level === "medium")
      findings.push({
        id: "home-sec",
        severity: sec.level,
        title: `Your Wi-Fi uses ${sec.label}`,
        detail: "This older setting can be cracked. Change the router's security mode to WPA2 (AES) or WPA3.",
        target: { kind: "home" },
      });
    else
      findings.push({
        id: "home-sec",
        severity: "good",
        title: `Strong encryption (${sec.label})`,
        detail: "Your connection to the router is encrypted with a current standard.",
        target: { kind: "home" },
      });
  }

  const ch = channelAdvice(snap);
  if (ch?.worthSwitching)
    findings.push({
      id: "channel",
      severity: "low",
      title: `Your Wi-Fi channel is crowded`,
      detail: `Channel ${ch.current} is shared with nearby networks. Switching your router to channel ${ch.best} should give a faster, steadier connection.`,
      target: { kind: "home" },
    });

  for (const n of snap.networks ?? []) {
    const sec = securityLevel(n.auth, n.encryption);
    const key = nearbyKey(n);
    const twin =
      home?.ssid &&
      n.ssid === home.ssid &&
      !n.bssids.some((b) => b.bssid === home.bssid) &&
      securityLevel(home.auth, home.cipher).label !== sec.label;
    if (twin)
      findings.push({
        id: `twin-${key}`,
        severity: "critical",
        title: `Possible fake copy of "${n.ssid}"`,
        detail: `A network with your name but ${sec.label === "No password" ? "no password" : `${sec.label} security`} is nearby. This is how "evil twin" attacks trick devices into connecting. Don't join it.`,
        target: { kind: "nearby", key },
      });
    else if (sec.level === "critical" && n.ssid)
      findings.push({
        id: `open-${key}`,
        severity: "low",
        title: `"${n.ssid}" nearby is ${sec.label === "No password" ? "open" : "using WEP"}`,
        detail: "Avoid joining it. Others on an unprotected network can see unencrypted traffic.",
        target: { kind: "nearby", key },
      });
  }

  for (const d of snap.devices) {
    if (d.isSelf || d.isGateway) continue;
    const m = meta[d.mac];
    if (m?.blocked && (m.routerBanUntil ?? 0) > Date.now()) continue; // router removed it; may linger in the scan briefly
    if (m?.blocked) {
      findings.push({
        id: `blocked-${d.mac}`,
        severity: "high",
        title: `Ejected device is still connected`,
        detail: `${nameFor(d, m)} is hidden from your map but still on the network. Block it in your router (Wifinity can write the steps) or change the Wi-Fi password.`,
        target: { kind: "device", mac: d.mac },
      });
      continue;
    }
    if (m?.trusted) continue;
    const name = nameFor(d, m);
    if (m?.watch) {
      findings.push({
        id: `watch-${d.mac}`,
        severity: "medium",
        title: `On your watch list: ${name}`,
        detail: "You flagged this device to keep an eye on. Find out who owns it, then trust it or eject it.",
        target: { kind: "device", mac: d.mac },
      });
      continue;
    }
    if (threatened.has(d.mac)) continue;
    if (m?.arrivedLive) {
      threatened.add(d.mac);
      findings.push({
        id: `new-${d.mac}`,
        severity: "high",
        title: `New device joined: ${name}`,
        detail: "It wasn't on your network when Wifinity started. If you don't recognize it, change your Wi-Fi password.",
        target: { kind: "device", mac: d.mac },
      });
    } else if (!d.vendor && !d.hostname && !d.randomized && d.vendor !== undefined)
      findings.push({
        id: `unk-${d.mac}`,
        severity: "medium",
        title: "Unidentified device",
        detail: "No name and no known maker. Check whether it belongs to someone in your home, then trust it.",
        target: { kind: "device", mac: d.mac },
      });
  }

  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  // Other people's open networks are worth knowing about but aren't your network's fault,
  // so they don't cost points. A fake copy of YOUR network does.
  for (const f of findings) f.points = f.target.kind === "nearby" && !f.id.startsWith("twin-") ? 0 : penalty[f.severity];
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + (f.points ?? 0), 0));
  const grade = score >= 85 ? "Secure" : score >= 65 ? "Watch" : score >= 40 ? "At risk" : "Critical";
  return { findings, score, grade, threatened, sunUnderAttack };
}
