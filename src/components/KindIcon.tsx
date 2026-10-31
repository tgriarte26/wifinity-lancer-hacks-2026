import { CircleHelp, Gamepad2, Laptop, Printer, Router, Smartphone, Speaker, Tv, type LucideProps } from "lucide-react";
import type { Kind } from "../lib/devices";

const icons = {
  router: Router,
  computer: Laptop,
  phone: Smartphone,
  tv: Tv,
  speaker: Speaker,
  printer: Printer,
  console: Gamepad2,
  unknown: CircleHelp,
};

export function KindIcon({ kind, ...props }: { kind: Kind } & LucideProps) {
  const Icon = icons[kind];
  return <Icon {...props} />;
}
