import clsx from "clsx";
import type { StackStatus } from "../lib/api";
import { exitCode } from "../lib/format";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE: Record<Tone, { pill: string; dot: string }> = {
  success: { pill: "bg-[#EAFFF1] text-[#04B440]", dot: "bg-[#17C653]" },
  warning: { pill: "bg-[#FFF8DD] text-[#B17C00]", dot: "bg-[#F6B100]" },
  danger: { pill: "bg-[#FFEEF3] text-danger", dot: "bg-danger" },
  neutral: { pill: "bg-line-soft text-grey", dot: "bg-muted" },
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap", TONE[tone].pill)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", TONE[tone].dot)} aria-hidden />
      {children}
    </span>
  );
}

/** Container state, with a non-zero exit code shown as a failure (like Docker Desktop). */
export function containerTone(state: string, status = ""): Tone {
  if (state === "running") return /\((unhealthy|health: starting)\)/.test(status) ? "warning" : "success";
  if (state === "paused" || state === "restarting" || state === "created") return "warning";
  if (state === "dead") return "danger";
  const code = exitCode(status);
  return code !== null && code !== 0 ? "danger" : "neutral";
}

export function ContainerStatus({ state, status }: { state: string; status?: string }) {
  const code = status ? exitCode(status) : null;
  const health = state === "running" ? /\((unhealthy|health: starting)\)/.exec(status ?? "")?.[1] : undefined;
  const label =
    health === "unhealthy"
      ? "Unhealthy"
      : health
        ? "Starting"
        : state === "exited" && code !== null
          ? `Exited (${code})`
          : state.charAt(0).toUpperCase() + state.slice(1);
  return (
    <span title={status}>
      <Badge tone={containerTone(state, status)}>{label}</Badge>
    </span>
  );
}

export function StackStatusBadge({ status, running, total }: { status: StackStatus; running: number; total: number }) {
  const tone: Tone = status === "running" ? "success" : status === "partial" ? "warning" : "neutral";
  return (
    <Badge tone={tone}>
      {status === "stopped" ? "Stopped" : `Running (${running}/${total})`}
    </Badge>
  );
}
