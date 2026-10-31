// Research: the ROVER-1 research tools inside Wifinity. Explore a topic with real sources,
// fact-check any text, cite in APA/MLA/Chicago, then train on it in the rover game.
import { useState } from "react";
import { Search, Telescope, FileCheck2, BookMarked, Copy, Star, Gamepad2, GraduationCap, Download, Trash2, ExternalLink, Loader2 } from "lucide-react";
import {
  searchWikipedia, searchPapers, brief, quality, CITE, saveToNotebook, getNotebook, removeFromNotebook,
  findClaims, checkClaims, reportText, HYPE, type Source, type Briefing, type Checked
} from "../lib/research";
import { keyStatus } from "../lib/api";
import { toast } from "../lib/toast";
import { clean } from "../lib/clean";
import { cn } from "../lib/cn";
import { RoverGame } from "../components/RoverGame";

const EXAMPLES = ["Evil twin Wi-Fi attack", "ARP spoofing", "DNS hijacking", "WPA3 encryption", "Phishing", "Public Wi-Fi safety"];
const SAMPLE = `Public Wi-Fi is completely safe as long as the network has a password. WPA2 was introduced in 2004 and replaced the older WEP standard. A VPN makes you 100% anonymous online. ARP spoofing lets an attacker on the same network intercept traffic by pretending to be the router. HTTPS was first used by Google in 1985.`;
type Style = keyof typeof CITE;
type Tab = "explore" | "check" | "notebook";

const VERDICT: Record<Checked["verdict"], { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "border-glow/40 text-glow" },
  nuance: { label: "Mostly right", cls: "border-sodium/40 text-sodium" },
  wrong: { label: "Wrong", cls: "border-danger/50 text-danger" },
  unsourced: { label: "Needs a source", cls: "border-line text-ink-muted" }
};

function Stars({ n }: { n: number }) {
  return <span className="flex" title={`${n}/5 source quality`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={11} className={i <= n ? "fill-sodium text-sodium" : "text-line"} />)}</span>;
}

function SourceCard({ s, style, topic, onSaved }: { s: Source; style: Style; topic: string; onSaved?(): void }) {
  const copy = () => { navigator.clipboard?.writeText(CITE[style](s)); toast(`${style} citation copied`); };
  return (
    <div className="rounded-[var(--radius-control)] border border-line/80 bg-night/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <a href={s.url} target="_blank" rel="noreferrer" className="font-display text-[14.5px] font-semibold text-ink hover:text-sodium">
          {s.title} <ExternalLink size={11} className="inline" />
        </a>
        <Stars n={quality(s)} />
      </div>
      <div className="mt-0.5 text-[11.5px] text-ink-muted">
        {s.kind === "wikipedia" ? "Wikipedia" : `Paper · ${s.year ?? "n.d."} · ${(s.citations ?? 0).toLocaleString()} citations${s.venue ? " · " + s.venue : ""}`}
      </div>
      {s.summary && <p className="mt-1.5 line-clamp-3 text-[13px] text-ink-soft">{clean(s.summary)}</p>}
      <div className="mt-2 flex gap-3 text-[12px]">
        <button onClick={copy} className="flex items-center gap-1 text-sodium hover:underline"><Copy size={11} /> Copy {style}</button>
        <button onClick={() => { saveToNotebook(s, topic); toast("Saved to notebook"); onSaved?.(); }} className="flex items-center gap-1 text-ink-soft hover:text-ink"><BookMarked size={11} /> Save</button>
      </div>
    </div>
  );
}

