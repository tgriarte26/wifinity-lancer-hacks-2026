# Wifinity

Your Wi-Fi network as a star system. The router is the sun, every device is a planet, nearby networks are stars.
Strangers who join get flagged instantly, and an AI security officer (Claude) explains every risk in plain English.
Built at LancerHacks 2026 (theme: space).

Wifinity is passive and local: it reads what Windows already knows (`netsh wlan`, `route print`, `arp -a`)
about your own network. It doesn't attack, crack or probe anything.

## Two modes

- **User** (switch at the top of the map): you're on someone's Wi-Fi, a cafe, campus. Wifinity answers
  "is this Wi-Fi safe?": encryption, real router (no impersonation), safe web lookups (no DNS hijack),
  no look-alike networks. One click disconnects this computer.
- **Admin**: you own the router. Sort devices into roles and priorities, eject devices, get router-specific
  steps, and connect an **OpenWrt** router (JSON-RPC/ubus) so Eject asks the router to remove the device
  for 5 minutes and then verifies it's gone. Other routers: Wifinity writes the steps for you instead.
  The router connector has only been tested against simulated responses, not a physical router.

## Voice

Settings > AI and voice: paste your ElevenLabs key (and optionally Claude's), save (encrypted by Windows),
load your voices, pick one and preview. With "Speak alerts and briefings" on, the officer reads briefings and
calls out new devices and attacks. Without ElevenLabs it uses the computer's voice.

## What it checks

- Devices on your network (strangers, unidentified devices) and their roles/priorities
- Router impersonation (ARP spoofing) and router identity changes
- DNS hijacking: web lookups sent to another device on your network
- Fake copies of your network nearby (evil twin), weak or missing encryption
- Crowded Wi-Fi channels, with the least crowded alternative
- This computer's connections per app, flagging unencrypted ones (Traffic page)
- Shields up (opt-in): disconnects this computer if the router is being impersonated

Wifinity can't see other devices' traffic: on Wi-Fi each device's traffic is private, and seeing it
would require the very attack Wifinity detects.

## Demo tips

- Run it on a phone hotspot so teammates' phones show up as planets. Campus Wi-Fi hides devices from each other.
- Have someone join the hotspot mid-demo: their phone flies into orbit and the officer calls it out.
- If Windows hides nearby networks, turn on Settings > Privacy & security > Location (including desktop apps).
- Backup: Settings > Use demo network, then "Add stranger".

## First run (Windows)

Double-click `setup.bat` once. It:
- installs Node.js if it's missing or too old
- installs the app packages and builds Wifinity
- creates `key.txt` and opens it in Notepad: paste your Claude key on the empty line and save
  (Wifinity works without a key, with simulated answers)
- checks Windows lets apps read Wi-Fi details (opens Location settings if not)
- adds an **Wifinity icon to your desktop and Start menu**, then starts Wifinity

After that, open Wifinity from the desktop icon like any app. No console window, and closing the
window fully quits it. Opening it twice just brings the existing window forward.

`run.bat` does the same as the icon, and rebuilds automatically if the code changed.
`dev.bat` is developer mode with live reload, for editing the code.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the app with live reload (same as dev.bat) |
| `npm run web` | Open the UI in a browser instead (AI is simulated there) |
| `npm run start` | Build and run the production version |
| `npm run typecheck` | Check the code for type errors |

## Where things live

```
electron/scan.cjs     network scan (Windows commands) + demo network
electron/parse.cjs    parsers for netsh / route / arp output
electron/main.cjs     window + secure calls that use API keys
electron/ai.cjs       Claude (one-shot, JSON, streaming)
src/pages/Wifinity.tsx   main screen: HUD, map, briefing
src/components/OrbitMap.tsx    the star-system drawing
src/components/DetailPanel.tsx findings + details for the selected planet/star
src/lib/network.ts    scan loop, device memory, arrival alerts
src/lib/risk.ts       findings + health score (no AI)
src/lib/commander.ts  prompts for the AI security officer
src/pages/            one file per screen; register new ones in src/pages/index.ts
src/components/       title bar, sidebar, toasts, ui/ (Button, Panel, Input, TextArea, StatusDot)
src/lib/api.ts        what pages call: ask(), askJson(), stream()
src/lib/glow.ts       the status light under the title bar: setGlow("thinking") etc.
src/index.css         colors and fonts (the @theme block)
src/config.ts         app name
```

## Using AI in a page

```ts
import { ask, askJson, stream } from "../lib/api";

const { text } = await ask({ prompt: "Summarize this: ..." });
const data = await askJson<{ items: string[] }>('List 3 study tips as {"items": [...]}');
const run = stream({ prompt: "Write a short story" }, (chunk) => setText((t) => t + chunk));
```

The status light reacts automatically: a sweep while Claude works, red on alerts and errors.

## Design rules

- Colors: `night` background, `asphalt`/`raised` surfaces, `sodium` (amber) for main actions, `glow` (cyan) for live activity, `danger` for errors.
- Fonts: `font-display` (Bricolage Grotesque) for headings, Onest for everything else.
- One primary (amber) button per screen. Sentence case everywhere.

## Credits

Planet surface maps, Earth clouds/night lights and the Milky Way star field: **Solar System Scope**
(https://www.solarsystemscope.com/textures/), licensed **CC BY 4.0**. See `assets/textures/ATTRIBUTION.md`.
