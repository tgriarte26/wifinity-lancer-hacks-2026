// Officer training sim: a wireframe rover devours intercepted transmissions and fights
// three Wi-Fi attacks (evil twin, ARP spoofer, DNS hijacker). Pure canvas, no page changes.
// Players earn VC and spend it in the Hangar on vehicles, paint, trails, toppers, weapons and upgrades.

/* ================= catalog + profile ================= */

export type Cat = "skin" | "color" | "trail" | "topper" | "weapon" | "pack";
export type UpKey = "damage" | "multishot" | "reach" | "armor" | "speed" | "fleet";
export type Loadout = Record<Cat, string>;
export type Profile = { vc: number; owned: string[]; loadout: Loadout; upgrades: Record<UpKey, number>; name: string; best: number };

export const SHOP: Record<Cat, { title: string; items: { id: string; name: string; price: number }[] }> = {
  skin: { title: "Vehicle", items: [{ id: "rover", name: "Rover", price: 0 }, { id: "rocket", name: "Rocket", price: 400 }, { id: "ufo", name: "UFO", price: 600 }, { id: "spider", name: "Spider crawler", price: 800 }] },
  weapon: { title: "Weapon", items: [{ id: "cannon", name: "Word cannon", price: 0 }, { id: "rapid", name: "Rapid blaster", price: 400 }, { id: "shotgun", name: "Plasma shotgun", price: 500 }] },
  color: { title: "Paint", items: [{ id: "wifinity", name: "Wifinity", price: 0 }, { id: "ice", name: "Ice", price: 150 }, { id: "gold", name: "Gold", price: 150 }, { id: "toxic", name: "Toxic", price: 200 }, { id: "stealth", name: "Stealth", price: 250 }] },
  trail: { title: "Trail", items: [{ id: "pink", name: "Laser pink", price: 0 }, { id: "cyan", name: "Cyan", price: 50 }, { id: "fire", name: "Fire", price: 150 }, { id: "rainbow", name: "Rainbow", price: 300 }] },
  topper: { title: "Topper", items: [{ id: "none", name: "None", price: 0 }, { id: "party", name: "Party hat", price: 100 }, { id: "halo", name: "Halo", price: 200 }, { id: "crown", name: "Crown", price: 250 }, { id: "egypt", name: "Egypt flag", price: 150 }, { id: "pirate", name: "Pirate flag", price: 150 }] },
  pack: { title: "Officer personality", items: [{ id: "control", name: "Mission control", price: 0 }, { id: "sarcastic", name: "Sarcastic", price: 200 }, { id: "hype", name: "Hype", price: 200 }] }
};
export const UPGRADES: Record<UpKey, { name: string; desc: string; max: number; base: number }> = {
  damage: { name: "Blaster", desc: "+35% damage per level", max: 3, base: 150 },
  multishot: { name: "Multishot", desc: "fire 1 → 2 → 3 shots at once", max: 2, base: 250 },
  reach: { name: "Grab reach", desc: "bigger, faster grabs", max: 3, base: 120 },
  armor: { name: "Hull armor", desc: "-20% damage taken per level", max: 3, base: 150 },
  speed: { name: "Engine", desc: "+15% top speed per level", max: 3, base: 100 },
  fleet: { name: "Wingmen", desc: "small rovers that fly with you, eat packets and shoot attackers", max: 3, base: 300 }
};
// [lines, accent, lights, highlight]
export const PALETTES: Record<string, [string, string, string, string]> = {
  wifinity: ["#4fe3d8", "#ff6b7a", "#7dff4d", "#ffb547"],
  ice: ["#bfe9ff", "#5ab0ff", "#e8f7ff", "#9fd3ff"],
  gold: ["#ffd166", "#fff3c4", "#ffe08a", "#ff9f43"],
  toxic: ["#7dff4d", "#b26bff", "#d4ff5c", "#ffd166"],
  stealth: ["#9aa0b5", "#ff6b7a", "#ff6b7a", "#5a6070"]
};

const KEY = "wifinityRoverProfile";
const DEFAULT: Profile = {
  vc: 0, owned: [], name: "ROVER-1", best: 0,
  loadout: { skin: "rover", color: "wifinity", trail: "pink", topper: "none", weapon: "cannon", pack: "control" },
  upgrades: { damage: 0, multishot: 0, reach: 0, armor: 0, speed: 0, fleet: 0 }
};
export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULT, ...p, loadout: { ...DEFAULT.loadout, ...(p.loadout || {}) }, upgrades: { ...DEFAULT.upgrades, ...(p.upgrades || {}) }, owned: p.owned || [] };
  } catch {
    return structuredClone(DEFAULT);
  }
}
export function saveProfile(p: Profile) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ } }
export const owns = (p: Profile, cat: Cat, id: string) => SHOP[cat].items.find(i => i.id === id)?.price === 0 || p.owned.includes(id);

/* ================= what everyone says (all clean, family-friendly) ================= */

export const PACK_LINES: Record<string, Record<string, string[]>> = {
  control: {
    start: ["Training simulation online. Steer with your mouse and eat the intercepted packets.", "Simulation live. Clean up this traffic before the attackers arrive."],
    breach: ["Hull breach.", "We took a hit.", "Shields down."],
    bossDown: ["Threat neutralized.", "Attack blocked.", "Target down."],
    win: ["All three attacks blocked. The network is secure."],
    sample: ["Officer online. Ready to defend the network."],
    learnStart: ["Autopilot engaged. Sit back, I'll read it and pull out what matters."],
    learnEnd: ["Reading complete. Here's what you learned."]
  },
  sarcastic: {
    start: ["Oh good, hackers. My favorite.", "Fine, let's go protect the Wi-Fi. Again."],
    breach: ["Ow. Rude.", "Watch the paint.", "I felt that."],
    bossDown: ["Deleted. You're welcome.", "Bye.", "That was almost hard."],
    win: ["Three attacks, zero problems. Try harder, hackers."],
    sample: ["Oh great, the Wi-Fi again. Let's see who's misbehaving."],
    learnStart: ["Fine, I'll do the reading. You just take the credit."],
    learnEnd: ["Done. You're welcome. Here's the summary."]
  },
  hype: {
    start: ["Let's go! Training sim is live!", "It's go time! Protect that network!"],
    breach: ["We got hit! Keep going!", "Shake it off!", "Ouch! Don't stop!"],
    bossDown: ["Attack down! Legendary!", "Destroyed! Unreal!", "Let's go! Blocked!"],
    win: ["All three attacks blocked! Absolutely legendary!"],
    sample: ["Let's go! Officer locked in and ready to defend!"],
    learnStart: ["Autopilot on! Let's learn this thing!"],
    learnEnd: ["Finished! Look how much you just learned!"]
  }
};

export type GameEnd = { score: number; words: number; kills: number; best: number; newBest: boolean; vc: number; terms: string[]; finished: boolean };
export type Speaker = { who: string; color: string; voice?: number };
export type GameHooks = { say(text: string, speaker: Speaker): void; onEnd(result: GameEnd): void; onSection?(index: number): number | void };
export type GameOpts = { auto?: boolean; terms?: string[] };
export type HudState = { score: number; time: number; words: number; ammo: string; heat: number; hot: boolean; msg: string; best: number; progress: number; learned: number; section: number; sections: number };

