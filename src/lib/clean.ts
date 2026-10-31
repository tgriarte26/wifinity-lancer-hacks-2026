// Keeps everything Wifinity says and shows family-friendly: AI answers, captions and voices.
// Swear words get masked before they are shown or spoken, whatever the AI or a pasted text says.
const WORDS = [
  "fuck", "fucking", "fucked", "fucker", "motherfucker", "shit", "shitty", "bullshit", "bitch", "bitches",
  "bastard", "asshole", "ass", "dick", "dickhead", "cunt", "piss", "pissed", "damn", "goddamn", "crap",
  "prick", "slut", "whore", "wtf", "stfu", "bollocks", "wanker", "twat", "douche", "douchebag", "hell"
];
// "hell" and "ass" only as whole words, so "hello" and "class" stay untouched.
const RE = new RegExp(`\\b(${WORDS.join("|")})(s|es|ed|ing)?\\b`, "gi");

/** Masks swear words: "shit" → "s***". */
export function clean(text: string) {
  return text.replace(RE, (w) => w[0] + "*".repeat(w.length - 1));
}
/** For speech: drop masked words entirely so the voice never says them or spells them out. */
export function cleanForVoice(text: string) {
  return text.replace(RE, "").replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/^[\s,.!?]+/, "").trim();
}
export const FAMILY_RULE = "Keep every answer family-friendly: never use profanity, slurs or crude language, even if the user or the text you are given does.";
