// Claude API helpers. Without ANTHROPIC_API_KEY they return simulated text,
// so the UI can be built and demoed before keys are set up.
const DEFAULT_MODEL = "claude-sonnet-5-5";
const URL = "https://api.anthropic.com/v1/messages";

function body({ prompt, messages, system, maxTokens = 1024, json = false }, stream) {
  const msgs = messages?.length ? messages : [{ role: "user", content: prompt ?? "" }];
  let sys = system || "";
  if (json) sys += "\nRespond with valid JSON only. No prose, no code fences.";
  return JSON.stringify({
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    max_tokens: maxTokens,
    ...(sys.trim() ? { system: sys.trim() } : {}),
    messages: msgs,
    stream,
  });
}

function headers() {
  return {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };
}

async function failure(res) {
  let detail = "";
  try {
    detail = (await res.json())?.error?.message || "";
  } catch {}
  if (res.status === 401) return new Error("Claude rejected the API key. Check ANTHROPIC_API_KEY in .env.");
  if (res.status === 429) return new Error("Claude rate limit hit. Wait a few seconds and try again.");
  return new Error(`Claude request failed (${res.status}). ${detail}`.trim());
}

const { offline } = require("./offline.cjs");
const simulated = offline;

// One-shot. Returns { text } or, with json: true, { text, data }.
async function ask(req) {
  let text;
  if (!process.env.ANTHROPIC_API_KEY) {
    text = simulated(req);
  } else {
    const res = await fetch(URL, { method: "POST", headers: headers(), body: body(req, false) });
    if (!res.ok) throw await failure(res);
    const out = await res.json();
    text = out.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  }
  if (!req.json) return { text };
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return { text, data: JSON.parse(cleaned) };
  } catch {
    throw new Error("Claude did not return valid JSON. Try asking again or simplify the format.");
  }
}

// Streamed. Calls onText for every piece of text as it arrives.
async function stream(req, onText, signal) {
  if (!process.env.ANTHROPIC_API_KEY) {
    for (const word of simulated(req).split(/(?<= )/)) {
      if (signal.aborted) return;
      onText(word);
      await new Promise((r) => setTimeout(r, 35));
    }
    return;
  }
  const res = await fetch(URL, { method: "POST", headers: headers(), body: body(req, true), signal });
  if (!res.ok) throw await failure(res);

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const evt = JSON.parse(line.slice(5));
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") onText(evt.delta.text);
        if (evt.type === "error") throw new Error(evt.error?.message || "Claude stream error");
      }
    }
  } catch (err) {
    if (signal.aborted) return; // cancelled by the user
    throw err;
  }
}

module.exports = { ask, stream, DEFAULT_MODEL };
