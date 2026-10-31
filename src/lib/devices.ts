// How devices are named and classified for people, not for the network.
import type { Device } from "../types/api";

export type Kind = "router" | "computer" | "phone" | "tv" | "speaker" | "printer" | "console" | "unknown";

export function shortVendor(v?: string | null) {
  if (!v) return "";
  const first = v
    .replace(/,?\s*(inc|ltd|llc|corp|corporation|co|technologies|technology|electronics|international|limited|gmbh)\.?\b.*$/i, "")
    .trim();
  return first.split(/\s+/).slice(0, 2).join(" ").replace(/,$/, "");
}

export function kindOf(d: Device): Kind {
  if (d.isGateway) return "router";
  const s = `${d.hostname} ${d.vendor ?? ""}`.toLowerCase();
  if (/iphone|ipad|android|galaxy|pixel|oneplus|motorola|xiaomi|redmi|phone/.test(s)) return "phone";
  if (/tv|roku|chromecast|fire|vizio|lg elec|tcl|hisense|apple tv/.test(s)) return "tv";
  if (/echo|alexa|nest|google home|sonos|homepod|speaker/.test(s)) return "speaker";
  if (/printer|officejet|epson|canon|brother|laserjet|hp inc/.test(s)) return "printer";
  if (/xbox|playstation|sony interactive|nintendo|switch/.test(s)) return "console";
  if (d.isSelf || /macbook|imac|desktop|laptop|pc\b|intel|dell|lenovo|asus|hewlett|microsoft|surface|liteon|azurewave/.test(s))
    return "computer";
  if (d.randomized) return "phone"; // private addresses are almost always phones, tablets or laptops
  return "unknown";
}

export const kindLabel: Record<Kind, string> = {
  router: "Router",
  computer: "Computer",
  phone: "Phone or tablet",
  tv: "TV or streamer",
  speaker: "Smart speaker",
  printer: "Printer",
  console: "Game console",
  unknown: "Unidentified",
};

export function displayName(d: Device, custom?: string) {
  if (custom) return custom;
  if (d.isSelf) return "This computer";
  if (d.isGateway) return "Router";
  if (d.hostname) return d.hostname.replace(/[-_]/g, " ");
  const v = shortVendor(d.vendor);
  if (v) return `${v} ${kindLabel[kindOf(d)].split(" ")[0].toLowerCase()}`.replace(" unidentified", " device");
  const tail = d.ip.split(".").pop();
  if (d.randomized) return `Private device ${tail}`;
  return `Unknown device ${tail}`;
}

export function makerText(d: Device) {
  if (d.randomized) return "Hidden (private Wi-Fi address)";
  if (d.vendor === undefined) return "Looking up…";
  return d.vendor || "Unknown maker";
}

// ---------- Roles and priority ----------
export type Role = "crew" | "systems" | "guest";
export type Priority = "high" | "normal" | "low";

export const roleLabel: Record<Role, string> = { crew: "Crew", systems: "Systems", guest: "Guest" };
export const roleHint: Record<Role, string> = {
  crew: "A person's phone, laptop or tablet",
  systems: "Appliances: TV, speakers, printer, smart home",
  guest: "A visitor's device",
};
export const priorityLabel: Record<Priority, string> = { high: "High", normal: "Normal", low: "Low" };

/** Best guess at a role from what the device looks like. */
export function suggestRole(d: Device): Role | null {
  const k = kindOf(d);
  if (k === "phone" || k === "computer") return "crew";
  if (k === "tv" || k === "speaker" || k === "printer" || k === "console") return "systems";
  return null;
}

export function roleOf(d: Device, m?: { role?: Role }): Role | null {
  return m?.role ?? suggestRole(d);
}

export function priorityOf(d: Device, m?: { role?: Role; priority?: Priority }): Priority {
  if (m?.priority) return m.priority;
  return roleOf(d, m) === "guest" ? "low" : "normal";
}

/** The name shown everywhere: owner-based for Crew ("Asad's phone"), else custom/host/maker name. */
export function nameFor(d: Device, m?: { name?: string; owner?: string; role?: Role }) {
  if (m?.name) return m.name;
  if (m?.owner && roleOf(d, m) === "crew") {
    const k = kindOf(d);
    return `${m.owner}'s ${k === "phone" ? "phone" : k === "computer" ? "computer" : "device"}`;
  }
  return displayName(d);
}
