// Electron main process: owns the window and every call that needs an API key.
const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");

const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });

// The Claude key lives in key.txt next to the app (one line; lines starting with # are notes).
// Read on every use, so pasting a key works without restarting.
function loadKey() {
  try {
    const line = fs
      .readFileSync(path.join(ROOT, "key.txt"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (line && !process.env.ORBIT_SAVED_KEY) process.env.ANTHROPIC_API_KEY = line;
  } catch {}
}
loadKey();

// One Orbit at a time: opening it again just brings the window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId("Wifinity");

const ai = require("./ai.cjs");
const scanner = require("./scan.cjs");
const shields = require("./shields.cjs");
const { createServices } = require("./services.cjs");
const services = createServices({ app, safeStorage });

const isDev = !app.isPackaged && !process.argv.includes("--prod");
const DEV_URL = "http://127.0.0.1:5173";

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    frame: false, // custom title bar lives in the React app
    title: "Wifinity",
    icon: path.join(ROOT, "assets", "orbit.ico"),
    backgroundColor: "#0E1430",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    win = null;
    app.quit();
  });
  win.on("maximize", () => win.webContents.send("win:state", { maximized: true }));
  win.on("unmaximize", () => win.webContents.send("win:state", { maximized: false }));

  // Links open in the real browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// Window controls
ipcMain.on("win:minimize", () => win?.minimize());
ipcMain.on("win:toggle-maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on("win:close", () => win?.close());

// Which keys are configured (never sends the keys themselves)
ipcMain.handle("env:status", () => {
  loadKey();
  return services.status();
});

// Keys, voice and router control (see services.cjs)
const safe = (fn) => async (_e, arg) => {
  try {
    return { ok: true, value: await fn(arg) };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
};
ipcMain.handle("keys:save", safe((input) => services.configure(input)));
ipcMain.handle("voice:list", safe(() => services.voices()));
ipcMain.handle("voice:speak", safe((req) => services.speech(req)));
ipcMain.handle("mode:set", safe((m) => services.setMode(m)));
ipcMain.handle("router:connect", safe((input) => services.connect(input)));
ipcMain.on("launch:demo", (e) => (e.returnValue = process.argv.includes("--demo")));
ipcMain.handle("router:refresh", safe(() => services.refreshRouter()));
ipcMain.handle("router:kick", safe((req) => services.kick(req)));
ipcMain.handle("router:disconnect", safe(() => services.disconnectRouter()));
ipcMain.handle("wifi:disconnect", safe(() => shields.disconnect({})));

// Planet maps (CC BY 4.0, Solar System Scope). Sent as data URLs so the renderer can read
// their pixels (images loaded straight from disk would be locked by browser security).
const TEXTURES = new Set(["earth", "clouds", "earth-night", "sky", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "sun"]);
const textureCache = new Map();
ipcMain.handle("texture:get", (_e, name) => {
  if (!TEXTURES.has(name)) return null;
  if (textureCache.has(name)) return textureCache.get(name);
  try {
    const data = fs.readFileSync(path.join(ROOT, "assets", "textures", `${name}.jpg`));
    const url = `data:image/jpeg;base64,${data.toString("base64")}`;
    textureCache.set(name, url);
    return url;
  } catch {
    return null;
  }
});

// Open key.txt in Notepad (creates it from the example if missing)
ipcMain.handle("key:open", async () => {
  const file = path.join(ROOT, "key.txt");
  if (!fs.existsSync(file)) fs.copyFileSync(path.join(ROOT, "key.txt.example"), file);
  return shell.openPath(file);
});

// AI: one-shot answer
ipcMain.handle("ai:ask", (_e, req) => (loadKey(), ai.ask(req)));

// AI: streamed answer. Chunks go back on "ai:chunk:<id>", the end on "ai:done:<id>".
const streams = new Map();
ipcMain.on("ai:stream", async (e, { id, ...req }) => {
  loadKey();
  const controller = new AbortController();
  streams.set(id, controller);
  try {
    await ai.stream(req, (text) => e.sender.send(`ai:chunk:${id}`, text), controller.signal);
    e.sender.send(`ai:done:${id}`, { ok: true });
  } catch (err) {
    e.sender.send(`ai:done:${id}`, { ok: false, error: String(err?.message || err) });
  } finally {
    streams.delete(id);
  }
});
ipcMain.on("ai:cancel", (_e, id) => streams.get(id)?.abort());

// Network scan (Windows). Falls back to demo data elsewhere or when demo is on.
ipcMain.handle("scan:run", (_e, opts) => scanner.scan(opts || {}));
ipcMain.on("demo:arrive", () => scanner.demoArrive());
ipcMain.on("demo:reset", () => scanner.demoReset());
ipcMain.handle("shields:traffic", (_e, opts) => shields.traffic(opts || {}));
ipcMain.handle("shields:disconnect", (_e, opts) => shields.disconnect(opts || {}));
ipcMain.on("demo:attack", (_e, on) => scanner.setDemoAttack(on));


app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  scanner.initVendors(app.getPath("userData"));
  services.init();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
// Closing the window fully exits Orbit: no background process left behind.
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => setTimeout(() => process.exit(0), 300));
