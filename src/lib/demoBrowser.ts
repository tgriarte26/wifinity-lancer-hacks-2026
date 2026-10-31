// Demo network used when the UI runs in a plain browser (npm run web).
import type { Snapshot } from "../types/api";

type DemoDevice = { ip: string; mac: string; vendor: string | null; hostname: string; isGateway?: boolean; isSelf?: boolean };
const base: DemoDevice[] = [
  { ip: "192.168.1.1", mac: "7c:10:c9:4e:21:08", vendor: "ASUSTek COMPUTER INC.", hostname: "RT-AX58U", isGateway: true },
  { ip: "192.168.1.23", mac: "a4:b1:c1:12:34:56", vendor: "Intel Corporate", hostname: "ASADBEKSPC", isSelf: true },
  { ip: "192.168.1.31", mac: "6a:2f:91:0c:77:e1", vendor: null, hostname: "Asads-iPhone" },
  { ip: "192.168.1.40", mac: "f8:4d:89:61:a0:3c", vendor: "Apple, Inc.", hostname: "Zafars-MacBook-Air" },
  { ip: "192.168.1.52", mac: "fc:a1:83:2e:90:14", vendor: "Amazon Technologies Inc.", hostname: "echo-kitchen" },
  { ip: "192.168.1.67", mac: "8c:79:f5:3a:11:9d", vendor: "Samsung Electronics Co.,Ltd", hostname: "Samsung-TV" },
  { ip: "192.168.1.88", mac: "00:1e:c0:7b:44:2a", vendor: null, hostname: "" },
];
const nets: [string, string, string, number, number][] = [
  ["Kurbonov Home", "WPA2-Personal", "CCMP", 92, 44],
  ["Kurbonov Home", "Open", "None", 58, 44],
  ["NETGEAR-5G", "WPA3-Personal", "GCMP", 47, 44],
  ["xfinitywifi", "Open", "None", 41, 48],
  ["DIRECT-HP OfficeJet", "WPA2-Personal", "CCMP", 33, 6],
  ["Linksys00422", "WEP", "WEP", 26, 1],
  ["", "WPA2-Personal", "CCMP", 19, 44],
  ["TP-Link_8F2C", "WPA-Personal", "TKIP", 15, 11],
];
const extra: typeof base = [];
// Preview-only stress test: localStorage "orbit-stress" = N adds N extra named gadgets.
try {
  const n = Number(localStorage.getItem("orbit-stress") || 0);
  const names = ["Pixel-8", "iPad", "Ring-Doorbell", "Nest-Thermostat", "PS5", "Roku-Ultra", "Galaxy-S24", "Kindle", "HP-LaserJet", "Sonos-One", "Apple-Watch", "Xbox", "Chromecast", "Dell-XPS", "Hue-Bridge", "Fire-TV", "MacBook-Pro"];
  const vendors = ["Google, Inc.", "Apple, Inc.", "Ring LLC", "Nest Labs Inc.", "Sony Interactive Entertainment Inc.", "Roku, Inc", "Samsung Electronics Co.,Ltd", "Amazon Technologies Inc.", "HP Inc.", "Sonos, Inc.", "Apple, Inc.", "Microsoft Corporation", "Google, Inc.", "Dell Inc.", "Signify B.V.", "Amazon Technologies Inc.", "Apple, Inc."];
  for (let i = 0; i < n; i++)
    extra.push({ ip: `192.168.1.${140 + i}`, mac: `b0:${(16 + i).toString(16)}:4c:${(32 + i * 3).toString(16)}:9e:${(48 + i * 7).toString(16)}`, vendor: vendors[i % vendors.length], hostname: names[i % names.length] });
} catch {}
let attack = false;
const ATTACKER: DemoDevice = { ip: "192.168.1.66", mac: "da:7e:13:37:c0:de", vendor: null, hostname: "" };

export function browserAttack(on: boolean) {
  attack = on;
}

export function browserArrive() {
  const n = extra.length;
  extra.push({ ip: `192.168.1.${120 + n}`, mac: `3e:${(0x40 + n).toString(16)}:7a:91:c2:5d`, vendor: null, hostname: "" });
}

export async function browserDemo(): Promise<Snapshot> {
  await new Promise((r) => setTimeout(r, 500));
  return {
    ok: true,
    demo: true,
    at: Date.now(),
    permissionIssue: false,
    connection: {
      interfaceName: "Wi-Fi", mac: "a4:b1:c1:12:34:56", ssid: "Kurbonov Home", bssid: "7c:10:c9:4e:21:0c",
      auth: "WPA2-Personal", cipher: "CCMP", signal: 92, band: "5 GHz", channel: "44", radio: "802.11ax",
    },
    gateway: { ip: "192.168.1.1", mac: attack ? ATTACKER.mac : "7c:10:c9:4e:21:08" },
    dns: attack ? [ATTACKER.ip] : ["192.168.1.1"],
    self: { ip: "192.168.1.23", mac: "a4:b1:c1:12:34:56" },
    devices: [...base.map((d) => (attack && d.isGateway ? { ...d, mac: ATTACKER.mac, vendor: null } : d)), ...extra, ...(attack ? [ATTACKER] : [])].map((d) => ({
      ...d, randomized: /^[0-9a-f][26ae]/i.test(d.mac), isGateway: !!d.isGateway, isSelf: !!d.isSelf,
    })),
    networks: nets.map(([ssid, auth, encryption, sig, ch], i) => ({
      ssid, hidden: !ssid, auth, encryption, maxSignal: sig,
      bssids: [{ bssid: i === 0 ? "7c:10:c9:4e:21:0c" : `02:aa:bb:cc:dd:${(16 + i).toString(16)}`, signal: sig, channel: String(ch), band: ch > 14 ? "5 GHz" : "2.4 GHz", radio: "" }],
    })),
  };
}

export async function browserTraffic(): Promise<import("../types/api").Traffic> {
  const apps = [
    { name: "chrome", connections: 15, unencrypted: 1, local: 0, destinations: [
      { ip: "142.250.72.14", port: 443, service: "Web (HTTPS)", plain: false, local: false },
      { ip: "93.184.216.34", port: 80, service: "Web (HTTP)", plain: true, local: false } ] },
    { name: "svchost", connections: 2, unencrypted: 1, local: 1, destinations: [
      { ip: "192.168.1.52", port: 80, service: "Web (HTTP)", plain: true, local: true } ] },
    { name: "Discord", connections: 2, unencrypted: 0, local: 0, destinations: [
      { ip: "162.159.135.232", port: 443, service: "Web (HTTPS)", plain: false, local: false } ] },
    { name: "Spotify", connections: 2, unencrypted: 0, local: 0, destinations: [
      { ip: "35.186.224.25", port: 443, service: "Web (HTTPS)", plain: false, local: false } ] },
    { name: "OneDrive", connections: 1, unencrypted: 0, local: 0, destinations: [
      { ip: "13.107.42.12", port: 443, service: "Web (HTTPS)", plain: false, local: false } ] },
    { name: "Code", connections: 1, unencrypted: 0, local: 0, destinations: [
      { ip: "140.82.112.21", port: 443, service: "Web (HTTPS)", plain: false, local: false } ] },
  ];
  return { ok: true, at: Date.now(), total: 23, unencrypted: 2, apps };
}
