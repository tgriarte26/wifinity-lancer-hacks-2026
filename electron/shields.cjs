// Protection features that only touch THIS computer:
//  - traffic(): which apps on this computer are connected where (no packet capture, just the
//    connection list Windows keeps), flagging unencrypted protocols
//  - disconnect(): leave the Wi-Fi network (used by "Shields up" when the router is impersonated)
const { execFile } = require("node:child_process");
const P = require("./parse.cjs");

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) =>
      resolve(err && !stdout ? "" : String(stdout || ""))
    );
  });
}

// Ports that send data without encryption
const PLAIN = { 80: "Web (HTTP)", 21: "FTP", 23: "Telnet", 25: "Email (SMTP)", 110: "Email (POP3)", 143: "Email (IMAP)" };
const KNOWN = { 443: "Web (HTTPS)", 993: "Email (secure)", 5228: "Google services", 5223: "Apple services", 3478: "Calls / video", 53: "DNS" };

function isPrivate(ip) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip);
}

function summarize(conns, names) {
  const apps = new Map();
  for (const c of conns) {
    const name = (names.get(c.pid) || `Process ${c.pid}`).replace(/\.exe$/i, "");
    const app = apps.get(name) || { name, connections: 0, unencrypted: 0, local: 0, destinations: [] };
    app.connections++;
    if (PLAIN[c.port]) app.unencrypted++;
    if (isPrivate(c.ip)) app.local++;
    if (app.destinations.length < 6 && !app.destinations.some((d) => d.ip === c.ip && d.port === c.port))
      app.destinations.push({ ip: c.ip, port: c.port, service: PLAIN[c.port] || KNOWN[c.port] || `Port ${c.port}`, plain: !!PLAIN[c.port], local: isPrivate(c.ip) });
    apps.set(name, app);
  }
  const list = [...apps.values()].sort((a, b) => b.unencrypted - a.unencrypted || b.connections - a.connections);
  return {
    ok: true,
    at: Date.now(),
    total: conns.length,
    unencrypted: conns.filter((c) => PLAIN[c.port]).length,
    apps: list,
  };
}

async function traffic({ demo } = {}) {
  if (demo || process.platform !== "win32") return demoTraffic();
  const [ns, tl] = await Promise.all([run("netstat", ["-ano", "-p", "tcp"]), run("tasklist", ["/fo", "csv", "/nh"])]);
  return summarize(P.parseNetstat(ns), P.parseTasklist(tl));
}

function demoTraffic() {
  const n = (name, pid) => [pid, name];
  const names = new Map([n("chrome.exe", 1), n("Discord.exe", 2), n("Spotify.exe", 3), n("OneDrive.exe", 4), n("Code.exe", 5), n("svchost.exe", 6), n("Wifinity.exe", 7)]);
  const conns = [
    ...Array.from({ length: 14 }, (_, i) => ({ ip: `142.250.72.${10 + i}`, port: 443, pid: 1 })),
    { ip: "93.184.216.34", port: 80, pid: 1 },
    { ip: "162.159.135.232", port: 443, pid: 2 },
    { ip: "162.159.136.232", port: 443, pid: 2 },
    { ip: "35.186.224.25", port: 443, pid: 3 },
    { ip: "35.186.224.47", port: 4070, pid: 3 },
    { ip: "13.107.42.12", port: 443, pid: 4 },
    { ip: "140.82.112.21", port: 443, pid: 5 },
    { ip: "20.42.65.92", port: 443, pid: 6 },
    { ip: "192.168.1.52", port: 80, pid: 6 },
    { ip: "160.79.104.10", port: 443, pid: 7 },
  ];
  return summarize(conns, names);
}

async function dnsServers(interfaceName) {
  if (!interfaceName) return [];
  return P.parseDns(await run("netsh", ["interface", "ipv4", "show", "dnsservers", `name=${interfaceName}`]));
}

async function disconnect({ demo } = {}) {
  if (demo || process.platform !== "win32") return { ok: true, demo: true };
  const out = await run("netsh", ["wlan", "disconnect"]);
  return { ok: /success|completed/i.test(out) || out.trim() === "", output: out.trim() };
}

module.exports = { traffic, dnsServers, disconnect };
