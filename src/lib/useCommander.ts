import { useRef, useState } from "react";
import { stream } from "./api";
import { SYSTEM } from "./commander";
import { toast } from "./toast";

/** Streams a commander answer into text. */
export function useCommander() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<(() => void) | undefined>(undefined);

  async function run(prompt: string): Promise<string> {
    cancelRef.current?.();
    setText("");
    setBusy(true);
    let full = "";
    const s = stream({ prompt, system: SYSTEM, maxTokens: 400 }, (chunk) => {
      full += chunk;
      setText((t) => t + chunk);
    });
    cancelRef.current = s.cancel;
    try {
      await s.done;
    } catch (err) {
      toast((err as Error).message, "error");
      full = "";
    } finally {
      setBusy(false);
    }
    return full;
  }

  function stop() {
    cancelRef.current?.();
    setBusy(false);
  }

  return { text, busy, run, stop, clear: () => setText("") };
}
