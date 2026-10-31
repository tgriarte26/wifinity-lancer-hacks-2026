const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Keys saved in Settings are encrypted by Windows (Electron safeStorage) and never sent back to
// the interface. key.txt still works as a fallback for the Claude key.
// Router control: OpenWrt's local JSON-RPC (ubus) API. Orbit asks the router to remove a client;
// it never sends attack traffic itself.
function createServices({ app, safeStorage, fetchImpl = fetch }) {
  let secrets = {},
    mode = "user",
    router = null;
  const file = path.join(app.getPath("userData"), "orbit-secrets.bin");
  function init() {
    try {
      if (safeStorage.isEncryptionAvailable())
        secrets = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    } catch {}
    apply();
  }
  function apply() {
    if (secrets.claude) {
      process.env.ANTHROPIC_API_KEY = secrets.claude;
      process.env.ORBIT_SAVED_KEY = "1";
    }
    if (secrets.model) process.env.AI_MODEL = secrets.model;
  }
  function configure(input) {
    const next = { ...secrets };
    for (const k of ["claude", "eleven", "model"])
      if (typeof input?.[k] === "string" && input[k].trim())
        next[k] = input[k].trim().replace(/^["']|["']$/g, "").replace(/^(xi-api-key|ELEVENLABS_API_KEY|ANTHROPIC_API_KEY)\s*[:=]\s*/i, "").replace(/\s+/g, "").slice(0, 500);
    if (input?.eleven?.trim() && !next.eleven.startsWith("sk_"))
      throw new Error(
        "That isn't an ElevenLabs API key. On elevenlabs.io go to Developers → API Keys → Create key, and copy the one that starts with sk_ (it's only shown once).",
      );
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(
        "Windows credential encryption is unavailable. Keys were not saved.",
      );
    fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(next)));
    secrets = next;
    apply();
    return status();
  }
  function elevenKey() {
    return (secrets.eleven || process.env.ELEVENLABS_API_KEY || "").trim();
  }
  function status() {
    apply();
    return {
      ai: !!process.env.ANTHROPIC_API_KEY,
      eleven: elevenKey().startsWith("sk_"),
      elevenBad: !!elevenKey() && !elevenKey().startsWith("sk_"),
      model: process.env.AI_MODEL || "claude-sonnet-5-5",
    };
  }
  async function eleven(route, body) {
    const key = elevenKey();
    if (!key) throw new Error("Add your ElevenLabs key in Settings first.");
    const res = await fetchImpl("https://api.elevenlabs.io" + route, {
      method: body ? "POST" : "GET",
      headers: {
        "xi-api-key": key,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!res.ok) {
      // Surface ElevenLabs' own explanation (bad key, missing permission, quota, blocked free tier…)
      let detail = "";
      try {
        const body = await res.json();
        const d = body?.detail;
        detail = typeof d === "string" ? d : d?.message || d?.status || JSON.stringify(d || body).slice(0, 200);
      } catch {}
      throw new Error(`ElevenLabs error ${res.status}${detail ? ": " + detail : ". Check your key, voice access and credits."}`);
    }
    return res;
  }
  async function voices() {
    const data = await (await eleven("/v1/voices")).json();
    return (data.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      description: v.description || "",
    }));
  }
  async function speech({ text, voice }) {
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 6000 ||
      !/^[\w-]{1,100}$/.test(voice)
    )
      throw new Error(
        "Choose a voice and a message of up to 6,000 characters.",
      );
    const res = await eleven(
      `/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      { text, model_id: "eleven_flash_v2_5" },
    );
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  }
  function endpoint(value, allowHttp) {
    const u = new URL(value);
    const parts = u.hostname.split(".").map(Number);
    const privateIp =
      parts.length === 4 &&
      parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (parts[0] === 10 ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
    if (
      !privateIp ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !["https:", ...(allowHttp ? ["http:"] : [])].includes(u.protocol)
    )
      throw new Error(
        "Use a private LAN IP address over HTTPS. HTTP requires the local HTTP option.",
      );
    return u.origin + "/ubus";
  }
  async function rpc(connection, session, object, method, args) {
    const res = await fetchImpl(connection.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "call",
        params: [session, object, method, args],
      }),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!res.ok)
      throw new Error(
        `Router returned ${res.status}. Check that uhttpd-mod-ubus is installed and your account has access.`,
      );
    const data = await res.json();
    if (data.error || !Array.isArray(data.result) || data.result[0] !== 0)
      throw new Error(
        "Router denied the request or the session expired. Reconnect with an authorized account.",
      );
    return data.result[1] || {};
  }
  async function refreshRouter(connection = router) {
    if (!connection) return { connected: false, interfaces: [], clients: [] };
    const listing = await fetchImpl(connection.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "list",
        params: ["hostapd.*"],
      }),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!listing.ok) throw new Error("Unable to list router radios.");
    const data = await listing.json();
    if (data.error || !data.result || Array.isArray(data.result))
      throw new Error("Router radio discovery failed. Check ubus permissions.");
    const interfaces = Object.keys(data.result).filter((k) =>
      /^hostapd\.[\w.-]+$/.test(k),
    );
    const clients = [];
    for (const radio of interfaces) {
      const info = await rpc(
        connection,
        connection.session,
        radio,
        "get_clients",
        {},
      );
      for (const [mac, client] of Object.entries(info.clients || {}))
        clients.push({
          mac: mac.toLowerCase(),
          radio,
          authorized: !!client.authorized,
          signal: client.signal ?? null,
        });
    }
    connection.clients = clients;
    connection.interfaces = interfaces;
    return {
      connected: true,
      interfaces,
      clients,
      host: new URL(connection.url).host,
    };
  }
  async function connect(input) {
    if (mode !== "admin") throw new Error("Switch to admin mode first.");
    router = null;
    const connection = { url: endpoint(input.url, input.allowHttp === true) };
    const auth = await rpc(
      connection,
      "00000000000000000000000000000000",
      "session",
      "login",
      { username: input.username, password: input.password, timeout: 300 },
    );
    if (!auth.ubus_rpc_session)
      throw new Error("Router did not return a session.");
    connection.session = auth.ubus_rpc_session;
    const out = await refreshRouter(connection);
    if (mode !== "admin")
      throw new Error("Connection canceled because you left Admin mode.");
    if (!out.interfaces.length)
      throw new Error(
        "No accessible hostapd radios. This router or account does not expose Wi-Fi client controls.",
      );
    router = connection;
    return out;
  }
  async function kick({ mac, seconds = 300 }) {
    if (mode !== "admin" || !router)
      throw new Error("Admin mode and an authenticated router are required.");
    if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac))
      throw new Error("Invalid device address.");
    mac = mac.toLowerCase();
    const own = Object.values(os.networkInterfaces())
      .flat()
      .filter(Boolean)
      .map((n) => n.mac.toLowerCase());
    if (own.includes(mac))
      throw new Error(
        "Wifinity will not disconnect this computer through the router. Use the personal disconnect control.",
      );
    const connection = router;
    await refreshRouter(connection);
    if (mode !== "admin" || router !== connection)
      throw new Error(
        "Router action canceled because the connection or mode changed.",
      );
    const matches = connection.clients.filter((c) => c.mac === mac);
    if (!matches.length)
      throw new Error(
        "This device is not currently connected to an accessible Wi-Fi radio. Wired clients cannot be kicked here.",
      );
    const duration = seconds === 0 ? 0 : 300;
    const done = [];
    for (const c of matches) {
      try {
        if (mode !== "admin" || router !== connection)
          throw new Error("Mode or router connection changed.");
        await rpc(connection, connection.session, c.radio, "del_client", {
          addr: mac,
          reason: 5,
          deauth: true,
          ban_time: duration * 1000,
        });
        done.push(c.radio);
      } catch (e) {
        throw new Error(
          `${done.length ? "Partial result: " + done.join(", ") + " accepted; " : ""}${e.message}`,
        );
      }
    }
    const checks = [];
    for (const radio of done) {
      try {
        const clients = await rpc(
          connection,
          connection.session,
          radio,
          "get_clients",
          {},
        );
        const bans = duration
          ? await rpc(connection, connection.session, radio, "list_bans", {})
          : { clients: [] };
        checks.push({
          radio,
          absent: !Object.keys(clients.clients || {}).some(
            (m) => m.toLowerCase() === mac,
          ),
          banListed:
            !duration ||
            (Array.isArray(bans.clients) &&
              bans.clients.some((m) => String(m).toLowerCase() === mac)),
        });
      } catch {
        checks.push({ radio, absent: false, banListed: false });
      }
    }
    return {
      ok: true,
      seconds: duration,
      radios: done,
      verified:
        checks.length === done.length &&
        checks.every((c) => c.absent && c.banListed),
      checks,
    };
  }
  return {
    hasEleven: () => elevenKey().startsWith("sk_"),
    init,
    configure,
    status,
    voices,
    speech,
    connect,
    refreshRouter,
    kick,
    disconnectRouter: () => {
      router = null;
    },
    setMode: (value) => {
      if (!["user", "admin"].includes(value)) throw new Error("Invalid mode");
      mode = value;
      if (value === "user") router = null;
      return mode;
    },
  };
}
module.exports = { createServices };
