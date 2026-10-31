// Network scanner. Passive and local only: it reads what Windows already knows
// about your Wi-Fi and the devices on your own network. Nothing is attacked or probed.
const { execFile } = require("node:child_process");
const dgram = require("node:dgram");
const dns = require("node:dns");
const fs = require("node:fs");
const path = require("node:path");
const P = require("./parse.cjs");
const shields = require("./shields.cjs");

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      resolve(err && !stdout ? "" : String(stdout || ""))
    );
  });
}

// Sending one tiny UDP packet to every address makes Windows look each device up,
// so they show up in the ARP table. (Port 9 is the "discard" port.)
function sweep(localIp) {
  return new Promise((resolve) => {
    const base = localIp.split(".").slice(0, 3).join(".");
    const sock = dgram.createSocket("udp4");
    sock.on("error", () => {});
    const buf = Buffer.from([0]);
    for (let i = 1; i < 255; i++) {
      const ip = `${base}.${i}`;
      if (ip !== localIp) sock.send(buf, 9, ip, () => {});
    }
    setTimeout(() => {
      try {
        sock.close();
      } catch {}
      resolve();
    }, 1500);
  });
}

// Device names from the router's DNS (e.g. "Asads-iPhone.lan"). Missing names are normal.
const nameCache = new Map();
async function hostname(ip, dnsServer) {
  if (nameCache.has(ip)) return nameCache.get(ip);
  const r = new dns.promises.Resolver({ timeout: 600, tries: 1 });
  if (dnsServer) r.setServers([dnsServer]);
  let name = "";
  try {
    name = ((await r.reverse(ip))[0] || "").replace(/\.(lan|local|home|localdomain|attlocal\.net)$/i, "");
  } catch {}
  nameCache.set(ip, name);
  return name;
}

// Maker lookup from the first half of the hardware address. Cached on disk; the free
// lookup service allows about one request per second, so it fills in over a few scans.
let vendorFile;
let vendors = {};
const pending = [];
let lookupRunning = false;
function initVendors(dir) {
  vendorFile = path.join(dir, "vendors.json");
  try {
    vendors = JSON.parse(fs.readFileSync(vendorFile, "utf8"));
  } catch {}
}
function vendorOf(mac) {
  const oui = mac.slice(0, 8);
  if (P.isRandomizedMac(mac)) return null;
  if (oui in vendors) return vendors[oui];
  if (!pending.includes(oui)) pending.push(oui);
  pumpVendors();
  return undefined; // still looking it up
}
async function pumpVendors() {
  if (lookupRunning) return;
  lookupRunning = true;
  while (pending.length) {
    const oui = pending.shift();
    try {
      const res = await fetch(`https://api.macvendors.com/${encodeURIComponent(oui)}`);
      if (res.status === 200) vendors[oui] = (await res.text()).trim();
      else if (res.status === 404) vendors[oui] = null;
      else pending.push(oui); // rate limited: try again later
    } catch {
      vendors[oui] = vendors[oui] ?? undefined;
    }
    try {
      fs.writeFileSync(vendorFile, JSON.stringify(vendors));
    } catch {}
    await new Promise((r) => setTimeout(r, 1100));
  }
  lookupRunning = false;
}

async function scanWindows({ sweepFirst = true, wifi = true } = {}) {
  const at = Date.now();
  const [ifaceText, routeText] = await Promise.all([
    run("netsh", ["wlan", "show", "interfaces"]),
    run("route", ["print", "-4", "0.0.0.0"]),
  ]);
  const permissionIssue = /location permission/i.test(ifaceText);
  const connection = P.parseInterfaces(ifaceText);
  const route = P.parseRoute(routeText);
  if (!route) {
    return { ok: false, at, error: "This computer isn't connected to a network. Connect to Wi-Fi and scan again." };
  }

  if (sweepFirst) await sweep(route.localIp);
  const [arpText, netText, dnsList] = await Promise.all([
    run("arp", ["-a"]),
    wifi ? run("netsh", ["wlan", "show", "networks", "mode=bssid"]) : Promise.resolve(""),
    wifi && connection ? shields.dnsServers(connection.interfaceName) : Promise.resolve(null),
  ]);

  const seen = P.parseArp(arpText, route.localIp);
  const self = { ip: route.localIp, mac: connection?.mac || "" };
  const list = [...seen.filter((d) => d.ip !== self.ip), { ip: self.ip, mac: self.mac, kind: "self" }];

  const devices = await Promise.all(
    list.map(async (d) => ({
      ip: d.ip,
      mac: d.mac,
      randomized: P.isRandomizedMac(d.mac),
      vendor: d.mac ? vendorOf(d.mac) : null,
      hostname: d.kind === "self" ? require("node:os").hostname() : await hostname(d.ip, route.gateway),
      isGateway: d.ip === route.gateway,
      isSelf: d.kind === "self",
    }))
  );

  return {
    ok: true,
    demo: false,
    at,
    permissionIssue: permissionIssue || /location permission/i.test(netText),
    connection,
    gateway: { ip: route.gateway, mac: seen.find((d) => d.ip === route.gateway)?.mac || "" },
    self,
    devices,
    networks: wifi ? P.parseNetworks(netText) : null,
    dns: dnsList,
  };
}

