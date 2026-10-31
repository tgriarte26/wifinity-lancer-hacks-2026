// Helpful answers when no Claude key is set. Topic-aware, clearly labeled, never pretends to be live AI.
const P = "Offline guidance (no Claude key). ";

function topFinding(context) {
  const m = [...context.matchAll(/^- \[(critical|high|medium|low)\] ([^:\n]+)(?::\s*([^\n]+))?$/gm)];
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  m.sort((a, b) => order[a[1]] - order[b[1]]);
  return m[0];
}

function offline(req) {
  const q = (req.messages?.at(-1)?.content || req.prompt || "").toString();
  const context = `${req.system || ""}\n${req.prompt || ""}`;
  if (req.json) return JSON.stringify({ offline: true, note: "Add a Claude key in Settings for generated answers." });
  const briefing = /Give a security briefing/.test(q);
  const score = /Health score: (\d+)/.exec(context)?.[1];
  const f = topFinding(context);

  if (briefing) {
    if (f && (f[1] === "critical" || f[1] === "high"))
      return `${P}Alert: ${f[2]}. ${f[3] ? f[3] + " " : ""}Check the matching finding first. If you don't trust this connection, disconnect this computer until it's resolved.`;
    if (f)
      return `${P}Status is mostly stable${score ? ` at ${score} out of 100` : ""}. The one thing to review: ${f[2]}. Confirm you recognize it, then mark it as known.`;
    return `${P}All clear${score ? `, ${score} out of 100` : ""}. No major flags right now. Good habit: give each device a name so a stranger stands out instantly.`;
  }
  if (/admin|user mode|mode/i.test(q) && /what|differ|can/i.test(q))
    return `${P}User mode protects this computer: it checks whether the Wi-Fi is encrypted and legit, shows what your apps connect to, and can disconnect you. Admin mode is for the router owner: connect an OpenWrt router and you can remove a device and ban it for five minutes, verified by the router.`;
  if (/kick|remove|eject|block|ban|get rid/i.test(q))
    return `${P}Switch to Admin mode, select the planet and use Eject. With a connected OpenWrt router, Wifinity asks the router to remove it and checks that it's really gone. Without a router, change your Wi-Fi password in the router's admin page so unknown devices can't rejoin.`;
  if (/dns|lookup/i.test(q))
    return `${P}DNS turns website names into addresses. If your DNS server isn't your router or a known provider, someone could send you to fake sites. Compare it with your router's settings before changing anything; a home filter like Pi-hole is a normal reason for a custom one.`;
  if (/spoof|impersonat|router.*(identity|changed)|arp/i.test(q))
    return `${P}If another device claims to be your router, your traffic could be passing through it. That's serious on public Wi-Fi. It can also happen after a router swap or with mesh gear. If you didn't change anything, disconnect and reconnect on a trusted network.`;
  if (/twin|fake.*wifi|same name|legit/i.test(q))
    return `${P}An "evil twin" is a fake network copying a real name. Warning signs: the same name with weaker or no encryption, or a different router maker. Only join networks that use WPA2 or WPA3, and forget any open copy of your network.`;
  if (/encrypt|wpa|password|secure/i.test(q))
    return `${P}WPA3 is best, WPA2 is fine. WEP or open networks let anyone nearby read unprotected traffic. On those, stick to HTTPS sites or use a VPN, and avoid logging into anything important.`;
  if (/check first|what should|start|priority|next/i.test(q)) {
    if (f) return `${P}Start with: ${f[2]}. ${f[3] || ""} After that, name any device you recognize so strangers stand out.`.trim();
    return `${P}Nothing urgent stands out. Name the devices you recognize, mark them as known, and keep Wifinity watching so new arrivals trigger an alert.`;
  }
  if (/stranger|unknown|new device|who is/i.test(q))
    return `${P}A new device isn't automatically bad: phones use private addresses that change. Click its planet, check the maker, and ask around. If nobody claims it, eject it in Admin mode or change the Wi-Fi password.`;
  return `${P}${f ? `The most important observation is: ${f[2]}. ` : "No major flags right now. "}Ask about a specific finding, device or mode and I'll explain. Add a Claude key in Settings for full conversational answers.`;
}

module.exports = { offline };