const NIGHT = "#070914";
const GAME_LEN = 90;
const COMMON = new Set(["the", "and", "for", "you", "are", "was", "its", "not", "but", "how", "why", "who", "what", "with", "from", "that", "this", "your", "into"]);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pickFrom = (a: string[], not?: string) => { const o = a.length > 1 ? a.filter(x => x !== not) : a; return o[(Math.random() * o.length) | 0]; };

type BossDef = { name: string; hp: number; armor: number; shield: number; rate: number; speed: number; shots: number; color: string; reward: number; ammo: string[]; voice: number };
export const BOSSES: BossDef[] = [
  { name: "EVIL TWIN", hp: 600, armor: 0, shield: 1.5, rate: 1000, speed: 1, shots: 2, color: "#ff6b7a", reward: 200, ammo: ["FREE_WIFI", "CAFE_GUEST", "LOGIN HERE", "SAME SSID"], voice: 3 },
  { name: "ARP SPOOFER", hp: 1000, armor: 0.2, shield: 2.2, rate: 800, speed: 1.4, shots: 3, color: "#b26bff", reward: 300, ammo: ["I AM THE ROUTER", "SPOOF", "MITM", "FAKE GATEWAY"], voice: 5 },
  { name: "DNS HIJACKER", hp: 1600, armor: 0.35, shield: 3, rate: 650, speed: 1.8, shots: 4, color: "#ffb547", reward: 450, ammo: ["bank-l0gin.com", "PHISH", "REDIRECT", "FAKE DNS"], voice: 4 }
];
const BOSS_LINES = [
  { intro: "Connect to me. I look exactly like your network.", rage: "Same name, same password page. Totally trustworthy.", hit: ["Wrong network!", "I'm the real one, I promise.", "Free Wi-Fi! Just log in!"], death: "Signal lost." },
  { intro: "I'm your router now. Send me everything.", rage: "All your packets belong to me!", hit: ["Nice try, I'm the gateway.", "Man in the middle, coming through.", "Your traffic looks delicious."], death: "Gateway restored. Ugh." },
  { intro: "Where do you want to go? I'll send you somewhere else.", rage: "Every lookup leads to me!", hit: ["That's not the real bank.", "Redirecting your redirect.", "Trust the address bar? Cute."], death: "Resolving. Failure." }
];

/* ================= drawing a vehicle (also used by the Hangar preview) ================= */

export type Vehicle = { x: number; y: number; face: number; wheelA: number; moving: boolean; glitch: number; arm: { x: number; y: number }; armTarget: null | { x: number; y: number }; scale: number; busy?: boolean; last?: number; lastShot?: number };
export const makeVehicle = (x: number, y: number, scale = 1): Vehicle => ({ x, y, face: 1, wheelA: 0, moving: false, glitch: 0, arm: { x: x + 60, y }, armTarget: null, scale });
export type Look = { skin: string; color: string; topper: string };

