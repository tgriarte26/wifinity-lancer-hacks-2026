import { createStore } from "./store";

export type Toast = { id: number; tone: "info" | "success" | "error"; text: string };

export const [useToasts, setToasts] = createStore<Toast[]>([]);
let next = 0;

export function toast(text: string, tone: Toast["tone"] = "info", ms = 3200) {
  const id = next++;
  setToasts((t) => [...t, { id, tone, text }]);
  setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
}
