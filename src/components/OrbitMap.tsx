// The star-system view, rendered like a space photo.
// Performance design:
//  - Heavy art (planet surfaces, sun, nebula) is generated once in lib/cosmos.ts and cached.
//  - React renders the interactive layer (hit areas, labels) only when data changes.
//  - One animation loop paints the canvas and moves the interactive layer by setting transforms.
//  - Detail levels: Cinematic (sharpest, spinning planets, sun rays), High, Balanced (30fps,
//    planets hold still), Low (one still image). Auto starts at High and steps down if frames
//    run slow. The loop stops while the window is hidden.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Device, Snapshot } from "../types/api";
import { useMeta, useSelected, setSelected, usePrefs, type DeviceMeta } from "../lib/network";
import { kindOf, nameFor, priorityOf, roleOf } from "../lib/devices";
import { nearbyKey, securityLevel } from "../lib/risk";
import { setPerf, type Level } from "../lib/perf";
import { loadRealTextures, nebula, planetSprite, ringSprite, skyImage, spriteBucket, starSprite, useTexturesReady, type PlanetType } from "../lib/cosmos";
import { cn } from "../lib/cn";

type Ok = Extract<Snapshot, { ok: true }>;

const W = 1000;
const H = 640;
const CX = 500;
const CY = 320;
const RINGS = [118, 176, 234, 292];
const RING_NAMES = ["High", "Normal", "Low", "Strangers"];
const TILT = 1; // top-down view: orbits are true circles
const SPEED = [0.07, 0.05, 0.035, 0.025];
const SUN_R = 56;

export const TONES = {
  self: "#ffb547",
  crew: "#4fe3d8",
  systems: "#8fa0e6",
  guest: "#c9a4ff",
  unassigned: "#9aa3c7",
  stranger: "#ff6b7a",
} as const;
type Tone = keyof typeof TONES;

const LOD = {
  cinematic: { maxSprite: 768, fps: 60, dpr: 2, frames: 64, rays: true, spin: true, twinkle: 40, rocks: 9, storm: 28, meteors: true, stars: 260 },
  high: { maxSprite: 512, fps: 60, dpr: 1.5, frames: 40, rays: false, spin: true, twinkle: 24, rocks: 7, storm: 22, meteors: true, stars: 200 },
  balanced: { maxSprite: 384, fps: 30, dpr: 1, frames: 1, rays: false, spin: false, twinkle: 0, rocks: 5, storm: 14, meteors: false, stars: 160 },
  low: { maxSprite: 384, fps: 0, dpr: 1, frames: 1, rays: false, spin: false, twinkle: 0, rocks: 0, storm: 0, meteors: false, stars: 160 },
};

