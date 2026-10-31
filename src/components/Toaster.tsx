import { AnimatePresence, motion } from "motion/react";
import { useToasts } from "../lib/toast";
import { cn } from "../lib/cn";

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col items-end gap-2" role="status">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "max-w-sm rounded-[var(--radius-control)] border bg-raised px-4 py-3 text-sm shadow-xl shadow-black/30",
              t.tone === "error" && "border-danger/40 text-[#ffc2c8]",
              t.tone === "success" && "border-glow/40",
              t.tone === "info" && "border-line"
            )}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
