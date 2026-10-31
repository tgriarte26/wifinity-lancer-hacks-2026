import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/Toaster";
import { pages, type PageId } from "./pages";
import { loadSaved, save } from "./lib/store";
import { startWatching, getPrefs, setPrefs } from "./lib/network";
import { setMode, startRouterRefresh } from "./lib/router";
import { setElevenReady } from "./lib/voice";
import { keyStatus } from "./lib/api";

let started = false;

export default function App() {
  const [page, setPage] = useState<PageId>(() => loadSaved("page", pages[0].id));
  const current = pages.find((p) => p.id === page) ?? pages[0];
  const Page = current.component;

  useEffect(() => {
    if (started) return; // StrictMode runs effects twice in development
    started = true;
    // The "Orbit Demo" shortcut always opens on the simulated network.
    if (window.api?.launchDemo) setPrefs({ demo: true });
    startWatching();
    setMode(getPrefs().mode);
    startRouterRefresh();
    keyStatus().then((k) => setElevenReady(!!k.eleven));
  }, []);

  const go = (id: PageId) => {
    setPage(id);
    save("page", id);
  };

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar current={current.id} onChange={go} />
        <main className="haze relative min-w-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="h-full"
            >
              <Page go={go} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
