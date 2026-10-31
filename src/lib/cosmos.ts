import { createStore } from "./store";
// Procedural space art, generated once and cached.
// Planet surfaces are painted on a seamless sphere (3D noise), unwrapped into a lon/lat
// texture, then turned into rotation frames. Drawing a planet per frame is one drawImage
// plus a lighting gradient, so the map stays light even at high quality.

// ---------- Noise ----------
const PERM = (() => {
  const p = new Uint8Array(512);
  let s = 1337;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return p;
})();
const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const h3 = (x: number, y: number, z: number) => PERM[(PERM[(PERM[x & 255] + y) & 255] + z) & 255] / 255;

function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const a = lerp(lerp(h3(xi, yi, zi), h3(xi + 1, yi, zi), xf), lerp(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), xf), yf);
  const b = lerp(lerp(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), xf), lerp(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), xf), yf);
  return lerp(a, b, zf);
}
function fbm3(x: number, y: number, z: number, oct = 5) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * noise3(x * f, y * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / norm;
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function ramp(stops: [number, string][], t: number): RGB {
  const s = stops.map(([p, c]) => [p, hex(c)] as [number, RGB]);
  if (t <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) if (t <= s[i][0]) return mix(s[i - 1][1], s[i][1], (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
  return s[s.length - 1][1];
}

// ---------- Planet surfaces ----------
// Every world is invented: a planet archetype plus a palette and shape picked from the
// device's seed, so no two devices look alike and none is a copy of a real planet.
export type PlanetType = "terra" | "gas" | "ice" | "dune" | "rock" | "storm" | "lava" | "sun";

type Shader = (x: number, y: number, z: number, lat: number) => RGB;
const P = (...h: string[]) => h.map(hex);
const rnd = (seed: number, k: number) => {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const pick = <T,>(arr: T[], seed: number, k: number) => arr[Math.floor(rnd(seed, k) * arr.length) % arr.length];
function rampP(stops: RGB[], t: number): RGB {
  const n = stops.length - 1;
  const f = Math.max(0, Math.min(0.9999, t)) * n;
  const i = Math.floor(f);
  return mix(stops[i], stops[i + 1], f - i);
}
const ridged = (x: number, y: number, z: number) => 1 - Math.abs(noise3(x, y, z) * 2 - 1);

// Cheap 3D cellular noise for craters: distance to the nearest random point.
function cell(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let best = 9;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let k = -1; k <= 1; k++) {
        const cx = xi + i, cy = yi + j, cz = zi + k;
        const dx = cx + h3(cx, cy, cz) - x, dy = cy + h3(cy, cz, cx) - y, dz = cz + h3(cz, cx, cy) - z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) best = d;
      }
  return Math.sqrt(best);
}
function craters(x: number, y: number, z: number, scale: number) {
  const d = cell(x * scale, y * scale, z * scale);
  if (d > 0.5) return 0;
  // Dark bowl with a bright raised rim
  const rim = Math.max(0, 1 - Math.abs(d - 0.38) / 0.07);
  const bowl = d < 0.36 ? (0.36 - d) / 0.36 : 0;
  return rim * 0.55 - bowl * 0.45;
}

// Alien oceans: [deep, shallow, shore, lowland, highland, peak]
const TERRA = [
  P("#04222c", "#0e6a74", "#c8c79a", "#6a4c8c", "#43305e", "#efe6ff"), // teal sea, violet forests
  P("#0b0d33", "#2b2f8a", "#e2c48a", "#c26a2a", "#7a3a1c", "#fff1d8"), // indigo sea, amber plains
  P("#03261f", "#0f7a5c", "#d6d2a6", "#a8432d", "#5e2418", "#f6e9e0"), // emerald sea, rust highlands
  P("#071733", "#1a4d8f", "#e9d9b6", "#b24f86", "#5c2a52", "#fde8f6"), // blue sea, magenta jungles
  P("#26070d", "#7a1a28", "#e6d2b0", "#cfc3a4", "#7d7563", "#ffffff"), // crimson sea, bone continents
  P("#061c24", "#13606b", "#d9e2b0", "#6f9a3a", "#3c5a24", "#f2f6ea"), // jade world
];
// Gas giants: five band colours
const GAS = [
  P("#6e3049", "#c47186", "#f4d7cf", "#9c4f66", "#ecd3c6"), // rose
  P("#132b4a", "#2c7c97", "#a6e3da", "#21507a", "#d2f1f0"), // teal-indigo
  P("#5a2f16", "#c27633", "#f3d79c", "#93501f", "#f1e4c5"), // gold-rust
  P("#33255f", "#69c2a4", "#e5f4e8", "#54459a", "#c6e6db"), // mint-violet
  P("#3a1e2e", "#a3577a", "#e8b8a6", "#5f2f4f", "#f4dcd0"), // plum-peach
  P("#20313a", "#7b9aa6", "#e6e1d3", "#4b6672", "#f5efe2"), // slate-ivory
];
const ICE = [
  P("#9fc6de", "#d6ecf6", "#ffffff", "#2b6f9e"), // blue ice, deep blue cracks
  P("#bba9d9", "#e6dcf6", "#ffffff", "#7a3c8c"), // lilac ice, violet cracks
  P("#a9dccb", "#e0f6ee", "#ffffff", "#2c7a6a"), // mint ice
  P("#d8c6b0", "#f2e8dc", "#ffffff", "#9a4a2a"), // cream ice, rust cracks
];
const DUNE = [
  P("#3b1d12", "#8a3f1f", "#cf7a3a", "#f0b878", "#fbe0b4"), // red desert
  P("#2c2a3a", "#5a5470", "#9a8fa8", "#d2c4c8", "#f4ece6"), // violet dust
  P("#23301c", "#4f6230", "#8f9a52", "#d4c98a", "#f3ecc6"), // olive steppe
  P("#3a2a14", "#7d5a2a", "#c09a56", "#e9d29a", "#fbf2d8"), // ochre canyons
];
const ROCK = [
  P("#1e1d22", "#4a4750", "#8a8590", "#cfcad2"), // basalt
  P("#2a1c16", "#6a4a38", "#a98a72", "#e6d4c2"), // sandstone
  P("#14231f", "#2f5048", "#6e9488", "#cfe2da"), // verdigris
  P("#241a2c", "#54406a", "#9a86b0", "#e2d8ee"), // amethyst
];
const STORM = [
  P("#2e3a10", "#7c9a1e", "#d8e65a", "#fbf8c8"), // acid
  P("#2a2246", "#6a5aa8", "#b8a8e8", "#f4f0ff"), // lavender
  P("#3e1e14", "#b2603a", "#f0b08a", "#fff0e2"), // peach
  P("#0e2a2e", "#2a8a8a", "#8ae0d0", "#eafffb"), // aqua
];

// Set by the terra shader for the pixel it just painted: 0 = sea, >0 = height above the shore.
let terraLand = 0;

let cloudCache: { d: Uint8ClampedArray; w: number; h: number } | null = null;
function cloudPixels() {
  if (cloudCache) return cloudCache;
  const img = realImg.get("clouds");
  if (!img) return null;
  const w = 1024, h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  cloudCache = { d: ctx.getImageData(0, 0, w, h).data, w, h };
  return cloudCache;
}

function makeShader(type: PlanetType, seed: number): Shader {
  const s = (seed % 97) * 0.37;
  switch (type) {
    case "terra": {
      const p = pick(TERRA, seed, 1);
      const sea = 0.46 + rnd(seed, 2) * 0.1; // more or less ocean
      const freq = 1.4 + rnd(seed, 3) * 1.1;
      const caps = rnd(seed, 4) > 0.3;
      return (x, y, z, lat) => {
        const wx = fbm3(x * 1.2 + s, y * 1.2, z * 1.2, 3) * 0.8;
        const hgt = fbm3(x * freq + wx + s, y * freq + wx, z * freq, 7);
        let c: RGB;
        terraLand = hgt < sea ? 0 : (hgt - sea) / (1 - sea);
        if (hgt < sea) c = mix(p[0], p[1], Math.pow(hgt / sea, 3));
        else {
          const k = (hgt - sea) / (1 - sea);
          const rough = ridged(x * 6 + s, y * 6, z * 6);
          c = k < 0.04 ? mix(p[2], p[3], k / 0.04) : k < 0.35 ? mix(p[3], p[4], (k - 0.04) / 0.31 + rough * 0.15) : mix(p[4], p[5], Math.max(0, (k - 0.35) * 1.8 + rough * 0.2 - 0.25));
        }
        if (caps && Math.abs(lat) > 1.18) c = mix(c, p[5], Math.min(1, (Math.abs(lat) - 1.18) * 5));
        return c;
      };
    }
    case "gas": {
      const p = pick(GAS, seed, 1);
      const bands = 7 + rnd(seed, 2) * 10;
      const turb = 2.5 + rnd(seed, 3) * 3;
      const storm = { lon: rnd(seed, 4) * 6.28, lat: (rnd(seed, 5) - 0.5) * 1.6, r: 0.12 + rnd(seed, 6) * 0.12, on: rnd(seed, 7) > 0.35 };
      const stormC = mix(p[0], hex("#ffffff"), 0.15 + rnd(seed, 8) * 0.4);
      return (x, y, z, lat) => {
        const w1 = fbm3(x * 2 + s, y * 6, z * 2, 5);
        const w2 = fbm3(x * 3.4 + w1 * 2.2, y * 10 + w1 * 1.6, z * 3.4 + s, 5);
        const b = Math.sin(lat * bands + (w2 - 0.5) * turb + (w1 - 0.5) * 1.2) * 0.5 + 0.5;
        let c = rampP(p, b);
        const fine = Math.sin(lat * bands * 3.3 + w2 * 7);
        c = mix(c, p[4], Math.max(0, fine) * 0.12);
        c = mix(c, p[0], Math.max(0, -fine) * 0.08);
        const streak = fbm3(x * 1.1 + s, y * 55, z * 1.1, 3);
        c = mix(c, p[2], Math.max(0, streak - 0.56) * 0.6);
        if (storm.on) {
          const lon = Math.atan2(z, x);
          let dl = lon - storm.lon;
          dl = Math.atan2(Math.sin(dl), Math.cos(dl));
          const d = Math.hypot(dl * 0.55, (lat - storm.lat) * 1.5);
          if (d < storm.r) c = mix(c, mix(stormC, p[2], 0.5 + 0.5 * Math.sin(d * 80 + w1 * 6)), Math.min(1, ((storm.r - d) / storm.r) * 2.2));
        }
        return c;
      };
    }
    case "ice": {
      const p = pick(ICE, seed, 1);
      return (x, y, z, lat) => {
        const t = fbm3(x * 2.4 + s, y * 2.4, z * 2.4, 6);
        let c = rampP([p[0], p[1], p[2]], t * 1.2 - 0.1);
        const r1 = ridged(x * 3.5 + s, y * 3.5, z * 3.5);
        const r2 = ridged(x * 8 + s * 2, y * 8, z * 8);
        const r3 = ridged(x * 17 + s, y * 17, z * 17);
        c = mix(c, p[3], Math.pow(r1, 18) * 0.85 + Math.pow(r2, 24) * 0.6 + Math.pow(r3, 30) * 0.4);
        c = mix(c, p[2], Math.max(0, Math.abs(lat) - 1.05) * 0.8);
        return c;
      };
    }
    case "dune": {
      const p = pick(DUNE, seed, 1);
      return (x, y, z, lat) => {
        const t = fbm3(x * 2.2 + s, y * 2.2, z * 2.2, 6);
        const canyon = Math.pow(ridged(x * 2.6 + s, y * 2.6, z * 2.6), 10);
        const dunes = Math.sin((x + y * 0.4) * 60 + fbm3(x * 4, y * 4, z * 4 + s, 3) * 12) * 0.5 + 0.5;
        let c = rampP(p, t * 1.15 - 0.05 + dunes * 0.05);
        c = mix(c, p[0], canyon * 0.75);
        c = mix(c, p[4], Math.max(0, craters(x, y, z, 5) * 0.6));
        if (Math.abs(lat) > 1.3) c = mix(c, hex("#f6f2ea"), (Math.abs(lat) - 1.3) * 5);
        return c;
      };
    }
    case "rock": {
      const p = pick(ROCK, seed, 1);
      return (x, y, z) => {
        const t = fbm3(x * 2.8 + s, y * 2.8, z * 2.8, 6);
        const cr = craters(x, y, z, 4) + craters(x + 3, y, z, 9) * 0.6 + craters(x, y + 5, z, 18) * 0.35;
        return rampP(p, t * 0.95 + cr * 0.45);
      };
    }
    case "storm": {
      const p = pick(STORM, seed, 1);
      return (x, y, z, lat) => {
        const a = fbm3(x * 1.8 + s, y * 1.8, z * 1.8, 4);
        const b = fbm3(x * 2.4 + a * 3, y * 4 + a * 2, z * 2.4 + s, 5);
        const c2 = fbm3(x * 3 + b * 3, y * 3 + b * 2, z * 3, 5);
        return rampP(p, c2 * 1.25 - 0.15 + Math.cos(lat * 3) * 0.05);
      };
    }
    case "lava":
      return (x, y, z) => {
        const t = fbm3(x * 2.6 + s, y * 2.6, z * 2.6, 5);
        const ridge = ridged(x * 5 + s, y * 5, z * 5);
        const base = ramp([[0, "#120a0c"], [0.6, "#2b1418"], [1, "#4a2222"]], t);
        return mix(base, [255, 96, 40], Math.pow(ridge, 7) * 1.6);
      };
    case "sun":
      return (x, y, z) => {
        const g = fbm3(x * 9 + s, y * 9, z * 9, 4);
        const big = fbm3(x * 2.2, y * 2.2, z * 2.2 + s, 3);
        return ramp([[0.25, "#f06a14"], [0.42, "#ff9a2a"], [0.56, "#ffc552"], [0.7, "#ffe7a0"], [0.86, "#fffbe8"]], g * 0.75 + big * 0.38);
      };
  }
}

// Glowing parts: lava cracks, and city lights on the inhabited world (this computer).
const EMISSIVE: Partial<Record<PlanetType, (x: number, y: number, z: number, seed: number) => number>> = {
  lava: (x, y, z, s) => {
    const r1 = 1 - Math.abs(noise3(x * 5 + s, y * 5, z * 5) * 2 - 1);
    const r2 = 1 - Math.abs(noise3(x * 11 + s, y * 11, z * 11) * 2 - 1);
    return Math.min(1, Math.pow(r1, 9) * 1.3 + Math.pow(r2, 14) * 0.7);
  },
};
const EMISSIVE_COLOR: Partial<Record<PlanetType, RGB>> = { lava: [255, 120, 40], terra: [255, 205, 130] };

const TEX_W = 320;
const TEX_H = 160;
// A little extra drift on top of the palette so even two worlds with the same palette differ.
const VARIETY: Record<PlanetType, { hue: number; sat: [number, number]; light: [number, number] }> = {
  terra: { hue: 14, sat: [0.85, 1.05], light: [0.92, 1.05] },
  gas: { hue: 20, sat: [0.8, 1.05], light: [0.9, 1.06] },
  ice: { hue: 16, sat: [0.8, 1.05], light: [0.94, 1.04] },
  dune: { hue: 14, sat: [0.8, 1.05], light: [0.9, 1.05] },
  rock: { hue: 14, sat: [0.7, 1.05], light: [0.88, 1.08] },
  storm: { hue: 18, sat: [0.8, 1.05], light: [0.92, 1.05] },
  lava: { hue: 10, sat: [0.85, 1.05], light: [0.9, 1.1] },
  sun: { hue: 0, sat: [1, 1], light: [1, 1] },
};
function hueRotate(c: RGB, deg: number, sat: number, light: number): RGB {
  // YIQ rotation keeps brightness while turning the colour wheel
  const y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const i = 0.596 * c[0] - 0.274 * c[1] - 0.322 * c[2];
  const q = 0.211 * c[0] - 0.523 * c[1] + 0.312 * c[2];
  const a = (deg * Math.PI) / 180;
  const ni = (i * Math.cos(a) - q * Math.sin(a)) * sat;
  const nq = (i * Math.sin(a) + q * Math.cos(a)) * sat;
  return [(y + 0.956 * ni + 0.621 * nq) * light, (y - 0.272 * ni - 0.647 * nq) * light, (y - 1.106 * ni + 1.703 * nq) * light];
}


// ---------- Real planet maps (Solar System Scope, CC BY 4.0) ----------
// Loaded once at startup. Until they arrive (or if they're missing) the procedural art is used.

const REAL_NAMES: Partial<Record<PlanetType, string>> = { sun: "sun" };
const realImg = new Map<string, HTMLImageElement>();
export const [useTexturesReady, setTexturesReady] = createStore(false);

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let loading: Promise<void> | null = null;
export function loadRealTextures() {
  if (loading) return loading;
  const names = [...new Set([...Object.values(REAL_NAMES), "clouds", "sky"])] as string[];
  loading = (async () => {
    await Promise.all(
      names.map(async (n) => {
        const src = typeof window !== "undefined" && window.api ? await window.api.textures.get(n) : `./textures/${n}.jpg`;
        if (!src) return;
        const img = await loadImage(src);
        if (img) realImg.set(n, img);
      })
    );
    if (realImg.size) {
      texCache.clear();
      spriteCache.clear();
      setTexturesReady(true);
    }
  })();
  return loading;
}
export const skyImage = () => realImg.get("sky") ?? null;

/** Surface texture from a real map, with a per-device rotation and gentle tint so no two match. */
function realTex(type: PlanetType, seed: number, hi: boolean): Tex | null {
  const name = REAL_NAMES[type];
  const img = name ? realImg.get(name) : undefined;
  if (!img) return null;
  const w = hi ? 2048 : 384;
  const h = w / 2;
  const r = (k: number) => {
    const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const tintable = type !== "sun";
  const hue = tintable ? (r(1) * 2 - 1) * 16 : 0;
  const sat = type === "sun" ? 1 : 0.88 + r(2) * 0.22;
  const bri = type === "sun" ? 1 : 0.94 + r(3) * 0.1;
  const off = type === "sun" ? 0 : Math.floor(r(4) * w);

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = `hue-rotate(${hue.toFixed(1)}deg) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)})`;
  const drawWrapped = (im: HTMLImageElement) => {
    ctx.drawImage(im, -off, 0, w, h);
    if (off) ctx.drawImage(im, w - off, 0, w, h);
  };
  drawWrapped(img);
  ctx.filter = "none";
  const clouds = realImg.get("clouds");
  if (false && clouds) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.85;
    drawWrapped(clouds!);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  const tex: Tex = { data, w, h, rows: h, done: true, emissive: false };

  // Earth's night side: real city lights become the glow layer
  const night = realImg.get("earth-night");
  if (false && night) {
    ctx.clearRect(0, 0, w, h);
    drawWrapped(night!);
    const nd = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) {
      const lum = nd[i * 4] * 0.5 + nd[i * 4 + 1] * 0.4 + nd[i * 4 + 2] * 0.1;
      data[i * 4 + 3] = lum > 38 ? Math.min(255, (lum - 38) * 2.2) : 0;
    }
    tex.emissive = true;
  } else {
    for (let i = 3; i < data.length; i += 4) data[i] = 0;
  }
  return tex;
}

type Tex = { data: Uint8ClampedArray; w: number; h: number; rows: number; done: boolean; emissive: boolean };
const texCache = new Map<string, Tex>();
// A job returns true when it has more work, "wait" when it depends on another job, else nothing.
const queue: (() => boolean | "wait" | void)[] = [];
let pumping = false;

function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const t0 = performance.now();
    let waits = 0;
    while (queue.length && performance.now() - t0 < 7 && waits < queue.length) {
      const res = queue[0]();
      if (res === "wait") {
        queue.push(queue.shift()!);
        waits++;
      } else if (!res) {
        queue.shift();
        waits = 0;
      } else waits = 0;
    }
    if (queue.length) setTimeout(step, 12);
    else pumping = false;
  };
  setTimeout(step, 0);
}