// Planets stay small next to the router so a busy network still fits. Gas giants are a bit bigger.
const PLANET_R: Record<PlanetType, number> = { terra: 14, gas: 17, storm: 13.5, ice: 12.5, dune: 12, rock: 10.5, lava: 12.5, sun: SUN_R };
const ATMOSPHERE: Partial<Record<PlanetType, string>> = {
  terra: "130,185,255",
  gas: "235,228,255",
  storm: "230,240,210",
  ice: "205,232,255",
  dune: "255,215,170",
  lava: "255,90,60",
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Which kind of world a device becomes. */
function planetFor(d: Device, stranger: boolean): PlanetType {
  if (stranger) return "lava";
  if (d.isSelf) return "terra"; // your computer is the inhabited world, city lights and all
  const k = kindOf(d);
  if (k === "computer") return hash(d.mac + "c") > 0.35 ? "gas" : "terra";
  if (k === "tv") return "gas";
  if (k === "console") return "storm";
  if (k === "speaker") return hash(d.mac + "s") > 0.5 ? "dune" : "ice";
  if (k === "printer") return hash(d.mac + "m") > 0.5 ? "ice" : "rock";
  // Phones and other gadgets: a wide pool so the system feels varied
  const pool: PlanetType[] = k === "unknown" ? ["rock", "ice", "dune"] : ["terra", "gas", "storm", "ice", "dune", "terra", "gas"];
  return pool[Math.floor(hash(d.mac + "type") * pool.length)];
}
function hasRings(d: Device, type: PlanetType) {
  if (kindOf(d) === "tv") return true;
  if (type === "gas") return hash(d.mac + "ring") > 0.55;
  if (type === "ice") return hash(d.mac + "ring") > 0.8;
  return false;
}

function toneOf(d: Device, m: DeviceMeta | undefined, stranger: boolean): Tone {
  if (d.isSelf) return "self";
  if (stranger) return "stranger";
  return roleOf(d, m) ?? "unassigned";
}

// Irregular rock outlines, made once.
const ROCKS: Path2D[] = (() => {
  if (typeof Path2D === "undefined") return [];
  const r = seeded(42);
  return Array.from({ length: 6 }, () => {
    const p = new Path2D();
    const n = 6 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = 0.65 + r() * 0.45;
      i ? p.lineTo(Math.cos(a) * d, Math.sin(a) * d) : p.moveTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    p.closePath();
    return p;
  });
})();

type Boom = { mac: string; x: number; y: number; r: number; t0: number; parts: { a: number; v: number; s: number; spin: number; hot: boolean }[] };

function makeDebris(r: number) {
  return Array.from({ length: 46 }, (_, i) => ({
    a: Math.random() * Math.PI * 2,
    v: (0.6 + Math.random() * 1.6) * r * 2.2,
    s: 0.8 + Math.random() * (i < 14 ? 3.5 : 1.6),
    spin: (Math.random() - 0.5) * 8,
    hot: i % 3 !== 0,
  }));
}

type Body = {
  mac: string;
  ring: number;
  phase: number;
  r: number;
  type: PlanetType;
  seed: number;
  ringed: boolean;
  dr: number; // lane offset on crowded rings
  threat: boolean;
  stranger: boolean;
  arrivedAt?: number;
  x: number;
  y: number;
  s: number;
  behind: boolean;
};

const clock = { t: 0, last: 0 };

export function OrbitMap({ snap, threatened, sunUnderAttack }: { snap: Ok; threatened: Set<string>; sunUnderAttack: boolean }) {
  const meta = useMeta();
  const selected = useSelected();
  const texturesReady = useTexturesReady();
  useEffect(() => {
    loadRealTextures();
  }, []);
  const prefs = usePrefs();
  const [hover, setHover] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const els = useRef(new Map<string, SVGGElement>());
  const bodiesRef = useRef<Body[]>([]);
  const redrawRef = useRef<() => void>(() => {});
  // Camera: glides to whatever is selected. x/y are world coords of the view centre, z is zoom.
  const camRef = useRef({ x: CX, y: CY, z: 1 });
  const camGRef = useRef<SVGGElement>(null);
  const farRef = useRef<SVGGElement>(null);
  const sunLabelRef = useRef<SVGGElement>(null);
  const labelEls = useRef(new Map<string, { el: SVGGElement; r: number }>());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const fxRef = useRef({
    attack: sunUnderAttack,
    stars: [] as { x: number; y: number; color: string; size: number; twin: boolean }[],
    booms: [] as Boom[],
    pulse: 0, // when the last scan landed: a sonar ping sweeps out from the router
  });
  fxRef.current.attack = sunUnderAttack;
  useEffect(() => {
    fxRef.current.pulse = performance.now();
  }, [snap]);

  // Windows "Animation effects: off" only quiets small UI pulses (see index.css); the space
  // scene follows the detail level the person picks, so the map never silently freezes.
  const [autoLevel, setAutoLevel] = useState<Level>("high");
  const level: Level = prefs.quality === "auto" ? autoLevel : prefs.quality;
  const kickRef = useRef<() => void>(() => {});
  const pausedRef = useRef(false);
  pausedRef.current = !!prefs.paused;

  // ---------- Scene layout (only when data changes) ----------
  const scene = useMemo(() => {
    const groups: { d: Device; m?: DeviceMeta; ring: number; stranger: boolean }[][] = [[], [], [], []];
    for (const d of snap.devices) {
      if (d.isGateway) continue;
      const m = meta[d.mac];
      if (m?.blocked) continue; // ejected: blown up and off the map
      const unknown = !m?.trusted && !m?.role && d.vendor === null && !d.hostname && !d.randomized;
      const stranger = !d.isSelf && (threatened.has(d.mac) || (!!m?.arrivedLive && !m?.trusted) || (!!m?.watch && !m?.trusted) || unknown);
      const p = priorityOf(d, m);
      const ring = stranger ? 3 : p === "high" ? 0 : p === "normal" ? 1 : 2;
      groups[ring].push({ d, m, ring, stranger });
    }
    // Busy networks shrink every planet a little, and a crowded ring splits into two lanes.
    const total = groups.reduce((n, g) => n + g.length, 0);
    const crowd = total <= 8 ? 1 : Math.max(0.62, Math.sqrt(8 / total));
    return groups.flatMap((g, ri) => {
      const lanes = (2 * Math.PI * RINGS[ri]) / Math.max(1, g.length) < 46 ? 2 : 1;
      return g.map((item, i) => {
        const type = planetFor(item.d, item.stranger);
        return {
          ...item,
          type,
          r: PLANET_R[type] * crowd,
          ringed: hasRings(item.d, type),
          dr: lanes === 2 ? (i % 2 ? 11 : -11) : 0,
          phase: (i / Math.max(1, g.length)) * Math.PI * 2 + ri * 0.9 + hash(item.d.mac) * 0.4,
        };
      });
    });
  }, [snap.devices, meta, threatened]);

  // When a device gets ejected, remember where its planet was and blow it up there.
  const prevBodies = bodiesRef.current;
  for (const b of prevBodies) {
    if (meta[b.mac]?.blocked && !fxRef.current.booms.some((x) => x.mac === b.mac)) {
      fxRef.current.booms.push({ mac: b.mac, x: b.x, y: b.y, r: b.r, t0: performance.now(), parts: makeDebris(b.r) });
      setTimeout(() => kickRef.current(), 0);
    }
  }
  bodiesRef.current = scene.map((it) => {
    const prev = bodiesRef.current.find((b) => b.mac === it.d.mac);
    return {
      mac: it.d.mac,
      ring: it.ring,
      phase: it.phase,
      r: it.r,
      type: it.type,
      seed: Math.floor(hash(it.d.mac) * 997) + 1,
      ringed: it.ringed,
      dr: it.dr,
      threat: threatened.has(it.d.mac),
      stranger: it.stranger,
      arrivedAt: it.m?.arrivedAt,
      x: prev?.x ?? CX,
      y: prev?.y ?? CY,
      s: prev?.s ?? 1,
      behind: prev?.behind ?? false,
    };
  });

  const home = snap.connection;
  const stars = useMemo(
    () =>
      (snap.networks ?? [])
        .filter((n) => !(home && n.bssids.some((b) => b.bssid === home.bssid)))
        .map((n) => {
          const key = nearbyKey(n);
          const a = hash(key) * Math.PI * 2;
          const dist = 345 + (100 - n.maxSignal) * 1.3;
          const x = Math.min(W - 40, Math.max(40, CX + dist * Math.cos(a)));
          const y = Math.min(H - 30, Math.max(30, CY + dist * 0.82 * Math.sin(a)));
          const sec = securityLevel(n.auth, n.encryption);
          const twin = !!home?.ssid && n.ssid === home.ssid && sec.label !== securityLevel(home.auth, home.cipher).label;
          return { n, key, x, y, sec, twin, size: 7 + (n.maxSignal / 100) * 12, rank: 0 };
        })
        .map((s, _i, all) => ({ ...s, rank: all.filter((o) => o.n.maxSignal > s.n.maxSignal).length })),
    [snap.networks, home]
  );
  const hovered = stars.find((s) => s.key === hover);
  const ringCounts = [0, 0, 0, 0];
  for (const it of scene) ringCounts[it.ring]++;
  fxRef.current.stars = stars.map((s) => ({
    x: s.x,
    y: s.y,
    size: s.size,
    twin: s.twin,
    color: s.twin || s.sec.level === "critical" ? "rgba(255,110,120,1)" : s.sec.level === "good" ? "rgba(200,220,255,1)" : "rgba(255,196,110,1)",
  }));

  // ---------- Animation loop ----------
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const cfg = LOD[level];
    let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
    let bg: HTMLCanvasElement | null = null;
    const rnd = seeded(7);
    const twinklers = Array.from({ length: cfg.twinkle }, () => ({ x: rnd() * W, y: rnd() * H, p: rnd() * 6.28, r: 0.6 + rnd() * 0.9 }));
    const meteors: { x: number; y: number; vx: number; vy: number }[] = [];

    function resize() {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, cfg.dpr);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const scale = Math.min(rect.width / W, rect.height / H);
      view = { scale, ox: (rect.width - W * scale) / 2, oy: (rect.height - H * scale) / 2, dpr };

      // Background baked once per size: nebula + star field.
      bg = document.createElement("canvas");
      bg.width = canvas.width;
      bg.height = canvas.height;
      const b = bg.getContext("2d")!;
      b.imageSmoothingQuality = "high";
      const sky = skyImage();
      if (sky) {
        // Real Milky Way photo (its bright band runs through the middle of the map), lifted a little
        b.fillStyle = "#000";
        b.fillRect(0, 0, canvas.width, canvas.height);
        // The band runs diagonally and passes beside the router, not straight through it
        const sw = sky.width * 0.42;
        const sh = sw * (canvas.height / canvas.width);
        const sx = sky.width * 0.29;
        const sy = sky.height / 2 - sh / 2;
        const drawSky = () => {
          b.save();
          b.translate(canvas.width / 2, canvas.height / 2);
          b.rotate(-0.42);
          b.translate(0, -canvas.height * 0.3);
          const k = 1.75;
          b.drawImage(sky, sx, sy, sw, sh, (-canvas.width * k) / 2, (-canvas.height * k) / 2, canvas.width * k, canvas.height * k);
          b.restore();
        };
        drawSky();
        b.globalCompositeOperation = "lighter";
        b.globalAlpha = 0.9;
        drawSky();
        b.globalAlpha = 0.55;
        b.globalCompositeOperation = "screen";
        b.drawImage(nebula(canvas.width, canvas.height), 0, 0, canvas.width, canvas.height);
        b.globalAlpha = 1;
        b.globalCompositeOperation = "source-over";
      } else {
        b.drawImage(nebula(canvas.width, canvas.height), 0, 0, canvas.width, canvas.height);
      }
      const r2 = seeded(11);
      for (let i = 0; i < cfg.stars; i++) {
        const x = r2() * canvas.width;
        const y = r2() * canvas.height;
        const big = r2() > 0.96;
        b.globalAlpha = big ? 0.9 : 0.15 + r2() * 0.55;
        if (big) {
          const s = (10 + r2() * 10) * dpr;
          b.drawImage(starSprite("rgba(220,228,255,1)"), x - s / 2, y - s / 2, s, s);
        } else {
          b.fillStyle = r2() > 0.85 ? "#ffe2c4" : "#dfe6ff";
          b.beginPath();
          b.arc(x, y, (0.4 + r2() * 0.9) * dpr, 0, 6.283);
          b.fill();
        }
      }
      b.globalAlpha = 1;
      draw(lastT);
    }

    const cam = camRef.current;
    const toView = () => {
      const k = view.scale * cam.z;
      ctx.setTransform(
        view.dpr * k, 0, 0, view.dpr * k,
        view.dpr * (view.ox + view.scale * (W / 2 - cam.x * cam.z)),
        view.dpr * (view.oy + view.scale * (H / 2 - cam.y * cam.z))
      );
    };
    let lastDraw = performance.now();

    function updateCamera() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastDraw) / 1000);
      lastDraw = now;
      const sel = selectedRef.current;
      let tx = CX, ty = CY, tz = 1;
      if (sel?.kind === "device") {
        const b = bodiesRef.current.find((x) => x.mac === sel.mac);
        const boom = fxRef.current.booms.find((x) => x.mac === sel.mac);
        if (b) {
          tx = b.x;
          ty = b.y;
          tz = Math.min(9, 125 / b.r); // planet fills a good part of the view
        } else if (boom) {
          // Hold on the explosion, pulling back a little so the blast fits
          tx = boom.x;
          ty = boom.y;
          tz = Math.min(3, 80 / boom.r);
        }
      } else if (sel?.kind === "home") {
        tz = 2.1;
      }
      const ease = 1 - Math.exp(-dt * 3.2);
      cam.x += (tx - cam.x) * ease;
      cam.y += (ty - cam.y) * ease;
      cam.z += (tz - cam.z) * ease;
      // Interactive layer follows the same camera
      camGRef.current?.setAttribute("transform", `translate(${W / 2} ${H / 2}) scale(${cam.z.toFixed(4)}) translate(${(-cam.x).toFixed(2)} ${(-cam.y).toFixed(2)})`);
      const inv = 1 / cam.z;
      for (const { el, r } of labelEls.current.values()) el.setAttribute("transform", `translate(0 ${(r + 15 * inv).toFixed(2)}) scale(${inv.toFixed(4)})`);
      sunLabelRef.current?.setAttribute("transform", `translate(0 ${SUN_R}) scale(${inv.toFixed(4)})`);
      if (farRef.current) farRef.current.style.opacity = String(Math.max(0, 1 - (cam.z - 1) * 1.5));
    }

    function rock(x: number, y: number, size: number, rot: number, i: number) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(size, size);
      ctx.fill(ROCKS[i % ROCKS.length]);
      ctx.restore();
    }

    function rockStyle(lit: number) {
      ctx.fillStyle = `rgb(${Math.round(58 + lit * 70)},${Math.round(48 + lit * 52)},${Math.round(44 + lit * 36)})`;
    }

    // A planet: sprite frame (crossfaded while spinning), sun lighting, atmosphere, rings.
    function planet(b: Body, t: number) {
      const r = b.r * b.s;
      const px = b.r * 2 * view.scale * cam.z * view.dpr;
      const sel = selectedRef.current;
      const focused = sel?.kind === "device" && sel.mac === b.mac;
      const bucket = spriteBucket(px, cfg.maxSprite);
      const big = bucket >= 256;
      let sprite = planetSprite(b.type, b.seed, bucket, big ? (cfg.spin ? 16 : 1) : cfg.frames, focused);
      // Close-up art paints in the background; show the sharpest ready version meanwhile.
      if (!sprite.frames[0]) sprite = planetSprite(b.type, b.seed, spriteBucket(Math.min(px, 192), 192), cfg.frames);
      const lx = CX - b.x;
      const ly = CY - b.y;
      const len = Math.hypot(lx, ly) || 1;
      const dx = lx / len;
      const dy = ly / len;

      if (b.ringed) ringHalf(b, r, true);

      // Surface
      let f0 = 0;
      let frac = 0;
      if (cfg.spin && sprite.count > 1) {
        const pos = (((t * 0.05 + b.seed * 0.13) % 1) + 1) % 1 * sprite.count;
        f0 = Math.floor(pos) % sprite.count;
        frac = pos - Math.floor(pos);
      }
      const fr = sprite.frames[f0] ?? sprite.frames[0]!;
      ctx.drawImage(fr.a, b.x - r, b.y - r, r * 2, r * 2);
      const nxt = sprite.frames[(f0 + 1) % sprite.count];
      if (frac > 0.02 && nxt) {
        ctx.globalAlpha = frac;
        ctx.drawImage(nxt.a, b.x - r, b.y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      }

      // Night side: shade away from the sun
      const g = ctx.createRadialGradient(b.x + dx * r * 0.45, b.y + dy * r * 0.45, r * 0.1, b.x + dx * r * 0.3, b.y + dy * r * 0.3, r * 1.2);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.42, "rgba(1,2,6,0.12)");
      g.addColorStop(0.64, "rgba(1,2,6,0.8)");
      g.addColorStop(0.8, "rgba(1,2,6,0.97)");
      g.addColorStop(1, "rgba(1,2,6,0.99)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Soft highlight where sunlight hits most directly
      ctx.globalCompositeOperation = "lighter";
      const hl = ctx.createRadialGradient(b.x + dx * r * 0.5, b.y + dy * r * 0.5, 0, b.x + dx * r * 0.5, b.y + dy * r * 0.5, r * 0.9);
      hl.addColorStop(0, "rgba(255,240,220,0.14)");
      hl.addColorStop(1, "rgba(255,240,220,0)");
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // Glow layer (lava cracks, city lights) shows through the night side
      if (fr.e) {
        ctx.save();
        if (b.type === "terra") {
          // City lights only on the night half (beyond the terminator, away from the sun)
          ctx.beginPath();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.rect(-r * 1.1, -r * 1.1, r * 0.95, r * 2.2);
          ctx.rotate(-Math.atan2(dy, dx));
          ctx.translate(-b.x, -b.y);
          ctx.clip();
        }
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = b.type === "lava" ? 0.95 : 0.85;
        ctx.drawImage(fr.e, b.x - r, b.y - r, r * 2, r * 2);
        ctx.restore();
      }

      // Atmosphere rim on the lit side
      const atm = ATMOSPHERE[b.type];
      if (atm) {
        ctx.globalCompositeOperation = "lighter";
        const gas = b.type === "gas" || b.type === "storm";
        const reach = gas ? 1.1 : 1.28;
        const ag = ctx.createRadialGradient(b.x, b.y, r * 0.9, b.x, b.y, r * reach);
        ag.addColorStop(0, `rgba(${atm},0)`);
        ag.addColorStop(0.3, `rgba(${atm},${b.type === "lava" ? 0.35 : gas ? 0.12 : 0.22})`);
        ag.addColorStop(1, `rgba(${atm},0)`);
        ctx.fillStyle = ag;
        ctx.beginPath();
        ctx.arc(b.x + dx * r * 0.08, b.y + dy * r * 0.08, r * reach, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }

      // Strangers glow like something that shouldn't be there
      if (b.stranger) {
        ctx.globalCompositeOperation = "lighter";
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + b.seed);
        const sg = ctx.createRadialGradient(b.x, b.y, r, b.x, b.y, r * 2.4);
        sg.addColorStop(0, `rgba(255,70,80,${0.28 + pulse * 0.2})`);
        sg.addColorStop(1, "rgba(255,70,80,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }

      if (b.ringed) ringHalf(b, r, false);
    }

    function ringHalf(b: Body, r: number, back: boolean) {
      const R = r * 2.35;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(-0.32);
      ctx.beginPath();
      if (back) ctx.rect(-R, -R, R * 2, R);
      else ctx.rect(-R, 0, R * 2, R);
      ctx.clip();
      ctx.scale(1, 0.3);
      ctx.globalAlpha = back ? 0.7 : 0.95;
      ctx.drawImage(ringSprite(), -R, -R, R * 2, R * 2);
      ctx.restore();
    }

    function sun(t: number) {
      const attack = fxRef.current.attack;
      const c1 = attack ? "255,80,70" : "255,170,60";
      const c2 = attack ? "255,40,60" : "255,120,30";
      const pulse = attack ? 0.5 + 0.5 * Math.sin(t * 6) : 0.5 + 0.5 * Math.sin(t * 0.8);
      ctx.globalCompositeOperation = "lighter";
      // Wide light that washes over the scene
      // Huge faint halo, like a photo's light scatter around the sun
      const halo = ctx.createRadialGradient(CX, CY, SUN_R, CX, CY, SUN_R * 11);
      halo.addColorStop(0, `rgba(${c1},0.16)`);
      halo.addColorStop(0.35, `rgba(${c2},0.05)`);
      halo.addColorStop(1, `rgba(${c2},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(CX, CY, SUN_R * 11, 0, Math.PI * 2);
      ctx.fill();
      const wash = ctx.createRadialGradient(CX, CY, SUN_R * 0.6, CX, CY, SUN_R * 5);
      wash.addColorStop(0, `rgba(${attack ? "255,150,140" : "255,230,180"},${0.55 + pulse * 0.08})`);
      wash.addColorStop(0.2, `rgba(${c1},0.28)`);
      wash.addColorStop(0.55, `rgba(${c2},0.07)`);
      wash.addColorStop(1, `rgba(${c2},0)`);
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.arc(CX, CY, SUN_R * 5, 0, Math.PI * 2);
      ctx.fill();
      // Rays (Cinematic)
      if (cfg.rays) {
        ctx.save();
        ctx.translate(CX, CY);
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2 + t * 0.02 * (i % 2 ? 1 : -1) + Math.sin(i * 12.9) * 0.1;
          const L = SUN_R * (1.7 + 0.6 * Math.sin(t * 0.6 + i * 1.7) + (i % 3) * 0.25);
          const wdt = SUN_R * 0.09;
          const rg = ctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
          rg.addColorStop(0, `rgba(${c1},0.09)`);
          rg.addColorStop(1, `rgba(${c1},0)`);
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a + Math.PI / 2) * wdt, Math.sin(a + Math.PI / 2) * wdt);
          ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L);
          ctx.lineTo(Math.cos(a - Math.PI / 2) * wdt, Math.sin(a - Math.PI / 2) * wdt);
          ctx.fill();
        }
        ctx.restore();
      }

      // Corona
      const cor = ctx.createRadialGradient(CX, CY, SUN_R * 0.9, CX, CY, SUN_R * 1.9);
      cor.addColorStop(0, `rgba(255,${attack ? 140 : 230},${attack ? 120 : 160},0.75)`);
      cor.addColorStop(0.3, `rgba(${c1},0.35)`);
      cor.addColorStop(1, `rgba(${c2},0)`);
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(CX, CY, SUN_R * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // Surface (spins faster than planets so it looks alive)
      const sunPx = SUN_R * 2 * view.scale * cam.z * view.dpr;
      let sprite = planetSprite("sun", 3, spriteBucket(sunPx, Math.min(cfg.maxSprite, 512)), cfg.frames);
      if (!sprite.frames[0]) sprite = planetSprite("sun", 3, spriteBucket(Math.min(sunPx, 192), 192), cfg.frames);
      let f0 = 0;
      let frac = 0;
      if (cfg.spin && sprite.count > 1) {
        const pos = ((t * 0.02) % 1) * sprite.count;
        f0 = Math.floor(pos) % sprite.count;
        frac = pos - Math.floor(pos);
      }
      const sf = sprite.frames[f0] ?? sprite.frames[0];
      if (sf) ctx.drawImage(sf.a, CX - SUN_R, CY - SUN_R, SUN_R * 2, SUN_R * 2);
      const nxt = sprite.frames[(f0 + 1) % sprite.count];
      if (frac > 0.02 && nxt) {
        ctx.globalAlpha = frac;
        ctx.drawImage(nxt.a, CX - SUN_R, CY - SUN_R, SUN_R * 2, SUN_R * 2);
        ctx.globalAlpha = 1;
      }
      // Hot rim + bloom
      ctx.globalCompositeOperation = "lighter";
      const rim = ctx.createRadialGradient(CX, CY, SUN_R * 0.7, CX, CY, SUN_R * 1.05);
      rim.addColorStop(0, "rgba(255,200,120,0)");
      rim.addColorStop(1, `rgba(${attack ? "255,90,80" : "255,236,190"},0.5)`);
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(CX, CY, SUN_R * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      if (attack) {
        ctx.fillStyle = `rgba(255,30,50,${0.28 + pulse * 0.12})`;
        ctx.beginPath();
        ctx.arc(CX, CY, SUN_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let lastT = 0;
    redrawRef.current = () => draw(lastT);
    // Low detail has no animation loop; still let the camera glide when the selection changes.
    let kickRaf = 0;
    kickRef.current = () => {
      if (cfg.fps) return;
      cancelAnimationFrame(kickRaf);
      const until = performance.now() + 1800;
      lastDraw = performance.now();
      const step = () => {
        draw(lastT);
        if (performance.now() < until) kickRaf = requestAnimationFrame(step);
      };
      kickRaf = requestAnimationFrame(step);
    };
    function draw(t: number) {
      lastT = t;
      updateCamera();
      const now = Date.now();

      // Positions + move the interactive layer
      for (const b of bodiesRef.current) {
        const theta = b.phase + t * SPEED[b.ring];
        const since = b.arrivedAt ? (now - b.arrivedAt) / 3000 : 1;
        const k = since < 1 ? 1 + 1.4 * Math.pow(1 - since, 3) : 1;
        const rx = (RINGS[b.ring] + b.dr) * k;
        b.x = CX + rx * Math.cos(theta);
        b.y = CY + rx * TILT * Math.sin(theta);
        const depth = (Math.sin(theta) + 1) / 2;
        b.s = 1;
        b.behind = false;
        void depth;
        const el = els.current.get(b.mac);
        if (el) el.setAttribute("transform", `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) scale(${b.s.toFixed(3)})`);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (bg) ctx.drawImage(bg, 0, 0);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
      toView();

      for (const s of twinklers) {
        ctx.globalAlpha = 0.2 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.p));
        ctx.fillStyle = "#eef2ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Nearby networks: bright distant stars (fade out while the camera is zoomed in)
      const far = Math.max(0, 1 - (cam.z - 1) * 1.5);
      for (const s of fxRef.current.stars) {
        if (!far) break;
        const tw = cfg.fps ? 0.75 + 0.25 * Math.sin(t * (s.twin ? 7 : 1.3) + s.x) : 1;
        ctx.globalAlpha = tw * far;
        const size = s.size * 2;
        ctx.drawImage(starSprite(s.color), s.x - size / 2, s.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // Orbits
      ctx.lineWidth = 0.7 / cam.z;
      for (let i = 0; i < RINGS.length; i++) {
        ctx.strokeStyle = i === 3 ? "rgba(255,110,120,0.22)" : "rgba(210,220,255,0.1)";
        ctx.setLineDash(i === 3 ? [3 / cam.z, 7 / cam.z] : []);
        ctx.beginPath();
        ctx.ellipse(CX, CY, RINGS[i], RINGS[i] * TILT, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Scan ping: a soft wave leaves the router each time Orbit finishes a scan
      const pk = cfg.fps ? (performance.now() - fxRef.current.pulse) / 2400 : 1;
      if (pk >= 0 && pk < 1) {
        const ease = 1 - Math.pow(1 - pk, 2.2);
        const pr = SUN_R * 1.2 + ease * (RINGS[3] + 60 - SUN_R * 1.2);
        const fade = Math.pow(1 - pk, 1.6);
        const tint = fxRef.current.attack ? "255,90,100" : "79,227,216";
        const band = ctx.createRadialGradient(CX, CY, Math.max(0, pr - 26), CX, CY, pr);
        band.addColorStop(0, `rgba(${tint},0)`);
        band.addColorStop(1, `rgba(${tint},${0.09 * fade})`);
        ctx.fillStyle = band;
        ctx.beginPath();
        ctx.arc(CX, CY, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(${tint},${0.45 * fade})`;
        ctx.lineWidth = 1.4 / cam.z;
        ctx.beginPath();
        ctx.arc(CX, CY, pr, 0, Math.PI * 2);
        ctx.stroke();
        // Each orbit lights up briefly as the wave passes it
        for (const R of RINGS) {
          const hit = Math.max(0, 1 - Math.abs(pr - R) / 30);
          if (!hit) continue;
          ctx.strokeStyle = `rgba(${tint},${0.35 * hit * fade})`;
          ctx.lineWidth = 1.2 / cam.z;
          ctx.beginPath();
          ctx.arc(CX, CY, R, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Orbit trails: a fading arc behind each planet
      if (cfg.fps) {
        ctx.lineCap = "round";
        for (const b of bodiesRef.current) {
          const theta = b.phase + t * SPEED[b.ring];
          const R = RINGS[b.ring];
          const segs = 14;
          const span = 0.55;
          for (let i = 0; i < segs; i++) {
            const a0 = theta - span + (span * i) / segs;
            const a1 = theta - span + (span * (i + 1)) / segs;
            ctx.strokeStyle = b.stranger ? `rgba(255,100,110,${(i / segs) * 0.5})` : `rgba(200,215,255,${(i / segs) * 0.35})`;
            ctx.lineWidth = (0.6 + (i / segs) * 1.6) / cam.z;
            ctx.beginPath();
            ctx.arc(CX, CY, R, a0, a1);
            ctx.stroke();
          }
        }
      }

      // Storm around the sun (far side first)
      const storm = fxRef.current.attack ? cfg.storm : 0;
      const stormRock = (front: boolean) => {
        for (let i = 0; i < storm; i++) {
          const a = i * 0.83 + t * (0.55 + 0.18 * (i % 5));
          if (Math.sin(a) > 0 !== front) continue;
          const rr = SUN_R + 10 + (i % 6) * 9 + 6 * Math.sin(t * 0.8 + i);
          rockStyle(front ? 0.9 : 0.4);
          rock(CX + rr * Math.cos(a), CY + rr * Math.sin(a), 2.6 + ((i * 5) % 6) * 0.7, t * (i % 2 ? 1.6 : -1.2) + i, i);
        }
      };

      const sorted = [...bodiesRef.current].sort((a, b) => a.y - b.y);
      const belt = (b: Body, front: boolean) => {
        if (!b.threat || !cfg.rocks) return;
        const R = b.r * b.s;
        for (let i = 0; i < cfg.rocks; i++) {
          const a = i * 2.4 + t * (0.9 + 0.22 * (i % 4)) + b.phase;
          if (Math.sin(a) > 0 !== front) continue;
          const rr = R * 1.7 + (i % 3) * 4;
          rockStyle(front ? 0.8 : 0.35);
          rock(b.x + rr * Math.cos(a), b.y + rr * Math.sin(a), 2.1 + ((i * 7) % 5) * 0.5, t * (i % 2 ? 1.3 : -1.1) + i, i);
        }
      };
      const drawBody = (b: Body) => {
        belt(b, false);
        planet(b, t);
        belt(b, true);
      };

      for (const b of sorted) if (b.behind) drawBody(b);
      stormRock(false);
      sun(t);
      stormRock(true);
      for (const b of sorted) if (!b.behind) drawBody(b);

      // Explosions of ejected devices: flash, fireball, shockwave, debris
      const nowMs = performance.now();
      fxRef.current.booms = fxRef.current.booms.filter((bm) => nowMs - bm.t0 < 2600);
      for (const bm of fxRef.current.booms) {
        const k = (nowMs - bm.t0) / 1000; // seconds since boom
        ctx.globalCompositeOperation = "lighter";
        if (k < 0.35) {
          const f = 1 - k / 0.35;
          const fl = ctx.createRadialGradient(bm.x, bm.y, 0, bm.x, bm.y, bm.r * (3 + k * 10));
          fl.addColorStop(0, `rgba(255,255,240,${f})`);
          fl.addColorStop(0.4, `rgba(255,200,120,${f * 0.6})`);
          fl.addColorStop(1, "rgba(255,120,60,0)");
          ctx.fillStyle = fl;
          ctx.beginPath();
          ctx.arc(bm.x, bm.y, bm.r * (3 + k * 10), 0, Math.PI * 2);
          ctx.fill();
        }
        if (k < 1.6) {
          const f = 1 - k / 1.6;
          const R = bm.r * (1.4 + k * 3.6);
          const fb = ctx.createRadialGradient(bm.x, bm.y, 0, bm.x, bm.y, R);
          fb.addColorStop(0, `rgba(255,230,170,${f * 0.9})`);
          fb.addColorStop(0.45, `rgba(255,120,40,${f * 0.7})`);
          fb.addColorStop(1, "rgba(120,20,10,0)");
          ctx.fillStyle = fb;
          ctx.beginPath();
          ctx.arc(bm.x, bm.y, R, 0, Math.PI * 2);
          ctx.fill();
        }
        // Shockwave ring
        const sw = k * bm.r * 9;
        ctx.strokeStyle = `rgba(255,210,170,${Math.max(0, 0.7 - k * 0.35)})`;
        ctx.lineWidth = Math.max(0.3, (3 - k * 1.2)) / cam.z;
        ctx.beginPath();
        ctx.arc(bm.x, bm.y, sw, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        // Debris
        const ease = 1 - Math.pow(1 - Math.min(1, k / 2.4), 2);
        for (const p of bm.parts) {
          const x = bm.x + Math.cos(p.a) * p.v * ease;
          const y = bm.y + Math.sin(p.a) * p.v * ease;
          const fade = Math.max(0, 1 - k / 2.6);
          if (p.hot) {
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = `rgba(255,${Math.round(150 + 80 * fade)},80,${fade})`;
            ctx.beginPath();
            ctx.arc(x, y, p.s * 0.5 * fade + 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
          } else {
            ctx.globalAlpha = fade;
            rockStyle(0.5);
            rock(x, y, p.s, k * p.spin, Math.floor(p.s * 10));
            ctx.globalAlpha = 1;
          }
        }
      }

      // Meteors diving at the sun during an attack
      if (fxRef.current.attack && cfg.meteors) {
        if (meteors.length < 4 && Math.random() < 0.05) {
          const a = Math.random() * Math.PI * 2;
          const x = CX + Math.cos(a) * 560;
          const y = CY + Math.sin(a) * 360;
          const dx = CX - x;
          const dy = CY - y;
          const l = Math.hypot(dx, dy);
          meteors.push({ x, y, vx: (dx / l) * 9, vy: (dy / l) * 9 });
        }
        ctx.lineCap = "round";
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.x += m.vx;
          m.y += m.vy;
          if (Math.hypot(m.x - CX, m.y - CY) < SUN_R) {
            meteors.splice(i, 1);
            continue;
          }
          const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 8, m.y - m.vy * 8);
          g.addColorStop(0, "rgba(255,230,200,1)");
          g.addColorStop(0.3, "rgba(255,140,90,0.7)");
          g.addColorStop(1, "rgba(255,80,90,0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x - m.vx * 8, m.y - m.vy * 8);
          ctx.stroke();
        }
      }
    }

    // Frame pacing + auto level of detail
    let raf = 0;
    let last = 0;
    const start = performance.now();
    let slow = 0;
    let frames = 0;
    let fpsWindow = performance.now();
    const minGap = cfg.fps ? 1000 / cfg.fps : Infinity;

    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (now - last < minGap - 2) return;
      const gap = now - last;
      last = now;
      const t0 = performance.now();
      // Orbital time only advances while playing, and survives detail-level changes.
      const step = clock.last ? Math.min(0.1, (now - clock.last) / 1000) : 0;
      clock.last = now;
      if (!pausedRef.current) clock.t += step;
      draw(clock.t);
      const work = performance.now() - t0;
      frames++;
      // Step down only when drawing itself is slow. Gaps between frames are ignored: Windows
      // throttles background windows, which says nothing about how fast the laptop is.
      if (prefs.quality === "auto" && level !== "low" && now - start > 4000 && !document.hidden && gap < 250) {
        slow = work > 14 ? slow + 1 : Math.max(0, slow - 2);
        if (slow > 90) {
          setAutoLevel(level === "high" ? "balanced" : "low");
          return;
        }
      }
      if (now - fpsWindow > 1000) {
        setPerf({ level, fps: Math.round((frames * 1000) / (now - fpsWindow)) });
        frames = 0;
        fpsWindow = now;
      }
    }

    function startLoop() {
      cancelAnimationFrame(raf);
      if (cfg.fps && !document.hidden) raf = requestAnimationFrame(loop);
    }
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : startLoop());

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    if (!cfg.fps) {
      draw(0);
      setPerf({ level, fps: 0 });
      // Planet art finishes generating in the background; refresh the still image once.
      setTimeout(() => draw(0), 1200);
    }
    startLoop();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      redrawRef.current = () => {};
    };
  }, [level, prefs.quality, texturesReady]);

  useEffect(() => {
    kickRef.current();
  }, [selected]);

  // Esc flies the camera back out to the whole system
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Place new planets right away after a re-render (and redraw the still image in Low detail).
  useLayoutEffect(() => {
    redrawRef.current();
  }, [scene, sunUnderAttack, level, stars]);

  const isSel = (kind: string, id: string) =>
    selected?.kind === kind && ((selected as { mac?: string }).mac ?? (selected as { key?: string }).key) === id;

  return (
    <div ref={wrapRef} className={cn("relative h-full w-full", level === "low" && "lod-low")}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full select-none"
        onClick={() => setSelected(null)}
        role="img"
        aria-label="Map of your network as a star system"
      >
        <g ref={camGRef}>
        <g ref={farRef}>
        {RINGS.map((rx, i) => (
          <text
            key={rx}
            x={CX}
            y={CY - rx - 5}
            textAnchor="middle"
            className="text-[8.5px] tracking-[0.14em] uppercase"
            fill={i === 3 ? "rgba(255,120,130,0.38)" : "rgba(200,210,255,0.2)"}
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {RING_NAMES[i]}
          </text>
        ))}

        {stars.map((s) => {
          const sel = isSel("nearby", s.key);
          const showLabel = sel || s.twin || s.rank < 10 || (s.sec.level === "critical" && s.rank < 16);
          const label = s.n.ssid || "Hidden network";
          return (
            <g
              key={s.key}
              transform={`translate(${s.x} ${s.y})`}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setSelected({ kind: "nearby", key: s.key });
              }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            >
              <circle r={15} fill="transparent" />
              {sel && <circle r={13} fill="none" stroke="var(--color-sodium)" strokeDasharray="3 4" />}
              {showLabel && (
                <text
                  y={s.size * 0.5 + 14}
                  textAnchor="middle"
                  className="text-[11px]"
                  fill={s.twin ? "#ff8a94" : "rgba(220,226,255,0.7)"}
                  style={{ fontFamily: "var(--font-sans)", paintOrder: "stroke", stroke: "rgba(5,6,18,0.7)", strokeWidth: 3 }}
                >
                  {label.length > 18 ? label.slice(0, 17) + "…" : label}
                </text>
              )}
            </g>
          );
        })}
        </g>

        <g
          transform={`translate(${CX} ${CY})`}
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setSelected({ kind: "home" });
          }}
        >
          <circle r={SUN_R + 6} fill="transparent" />
          <g ref={sunLabelRef} transform={`translate(0 ${SUN_R})`}>
          <text
            y={26}
            textAnchor="middle"
            className="fill-ink text-[15px] font-semibold"
            style={{ fontFamily: "var(--font-display)", paintOrder: "stroke", stroke: "rgba(5,6,18,0.75)", strokeWidth: 4 }}
          >
            {home?.ssid || "Your router"}
          </text>
          <text
            y={42}
            textAnchor="middle"
            className="text-[11px]"
            fill={sunUnderAttack ? "#ff8a94" : "rgba(220,226,255,0.7)"}
            style={{ fontFamily: "var(--font-sans)", paintOrder: "stroke", stroke: "rgba(5,6,18,0.75)", strokeWidth: 3 }}
          >
            {sunUnderAttack ? "Under attack" : `Router ${snap.gateway.ip}`}
          </text>
          </g>
        </g>

        {scene.map(({ d, m, stranger, r, ring }) => {
          const tone = toneOf(d, m, stranger);
          const sel = isSel("device", d.mac);
          const name = nameFor(d, m);
          // Busy rings would bury the map in labels: show names on hover there.
          const crowded = (2 * Math.PI * RINGS[ring]) / Math.max(1, ringCounts[ring]) < 118;
          const showName = !crowded || sel || hover === d.mac || d.isSelf || stranger;
          return (
            <g
              key={d.mac}
              ref={(el) => {
                if (el) els.current.set(d.mac, el);
                else els.current.delete(d.mac);
              }}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setSelected({ kind: "device", mac: d.mac });
              }}
              onMouseEnter={() => setHover(d.mac)}
              onMouseLeave={() => setHover(null)}
            >
              <circle r={r + 6} fill="transparent" />
              {stranger && !sel && <circle r={r + 2} fill="none" stroke={TONES.stranger} strokeWidth={1.4} className="orbit-ping" />}
              {!sel && hover === d.mac && (
                <circle r={r + 7} fill="none" stroke="rgba(220,226,255,0.5)" strokeWidth={1.4} strokeDasharray="3 4" />
              )}
              <g
                ref={(el) => {
                  if (el) labelEls.current.set(d.mac, { el, r });
                  else labelEls.current.delete(d.mac);
                }}
                transform={`translate(0 ${r + 15})`}
                opacity={showName ? 1 : 0}
                style={{ transition: "opacity 160ms" }}
              >
                {(() => {
                  const label = name.length > 22 ? name.slice(0, 21) + "…" : name;
                  const w = label.length * 5.9 + 30;
                  return (
                    <>
                      <rect
                        x={-w / 2}
                        y={-1}
                        width={w}
                        height={19}
                        rx={9.5}
                        fill={sel ? "rgba(40,32,12,0.82)" : "rgba(6,8,20,0.62)"}
                        stroke={sel ? "rgba(255,181,71,0.55)" : stranger ? "rgba(255,107,122,0.45)" : "rgba(255,255,255,0.09)"}
                      />
                      <circle cx={-w / 2 + 10} cy={8.5} r={2.6} fill={TONES[tone]} />
                      <text
                        x={-w / 2 + 18}
                        y={12.5}
                        textAnchor="start"
                        className="text-[10.5px]"
                        fill="rgba(236,240,255,0.92)"
                        style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.01em" }}
                      >
                        {label}
                      </text>
                    </>
                  );
                })()}
              </g>
            </g>
          );
        })}

        {hovered && (
          <g
            transform={`translate(${Math.min(W - 190, Math.max(10, hovered.x - 90))} ${hovered.y > H / 2 ? hovered.y - 78 : hovered.y + 26})`}
            pointerEvents="none"
          >
            <rect width={180} height={52} rx={10} fill="rgba(20,26,58,0.95)" stroke="var(--color-line)" />
            <text x={12} y={21} className="fill-ink text-[12px] font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
              {(hovered.n.ssid || "Hidden network").slice(0, 24)}
            </text>
            <text
              x={12}
              y={39}
              className="text-[11px]"
              fill={hovered.twin || hovered.sec.level === "critical" ? "var(--color-danger)" : "var(--color-ink-muted)"}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {hovered.twin ? "Fake copy of your network?" : hovered.sec.label}, signal {hovered.n.maxSignal}%
            </text>
          </g>
        )}
        </g>
      </svg>
    </div>
  );
}
