import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { useGlow } from "../lib/glow";
import { isDesktop } from "../lib/api";
import { APP_NAME } from "../config";

const stateLabel = {
  idle: "",
  thinking: "Thinking",
  success: "Done",
  error: "Alert",
} as const;

export function TitleBar() {
  const glow = useGlow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const off = window.api?.window.onState((s) => setMaximized(s.maximized));
    return () => off?.();
  }, []);

  return (
    <div className="relative z-20 shrink-0">
      <div className="drag flex h-11 items-center justify-between pl-4">
        <div className="flex items-center gap-2.5">
          <img src="./logo.png" alt="" className="size-6 drop-shadow-[0_0_8px_rgba(255,170,60,.45)]" draggable={false} />
          <span className="font-display text-[14px] font-semibold tracking-[-0.01em]">{APP_NAME}</span>
          {stateLabel[glow] && <span className="ml-2 text-[12.5px] text-ink-muted">{stateLabel[glow]}</span>}
        </div>

        {isDesktop && (
          <div className="no-drag flex h-full">
            <WinButton label="Minimize" onClick={() => window.api!.window.minimize()}>
              <Minus size={15} />
            </WinButton>
            <WinButton label={maximized ? "Restore" : "Maximize"} onClick={() => window.api!.window.toggleMaximize()}>
              {maximized ? <Copy size={13} className="-scale-x-100" /> : <Square size={12} />}
            </WinButton>
            <WinButton label="Close" danger onClick={() => window.api!.window.close()}>
              <X size={16} />
            </WinButton>
          </div>
        )}
      </div>
      <div className="underglow" data-state={glow} aria-hidden />
    </div>
  );
}

function WinButton(props: { label: string; danger?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={
        "grid w-12 place-items-center text-ink-soft transition-colors " +
        (props.danger ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-raised hover:text-ink")
      }
    >
      {props.children}
    </button>
  );
}
