// Research tools shared with the ROVER-1 extension: find real sources (Wikipedia + Semantic Scholar),
// cite them, get a Claude briefing, and fact-check pasted text claim by claim.
import { askJson } from "./api";
import { FAMILY_RULE, clean } from "./clean";

export type Source = {
  id: string; kind: "wikipedia" | "paper"; title: string; url: string; year?: number;
  authors: string[]; venue?: string; citations?: number; summary: string;
};
export type Briefing = {
  overview: string;
  keyFacts: { fact: string; source?: string }[];
  debates: { point: string; source?: string }[];
  questions: string[];
  keywords: string[];
};
export type Verdict = "verified" | "nuance" | "wrong" | "unsourced";
export type Checked = { claim: string; verdict: Verdict; note: string; fix?: string; sources: Source[] };

const strip = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#0?39;/g, "'");

export async function searchWikipedia(q: string, limit = 5): Promise<Source[]> {
  const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${limit}&prop=extracts|info&exintro=1&explaintext=1&exsentences=3&inprop=url`;
  try {
    const r = await fetch(u); if (!r.ok) return [];
    const j = await r.json();
    const pages = Object.values(j?.query?.pages || {}) as { pageid: number; title: string; fullurl: string; extract?: string; index: number }[];
    return pages.sort((a, b) => a.index - b.index).map((p) => ({
      id: "w" + p.pageid, kind: "wikipedia", title: p.title, url: p.fullurl, authors: ["Wikipedia contributors"],
      summary: strip(p.extract || ""), year: new Date().getFullYear()
    }));
  } catch { return []; }
}

let lastScholar = 0;
export async function searchPapers(q: string, limit = 5): Promise<Source[]> {
  const wait = 1100 - (Date.now() - lastScholar); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastScholar = Date.now();
  const u = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${limit}&fields=title,url,year,abstract,citationCount,venue,authors`;
  try {
    const r = await fetch(u); if (!r.ok) return [];
    const j = await r.json();
    return (j.data || []).filter((p: { title?: string }) => p.title).map((p: { paperId: string; title: string; url: string; year?: number; abstract?: string; citationCount?: number; venue?: string; authors?: { name: string }[] }) => ({
      id: "p" + p.paperId, kind: "paper", title: p.title, url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`, year: p.year,
      authors: (p.authors || []).map((a) => a.name), venue: p.venue || undefined, citations: p.citationCount ?? 0,
      summary: (p.abstract || "").slice(0, 400)
    }));
  } catch { return []; }
}

/** 1-5 stars: Wikipedia is a solid start (3); papers by how often they're cited. */
export function quality(s: Source) {
  if (s.kind === "wikipedia") return 3;
  const c = s.citations || 0;
  return c >= 500 ? 5 : c >= 100 ? 4 : c >= 20 ? 3 : 2;
}

/* ---------- citations ---------- */
const split = (n: string) => { const p = n.trim().split(/\s+/); return { last: p.pop() || n, first: p }; };
const initials = (f: string[]) => f.map((x) => x[0] + ".").join(" ");
const today = () => new Date();
const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

export function apa(s: Source) {
  if (s.kind === "wikipedia") {
    const d = today();
    return `${s.title}. (n.d.). In Wikipedia. Retrieved ${d.toLocaleString("en-US", { month: "long" })} ${d.getDate()}, ${d.getFullYear()}, from ${s.url}`;
  }
  const a = s.authors.slice(0, 20).map((n) => { const { last, first } = split(n); return `${last}, ${initials(first)}`.trim(); });
  const who = a.length > 1 ? a.slice(0, -1).join(", ") + ", & " + a[a.length - 1] : a[0] || "Unknown author";
  return `${who} (${s.year ?? "n.d."}). ${s.title}.${s.venue ? ` ${s.venue}.` : ""} ${s.url}`;
}
export function mla(s: Source) {
  const d = today(), acc = `Accessed ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (s.kind === "wikipedia") return `"${s.title}." Wikipedia, Wikimedia Foundation, ${s.url}. ${acc}.`;
  const a = s.authors;
  const who = !a.length ? "" : a.length === 1 ? `${split(a[0]).last}, ${split(a[0]).first.join(" ")}. ` : a.length === 2 ? `${split(a[0]).last}, ${split(a[0]).first.join(" ")}, and ${a[1]}. ` : `${split(a[0]).last}, ${split(a[0]).first.join(" ")}, et al. `;
  return `${who}"${s.title}." ${s.venue ? s.venue + ", " : ""}${s.year ?? "n.d."}, ${s.url}. ${acc}.`;
}
export function chicago(s: Source) {
  if (s.kind === "wikipedia") return `Wikipedia. "${s.title}." Last modified n.d. ${s.url}.`;
  const a = s.authors;
  const who = !a.length ? "" : a.length === 1 ? `${split(a[0]).last}, ${split(a[0]).first.join(" ")}. ` : `${split(a[0]).last}, ${split(a[0]).first.join(" ")}, ${a.length > 3 ? "et al." : "and " + a.slice(1).join(", ")}. `;
  return `${who}${s.year ?? "n.d."}. "${s.title}."${s.venue ? ` ${s.venue}.` : ""} ${s.url}.`;
}
export const CITE = { APA: apa, MLA: mla, Chicago: chicago };

/* ---------- saved sources (the notebook) ---------- */
const NB = "wifinityNotebook";
export function getNotebook(): (Source & { topic: string; at: number })[] {
  try { return JSON.parse(localStorage.getItem(NB) || "[]"); } catch { return []; }
}
export function saveToNotebook(s: Source, topic: string) {
  const nb = getNotebook().filter((x) => x.id !== s.id);
  nb.unshift({ ...s, topic, at: Date.now() });
  try { localStorage.setItem(NB, JSON.stringify(nb.slice(0, 200))); } catch { /* full */ }
}
export function removeFromNotebook(id: string) {
  try { localStorage.setItem(NB, JSON.stringify(getNotebook().filter((x) => x.id !== id))); } catch { /* full */ }
}

/* ---------- Claude ---------- */
const RULES = `${FAMILY_RULE}
Be fair and neutral. On contested issues present the main sides without taking one. Only use facts you are confident about.`;

export async function brief(topic: string, sources: Source[]): Promise<Briefing | null> {
  const ctx = sources.slice(0, 8).map((s, i) => `[${i + 1}] ${s.title}: ${s.summary}`).join("\n");
  try {
    const b = await askJson<Briefing>(
      `Research topic: "${topic}". Write a study briefing for a student, using these sources where possible:
${ctx || "(no sources found)"}
Reply only with JSON: {"overview": "3-4 plain sentences", "keyFacts": [{"fact": "...", "source": "title of a source above, or empty"}] (5 items), "debates": [{"point": "an open question or disagreement", "source": "..."}] (2-3 items), "questions": ["research questions worth asking"] (3), "keywords": ["search terms"] (5)}`,
      RULES
    );
    if (!b || typeof b !== "object" || !b.overview) return null;
    return {
      overview: clean(b.overview), keyFacts: (b.keyFacts || []).map((f) => ({ ...f, fact: clean(f.fact) })),
      debates: (b.debates || []).map((d) => ({ ...d, point: clean(d.point) })), questions: (b.questions || []).map(clean), keywords: b.keywords || []
    };
  } catch { return null; }
}

/** Sentences that state facts (numbers, dates, "is/was/causes"), as opposed to opinions or filler. */
export function findClaims(text: string) {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.map((s) => s.trim()).filter((s) => s.split(" ").length >= 6 && (/\d/.test(s) || /\b(is|are|was|were|has|have|causes?|invented|discovered|first|largest|only|always|never|percent|million|billion)\b/i.test(s))).slice(0, 12);
}
export const HYPE = /\b(always|never|everyone|no one|proven|guaranteed|100%|completely|totally|best|worst)\b/i;

export async function checkClaims(claims: string[], context: string): Promise<Checked[]> {
  let verdicts: { claim: number; verdict: Verdict; note: string; fix?: string }[] = [];
  try {
    const out = await askJson<{ results: typeof verdicts }>(
      `Fact-check these claims. Context of the text: "${context.slice(0, 1200)}"
${claims.map((c, i) => `${i}. ${c}`).join("\n")}
For each, verdict is "verified" (correct), "nuance" (mostly right but oversimplified), "wrong" (a clear factual error) or "unsourced" (can't be confirmed). Be fair, not picky: only call something wrong if it's a clear error.
Reply only with JSON: {"results": [{"claim": index, "verdict": "...", "note": "one short sentence why", "fix": "a corrected sentence if wrong or nuance, else empty"}]}`,
      RULES
    );
    verdicts = Array.isArray(out?.results) ? out.results : [];
  } catch { verdicts = []; }
  const results: Checked[] = [];
  for (let i = 0; i < claims.length; i++) {
    const v = verdicts.find((x) => Number(x.claim) === i);
    const keywords = claims[i].replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 4).slice(0, 5).join(" ");
    const sources = await searchWikipedia(keywords, 2);
    results.push(v
      ? { claim: claims[i], verdict: v.verdict, note: clean(v.note || ""), fix: v.fix ? clean(v.fix) : undefined, sources }
      : { claim: claims[i], verdict: "unsourced", note: HYPE.test(claims[i]) ? "Absolute words like 'always', 'completely' or '100%' are rarely true. Find a source." : `Not checked by Claude (add a key in Settings).${sources.length ? " Here are sources to verify it yourself." : ""}`, sources });
  }
  return results;
}

export function reportText(title: string, items: Checked[], style: keyof typeof CITE = "APA") {
  const L = [`${title}`, `Checked by Wifinity Research on ${new Date().toLocaleDateString()}`, ""];
  const all = new Map<string, Source>();
  items.forEach((c, i) => {
    L.push(`${i + 1}. [${c.verdict.toUpperCase()}] ${c.claim}`);
    if (c.note) L.push(`   ${c.note}`);
    if (c.fix) L.push(`   Suggested: ${c.fix}`);
    c.sources.forEach((s) => all.set(s.id, s));
    L.push("");
  });
  if (all.size) { L.push(style === "MLA" ? "Works Cited" : "References", ""); [...all.values()].map(CITE[style]).sort().forEach((x) => L.push(x)); }
  return L.join("\n");
}
