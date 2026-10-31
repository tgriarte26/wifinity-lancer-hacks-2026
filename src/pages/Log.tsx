import { ArrowDownLeft, ArrowUpRight, Download, Info, TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/Button";
import { observationReport, downloadReport } from "../lib/report";
import { toast } from "../lib/toast";
import { useLog } from "../lib/network";
import { PageHeader } from "./PageHeader";
import { cn } from "../lib/cn";

const icon = {
  arrived: <ArrowDownLeft size={15} className="text-danger" />,
  left: <ArrowUpRight size={15} className="text-ink-muted" />,
  info: <Info size={15} className="text-glow" />,
  warning: <TriangleAlert size={15} className="text-sodium" />,
};

export function Log() {
  const log = useLog();
  return (
    <div className="mx-auto w-full max-w-[760px] px-10 py-10">
      <div className="flex items-start justify-between gap-6">
        <PageHeader title="Flight log">Every device that joined or left while Wifinity was watching.</PageHeader>
        <Button
          size="sm"
          className="mt-2 shrink-0 whitespace-nowrap"
          icon={<Download size={14} />}
          onClick={() => {
            downloadReport(observationReport(log));
            toast("Report saved. It includes network names and addresses, so check it before sharing.", "success", 5000);
          }}
        >
          Export report
        </Button>
      </div>
      {log.length === 0 ? (
        <p className="text-ink-muted">Nothing yet. Events appear here as devices come and go.</p>
      ) : (
        <ol className="border-l border-line/70 pl-6" data-selectable>
          {log.map((e) => (
            <li key={e.id} className="relative pb-5">
              <span className="absolute top-0.5 -left-[35px] grid size-[22px] place-items-center rounded-full border border-line bg-night">
                {icon[e.kind]}
              </span>
              <div className={cn("text-[14.5px]", e.kind === "arrived" ? "text-ink" : "text-ink-soft")}>{e.text}</div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted tabular-nums">
                {new Date(e.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", second: "2-digit" })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
