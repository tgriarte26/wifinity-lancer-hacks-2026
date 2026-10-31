// Every screen in the app. To add one: make a component in this folder and add it here.
import type { ComponentType } from "react";
import { Orbit as OrbitIcon, MessageSquareText, RadioTower, ScrollText, SlidersHorizontal, Telescope, type LucideIcon } from "lucide-react";
import { Orbit } from "./Orbit";
import { Log } from "./Log";
import { Traffic } from "./Traffic";
import { Settings } from "./Settings";
import { Officer } from "./Officer";
import { Research } from "./Research";

export type PageId = "orbit" | "officer" | "research" | "traffic" | "log" | "settings";
export type PageProps = { go(id: PageId): void };

export const pages: { id: PageId; label: string; icon: LucideIcon; component: ComponentType<PageProps> }[] = [
  { id: "orbit", label: "Map", icon: OrbitIcon, component: Orbit },
  { id: "officer", label: "Officer", icon: MessageSquareText, component: Officer },
  { id: "research", label: "Research", icon: Telescope, component: Research },
  { id: "traffic", label: "Traffic", icon: RadioTower, component: Traffic },
  { id: "log", label: "Log", icon: ScrollText, component: Log },
  { id: "settings", label: "Settings", icon: SlidersHorizontal, component: Settings },
];
