import { createStore } from "./store";

// What the map is actually rendering at, for the detail indicator.
export type Level = "cinematic" | "high" | "balanced" | "low";
export const [usePerf, setPerf] = createStore<{ level: Level; fps: number }>({ level: "high", fps: 0 });