/** Lon/lat surface texture (RGB + glow), painted a few rows at a time in the background. */
function equirect(type: PlanetType, seed: number, hi: boolean, urgent = false): Tex {
  const key = `${type}:${seed}:${hi ? "hi" : "lo"}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const real = realTex(type, seed, hi);
  if (real) {
    texCache.set(key, real);
    return real;
  }
  const w = hi ? 768 : TEX_W;
  const h = hi ? 384 : TEX_H;
  const emissiveFn = EMISSIVE[type];
  const tex: Tex = { data: new Uint8ClampedArray(w * h * 4), w, h, rows: 0, done: false, emissive: !!emissiveFn || type === "terra" };
  const shade = makeShader(type, seed);
  // Inhabited worlds get real-looking cloud cover (a cloud map, shifted per planet) and city lights
  const cloudy = type === "terra" || (type === "ice" && rnd(seed, 9) > 0.5);
  const cloudMap = cloudy ? cloudPixels() : null;
  const cloudOff = rnd(seed, 10);
  const cloudAmt = type === "terra" ? 0.55 + rnd(seed, 11) * 0.35 : 0.35;
  const lights = type === "terra";
  const r = (k: number) => {
    const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const v = VARIETY[type];
  const hue = (r(1) * 2 - 1) * v.hue;
  const sat = v.sat[0] + r(2) * (v.sat[1] - v.sat[0]);
  const light = v.light[0] + r(3) * (v.light[1] - v.light[0]);
  const stretch = 0.75 + r(4) * 0.6;
  const tilt = (r(5) - 0.5) * 0.5;
  const job = () => {
    const t0 = performance.now();
    while (tex.rows < h && performance.now() - t0 < 6) {
      const row = tex.rows++;
      const lat = (0.5 - (row + 0.5) / h) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let u = 0; u < w; u++) {
        const lon = ((u + 0.5) / w) * Math.PI * 2;
        const px = cl * Math.cos(lon) * stretch, py = sl * stretch, pz = cl * Math.sin(lon) * stretch;
        let c = shade(px, py, pz, lat * stretch + tilt * Math.cos(lon));
        const land = terraLand;
        if (type !== "sun") {
          c = hueRotate(c, hue, sat, light);
          // Fine surface grain, the high-frequency detail that makes photos read as real
          const g = (noise3(px * 38 + seed, py * 38, pz * 38) - 0.5) * (hi ? 0.1 : 0.06) + 1;
          c = [c[0] * g, c[1] * g, c[2] * g];
        }
        const i = (row * w + u) * 4;
        tex.data[i] = c[0];
        tex.data[i + 1] = c[1];
        tex.data[i + 2] = c[2];
        let glow = emissiveFn ? emissiveFn(px, py, pz, seed * 0.37) : 0;
        if (lights && land > 0.02 && land < 0.5) {
          const city = noise3(px * 44 + seed, py * 44, pz * 44) * noise3(px * 9, py * 9 + seed, pz * 9);
          glow = city > 0.42 ? Math.min(1, (city - 0.42) * 4) : 0;
        }
        if (cloudMap) {
          const cu = Math.floor(((u / w + cloudOff) % 1) * cloudMap.w);
          const cv = Math.min(cloudMap.h - 1, Math.floor((row / h) * cloudMap.h));
          const a = (cloudMap.d[(cv * cloudMap.w + cu) * 4] / 255) * cloudAmt;
          c = mix(c, [248, 250, 255], a);
          glow *= 1 - a;
        }
        tex.data[i + 3] = glow * 255;
      }
    }
    if (tex.rows >= h) tex.done = true;
    return !tex.done;
  };
  // Small textures are cheap: paint them now so planets appear immediately.
  if (!hi) while (job()) {}
  else {
    urgent ? queue.unshift(job) : queue.push(job);
    pump();
  }
  texCache.set(key, tex);
  return tex;
}

type Frame = { a: HTMLCanvasElement; e: HTMLCanvasElement | null };

/** One rotation frame of a planet as a sphere (bilinear sampled), plus its glow layer. */
function sphereFrame(tex: Tex, size: number, rot: number, limb: number, glow?: RGB): Frame {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  };
  const a = mk();
  const ctx = a.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const e = tex.emissive ? mk() : null;
  const eimg = e ? e.getContext("2d")!.createImageData(size, size) : null;
  const ed = eimg?.data;
  const { w, h, data } = tex;
  const R = size / 2;
  const TAU = Math.PI * 2;
  for (let py = 0; py < size; py++) {
    const ny = (py + 0.5 - R) / R;
    for (let px = 0; px < size; px++) {
      const nx = (px + 0.5 - R) / R;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      const nz = Math.sqrt(1 - rr);
      const lat = Math.asin(-ny);
      let lon = Math.atan2(nz, nx) + rot;
      lon = ((lon % TAU) + TAU) % TAU;
      // bilinear sample
      const fu = (lon / TAU) * w - 0.5;
      const fv = Math.min(h - 1.001, Math.max(0, (0.5 - lat / Math.PI) * h - 0.5));
      const u0 = Math.floor(fu), v0 = Math.floor(fv);
      const tu = fu - u0, tv = fv - v0;
      const ua = ((u0 % w) + w) % w, ub = (ua + 1) % w;
      const i00 = (v0 * w + ua) * 4, i10 = (v0 * w + ub) * 4, i01 = ((v0 + 1) * w + ua) * 4, i11 = ((v0 + 1) * w + ub) * 4;
      const l = 1 - limb + limb * Math.pow(nz, 0.6);
      const o = (py * size + px) * 4;
      for (let k = 0; k < 3; k++) {
        const top = data[i00 + k] + (data[i10 + k] - data[i00 + k]) * tu;
        const bot = data[i01 + k] + (data[i11 + k] - data[i01 + k]) * tu;
        d[o + k] = (top + (bot - top) * tv) * l;
      }
      const edge = Math.min(255, (1 - Math.sqrt(rr)) * R * 255 * 1.4);
      d[o + 3] = edge;
      if (ed && glow) {
        const et = data[i00 + 3] + (data[i10 + 3] - data[i00 + 3]) * tu;
        const eb = data[i01 + 3] + (data[i11 + 3] - data[i01 + 3]) * tu;
        const ev = (et + (eb - et) * tv) / 255;
        ed[o] = glow[0];
        ed[o + 1] = glow[1];
        ed[o + 2] = glow[2];
        ed[o + 3] = Math.min(edge, ev * 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (e && eimg) e.getContext("2d")!.putImageData(eimg, 0, 0);
  return { a, e };
}

export type PlanetSprite = { frames: (Frame | undefined)[]; size: number; count: number };
const spriteCache = new Map<string, PlanetSprite>();

/** Snap a pixel size to a few buckets so zooming reuses sprites instead of making new ones. */
export function spriteBucket(px: number, max: number) {
  const b = [32, 48, 64, 96, 128, 192, 256, 384, 512, 768];
  for (const s of b) if (px <= s * 1.05 || s >= max) return Math.min(s, max);
  return max;
}

/**
 * Rotation frames for a planet. Small sizes are ready immediately; large close-up sizes
 * paint in the background (urgent ones first) while the caller shows a smaller sprite.
 */
export function planetSprite(type: PlanetType, seed: number, size: number, count: number, urgent = false): PlanetSprite {
  size = Math.max(16, Math.round(size));
  const key = `${type}:${seed}:${size}:${count}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const hi = size >= 256;
  const tex = equirect(type, seed, hi, urgent);
  const limb = type === "sun" ? 0.55 : type === "gas" || type === "storm" ? 0.35 : 0.2;
  const glow = EMISSIVE_COLOR[type];
  const sprite: PlanetSprite = { frames: new Array(count), size, count };
  const order = Array.from({ length: count }, (_, i) => i);
  if (!hi) sprite.frames[0] = sphereFrame(tex, size, 0, limb, glow);
  for (const i of order) {
    if (!hi && i === 0) continue;
    const job = () => {
      if (!tex.done) return "wait" as const; // the texture is still being painted
      sprite.frames[i] = sphereFrame(tex, size, (i / count) * Math.PI * 2, limb, glow);
      return false;
    };
    urgent && i === 0 ? queue.splice(1, 0, job) : queue.push(job);
  }
  pump();
  spriteCache.set(key, sprite);
  return sprite;
}

