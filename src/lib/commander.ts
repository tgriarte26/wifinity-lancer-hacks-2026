// The AI security officer. Builds a compact picture of the network for Claude.
import type { Snapshot } from "../types/api";
import type { DeviceMeta } from "./network";
import type { Finding, Target } from "./risk";
import { nameFor, kindLabel, kindOf, makerText, priorityOf, roleOf, roleLabel } from "./devices";
import { nearbyKey, securityLevel } from "./risk";

type Ok = Extract<Snapshot, { ok: true }>;

export const SYSTEM = `You are the station security officer inside Wifinity, a desktop app that shows a person's Wi-Fi network as a star system: the router is the sun, devices are planets, nearby Wi-Fi networks are stars.
Write like calm mission control, but in plain, practical English a non-technical person understands.
Your words appear in a small panel: no markdown, no headings, no MAC addresses unless asked, explain acronyms briefly.
Be specific to the data given. Never invent devices or facts. Give concrete next steps.
Keep every answer family-friendly: never use profanity, slurs or crude language, even if the user does.`;

function deviceLine(d: Ok["devices"][number], m?: DeviceMeta) {
  const role = roleOf(d, m);
  const tags = [
    role && `role: ${roleLabel[role]}${m?.owner ? ` (belongs to ${m.owner})` : ""}`,
    `priority: ${priorityOf(d, m)}`,
    d.isSelf && "this computer",
    d.isGateway && "router",
    m?.trusted && "trusted by user",
    m?.arrivedLive && !m?.trusted && "joined after monitoring started",
    d.randomized && "uses a private (randomized) Wi-Fi address",
  ].filter(Boolean);
  return `- ${nameFor(d, m)} (${kindLabel[kindOf(d)]}, maker: ${makerText(d)}, IP ${d.ip})${tags.length ? " [" + tags.join(", ") + "]" : ""}`;
}

export function summarize(snap: Ok, meta: Record<string, DeviceMeta>, findings: Finding[], score: number) {
  const c = snap.connection;
  const sec = c ? securityLevel(c.auth, c.cipher).label : "unknown";
  const nearby = (snap.networks ?? [])
    .slice(0, 12)
    .map((n) => `- "${n.ssid || "hidden"}" ${securityLevel(n.auth, n.encryption).label}, signal ${n.maxSignal}%`)
    .join("\n");
  return `Network: "${c?.ssid ?? "unknown"}", security ${sec}, ${c?.band ?? ""} signal ${c?.signal ?? "?"}%.
Health score: ${score}/100.
Devices (${snap.devices.length}):
${snap.devices.map((d) => deviceLine(d, meta[d.mac])).join("\n")}
Findings:
${findings.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join("\n") || "- none"}
Nearby networks:
${nearby || "- none visible"}`;
}

export function briefingPrompt(summary: string) {
  return `${summary}

Give a security briefing for this network in at most 85 words. Start with the overall status, then the single most important thing to do. If everything is fine, say so and mention one good habit.`;
}

export function explainPrompt(summary: string, target: Target, snap: Ok, meta: Record<string, DeviceMeta>) {
  let subject = "";
  if (target.kind === "home") subject = `the user's own Wi-Fi network "${snap.connection?.ssid}" and its router`;
  if (target.kind === "device") {
    const d = snap.devices.find((x) => x.mac === target.mac && !x.isGateway) ?? snap.devices.find((x) => x.mac === target.mac);
    subject = d ? `this device:\n${deviceLine(d, meta[d.mac])}` : "a device that has left";
  }
  if (target.kind === "nearby") {
    const n = (snap.networks ?? []).find((x) => nearbyKey(x) === target.key);
    subject = n
      ? `the nearby network "${n.ssid || "hidden"}" (${securityLevel(n.auth, n.encryption).label}, signal ${n.maxSignal}%)`
      : "a nearby network";
  }
  return `${summary}

Explain ${subject}
In at most 70 words: what it most likely is, whether it is a risk, and exactly what the user should do.`;
}

export function planPrompt(snap: Ok, meta: Record<string, DeviceMeta>) {
  const router = snap.devices.find((d) => d.isGateway);
  const maker = router ? makerText(router) : "unknown";
  const rows = snap.devices
    .filter((d) => !d.isGateway)
    .map((d) => `- ${nameFor(d, meta[d.mac])}: priority ${priorityOf(d, meta[d.mac])}, IP ${d.ip}, MAC ${d.mac.toUpperCase()}`)
    .join("\n");
  return `Router maker: ${maker}. Router admin page: http://${snap.gateway.ip}
Devices and the Wi-Fi priority the user wants:
${rows}

Use a short numbered list (max 7 steps) and you may include the MAC addresses.
Write step-by-step instructions to set these priorities in this router's QoS / device priority settings, using the menu names this maker typically uses.
If the maker is unknown, give the most common path and say menu names vary. End with one sentence on what to do if the router has no QoS option.`;
}

export function blockPrompt(snap: Ok, mac: string, meta: Record<string, DeviceMeta>) {
  const router = snap.devices.find((d) => d.isGateway);
  const d = snap.devices.find((x) => x.mac === mac && !x.isGateway) ?? snap.devices.find((x) => x.mac === mac);
  return `Router maker: ${router ? makerText(router) : "unknown"}. Router admin page: http://${snap.gateway.ip}
Device to block: ${d ? nameFor(d, meta[mac]) : "unknown"}, IP ${d?.ip ?? "?"}, MAC ${mac.toUpperCase()}${d?.randomized ? " (private/randomized address: it may change, so also suggest changing the Wi-Fi password)" : ""}.

Use a short numbered list (max 6 steps) and include the MAC address. Explain how to block this device in this router's admin page (device list / access control / MAC filter), using the menu names this maker typically uses. If the maker is unknown, give the most common path and say menu names vary.`;
}