/** Split text into short paragraphs of about 3 sentences, max 10. */
function chunk(text: string) {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    const sents = p.match(/[^.!?]+[.!?]+(\s|$)/g) || [p];
    for (let i = 0; i < sents.length; i += 3) out.push(sents.slice(i, i + 3).join(" ").trim());
  }
  return out.filter((t) => t.length > 20).slice(0, 10);
}

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function Research() {
  const [tab, setTab] = useState<Tab>("explore");
  const [style, setStyle] = useState<Style>("APA");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [noAi, setNoAi] = useState(false);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<Checked[] | null>(null);
  const [notebook, setNotebook] = useState(getNotebook);
  const [train, setTrain] = useState<{ texts: string[]; source: string; learn: boolean; topic: string } | null>(null);

  async function explore(q = topic) {
    const t = q.trim(); if (!t || busy) return;
    setTopic(t); setBusy(true); setBriefing(null); setSources([]);
    const [wiki, papers] = await Promise.all([searchWikipedia(t, 5), searchPapers(t, 5)]);
    const all = [...wiki, ...papers];
    setSources(all);
    const k = await keyStatus();
    setNoAi(!k.ai);
    if (k.ai) setBriefing(await brief(t, all));
    setBusy(false);
    if (!all.length) toast("No sources found. Check your internet connection.", "error");
  }

  async function check() {
    const claims = findClaims(text);
    if (!claims.length || busy) { if (!claims.length) toast("No factual claims found. Try sentences with facts, dates or numbers."); return; }
    setBusy(true); setChecked(null);
    setChecked(await checkClaims(claims, text));
    setBusy(false);
  }

  function trainOnTopic(learn = false) {
    const texts = [
      ...(briefing ? [briefing.overview, ...briefing.keyFacts.map((f) => f.fact)] : []),
      ...sources.map((s) => clean(s.summary)).filter((s) => s.length > 40)
    ].slice(0, 14);
    if (!texts.length) return toast("Explore a topic first.");
    setTrain({ texts, source: `RESEARCH · ${topic.toUpperCase()}`, learn, topic });
  }
  function trainOnCheck(learn = false) {
    // learn mode reads the whole text (with any fixes applied), a few sentences per paragraph
    // so the rover never teaches a mistake: wrong claims get their fix, or are dropped if there isn't one
    let body = text;
    checked?.forEach((c) => {
      if (c.verdict === "wrong") body = body.replace(c.claim, c.fix || "");
      else if (c.verdict === "unsourced" && HYPE.test(c.claim)) body = body.replace(c.claim, ""); // too absolute to teach
    });
    const texts = learn ? chunk(clean(body)) : checked ? checked.map((c) => c.fix || c.claim) : findClaims(text);
    if (!texts.length) return toast("Paste some text first.");
    setTrain({ texts, source: learn ? "YOUR TEXT" : "FACT-CHECKED TEXT", learn, topic: "" });
  }

  const planet = checked?.length ? Math.round((checked.reduce((a, c) => a + ({ verified: 1, nuance: 0.85, unsourced: 0.6, wrong: 0 })[c.verdict], 0) / checked.length) * 100) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[880px] px-8 pt-10 pb-12">
        <header className="mb-6 flex items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.18em] text-sodium/90">RESEARCH · POWERED BY ROVER-1</div>
            <h1 className="mt-2 font-display text-[32px] leading-[1.1] font-semibold tracking-[-0.025em]">Find real sources. Check the facts.</h1>
            <p className="mt-2 text-[14.5px] text-ink-soft">The same research engine as the ROVER-1 browser extension: Wikipedia and peer-reviewed papers, cited for you.</p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-full border border-line bg-night/50 p-1 text-[12px]">
            {(Object.keys(CITE) as Style[]).map((s) => (
              <button key={s} onClick={() => setStyle(s)} className={cn("rounded-full px-2.5 py-1", style === s ? "bg-raised text-ink" : "text-ink-muted hover:text-ink")}>{s}</button>
            ))}
          </div>
        </header>

        <div className="mb-6 flex gap-1 rounded-full border border-line bg-night/50 p-1 text-[13.5px]">
          {([["explore", "Topic explorer", Telescope], ["check", "Check text", FileCheck2], ["notebook", `Notebook (${notebook.length})`, BookMarked]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setTab(id); if (id === "notebook") setNotebook(getNotebook()); }}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2", tab === id ? "bg-sodium font-semibold text-night" : "text-ink-soft hover:text-ink")}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {tab === "explore" && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); explore(); }} className="flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-asphalt/90 px-3 focus-within:border-sodium/60">
                <Search size={15} className="text-ink-muted" />
                <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Any topic: evil twin attacks, black holes, the Roman empire…" aria-label="Research topic"
                  className="flex-1 bg-transparent py-2.5 text-[14.5px] text-ink outline-none placeholder:text-ink-muted" />
              </div>
              <button disabled={busy || !topic.trim()} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-sodium px-4 text-[14px] font-semibold text-night disabled:opacity-40">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Telescope size={15} />} Explore
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => explore(e)} className="rounded-full border border-line/80 px-3 py-1 text-[12.5px] text-ink-soft hover:border-sodium/50 hover:text-ink">{e}</button>
              ))}
            </div>

            {busy && <p className="mt-8 animate-pulse text-[13.5px] text-ink-muted">Searching Wikipedia and Semantic Scholar…</p>}

            {briefing && (
              <section className="mt-8 rounded-[var(--radius-panel)] border border-line bg-asphalt/70 p-5">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-sodium/90">BRIEFING</div>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink">{briefing.overview}</p>
                <div className="mt-4 grid gap-5 md:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-ink-muted">KEY FACTS</div>
                    <ul className="mt-1.5 space-y-1.5 text-[13.5px] text-ink-soft">
                      {briefing.keyFacts.map((f, i) => <li key={i}>• {f.fact}{f.source && <span className="text-ink-muted"> ({f.source})</span>}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-ink-muted">OPEN DEBATES</div>
                    <ul className="mt-1.5 space-y-1.5 text-[13.5px] text-ink-soft">{briefing.debates.map((d, i) => <li key={i}>• {d.point}</li>)}</ul>
                    <div className="mt-3 text-[11px] font-semibold tracking-[0.14em] text-ink-muted">QUESTIONS TO ASK</div>
                    <ul className="mt-1.5 space-y-1.5 text-[13.5px] text-ink-soft">{briefing.questions.map((q, i) => <li key={i}>• {q}</li>)}</ul>
                  </div>
                </div>
                {!!briefing.keywords.length && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {briefing.keywords.map((k) => <button key={k} onClick={() => explore(k)} className="rounded-full bg-raised px-2.5 py-0.5 text-[12px] text-ink-soft hover:text-ink">{k}</button>)}
                  </div>
                )}
              </section>
            )}
            {noAi && !!sources.length && <p className="mt-6 text-[12.5px] text-ink-muted">Add a Claude key in Settings for an AI briefing. The sources below are real either way.</p>}

            {!!sources.length && (
              <section className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-ink-muted">SOURCES · BEST FIRST</div>
                  <div className="flex gap-1.5">
                    <button onClick={() => trainOnTopic(true)} className="flex items-center gap-1.5 rounded-full bg-sodium px-3 py-1 text-[12px] font-semibold text-night hover:bg-sodium-deep">
                      <GraduationCap size={13} /> Learn it with the rover
                    </button>
                    <button onClick={() => trainOnTopic(false)} className="flex items-center gap-1.5 rounded-full border border-sodium/40 bg-sodium/10 px-3 py-1 text-[12px] font-semibold text-sodium hover:bg-sodium/20">
                      <Gamepad2 size={13} /> Play it
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {[...sources].sort((a, b) => quality(b) - quality(a)).map((s) => <SourceCard key={s.id} s={s} style={style} topic={topic} onSaved={() => setNotebook(getNotebook())} />)}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "check" && (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={8000}
              placeholder="Paste an essay, notes or an AI answer. Wifinity pulls out the factual claims, checks each one and suggests sources to cite."
              aria-label="Text to fact-check"
              className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-asphalt/90 p-3 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-muted focus:border-sodium/60" />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button onClick={() => { setText(SAMPLE); setChecked(null); }} className="text-[12.5px] text-ink-muted hover:text-ink">Try a sample with mistakes</button>
              <div className="flex gap-2">
                {checked && <button onClick={() => trainOnCheck(true)} className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-sodium/40 px-3 py-2 text-[13px] text-sodium hover:bg-sodium/10"><GraduationCap size={14} /> Learn it</button>}
                {checked && <button onClick={() => download("fact-check-report.txt", reportText("Fact-check report", checked, style))} className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 py-2 text-[13px] text-ink-soft hover:text-ink"><Download size={14} /> Report</button>}
                <button onClick={check} disabled={busy || !text.trim()} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-sodium px-4 py-2 text-[14px] font-semibold text-night disabled:opacity-40">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />} Check claims
                </button>
              </div>
            </div>
            {busy && <p className="mt-6 animate-pulse text-[13.5px] text-ink-muted">Checking each claim and finding sources…</p>}
            {checked && (
              <section className="mt-6 space-y-2.5">
                {planet !== null && <div className="text-[13px] text-ink-soft">Accuracy score: <b className={planet >= 75 ? "text-glow" : planet >= 50 ? "text-sodium" : "text-danger"}>{planet}%</b> across {checked.length} claims</div>}
                {checked.map((c, i) => (
                  <div key={i} className="rounded-[var(--radius-control)] border border-line/80 bg-night/40 p-3">
                    <div className="flex items-start gap-3">
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", VERDICT[c.verdict]?.cls)}>{VERDICT[c.verdict]?.label ?? c.verdict}</span>
                      <p className={cn("text-[14px] text-ink", c.verdict === "wrong" && "line-through decoration-danger/70")}>{clean(c.claim)}</p>
                    </div>
                    {c.note && <p className="mt-1.5 text-[13px] text-ink-soft">{c.note}</p>}
                    {c.fix && <p className="mt-1 text-[13px] text-glow">Suggested: {c.fix}</p>}
                    {!!c.sources.length && (
                      <div className="mt-2 space-y-1">
                        {c.sources.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-[12px]">
                            <a href={s.url} target="_blank" rel="noreferrer" className="truncate text-ink-soft hover:text-sodium">{s.title}</a>
                            <button onClick={() => { navigator.clipboard?.writeText(CITE[style](s)); toast(`${style} citation copied`); }} className="shrink-0 text-sodium hover:underline">cite</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {tab === "notebook" && (
          <section>
            {!notebook.length ? (
              <p className="text-[14px] text-ink-muted">Nothing saved yet. Press Save on any source and it lands here with its citation ready.</p>
            ) : (
              <>
                <div className="mb-3 flex justify-end">
                  <button onClick={() => download("works-cited.txt", `${style === "MLA" ? "Works Cited" : "References"}\n\n` + notebook.map(CITE[style]).sort().join("\n\n"))}
                    className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-[13px] text-ink-soft hover:text-ink">
                    <Download size={13} /> Download {style === "MLA" ? "works cited" : "references"}
                  </button>
                </div>
                <div className="space-y-2">
                  {notebook.map((s) => (
                    <div key={s.id} className="rounded-[var(--radius-control)] border border-line/80 bg-night/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] text-ink-muted">{s.topic}</div>
                          <p className="text-[13px] text-ink" data-selectable>{CITE[style](s)}</p>
                        </div>
                        <button aria-label="Remove" onClick={() => { removeFromNotebook(s.id); setNotebook(getNotebook()); }} className="text-ink-muted hover:text-danger"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>
      {train && <RoverGame texts={train.texts} source={train.source} learn={train.learn} topic={train.topic} onClose={() => setTrain(null)} />}
    </div>
  );
}