// ---------- Background ----------
let nebulaCache: { key: string; canvas: HTMLCanvasElement } | null = null;

/** Nebula + milky-way dust band, painted at low resolution and scaled up (it's soft anyway). */
export function nebula(w: number, h: number) {
  const key = `${w}x${h}`;
  if (nebulaCache?.key === key) return nebulaCache.canvas;
  const sw = Math.max(64, Math.round(w / 2.5));
  const sh = Math.max(40, Math.round(h / 2.5));
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(sw, sh);
  const d = img.data;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const u = x / sw, v = y / sh;
      // Mostly black space with a faint galactic band and a few vivid nebula clouds
      const bandDist = Math.abs(v - (0.15 + u * 0.7)) / 0.3;
      const warp = fbm3(u * 3, v * 3, 4.2, 4);
      const n = fbm3(u * 4 + warp * 1.5, v * 4 + warp, 1.7, 6);
      const band = Math.max(0, 1 - bandDist + (n - 0.5) * 0.9);
      let col: RGB = [1, 2, 6];
      col = mix(col, [70, 60, 110], Math.pow(band, 2.4) * n * 0.5);
      col = mix(col, [210, 180, 150], Math.pow(band, 5) * Math.max(0, n - 0.5) * 1.4);
      // Nebula clouds: domain-warped wisps, placed away from the centre where the sun sits
      const cloud = (cx: number, cy: number, rad: number, seed: number) => {
        const dd = Math.hypot((u - cx) * 1.6, v - cy) / rad;
        if (dd > 1.6) return 0;
        const q = fbm3(u * 3.5 + seed, v * 3.5, seed, 5);
        const w = fbm3(u * 6 + q * 2.2, v * 6 + q * 1.8, seed + 3, 6);
        return Math.max(0, 1 - dd + (w - 0.5) * 1.6) * Math.pow(w, 1.6) * 1.6;
      };
      const teal = cloud(0.16, 0.72, 0.34, 2.1);
      const blue = cloud(0.24, 0.22, 0.3, 5.7);
      const violet = cloud(0.86, 0.78, 0.32, 9.3);
      col = mix(col, [20, 150, 150], Math.min(1, teal) * 0.55);
      col = mix(col, [120, 255, 220], Math.pow(Math.min(1, teal), 3) * 0.35);
      col = mix(col, [30, 70, 200], Math.min(1, blue) * 0.6);
      col = mix(col, [150, 190, 255], Math.pow(Math.min(1, blue), 3) * 0.4);
      col = mix(col, [110, 40, 170], Math.min(1, violet) * 0.55);
      col = mix(col, [230, 140, 255], Math.pow(Math.min(1, violet), 3) * 0.3);
      // Dark dust lanes cut through the glow
      const dust = fbm3(u * 8, v * 8, 5.5, 5);
      col = mix(col, [0, 0, 2], Math.max(0, dust - 0.56) * 2.4);
      const vig = 1 - Math.pow(Math.hypot(u - 0.5, v - 0.5) * 1.2, 2) * 0.35;
      const o = (y * sw + x) * 4;
      d[o] = col[0] * vig;
      d[o + 1] = col[1] * vig;
      d[o + 2] = col[2] * vig;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  nebulaCache = { key, canvas: c };
  return c;
}