// ---------- Demo mode: a believable network for rehearsals and as a backup ----------
const demo = {
  devices: [
    { ip: "192.168.1.1", mac: "7c:10:c9:4e:21:08", vendor: "ASUSTek COMPUTER INC.", hostname: "RT-AX58U", isGateway: true },
    { ip: "192.168.1.23", mac: "a4:b1:c1:12:34:56", vendor: "Intel Corporate", hostname: "ASADBEKSPC", isSelf: true },
    { ip: "192.168.1.31", mac: "6a:2f:91:0c:77:e1", vendor: null, hostname: "Asads-iPhone" },
    { ip: "192.168.1.40", mac: "f8:4d:89:61:a0:3c", vendor: "Apple, Inc.", hostname: "Zafars-MacBook-Air" },
    { ip: "192.168.1.52", mac: "fc:a1:83:2e:90:14", vendor: "Amazon Technologies Inc.", hostname: "echo-kitchen" },
    { ip: "192.168.1.67", mac: "8c:79:f5:3a:11:9d", vendor: "Samsung Electronics Co.,Ltd", hostname: "Samsung-TV" },
    { ip: "192.168.1.88", mac: "00:1e:c0:7b:44:2a", vendor: "Hon Hai Precision Ind. Co.,Ltd.", hostname: "" },
  ],
  networks: [
    { ssid: "Kurbonov Home", auth: "WPA2-Personal", encryption: "CCMP", sig: 92, ch: 44 },
    { ssid: "Kurbonov Home", auth: "Open", encryption: "None", sig: 58, ch: 44 },
    { ssid: "NETGEAR-5G", auth: "WPA3-Personal", encryption: "GCMP", sig: 47, ch: 44 },
    { ssid: "xfinitywifi", auth: "Open", encryption: "None", sig: 41, ch: 48 },
    { ssid: "DIRECT-HP OfficeJet", auth: "WPA2-Personal", encryption: "CCMP", sig: 33, ch: 6 },
    { ssid: "Linksys00422", auth: "WEP", encryption: "WEP", sig: 26, ch: 1 },
    { ssid: "", auth: "WPA2-Personal", encryption: "CCMP", sig: 19, ch: 44 },
    { ssid: "TP-Link_8F2C", auth: "WPA-Personal", encryption: "TKIP", sig: 15, ch: 11 },
  ],
};
let demoExtra = [];
let demoAttack = false;
const ATTACKER = { ip: "192.168.1.66", mac: "da:7e:13:37:c0:de", vendor: null, hostname: "" };

function scanDemo() {
  const gwMac = demoAttack ? ATTACKER.mac : "7c:10:c9:4e:21:08";
  const list = [
    ...demo.devices.map((d) => (demoAttack && d.isGateway ? { ...d, mac: ATTACKER.mac, vendor: null } : d)),
    ...demoExtra,
    ...(demoAttack ? [ATTACKER] : []),
  ];
  const devices = list.map((d) => ({
    ip: d.ip,
    mac: d.mac,
    vendor: d.vendor,
    hostname: d.hostname,
    randomized: P.isRandomizedMac(d.mac),
    isGateway: !!d.isGateway,
    isSelf: !!d.isSelf,
  }));
  return {
    ok: true,
    demo: true,
    at: Date.now(),
    permissionIssue: false,
    connection: {
      interfaceName: "Wi-Fi",
      mac: "a4:b1:c1:12:34:56",
      ssid: "Kurbonov Home",
      bssid: "7c:10:c9:4e:21:0c",
      auth: "WPA2-Personal",
      cipher: "CCMP",
      signal: 92,
      band: "5 GHz",
      channel: "44",
      radio: "802.11ax",
    },
    gateway: { ip: "192.168.1.1", mac: gwMac },
    dns: demoAttack ? [ATTACKER.ip] : ["192.168.1.1"],
    self: { ip: "192.168.1.23", mac: "a4:b1:c1:12:34:56" },
    devices,
    networks: demo.networks.map((n, i) => ({
      ssid: n.ssid,
      hidden: !n.ssid,
      auth: n.auth,
      encryption: n.encryption,
      maxSignal: Math.max(5, Math.min(100, n.sig + Math.round(Math.random() * 6 - 3))),
      bssids: [{ bssid: i === 0 ? "7c:10:c9:4e:21:0c" : `02:aa:bb:cc:dd:${(16 + i).toString(16)}`, signal: n.sig, channel: String(n.ch), band: n.ch > 14 ? "5 GHz" : "2.4 GHz", radio: "" }],
    })),
  };
}

// Adds a stranger to the demo network so the arrival alert can be rehearsed.
function demoArrive() {
  const n = demoExtra.length;
  demoExtra.push({
    ip: `192.168.1.${120 + n}`,
    mac: `3e:${(0x40 + n).toString(16)}:7a:91:c2:5d`,
    vendor: null,
    hostname: "",
  });
}
function demoReset() {
  demoExtra = [];
  demoAttack = false;
}
// Pretends a device is answering as the router (what ARP spoofing looks like).
function setDemoAttack(on) {
  demoAttack = !!on;
}

function scan(opts = {}) {
  if (opts.demo || process.platform !== "win32") return Promise.resolve(scanDemo());
  return scanWindows(opts).catch((err) => ({ ok: false, at: Date.now(), error: `Scan failed: ${err.message}` }));
}

module.exports = { scan, initVendors, demoArrive, demoReset, setDemoAttack };
