import type { ContainerSummary } from "../../../shared/types";
import { useConfirm } from "../components/Confirm";
import { api, type ContainerAction } from "./api";
import { useAction } from "./useAction";

const PAST: Record<ContainerAction, string> = { start: "started", stop: "stopped", restart: "restarted" };

export const SELF_REASON = "This is Dockyard itself — manage it from your host terminal.";

export function useContainerActions(refresh: () => Promise<void> | void) {
  const confirm = useConfirm();
  const { busy, run } = useAction(refresh);

  const act = (c: Pick<ContainerSummary, "id" | "name">, action: ContainerAction) =>
    run(`${c.id}:${action}`, () => api.containerAction(c.id, action), `${c.name} ${PAST[action]}`);

  const remove = async (c: Pick<ContainerSummary, "id" | "name">) => {
    const ok = await confirm({
      title: "Delete container?",
      message: (
        <>
          <b>{c.name}</b> will be stopped and removed. Its image and volumes are kept.
        </>
      ),
      action: "Delete",
      danger: true,
    });
    if (!ok) return false;
    const res = await run(`${c.id}:remove`, () => api.removeContainer(c.id), `${c.name} deleted`);
    return res !== undefined;
  };

  return { busy, act, remove };
}
