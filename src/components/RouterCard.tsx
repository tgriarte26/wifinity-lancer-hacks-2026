// Admin mode: connect a router you administer so Orbit can ask it to remove devices.
import { useState } from "react";
import { Router as RouterIcon } from "lucide-react";
import { Button } from "./ui/Button";
import { connectRouter, disconnectRouter, useRouter } from "../lib/router";
import { usePrefs, useSnapshot } from "../lib/network";
import { toast } from "../lib/toast";

export function RouterCard({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const prefs = usePrefs();
  const snap = useSnapshot();
  const gw = snap?.ok ? snap.gateway.ip : "192.168.1.1";
  const [open, setOpen] = useState(!compact);
  const [url, setUrl] = useState(`https://${gw}`);
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const [allowHttp, setAllowHttp] = useState(false);
  const [busy, setBusy] = useState(false);

  if (router?.connected)
    return (
      <div className="mb-5 rounded-[var(--radius-panel)] border border-glow/30 bg-glow/5 p-4">
        <div className="flex items-center gap-2">
          <RouterIcon size={16} className="text-glow" />
          <span className="font-display text-[15px] font-semibold">Router connected</span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          {router.host} · {router.interfaces.length} radios · {router.clients.length} Wi-Fi clients. Eject now removes devices through the router.
        </p>
        <Button size="sm" variant="ghost" className="mt-2 -ml-1" onClick={disconnectRouter}>
          Disconnect router
        </Button>
      </div>
    );

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await connectRouter({ url, username, password, allowHttp });
    setBusy(false);
    setPassword("");
    if (!res.ok) toast(res.error, "error");
    else toast("Router connected.", "success");
  }

  return (
    <div className="mb-5 rounded-[var(--radius-panel)] border border-line/70 bg-night/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RouterIcon size={16} className="text-sodium" />
          <span className="font-display text-[15px] font-semibold">Router control</span>
        </div>
        {!open && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Connect
          </Button>
        )}
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-muted">
        {prefs.demo
          ? "Demo: connect a simulated router to show ejecting through the router."
          : "Sign in to an OpenWrt router you administer. Wifinity asks the router to remove devices; it never attacks them."}
      </p>
      {open && (
        <form onSubmit={connect} className="mt-3 space-y-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Router address" className="h-9 w-full rounded-[var(--radius-control)] border border-line bg-night/60 px-3 text-[13px] text-ink outline-none focus:border-glow/70" />
          <div className="flex gap-2">
            <input value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Router username" placeholder="Username" className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-night/60 px-3 text-[13px] text-ink outline-none focus:border-glow/70" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" aria-label="Router password" placeholder="Password" className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-night/60 px-3 text-[13px] text-ink outline-none focus:border-glow/70" />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-ink-muted">
            <input type="checkbox" checked={allowHttp} onChange={(e) => setAllowHttp(e.target.checked)} />
            Allow plain HTTP (password is sent unencrypted on your LAN)
          </label>
          <Button size="sm" variant="primary" disabled={busy}>
            {busy ? "Connecting…" : "Connect router"}
          </Button>
        </form>
      )}
    </div>
  );
}
