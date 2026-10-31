// A plain-text observation report the user can save and share.
import { getSnapshot, getMeta, getGw, type LogEvent } from "./network";
import { analyze, securityLevel } from "./risk";
import { nameFor, makerText } from "./devices";

export function observationReport(events: LogEvent[]) {
  const snap = getSnapshot();
  const lines = ["ORBIT · Network observation report", new Date().toLocaleString(), "These are observations and warning signs, not proof of an attack.", ""];
  if (snap?.ok) {
    const meta = getMeta();
    const r = analyze(snap, meta, getGw());
    const c = snap.connection;
    lines.push(
      `Source: ${snap.demo ? "SIMULATED DEMO NETWORK" : "Live scan of this computer's network"}`,
      `Network: ${c?.ssid || "name hidden (Windows Location is off)"}${c ? ` · ${securityLevel(c.auth, c.cipher).label}` : ""}`,
      `Router: ${snap.gateway.ip}`,
      `Health score: ${r.score}/100 (${r.grade})`,
      "",
      "FINDINGS",
      ...(r.findings.length ? r.findings.map((f) => `  [${f.severity.toUpperCase()}] ${f.title}\n      ${f.detail}`) : ["  None."]),
      "",
      `DEVICES (${snap.devices.length})`,
      ...snap.devices.map((d) => {
        const m = meta[d.mac];
        const tag = d.isGateway ? "router" : d.isSelf ? "this computer" : m?.trusted ? "trusted" : m?.watch ? "watch list" : "not reviewed";
        return `  ${nameFor(d, m).padEnd(28)} ${d.ip.padEnd(16)} ${makerText(d).slice(0, 24).padEnd(25)} ${tag}`;
      })
    );
  } else lines.push("No successful scan yet.");
  lines.push("", "RECENT EVENTS", ...(events.length ? events.slice(0, 60).map((e) => `  ${new Date(e.at).toLocaleString()}  ${e.text}`) : ["  None."]));
  return lines.join("\n");
}

export function downloadReport(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Wifinity-report-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