/** A bright star with a soft glow and a faint cross, for nearby networks and hero stars. */
const starCache = new Map<string, HTMLCanvasElement>();
export function starSprite(color: string, size = 48) {
  const key = color + size;
  const hit = starCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.08, color);
  grd.addColorStop(0.3, color.replace(/[\d.]+\)$/, "0.25)"));
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = color.replace(/[\d.]+\)$/, "0.5)");
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(r, r * 0.15);
  g.lineTo(r, r * 1.85);
  g.moveTo(r * 0.15, r);
  g.lineTo(r * 1.85, r);
  g.stroke();
  starCache.set(key, c);
  return c;
}

/** Saturn-style ring as an annulus with soft bands (drawn flat, squashed by the caller). */
let ringCache: HTMLCanvasElement | null = null;
export function ringSprite() {
  if (ringCache) return ringCache;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const rad = r * (0.58 + t * 0.42);
    const a = 0.25 + 0.55 * noise3(t * 30, 1.3, 2.7) * (t > 0.62 && t < 0.66 ? 0.1 : 1);
    g.strokeStyle = `rgba(${Math.round(200 + t * 30)},${Math.round(175 + t * 20)},${Math.round(130 + t * 10)},${a.toFixed(2)})`;
    g.lineWidth = r * 0.42 / 70 + 0.6;
    g.beginPath();
    g.arc(r, r, rad, 0, Math.PI * 2);
    g.stroke();
  }
  ringCache = c;
  return c;
}