export function drawVehicle(c: CanvasRenderingContext2D, b: Vehicle, t: number, look: Look) {
  const [CY, PK, GR, YL] = PALETTES[look.color] || PALETTES.wifinity;
  const s = b.scale, f = b.face;
  const bob = b.moving ? Math.sin(t / 70 + s * 7) * 1.2 : 0;
  const jit = b.glitch > 0 && Math.random() < 0.3 ? Math.random() * 6 - 3 : 0;
  if (b.glitch > 0) b.glitch--;
  const bx = b.x + jit, by = b.y + bob;
  const tgt = b.armTarget || { x: bx + 64 * f * s, y: by + 12 * s };
  b.arm.x += (tgt.x - b.arm.x) * 0.22; b.arm.y += (tgt.y - b.arm.y) * 0.22;
  const tx0 = (b.arm.x - bx) / s, ty0 = (b.arm.y - by) / s, grabbing = !!b.armTarget;

  c.save(); c.translate(bx, by); c.scale(s, s);
  c.lineWidth = 1.3; c.lineCap = "round"; c.lineJoin = "round"; c.shadowColor = CY; c.shadowBlur = 6;
  const P = (x: number, y: number): [number, number] => [x * f, y];
  const dot = (x: number, y: number, r = 2.2, col = CY) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); };
  const line = (pts: [number, number][], col = CY) => { c.strokeStyle = col; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.stroke(); };
  const poly = (pts: [number, number][], stroke: string, fill?: string) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } c.strokeStyle = stroke; c.stroke(); };
  const topper = (ax: number, ay: number) => {
    const k = look.topper; if (k === "none") return;
    c.save();
    if (k === "party") { poly([[ax - 7, ay], [ax + 7, ay], [ax, ay - 19]], PK, "rgba(255,107,122,.25)"); line([[ax - 4, ay - 6], [ax + 4, ay - 6]], YL); dot(ax, ay - 20, 2.6, YL); }
    else if (k === "crown") { poly([[ax - 10, ay], [ax - 10, ay - 10], [ax - 5, ay - 5], [ax, ay - 13], [ax + 5, ay - 5], [ax + 10, ay - 10], [ax + 10, ay]], "#ffd166", "rgba(255,209,102,.35)"); dot(ax, ay - 4, 1.8, "#ff6b7a"); }
    else if (k === "halo") { c.shadowColor = "#fff7c2"; c.shadowBlur = 10; c.strokeStyle = "#fff7c2"; c.lineWidth = 2; c.beginPath(); c.ellipse(ax, ay - 12 + Math.sin(t / 400) * 1.5, 11, 3.5, 0, 0, 6.283); c.stroke(); }
    else {
      line([[ax, ay], [ax, ay - 28]], "#cfc8ff");
      const w = 20, dir = -f, wave = Math.sin(t / 160) * 1.5;
      const band = (y0: number, h: number, col: string) => poly([[ax, ay - 28 + y0], [ax + dir * w, ay - 28 + y0 + wave], [ax + dir * w, ay - 28 + y0 + h + wave], [ax, ay - 28 + y0 + h]], col, col);
      if (k === "egypt") { band(0, 4, "#ce1126"); band(4, 4, "#ffffff"); band(8, 4, "#111111"); dot(ax + (dir * w) / 2, ay - 22, 1.3, "#c09300"); }
      else { band(0, 12, "#111111"); dot(ax + (dir * w) / 2, ay - 23, 2.2, "#ffffff"); }
    }
    c.restore();
  };

  if (look.skin === "rocket") {
    c.rotate(b.moving ? Math.sin(t / 160) * 0.04 : 0);
    if (grabbing) { c.save(); c.shadowColor = PK; c.shadowBlur = 10; c.lineWidth = 2.2; line([P(54, 0), [tx0, ty0]], PK); c.restore(); }
    const fl = (b.moving ? 18 : 8) + Math.random() * 8;
    poly([P(-50, -8), P(-50 - fl, 0), P(-50, 8)], YL, "rgba(255,181,71,.35)");
    poly([P(-50, -12), P(-64, -28), P(-36, -12)], PK, "rgba(255,107,122,.12)");
    poly([P(-50, 12), P(-64, 28), P(-36, 12)], PK, "rgba(255,107,122,.12)");
    c.beginPath(); c.moveTo(...P(-50, -12)); c.lineTo(...P(22, -12)); c.quadraticCurveTo(...P(48, -11), ...P(56, 0)); c.quadraticCurveTo(...P(48, 11), ...P(22, 12)); c.lineTo(...P(-50, 12)); c.closePath();
    c.fillStyle = "rgba(7,9,20,.8)"; c.fill(); c.strokeStyle = CY; c.lineWidth = 1.6; c.stroke(); c.lineWidth = 1.3;
    c.strokeStyle = PK; c.beginPath(); c.arc(...P(14, -1), 6.5, 0, 6.283); c.stroke(); dot(...P(14, -1), 2.6, GR);
    topper(...P(-12, -12));
    c.restore(); return;
  }
  if (look.skin === "ufo") {
    c.rotate(Math.sin(t / 300) * 0.05);
    if (grabbing) { const g = c.createLinearGradient(0, 10, 0, ty0); g.addColorStop(0, CY); g.addColorStop(1, "transparent"); c.fillStyle = g; c.globalAlpha = 0.45; c.beginPath(); c.moveTo(-14, 10); c.lineTo(14, 10); c.lineTo(tx0 + 20, ty0); c.lineTo(tx0 - 20, ty0); c.closePath(); c.fill(); c.globalAlpha = 1; }
    c.beginPath(); c.arc(0, -2, 24, Math.PI, 0); c.closePath(); c.fillStyle = "rgba(79,227,216,.08)"; c.fill(); c.strokeStyle = PK; c.stroke();
    c.strokeStyle = GR; c.beginPath(); c.ellipse(0, -11, 7, 9, 0, 0, 6.283); c.stroke(); dot(-3, -12, 1.8, GR); dot(3, -12, 1.8, GR);
    c.beginPath(); c.ellipse(0, 4, 62, 13, 0, 0, 6.283); c.fillStyle = "rgba(7,9,20,.85)"; c.fill(); c.strokeStyle = CY; c.lineWidth = 1.6; c.stroke(); c.lineWidth = 1.3;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + t / 900; if (Math.sin(a) < -0.2) continue; dot(Math.cos(a) * 54, 4 + Math.sin(a) * 10, 2, [YL, PK, GR][(i + Math.floor(t / 250)) % 3]); }
    topper(0, -26);
    c.restore(); return;
  }
  if (look.skin === "spider") {
    const ph = b.wheelA * 0.8;
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4, hip: [number, number] = [side * (14 + k * 2), -2 + k * 3];
      const lift = b.moving ? Math.max(0, Math.sin(ph + i * 1.7)) * 7 : 0;
      const foot: [number, number] = [side * (40 + k * 9) + (b.moving ? Math.cos(ph + i * 1.7) * 6 : 0), 32 - lift];
      const knee: [number, number] = [(hip[0] + foot[0]) / 2 + side * 6, Math.min(hip[1], foot[1]) - 18 - k * 2];
      line([hip, knee, foot]); dot(knee[0], knee[1], 1.8); dot(foot[0], foot[1], 1.6, GR);
    }
    if (grabbing) { const mid: [number, number] = [tx0 / 2, Math.min(0, ty0) / 2 - 30]; c.lineWidth = 1.6; line([[0, -6], mid, [tx0, ty0]], PK); c.lineWidth = 1.3; dot(tx0, ty0, 3, YL); }
    poly([[-26, -20], [26, -20], [26, 12], [-26, 12]], PK, "rgba(255,107,122,.12)");
    for (let i = 0; i < 6; i++) { const on = Math.floor(t / 230 + i * 1.3) % 4 !== 0; dot(-18 + (i % 3) * 7, -14 + ((i / 3) | 0) * 7, 2, on ? GR : "#1d3a12"); }
    dot(14 * f, -12, 3, CY);
    topper(0, -20);
    c.restore(); return;
  }
  // the rover: modeled on a Mars rover, with rocker-bogie wheels and a robotic arm
  const wheels = [P(-40, 28), P(0, 28), P(40, 28)];
  for (const [wx, wy] of wheels) {
    c.fillStyle = "rgba(7,9,20,.7)"; c.beginPath(); c.arc(wx, wy, 11, 0, 6.283); c.fill();
    c.strokeStyle = CY; c.beginPath(); c.arc(wx, wy, 11, 0, 6.283); c.stroke();
    for (let k = 0; k < 12; k++) { const a = b.wheelA + k * 0.5236; c.beginPath(); c.moveTo(wx + Math.cos(a) * 11, wy + Math.sin(a) * 11); c.lineTo(wx + Math.cos(a) * 13.5, wy + Math.sin(a) * 13.5); c.stroke(); }
    for (let k = 0; k < 4; k++) { const a = b.wheelA + k * 1.5708; c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + Math.cos(a) * 7.5, wy + Math.sin(a) * 7.5); c.stroke(); }
    dot(wx, wy, 2.2, PK);
  }
  const piv = P(-6, 8), elbow = P(-30, 13), bog = P(20, 15);
  c.lineWidth = 2.2; line([piv, elbow, wheels[0]]); line([piv, bog]); line([bog, wheels[1]]); line([bog, wheels[2]]); c.lineWidth = 1.3;
  poly([P(-44, -12), P(-64, -28), P(-71, -21), P(-51, -5)], YL, "rgba(255,181,71,.08)");
  poly([P(-46, -10), P(46, -10), P(51, 8), P(-50, 8)], PK, "rgba(255,107,122,.09)");
  for (let i = 0; i < 3; i++) { const on = Math.floor(t / 300 + i * 1.3) % 3 !== 0; const [lx, ly] = P(22 + i * 7, 3.5); dot(lx, ly, 1.8, on ? GR : "#1d3a12"); }
  line([P(-14, -10), P(-14, -17)]);
  c.save(); const [ax, ay] = P(-14, -21); c.translate(ax, ay); c.rotate(-0.3 * f); c.strokeStyle = CY; c.beginPath(); c.ellipse(0, 0, 12, 4, 0, 0, 6.283); c.stroke(); c.restore();
  line([P(28, -10), P(28, -56)]); line([P(32, -10), P(32, -56)]);
  for (let y = -16; y > -56; y -= 8) line([P(28, y), P(32, y - 4)]);
  poly([P(22, -69), P(48, -69), P(48, -56), P(22, -56)], PK, "rgba(255,107,122,.12)");
  c.strokeStyle = CY; for (const ex of [36, 42]) { const [x, y] = P(ex, -62.5); c.beginPath(); c.arc(x, y, 2.8, 0, 6.283); c.stroke(); }
  const A = P(50, -2), L1 = 64, L2 = 60, dx = tx0 - A[0], dy = ty0 - A[1];
  const dd = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 2, L1 + L2 - 2), ang = Math.atan2(dy, dx);
  const al = Math.acos(clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1));
  const e1: [number, number] = [A[0] + L1 * Math.cos(ang - al), A[1] + L1 * Math.sin(ang - al)];
  const e2: [number, number] = [A[0] + L1 * Math.cos(ang + al), A[1] + L1 * Math.sin(ang + al)];
  const E = e1[1] < e2[1] ? e1 : e2, T: [number, number] = [A[0] + dd * Math.cos(ang), A[1] + dd * Math.sin(ang)];
  c.lineWidth = 2; line([A, E, T]); c.lineWidth = 1.3; dot(A[0], A[1], 2.8, PK); dot(E[0], E[1], 2.4);
  c.save(); c.translate(T[0], T[1]); c.rotate(ang); c.strokeStyle = PK; c.strokeRect(-5, -5, 10, 10); line([[5, 0], [5 + (grabbing ? 10 : 4), 0]], YL); c.restore();
  topper(...P(35, -69));
  c.restore();
}

