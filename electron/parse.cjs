// Parsers for Windows command output. Kept separate so they can be tested on sample text.

const norm = (mac) => (mac || "").trim().toLowerCase().replace(/-/g, ":");

function kv(line) {
  const m = line.match(/^\s*(.+?)\s+:\s?(.*)$/);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

// netsh wlan show interfaces -> the connected Wi-Fi network
function parseInterfaces(text) {
  const blocks = text.split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const f = {};
    for (const line of block.split(/\r?\n/)) {
      const p = kv(line);
      if (p) f[p[0].toLowerCase()] = p[1];
    }
    if (!f.name || !f.state) continue;
    if (!/^connected/i.test(f.state)) continue;
    return {
      interfaceName: f.name,
      mac: norm(f["physical address"]),
      ssid: f.ssid || "",
      bssid: norm(f["ap bssid"] || f.bssid),
      auth: f.authentication || "",
      cipher: f.cipher || "",
      signal: parseInt(f.signal, 10) || 0,
      band: f.band || "",
      channel: f.channel || "",
      radio: f["radio type"] || "",
    };
  }
  return null;
}

// netsh wlan show networks mode=bssid -> nearby networks
function parseNetworks(text) {
  const nets = [];
  let net = null;
  let bss = null;
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.match(/^SSID \d+\s*:\s?(.*)$/);
    if (s) {
      net = { ssid: s[1].trim(), hidden: !s[1].trim(), auth: "", encryption: "", bssids: [] };
      nets.push(net);
      bss = null;
      continue;
    }
    if (!net) continue;
    const p = kv(raw);
    if (!p) continue;
    const [k, v] = p;
    if (/^BSSID \d+$/i.test(k)) {
      bss = { bssid: norm(v), signal: 0, channel: "", band: "", radio: "" };
      net.bssids.push(bss);
    } else if (/^Authentication$/i.test(k)) net.auth = v;
    else if (/^Encryption$/i.test(k)) net.encryption = v;
    else if (bss && /^Signal$/i.test(k)) bss.signal = parseInt(v, 10) || 0;
    else if (bss && /^Channel$/i.test(k)) bss.channel = v;
    else if (bss && /^Band$/i.test(k)) bss.band = v;
    else if (bss && /^Radio type$/i.test(k)) bss.radio = v;
  }
  for (const n of nets) n.maxSignal = Math.max(0, ...n.bssids.map((b) => b.signal));
  return nets;
}

// route print -4 0.0.0.0 -> { gateway, localIp } for the best default route
function parseRoute(text) {
  let best = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+)/);
    if (m && (!best || +m[3] < best.metric)) best = { gateway: m[1], localIp: m[2], metric: +m[3] };
  }
  return best;
}

const isMulticastIp = (ip) => {
  const a = +ip.split(".")[0];
  return a >= 224 || ip.endsWith(".255");
};
const isSpecialMac = (mac) =>
  mac === "ff:ff:ff:ff:ff:ff" || mac.startsWith("01:00:5e") || mac.startsWith("33:33") || mac === "00:00:00:00:00:00";

// arp -a -> devices seen on the interface that owns localIp
function parseArp(text, localIp) {
  const out = [];
  let inSection = !localIp;
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^Interface:\s*(\d+\.\d+\.\d+\.\d+)/i);
    if (head) {
      inSection = !localIp || head[1] === localIp;
      continue;
    }
    if (!inSection) continue;
    const m = line.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})\s+(\w+)/i);
    if (!m) continue;
    const ip = m[1];
    const mac = norm(m[2]);
    if (isMulticastIp(ip) || isSpecialMac(mac)) continue;
    out.push({ ip, mac, kind: m[3].toLowerCase() });
  }
  return out;
}

// Phones and newer laptops use a random ("private") address per network.
const isRandomizedMac = (mac) => /^[0-9a-f][26ae]/i.test(mac || "");

// netsh interface ipv4 show dnsservers name="Wi-Fi" -> ["192.168.1.1", ...]
function parseDns(text) {
  const out = [];
  let inList = false;
  for (const line of text.split(/\r?\n/)) {
    if (/DNS servers/i.test(line)) inList = true;
    else if (/Register with|^\s*$/i.test(line) && out.length) inList = false;
    if (!inList) continue;
    for (const m of line.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g)) out.push(m[1]);
  }
  return [...new Set(out)];
}

// netstat -ano -p tcp -> established outbound connections
function parseNetstat(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+(\S+):(\d+)\s+ESTABLISHED\s+(\d+)/i);
    if (!m) continue;
    const remote = m[3];
    if (remote.startsWith("127.") || remote === "0.0.0.0" || remote.startsWith("[")) continue;
    out.push({ localPort: +m[2], ip: remote, port: +m[4], pid: +m[5] });
  }
  return out;
}

// tasklist /fo csv /nh -> Map(pid -> "chrome.exe")
function parseTasklist(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (m) map.set(+m[2], m[1]);
  }
  return map;
}

module.exports = {
  parseDns,
  parseNetstat,
  parseTasklist, parseInterfaces, parseNetworks, parseRoute, parseArp, isRandomizedMac, norm };
