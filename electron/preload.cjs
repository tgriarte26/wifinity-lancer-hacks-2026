// The only bridge between the UI and the main process. Exposed as window.api.
const { contextBridge, ipcRenderer } = require("electron");

let nextId = 0;

contextBridge.exposeInMainWorld("api", {
  isDesktop: true,
  launchDemo: ipcRenderer.sendSync("launch:demo") === true,
  platform: process.platform,

  window: {
    minimize: () => ipcRenderer.send("win:minimize"),
    toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
    close: () => ipcRenderer.send("win:close"),
    onState: (cb) => {
      const fn = (_e, state) => cb(state);
      ipcRenderer.on("win:state", fn);
      return () => ipcRenderer.removeListener("win:state", fn);
    },
  },

  keys: { save: (input) => ipcRenderer.invoke("keys:save", input) },
  voice: {
    list: () => ipcRenderer.invoke("voice:list"),
    speak: (req) => ipcRenderer.invoke("voice:speak", req),
  },
  mode: { set: (m) => ipcRenderer.invoke("mode:set", m) },
  router: {
    connect: (input) => ipcRenderer.invoke("router:connect", input),
    refresh: () => ipcRenderer.invoke("router:refresh"),
    kick: (req) => ipcRenderer.invoke("router:kick", req),
    disconnect: () => ipcRenderer.invoke("router:disconnect"),
  },
  wifi: { disconnect: () => ipcRenderer.invoke("wifi:disconnect") },

  textures: { get: (name) => ipcRenderer.invoke("texture:get", name) },

  env: { status: () => ipcRenderer.invoke("env:status"), openKeyFile: () => ipcRenderer.invoke("key:open") },

  ai: {
    ask: (req) => ipcRenderer.invoke("ai:ask", req),
    stream: (req, onChunk) => {
      const id = `s${Date.now()}_${nextId++}`;
      const chunkCh = `ai:chunk:${id}`;
      const doneCh = `ai:done:${id}`;
      const onC = (_e, text) => onChunk(text);
      const done = new Promise((resolve, reject) => {
        ipcRenderer.once(doneCh, (_e, res) => {
          ipcRenderer.removeListener(chunkCh, onC);
          res.ok ? resolve() : reject(new Error(res.error));
        });
      });
      ipcRenderer.on(chunkCh, onC);
      ipcRenderer.send("ai:stream", { id, ...req });
      return { done, cancel: () => ipcRenderer.send("ai:cancel", id) };
    },
  },

  shields: {
    traffic: (opts) => ipcRenderer.invoke("shields:traffic", opts),
    disconnect: (opts) => ipcRenderer.invoke("shields:disconnect", opts),
  },

  scan: {
    run: (opts) => ipcRenderer.invoke("scan:run", opts),
    demoArrive: () => ipcRenderer.send("demo:arrive"),
    demoReset: () => ipcRenderer.send("demo:reset"),
    demoAttack: (on) => ipcRenderer.send("demo:attack", on),
  },

});