/* ================= the game ================= */

type Word = { text: string; x: number; y: number; w: number; h: number; eaten: boolean; para: number };
type Tag = { text: string; x: number; y: number; w: number; vx: number; vy: number; rot: number; vr: number; scale: number; color: string; suck?: { x: number; y: number }; shot?: boolean; dead?: boolean; seed: number };
type Bolt = { x: number; y: number; vx: number; vy: number; life: number; dmg: number; dead?: boolean };
type Enemy = { text: string; x: number; y: number; vx: number; vy: number; rot: number; homing: boolean; dead?: boolean; color: string };
type Boss = { def: BossDef; idx: number; x: number; y: number; hp: number; max: number; hit: number; rage: boolean; lastShot: number; born: number; lastTaunt: number; lastHit?: string };

export function startGame(canvas: HTMLCanvasElement, arena: HTMLElement, hooks: GameHooks, profile: Profile, opts: GameOpts = {}) {
  const auto = !!opts.auto;
  const c = canvas.getContext("2d")!;
  const look: Look = { skin: profile.loadout.skin, color: profile.loadout.color, topper: profile.loadout.topper };
  const [CY, PK, GR, YL] = PALETTES[look.color] || PALETTES.wifinity;
  const up = (k: UpKey) => profile.upgrades[k] || 0;
  const weapon = profile.loadout.weapon;
  const lines = PACK_LINES[profile.loadout.pack] || PACK_LINES.control;
  const name = profile.name || "ROVER-1";
  let W = 0, H = 0;
  const resize = () => {
    const d = window.devicePixelRatio || 1;
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * d; canvas.height = H * d;
    c.setTransform(d, 0, 0, d, 0, 0);
  };
  resize();

  // Every word in the arena becomes something the rover can eat.
  const words: Word[] = [];
  const base = canvas.getBoundingClientRect();
  const paras = [...arena.querySelectorAll("p")];
  const walker = document.createTreeWalker(arena, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const tx = n.nodeValue || "", re = /\S+/g; let m: RegExpExecArray | null;
    while ((m = re.exec(tx))) {
      const word = m[0].replace(/^[^\w%$]+|[^\w%]+$/g, "");
      if (word.length < 2) continue;
      const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const r = rg.getBoundingClientRect();
      const para = paras.indexOf(n.parentElement?.closest("p") as HTMLParagraphElement);
      if (r.width && r.bottom > base.top && r.top < base.bottom) words.push({ text: word, x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, eaten: false, para });
    }
  }

  const best = profile.best || 0;
  const now0 = performance.now();
  const bot = makeVehicle(140, H * 0.5);
  const wing: Vehicle[] = Array.from({ length: up("fleet") }, () => makeVehicle(140, H * 0.5, 0.5));
  const G = {
    score: 0, words: 0, kills: 0, left: GAME_LEN, start: now0, vx: 0, vy: 0, safeUntil: now0 + 2000,
    tags: [] as Tag[], bolts: [] as Bolt[], enemy: [] as Enemy[], tracks: [] as { x: number; y: number; a: number; col: string; round: boolean }[],
    bh: { x: W - 160, y: H - 140, gone: false, scale: 1 }, boss: null as Boss | null, bossIdx: 0, nextBossAt: now0 + 20000,
    heat: 0, overheatUntil: 0, lastBolt: 0, lastFire: 0, lastWord: 0, lastCount: 0, msg: "", over: false, lastLine: {} as Record<string, string>,
    pops: [] as { text: string; x: number; y: number; t: number; color: string; big?: boolean }[], countdown: null as null | { n: number; t: number }
  };
  let mouse = { x: 140, y: H * 0.5 }, mouseDown = false, raf = 0;
  // learn mode: the rover reads in order and collects key terms
  const readOrder = words.filter((w) => w.para >= 0);
  const sections = paras.length;
  let termList = (opts.terms || []).filter(Boolean);
  let termIndex = new Map<string, string>();
  const indexTerms = () => {
    termIndex = new Map();
    for (const t of termList) for (const part of t.toLowerCase().split(/[^\w]+/)) if (part.length > 2 && !COMMON.has(part) && !termIndex.has(part)) termIndex.set(part, t);
  };
  indexTerms();
  const learned = new Set<string>();
  let lastSection = -1, cursor = 0, lastEat = 0, pauseUntil = 0;
  if (auto) { G.bh.gone = true; G.bh.scale = 0; G.nextBossAt = Infinity; }
  const stars = Array.from({ length: 120 }, () => [Math.random(), Math.random(), Math.random() * 1.3 + 0.3, Math.random() * 6]);

  /* ---------- sound (generated in code) ---------- */
  let ac: AudioContext | null = null;
  const audio = () => { try { ac = ac || new AudioContext(); if (ac.state === "suspended") ac.resume(); return ac; } catch { return null; } };
  function tone(f: number, dur: number, type: OscillatorType = "sine", vol = 0.06, slide?: number) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const say = (text: string, s: Speaker) => hooks.say(text, s);
  const officer = (key: string) => {
    const l = pickFrom(lines[key] || [""], G.lastLine[key]); G.lastLine[key] = l;
    if (l) say(l.replace(/^Training simulation online/, `${name} online`), { who: name, color: YL });
  };
  const pop = (text: string, x: number, y: number, color = GR, big = false) => G.pops.push({ text, x, y, t: performance.now(), color, big });
  const trailColor = () => {
    const tr = profile.loadout.trail;
    return tr === "cyan" ? "#4fe3d8" : tr === "fire" ? (Math.random() < 0.5 ? "#ff9f43" : "#ffd166") : tr === "rainbow" ? `hsl(${(performance.now() / 6) % 360},100%,65%)` : "#ff6b7a";
  };

  /* ---------- input ---------- */
  const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    audio();
    if (auto) return;
    mouseDown = true;
    if (weapon === "cannon") fireWords();
    else if (weapon === "shotgun") shotgun();
  };
  const onUp = () => { mouseDown = false; };
  const onKey = (e: KeyboardEvent) => { if (!auto && e.code === "Space") { e.preventDefault(); if (!e.repeat) fireWords(); } };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", resize);

  /* ---------- tags: eaten words floating around ---------- */
  const TAGC = [PK, GR, CY, "#b26bff"];
  function spawnTag(text: string, x: number, y: number, color?: string) {
    c.font = "600 13px Onest Variable, system-ui, sans-serif";
    const w = c.measureText(text).width + 10;
    G.tags.push({ text, x, y, w, vx: (Math.random() - 0.5) * 2.4, vy: -1.2 - Math.random() * 1.8, rot: 0, vr: (Math.random() - 0.5) * 9, scale: 1, color: color || TAGC[(Math.random() * 4) | 0], seed: Math.random() * 100 });
    if (G.tags.length > 70) G.tags.shift();
  }
  const freeTags = () => G.tags.filter(g => !g.suck && !g.shot);

  /* ---------- weapons ---------- */
  function launchTag(g: Tag, from: { x: number; y: number }, face: number, spread: number) {
    g.x = from.x; g.y = from.y - 40; g.shot = true;
    const a = (G.boss ? Math.atan2(G.boss.y - g.y, G.boss.x - g.x) : face > 0 ? 0 : Math.PI) + spread;
    g.vx = Math.cos(a) * 15; g.vy = Math.sin(a) * 15;
  }
  function fireWords() {
    const t = performance.now();
    if (t - G.lastFire < 260) return;
    G.lastFire = t;
    const ammo = freeTags().sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y));
    if (!ammo.length) { pop("no ammo · eat more packets!", bot.x - 70, bot.y - 90, PK); return; }
    const k = Math.min(ammo.length, 1 + up("multishot"));
    for (let i = 0; i < k; i++) launchTag(ammo[i], bot, bot.face, (i - (k - 1) / 2) * 0.28);
    tone(900, 0.12, "square", 0.04, 300);
  }
  function bolts(k: number, spread: number, dmg: number) {
    const ox = bot.x + bot.face * 50, oy = bot.y - 12;
    let a = bot.face > 0 ? 0 : Math.PI;
    if (G.boss) a = Math.atan2(G.boss.y - oy, G.boss.x - ox);
    else if (G.enemy.length) { const e = G.enemy.slice().sort((p, q) => Math.hypot(p.x - ox, p.y - oy) - Math.hypot(q.x - ox, q.y - oy))[0]; a = Math.atan2(e.y - oy, e.x - ox); }
    for (let i = 0; i < k; i++) {
      const aa = a + (i - (k - 1) / 2) * spread + (Math.random() - 0.5) * 0.05;
      G.bolts.push({ x: ox, y: oy, vx: Math.cos(aa) * 19, vy: Math.sin(aa) * 19, life: 70, dmg: dmg * (1 + 0.35 * up("damage")) });
    }
  }
  function shotgun() {
    const t = performance.now();
    if (t - G.lastFire < 650) return;
    G.lastFire = t;
    bolts(5, 0.16, 8);
    tone(160, 0.25, "sawtooth", 0.07, 60);
  }

  /* ---------- bosses ---------- */
  const shieldUp = (B: Boss) => ((performance.now() - B.born) % 7000) / 1000 > 7 - B.def.shield;
  function bossSay(B: Boss, key: "intro" | "rage" | "hit" | "death") {
    const l = BOSS_LINES[B.idx][key];
    const text = Array.isArray(l) ? pickFrom(l, B.lastHit) : l;
    if (Array.isArray(l)) B.lastHit = text;
    say(text, { who: B.def.name, color: B.def.color, voice: B.def.voice });
  }
  function spawnBoss() {
    const def = BOSSES[G.bossIdx], t = performance.now();
    G.bh.gone = true;
    G.boss = { def, idx: G.bossIdx, x: W / 2, y: H * 0.38, hp: def.hp, max: def.hp, hit: 0, rage: false, lastShot: t + 1500, born: t, lastTaunt: t };
    bossSay(G.boss, "intro");
    tone(55, 1.6, "sawtooth", 0.1, 40);
    G.msg = `⚠ ATTACK ${G.bossIdx + 1}/3: ${def.name}`;
  }
  function damageBoss(B: Boss, raw: number, t: number) {
    if (shieldUp(B)) { pop("BLOCKED", B.x - 30, B.y - 60, PK); return; }
    const dmg = Math.max(1, Math.round(raw * (1 - B.def.armor) * (B.rage ? 0.85 : 1)));
    B.hp -= dmg; B.hit = t; G.score += dmg;
    if (t - B.lastTaunt > 6000 && Math.random() < 0.4) { B.lastTaunt = t; bossSay(B, "hit"); }
    if (B.hp <= 0) killBoss();
  }
  function killBoss() {
    const B = G.boss!;
    bossSay(B, "death");
    G.boss = null; G.kills++; G.bossIdx++; G.score += B.def.reward;
    if (G.bossIdx < BOSSES.length) G.nextBossAt = performance.now() + 6000;
    pop(`+${B.def.reward} ${B.def.name} BLOCKED`, B.x - 140, B.y, YL, true);
    B.def.ammo.forEach((w, i) => { spawnTag(w, B.x, B.y, B.def.color); const g = G.tags[G.tags.length - 1], a = (i / 4) * 6.283; g.vx = Math.cos(a) * 7; g.vy = Math.sin(a) * 7; });
    tone(523, 0.3, "triangle", 0.07); setTimeout(() => tone(784, 0.35, "triangle", 0.07), 120);
    if (G.bossIdx >= BOSSES.length) { G.msg = "ALL 3 ATTACKS BLOCKED · NETWORK SECURE"; setTimeout(() => officer("win"), 1500); }
    else { G.msg = "ATTACK BLOCKED · the next one is coming…"; setTimeout(() => officer("bossDown"), 1500); }
  }
  function hurt(loss: number, label: string) {
    const t = performance.now();
    G.safeUntil = t + 1500;
    const l = Math.min(G.score, Math.round(loss * (1 - 0.2 * up("armor"))));
    G.score -= l; bot.glitch = 30;
    pop(`-${l} ${label}`, bot.x - 60, bot.y - 90, PK);
    tone(90, 0.4, "square", 0.08, 40);
    if (Math.random() < 0.5) officer("breach");
  }

  function eatNear(v: Vehicle, ax: number, ay: number, reach: number) {
    let bestW: Word | null = null, bd = reach;
    for (const w of words) { if (w.eaten) continue; const d = Math.hypot(w.x + w.w / 2 - ax, w.y + w.h / 2 - ay); if (d < bd) { bd = d; bestW = w; } }
    if (!bestW) return;
    const w = bestW;
    w.eaten = true;
    v.armTarget = { x: w.x + w.w / 2, y: w.y + w.h / 2 };
    setTimeout(() => { v.armTarget = null; }, 160);
    spawnTag(w.text, w.x, w.y);
    let pts = w.text.length; if (/\d/.test(w.text)) pts += 5; if (/^[A-Z]/.test(w.text)) pts += 2;
    G.score += pts; G.words++;
    tone(620 + Math.random() * 360, 0.06, "square", 0.03, 1300);
    if (pts >= 9) pop("+" + pts, w.x, w.y - 10);
  }

  function drawBoss(t: number, B: Boss) {
    const col = B.def.color, sz = 1 + 0.15 * B.idx;
    c.save(); c.translate(B.x, B.y); c.scale(sz, sz);
    if (B.rage) c.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    c.strokeStyle = t - B.hit < 120 ? "#fff" : col; c.lineWidth = 2; c.shadowColor = col; c.shadowBlur = B.rage ? 30 : 18;
    c.beginPath();
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * 6.283, r = 62 + Math.sin(t / 180 + i * 1.7) * 8 + Math.sin(t / 90 + i) * 4; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = "rgba(40,6,20,.65)"; c.fill(); c.stroke();
    c.lineWidth = 1.3;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + t / 2000, m = 92 + Math.sin(t / 300 + i) * 12, e = 115 + Math.sin(t / 250 + i) * 10; c.beginPath(); c.moveTo(Math.cos(a) * 60, Math.sin(a) * 60); c.quadraticCurveTo(Math.cos(a + 0.35) * m, Math.sin(a + 0.35) * m, Math.cos(a) * e, Math.sin(a) * e); c.stroke(); }
    c.shadowBlur = 0;
    const ex = bot.x - B.x, ey = bot.y - B.y, ed = Math.hypot(ex, ey) || 1;
    c.fillStyle = "#14030a"; c.beginPath(); c.arc(0, 0, 26, 0, 6.283); c.fill(); c.strokeStyle = col; c.stroke();
    c.fillStyle = B.rage ? PK : YL; c.beginPath(); c.arc((ex / ed) * 12, (ey / ed) * 12, 9, 0, 6.283); c.fill();
    c.font = "bold 11px ui-monospace, Menlo, monospace"; c.fillStyle = col; c.textAlign = "center";
    B.def.ammo.forEach((w, i) => { const a = t / 1500 + (i / B.def.ammo.length) * 6.283; c.fillText(w, Math.cos(a) * 140, Math.sin(a) * 75); });
    c.restore();
    const w = 200, x = B.x - w / 2, y = B.y - 130 * sz;
    c.globalAlpha = 0.3; c.fillStyle = col; c.fillRect(x, y, w, 6); c.globalAlpha = 1;
    c.fillStyle = col; c.fillRect(x, y, (w * Math.max(0, B.hp)) / B.max, 6);
    c.font = "600 11px Onest Variable, system-ui, sans-serif"; c.fillStyle = "#fff"; c.textAlign = "center";
    c.fillText(B.def.name + (B.rage ? " · RAGE" : ""), B.x, y - 7);
    if (shieldUp(B)) {
      c.save(); c.strokeStyle = "#4fe3d8"; c.lineWidth = 3; c.shadowColor = "#4fe3d8"; c.shadowBlur = 20; c.globalAlpha = 0.6 + Math.sin(t / 60) * 0.3; c.setLineDash([12, 6]);
      c.beginPath(); c.arc(B.x, B.y, 92 * sz, t / 500, t / 500 + 6.283); c.stroke(); c.restore();
      c.font = "bold 10px ui-monospace, Menlo, monospace"; c.fillStyle = "#4fe3d8"; c.fillText("FIREWALL UP · HOLD FIRE", B.x, y + 16);
    }
  }

  /* ---------- learn mode autopilot ---------- */
  function autopilot(t: number) {
    while (cursor < readOrder.length && readOrder[cursor].eaten) cursor++;
    const w = readOrder[cursor];
    if (t < pauseUntil) { mouse = { x: bot.x, y: bot.y + 45 }; return; } // hold still while the takeaway is read
    if (!w) { if (!doneSections.has(sections - 1)) { finishSection(sections - 1, t); return; } return end(true); }
    if (w.para !== lastSection) { if (lastSection >= 0 && !doneSections.has(lastSection)) { finishSection(lastSection, t); return; } lastSection = w.para; }
    mouse = { x: w.x + w.w / 2 - bot.face * 40, y: w.y + w.h / 2 - 5 };
    const ex = bot.x + bot.face * 40, ey = bot.y + 50;
    if (t - lastEat > 70 && Math.hypot(w.x + w.w / 2 - ex, w.y + w.h / 2 - ey) < 95) {
      lastEat = t;
      learnWord(bot, w);
      const n2 = readOrder[cursor + 1];
      if (n2 && n2.para === w.para && Math.hypot(n2.x + n2.w / 2 - ex, n2.y + n2.h / 2 - ey) < 95) learnWord(bot, n2);
    }
  }
  const doneSections = new Set<number>();
  function finishSection(i: number, t: number) {
    if (i < 0 || doneSections.has(i)) return;
    doneSections.add(i);
    const ms = hooks.onSection?.(i);
    pauseUntil = t + (typeof ms === "number" ? ms : 1200);
    tone(660, 0.12, "triangle", 0.05); setTimeout(() => tone(990, 0.16, "triangle", 0.05), 90);
  }
  function learnWord(v: Vehicle, w: Word) {
    w.eaten = true; G.words++; G.score += 1;
    v.armTarget = { x: w.x + w.w / 2, y: w.y + w.h / 2 };
    setTimeout(() => { v.armTarget = null; }, 120);
    const term = termIndex.get(w.text.toLowerCase());
    if (term && !learned.has(term)) {
      learned.add(term); G.score += 25;
      spawnTag(term, w.x, w.y, YL);
      pop("+ " + term, w.x, w.y - 14, YL, true);
      tone(880, 0.18, "triangle", 0.06, 1320);
    } else if (Math.random() < 0.25) tone(500 + Math.random() * 200, 0.04, "sine", 0.015);
  }

  /* ---------- one frame ---------- */
  function step(t: number) {
    if (G.over) return;
    G.left = auto ? GAME_LEN : Math.max(0, GAME_LEN - (t - G.start) / 1000);
    if (auto) autopilot(t);

    // steer toward the cursor
    const dx = mouse.x - bot.x, dy = mouse.y - 45 - bot.y, d = Math.hypot(dx, dy);
    const sp = Math.min(d * 0.09, 9 * (1 + 0.15 * up("speed")));
    G.vx += ((d > 3 ? (dx / d) * sp : 0) - G.vx) * 0.25; G.vy += ((d > 3 ? (dy / d) * sp : 0) - G.vy) * 0.25;
    if (Math.abs(G.vx) > 0.4) bot.face = G.vx < 0 ? -1 : 1;
    bot.moving = Math.hypot(G.vx, G.vy) > 0.4;
    const nx = clamp(bot.x + G.vx, 80, W - 80), ny = clamp(bot.y + G.vy, 90, H - 60);
    bot.wheelA += (nx - bot.x) / 10; bot.x = nx; bot.y = ny;

    // trails behind every vehicle
    for (const v of [bot, ...wing]) {
      if (!v.moving) continue;
      const round = look.skin !== "rover";
      const tx = look.skin === "rocket" ? v.x - v.face * 62 * v.scale : round ? v.x : v.x - v.face * 40 * v.scale;
      const ty = look.skin === "rocket" ? v.y : look.skin === "ufo" ? v.y + 20 * v.scale : look.skin === "spider" ? v.y + 32 * v.scale : v.y + 42 * v.scale;
      const l = G.tracks[G.tracks.length - 1];
      if (!l || Math.hypot(l.x - tx, l.y - ty) > 5) G.tracks.push({ x: tx, y: ty, a: 1, col: trailColor(), round });
    }

    // eat packets, several a second
    if (!auto && t - G.lastWord > 140 - 25 * up("reach")) { G.lastWord = t; eatNear(bot, bot.x + bot.face * 40, bot.y + 50, 170 + 30 * up("reach")); }

    // wingmen fly in formation, eat their own packets and shoot attackers
    wing.forEach((w, i) => {
      const off = [[-95, -70], [95, -70], [0, -125]][i];
      const tx = clamp(bot.x + off[0], 50, W - 50), ty = clamp(bot.y + off[1], 50, H - 50);
      w.moving = Math.hypot(tx - w.x, ty - w.y) > 2; w.face = bot.face;
      w.wheelA += (tx - w.x) * 0.012; w.x += (tx - w.x) * 0.12; w.y += (ty - w.y) * 0.12;
      if (t - (w.last || 0) > 650) { w.last = t; eatNear(w, w.x, w.y + 40, 120); }
      if (G.boss && t - (w.lastShot || 0) > 1500) { w.lastShot = t; const g = freeTags()[0]; if (g) { launchTag(g, w, w.face, 0); tone(900, 0.08, "square", 0.025, 300); } }
    });

    // the rogue black hole hunts you until the first attack
    if (!G.bh.gone) {
      const sp2 = Math.min(2.6, 0.8 + (GAME_LEN - G.left) * 0.03), hx = bot.x - G.bh.x, hy = bot.y - G.bh.y, hd = Math.hypot(hx, hy) || 1;
      G.bh.x += (hx / hd) * sp2; G.bh.y += (hy / hd) * sp2;
      for (const g of G.tags) if (!g.suck && !g.shot && Math.hypot(g.x - G.bh.x, g.y - G.bh.y) < 90) g.suck = G.bh;
      if (hd < 60 && t > G.safeUntil) { G.vx = (hx / hd) * 16; G.vy = (hy / hd) * 16; hurt(15, "HULL BREACH"); }
    } else G.bh.scale = Math.max(0, G.bh.scale - 0.04);

    // attack schedule with a countdown
    if (!G.boss && G.bossIdx < BOSSES.length && G.left > 3) {
      const ms = G.nextBossAt - t, secs = Math.ceil(ms / 1000);
      if (ms <= 0) spawnBoss();
      else if (secs <= 10) {
        G.msg = `⚠ ATTACK ${G.bossIdx + 1}/3 INCOMING IN ${secs}s`;
        if (secs <= 3 && secs !== G.lastCount) { G.lastCount = secs; G.countdown = { n: secs, t }; tone(secs === 1 ? 880 : 660, 0.15, "square", 0.05); }
      }
    }
    const B = G.boss;
    if (B) {
      if (!B.rage && B.hp < B.max / 2) { B.rage = true; pop("⚠ RAGE MODE", B.x - 70, B.y - 170, PK); bossSay(B, "rage"); }
      if (shieldUp(B)) B.hp = Math.min(B.max, B.hp + B.max * 0.0003);
      const spd = B.def.speed * (B.rage ? 1.4 : 1);
      B.x = clamp(W / 2 + Math.sin(t / (1400 / spd)) * W * 0.28, 140, W - 140);
      B.y = clamp(H * 0.38 + Math.sin(t / (900 / spd)) * 60, 150, H - 170);
      if (t - B.lastShot > B.def.rate * (B.rage ? 0.65 : 1)) {
        B.lastShot = t;
        const k = B.def.shots + (B.rage ? 1 : 0), base2 = Math.atan2(bot.y - B.y, bot.x - B.x);
        for (let i = 0; i < k; i++) { const a = base2 + (i - (k - 1) / 2) * 0.28, v = 4.2 + B.idx * 0.6; G.enemy.push({ text: B.def.ammo[(Math.random() * B.def.ammo.length) | 0], x: B.x, y: B.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: 0, homing: B.rage, color: B.def.color }); }
      }
      if (Math.hypot(bot.x - B.x, bot.y - B.y) < 70 * (1 + 0.15 * B.idx) && t > G.safeUntil) { const ddx = bot.x - B.x, ddy = bot.y - B.y, dl = Math.hypot(ddx, ddy) || 1; G.vx = (ddx / dl) * 18; G.vy = (ddy / dl) * 18; hurt(25, "RAMMED"); }
      for (const g of G.tags) if (g.shot && !g.dead) {
        const hx = B.x - g.x, hy = B.y - g.y, hd = Math.hypot(hx, hy) || 1;
        g.vx += ((hx / hd) * 16 - g.vx) * 0.25; g.vy += ((hy / hd) * 16 - g.vy) * 0.25;
        if (hd < 75) { g.dead = true; damageBoss(B, (4 + g.text.length * 0.7) * 3 * (1 + 0.35 * up("damage")), t); if (!G.boss) break; }
      }
    }

    // rapid blaster: hold the mouse
    G.heat = Math.max(0, G.heat - (t < G.overheatUntil ? 0.5 : 0.8));
    if (weapon === "rapid" && mouseDown && t > G.overheatUntil && t - G.lastBolt > 85) {
      G.lastBolt = t; bolts(1 + up("multishot"), 0.12, 4); G.heat += 7;
      tone(1300 - Math.random() * 300, 0.04, "square", 0.022, 500);
      if (G.heat >= 100) { G.overheatUntil = t + 1800; pop("OVERHEATED", bot.x - 50, bot.y - 120, PK); tone(220, 0.4, "sawtooth", 0.06, 80); }
    }
    for (const o of G.bolts) {
      o.x += o.vx; o.y += o.vy; o.life--;
      if (o.life <= 0 || o.x < -50 || o.x > W + 50 || o.y < -50 || o.y > H + 50) { o.dead = true; continue; }
      for (const e of G.enemy) if (!e.dead && Math.hypot(e.x - o.x, e.y - o.y) < 28) { e.dead = true; o.dead = true; G.score += 5; pop("+5", e.x, e.y); break; }
      if (!o.dead && G.boss && Math.hypot(G.boss.x - o.x, G.boss.y - o.y) < 75 * (1 + 0.15 * G.boss.idx)) { o.dead = true; damageBoss(G.boss, o.dmg, t); }
    }
    G.bolts = G.bolts.filter(o => !o.dead);
    for (const e of G.enemy) {
      if (e.homing) { const hx = bot.x - e.x, hy = bot.y - e.y, hd = Math.hypot(hx, hy) || 1, v = Math.hypot(e.vx, e.vy); e.vx += ((hx / hd) * v - e.vx) * 0.03; e.vy += ((hy / hd) * v - e.vy) * 0.03; }
      e.x += e.vx; e.y += e.vy; e.rot += 6;
      if (Math.hypot(e.x - bot.x, e.y - bot.y) < 50 && t > G.safeUntil) { e.dead = true; hurt(15, `${e.text} HIT`); }
      if (e.x < -100 || e.x > W + 100 || e.y < -100 || e.y > H + 100) e.dead = true;
    }
    G.enemy = G.enemy.filter(e => !e.dead);

    for (const g of G.tags) {
      if (g.suck) { g.x += (g.suck.x - g.x) * 0.12; g.y += (g.suck.y - g.y) * 0.12; g.rot += 18; g.scale *= 0.9; if (g.scale < 0.05) g.dead = true; }
      else if (g.shot) { if (!G.boss) { g.x += g.vx; g.y += g.vy; } else { g.x += g.vx; g.y += g.vy; } g.rot += 22; if (g.x < -100 || g.x > W + 100 || g.y < -100 || g.y > H + 100) g.dead = true; }
      else {
        g.vx = g.vx * 0.985 + Math.sin(t / 1300 + g.seed) * 0.006; g.vy = g.vy * 0.985 + Math.cos(t / 1500 + g.seed) * 0.006;
        g.x += g.vx; g.y += g.vy; g.rot += g.vr; g.vr *= 0.96;
        if (g.x < 0 || g.x > W - g.w) g.vx = -g.vx; if (g.y < 0 || g.y > H - 20) g.vy = -g.vy;
        g.x = clamp(g.x, 0, W - g.w); g.y = clamp(g.y, 0, H - 20);
      }
    }
    G.tags = G.tags.filter(g => !g.dead);

    if (G.left <= 0) end();
  }

  /* ---------- drawing ---------- */
  function draw(t: number) {
    c.clearRect(0, 0, W, H);
    for (const w of words) if (w.eaten) {
      c.fillStyle = NIGHT; c.fillRect(w.x - 1, w.y, w.w + 2, w.h);
      c.strokeStyle = "rgba(79,227,216,.25)"; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(w.x, w.y + w.h - 2); c.lineTo(w.x + w.w, w.y + w.h - 2); c.stroke(); c.setLineDash([]);
    }
    for (const [x, y, r, p] of stars) { c.globalAlpha = 0.2 + 0.3 * Math.sin(t / 900 + p); c.fillStyle = "#fff"; c.fillRect(x * W, y * H, r, r); }
    for (const p of G.tracks) {
      p.a -= 0.006; c.globalAlpha = Math.max(0, p.a) * 0.6; c.fillStyle = p.col;
      if (p.round) { c.beginPath(); c.arc(p.x, p.y, 1 + 2.5 * p.a, 0, 6.283); c.fill(); } else c.fillRect(p.x - 3, p.y, 6, 2);
    }
    G.tracks = G.tracks.filter(p => p.a > 0).slice(-500);
    c.globalAlpha = 1;
    if (G.bh.scale > 0) {
      c.save(); c.translate(G.bh.x, G.bh.y); c.scale(G.bh.scale, G.bh.scale); c.rotate(t / 150);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 45);
      g.addColorStop(0, "#000"); g.addColorStop(0.55, "#000"); g.addColorStop(0.68, "#2a0a3d"); g.addColorStop(0.8, "rgba(255,107,122,.75)"); g.addColorStop(1, "transparent");
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 45, 0, 6.283); c.fill(); c.restore();
    }
    c.lineWidth = 1.2;
    for (const g of freeTags()) {
      const d = Math.hypot(g.x - bot.x, g.y - bot.y); if (d > 300) continue;
      const mx = (bot.x + g.x) / 2 + Math.sin(t / 600 + g.seed) * 14, my = (bot.y + g.y) / 2;
      c.globalAlpha = 0.1 + 0.4 * (1 - d / 300); c.strokeStyle = CY; c.beginPath(); c.moveTo(bot.x, bot.y); c.lineTo(mx, my); c.lineTo(g.x + g.w / 2, g.y + 8); c.stroke();
    }
    c.globalAlpha = 1;
    for (const g of G.tags) {
      c.save(); c.translate(g.x + g.w / 2, g.y + 9); c.rotate((g.rot * Math.PI) / 180); c.scale(g.scale, g.scale);
      c.fillStyle = "rgba(13,17,36,.9)"; c.fillRect(-g.w / 2, -10, g.w, 20); c.strokeStyle = g.color; c.lineWidth = 1.5; c.strokeRect(-g.w / 2, -10, g.w, 20);
      c.fillStyle = g.color; c.font = "600 13px Onest Variable, system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(g.text, 0, 1);
      c.restore();
    }
    for (const e of G.enemy) {
      c.save(); c.translate(e.x, e.y); c.rotate((e.rot * Math.PI) / 180);
      c.font = "bold 12px ui-monospace, Menlo, monospace"; const w = c.measureText(e.text).width + 12;
      c.shadowColor = e.color; c.shadowBlur = 12; c.fillStyle = e.color; c.fillRect(-w / 2, -10, w, 20);
      c.shadowBlur = 0; c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(e.text, 0, 1); c.restore();
    }
    if (G.boss) drawBoss(t, G.boss);
    c.save(); c.lineCap = "round"; c.shadowBlur = 12; c.shadowColor = PK;
    for (const o of G.bolts) { c.strokeStyle = PK; c.lineWidth = 4; c.beginPath(); c.moveTo(o.x - o.vx * 1.3, o.y - o.vy * 1.3); c.lineTo(o.x, o.y); c.stroke(); c.strokeStyle = YL; c.lineWidth = 1.6; c.beginPath(); c.moveTo(o.x - o.vx * 0.6, o.y - o.vy * 0.6); c.lineTo(o.x, o.y); c.stroke(); }
    c.restore();
    for (const w of wing) drawVehicle(c, w, t, look);
    drawVehicle(c, bot, t, look);
    if (weapon === "rapid") {
      const hx = bot.x - 35, hy = bot.y - 100, hot = t < G.overheatUntil;
      c.fillStyle = "rgba(255,255,255,.15)"; c.fillRect(hx, hy, 70, 5);
      c.fillStyle = hot ? PK : G.heat > 70 ? YL : CY; c.fillRect(hx, hy, 70 * Math.min(1, G.heat / 100), 5);
    }
    for (const p of G.pops) {
      const k = (t - p.t) / 1000; if (k > 1) continue;
      c.globalAlpha = 1 - k; c.fillStyle = p.color; c.font = `bold ${p.big ? 26 : 15}px ui-monospace, Menlo, monospace`; c.textAlign = "left";
      c.fillText(p.text, p.x, p.y - k * 40);
    }
    c.globalAlpha = 1;
    G.pops = G.pops.filter(p => t - p.t < 1000);
    if (G.countdown && t - G.countdown.t < 900) {
      const k = (t - G.countdown.t) / 900;
      c.globalAlpha = 1 - k; c.fillStyle = PK; c.shadowColor = PK; c.shadowBlur = 30; c.textAlign = "center";
      c.font = `bold ${Math.round(140 - 50 * k)}px ui-monospace, Menlo, monospace`; c.fillText(String(G.countdown.n), W / 2, H * 0.45);
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
  }

  function frame(t: number) {
    try { step(t); draw(t); } catch (e) { console.warn("[rover game]", e); }
    if (!G.over) raf = requestAnimationFrame(frame);
  }

  function end(finished = true) {
    if (G.over) return;
    G.over = true;
    const newBest = !auto && G.score > best;
    const vc = auto ? learned.size * 10 + (finished ? 60 : 0) : Math.round(G.score / 8) + G.kills * 75 + (G.kills === BOSSES.length ? 150 : 0) + (newBest ? 25 : 0);
    draw(performance.now());
    if (auto && finished) officer("learnEnd");
    hooks.onEnd({ score: G.score, words: G.words, kills: G.kills, best: auto ? best : Math.max(best, G.score), newBest, vc, terms: [...learned], finished });
  }

  officer(auto ? "learnStart" : "start");
  raf = requestAnimationFrame(frame);

  return {
    hud(): HudState {
      const t = performance.now();
      const ammo = weapon === "cannon" ? String(freeTags().length) : weapon === "rapid" ? (t < G.overheatUntil ? "HOT" : `${Math.round(100 - G.heat)}%`) : "∞";
      const eaten = readOrder.filter((w) => w.eaten).length;
      return { score: G.score, time: Math.ceil(G.left), words: G.words, ammo, heat: Math.round(G.heat), hot: t < G.overheatUntil, msg: G.msg, best: Math.max(best, G.score),
        progress: readOrder.length ? Math.round((eaten / readOrder.length) * 100) : 100, learned: learned.size, section: Math.max(0, lastSection) + 1, sections };
    },
    /** Learn mode: add key terms once Claude's lesson arrives. */
    setTerms(t: string[]) { termList = [...new Set([...termList, ...t])]; indexTerms(); },
    /** Jump straight to the summary. */
    finish() { if (auto) { for (let i = 0; i < sections; i++) if (!doneSections.has(i)) doneSections.add(i); } end(false); },
    stop() {
      G.over = true; cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp); window.removeEventListener("keydown", onKey); window.removeEventListener("resize", resize);
      ac?.close().catch(() => {});
    }
  };
}
