// Shape of window.api (exposed by electron/preload.cjs).
export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AiRequest = {
  prompt?: string;
  messages?: ChatMessage[];
  system?: string;
  maxTokens?: number;
  json?: boolean;
};

export type Device = {
  ip: string;
  mac: string;
  vendor: string | null | undefined; // undefined = still looking it up
  hostname: string;
  randomized: boolean;
  isGateway: boolean;
  isSelf: boolean;
};

export type Nearby = {
  ssid: string;
  hidden: boolean;
  auth: string;
  encryption: string;
  maxSignal: number;
  bssids: { bssid: string; signal: number; channel: string; band: string; radio: string }[];
};

export type Connection = {
  interfaceName: string;
  mac: string;
  ssid: string;
  bssid: string;
  auth: string;
  cipher: string;
  signal: number;
  band: string;
  channel: string;
  radio: string;
};

export type Snapshot =
  | { ok: false; at: number; error: string }
  | {
      ok: true;
      demo: boolean;
      at: number;
      permissionIssue: boolean;
      connection: Connection | null;
      gateway: { ip: string; mac: string };
      self: { ip: string; mac: string };
      devices: Device[];
      networks: Nearby[] | null;
      dns?: string[] | null;
    };

export type TrafficApp = {
  name: string;
  connections: number;
  unencrypted: number;
  local: number;
  destinations: { ip: string; port: number; service: string; plain: boolean; local: boolean }[];
};
export type Traffic = { ok: true; at: number; total: number; unencrypted: number; apps: TrafficApp[] };

export type Res<T> = { ok: true; value: T } | { ok: false; error: string };
export type RouterState = { connected: boolean; interfaces: string[]; clients: { mac: string; radio: string; authorized: boolean; signal: number | null }[]; host?: string };
export type KickResult = { ok: true; seconds: number; radios: string[]; verified: boolean; checks: { radio: string; absent: boolean; banListed: boolean }[] };

export type DesktopApi = {
  isDesktop: true;
  launchDemo?: boolean;
  platform: string;
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    onState(cb: (s: { maximized: boolean }) => void): () => void;
  };
  textures: { get(name: string): Promise<string | null> };
  env: { status(): Promise<{ ai: boolean; eleven: boolean; elevenBad?: boolean; model: string }>; openKeyFile(): Promise<string> };
  keys: { save(input: { claude?: string; eleven?: string; model?: string }): Promise<Res<{ ai: boolean; eleven: boolean; elevenBad?: boolean; model: string }>> };
  voice: {
    list(): Promise<Res<{ id: string; name: string; description: string }[]>>;
    speak(req: { text: string; voice: string }): Promise<Res<string>>;
  };
  mode: { set(m: "user" | "admin"): Promise<Res<string>> };
  router: {
    connect(input: { url: string; username: string; password: string; allowHttp: boolean }): Promise<Res<RouterState>>;
    refresh(): Promise<Res<RouterState>>;
    kick(req: { mac: string; seconds?: number }): Promise<Res<KickResult>>;
    disconnect(): Promise<Res<void>>;
  };
  wifi: { disconnect(): Promise<Res<{ ok: boolean; demo?: boolean }>> };
  ai: {
    ask(req: AiRequest): Promise<{ text: string; data?: unknown }>;
    stream(req: AiRequest, onChunk: (text: string) => void): { done: Promise<void>; cancel(): void };
  };
  shields: {
    traffic(opts?: { demo?: boolean }): Promise<Traffic>;
    disconnect(opts?: { demo?: boolean }): Promise<{ ok: boolean; demo?: boolean; output?: string }>;
  };
  scan: {
    run(opts?: { demo?: boolean; sweepFirst?: boolean; wifi?: boolean }): Promise<Snapshot>;
    demoArrive(): void;
    demoReset(): void;
    demoAttack(on: boolean): void;
  };
};

declare global {
  interface Window {
    api?: DesktopApi;
  }
}
