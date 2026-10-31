// Learn mode: turn any text into a lesson the rover teaches on autopilot.
// Claude writes takeaways, key terms and a quiz; without a key we build a simpler lesson locally.
import { askJson, keyStatus } from "./api";
import { FAMILY_RULE, clean } from "./clean";

export type Lesson = {
  summary: string;
  takeaways: string[]; // one per paragraph, in order
  terms: { term: string; meaning: string }[];
  quiz: { q: string; options: string[]; answer: number }[];
  ai: boolean;
};

const STOP = new Set("about after again also because been before being between both could does doing during each from further have having here into itself just more most other over same should some such than that their them then there these they this those through under until very what when where which while will with would your yours".split(" "));

const firstSentence = (t: string) => (t.replace(/\s+/g, " ").match(/^.*?[.!?](\s|$)/)?.[0] || t).trim().slice(0, 220);

/** Quick local lesson: first sentence of each paragraph + the most repeated important words and acronyms. */
export function localLesson(texts: string[]): Lesson {
  const count = new Map<string, number>();
  for (const t of texts) {
    for (const raw of t.match(/\b[\w-]{3,}\b/g) || []) {
      const w = raw.replace(/-+$/, "");
      const isAcr = /^[A-Z0-9]{2,6}$/.test(w) && /[A-Z]/.test(w);
      const k = isAcr ? w : w.toLowerCase();
      if (!isAcr && (k.length < 4 || STOP.has(k) || /^\d+$/.test(k))) continue;
      count.set(k, (count.get(k) || 0) + (isAcr || /^[A-Z]/.test(w) ? 2 : 1));
    }
  }
  const terms = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([term]) => ({ term, meaning: "" }));
  return { summary: texts.map(firstSentence).slice(0, 3).join(" "), takeaways: texts.map(firstSentence), terms, quiz: [], ai: false };
}

export async function buildLesson(texts: string[], topic = ""): Promise<Lesson> {
  const local = localLesson(texts);
  try {
    if (!(await keyStatus()).ai) return local;
    const out = await askJson<Omit<Lesson, "ai">>(
      `Turn this ${topic ? `material about "${topic}"` : "material"} into a short lesson for a student.
${texts.map((t, i) => `[${i}] ${t}`).join("\n")}
Reply only with JSON: {"summary": "3 plain sentences: what this is all about", "takeaways": ["one short sentence per paragraph, in the same order, ${texts.length} total"], "terms": [{"term": "a key term that appears in the text", "meaning": "plain one-line meaning"}] (5-8 items), "quiz": [{"q": "question", "options": ["4 options"], "answer": index of the correct option}] (3 items)}`,
      `${FAMILY_RULE} Be accurate and neutral. Explain like a friendly teacher.`
    );
    if (!out?.summary) return local;
    return {
      summary: clean(out.summary),
      takeaways: texts.map((_, i) => clean(out.takeaways?.[i] || local.takeaways[i])),
      terms: (out.terms || []).filter((t) => t?.term).map((t) => ({ term: t.term, meaning: clean(t.meaning || "") })),
      quiz: (out.quiz || []).filter((q) => q?.q && Array.isArray(q.options) && q.options.length > 1).map((q) => ({ q: clean(q.q), options: q.options.map(clean), answer: Number(q.answer) || 0 })),
      ai: true
    };
  } catch {
    return local;
  }
}
