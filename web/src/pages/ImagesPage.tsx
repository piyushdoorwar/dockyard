import { Download, Eraser, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ImageSummary } from "../../../shared/types";
import { Button, IconButton } from "../components/Button";
import { useConfirm } from "../components/Confirm";
import { type Column, DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ErrorBanner, NoItemFound, PageHeader } from "../components/Page";
import { SearchBar, Toggle } from "../components/SearchBar";
import { Badge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatBytes, timeAgo } from "../lib/format";
import { useAction } from "../lib/useAction";
import { usePolling } from "../lib/usePolling";

function PullDialog({ onPull, onClose }: { onPull: (image: string) => Promise<void>; onClose: () => void }) {
  const [image, setImage] = useState("");
  const [pulling, setPulling] = useState(false);
  const submit = async () => {
    if (!image.trim()) return;
    setPulling(true);
    await onPull(image.trim());
    setPulling(false);
    onClose();
  };
  return (
    <Modal
      title="Pull image"
      onClose={pulling ? () => {} : onClose}
      footer={
        <>
          <Button variant="cancel" onClick={onClose} disabled={pulling}>
            Cancel
          </Button>
          <Button icon={Download} onClick={submit} disabled={!image.trim() || pulling}>
            {pulling ? "Pulling…" : "Pull"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="label" htmlFor="pull-image">
          Image name, e.g. <code>redis:7</code> or <code>mcr.microsoft.com/mssql/server:2022-latest</code>
        </label>
        <input
          id="pull-image"
          autoFocus
          value={image}
          onChange={(e) => setImage(e.target.value)}
          disabled={pulling}
          placeholder="repository:tag"
          className="input font-mono"
        />
        <p className="mt-2 text-12 text-muted">
          Private registries work once you have run <code>docker login</code> on the host.
        </p>
      </form>
    </Modal>
  );
}

function PruneDialog({ onPrune, onClose }: { onPrune: (all: boolean) => Promise<void>; onClose: () => void }) {
  const [all, setAll] = useState(false);
  return (
    <Modal
      title="Remove unused images?"
      onClose={onClose}
      footer={
        <>
          <Button variant="cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="delete"
            onClick={async () => {
              onClose();
              await onPrune(all);
            }}
          >
            Remove
          </Button>
        </>
      }
    >
      <p className="mb-4">Dangling images (untagged leftovers from rebuilds) will be removed.</p>
      <Toggle checked={all} onChange={setAll} label="Also remove every image no container uses (they'll be re-pulled when needed)" />
    </Modal>
  );
}

function ImageStatus({ img }: { img: ImageSummary }) {
  if (img.containers > 0) return <Badge tone="success">In use ({img.containers})</Badge>;
  if (img.dangling) return <Badge tone="warning">Dangling</Badge>;
  return <Badge tone="neutral">Unused</Badge>;
}

export function ImagesPage() {
  const { data, error, loading, refresh } = usePolling(api.images, 5_000);
  const { busy, run } = useAction(refresh);
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"pull" | "prune" | null>(null);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return (data ?? []).filter((i) => !q || `${i.repository}:${i.tag} ${i.shortId}`.toLowerCase().includes(q));
  }, [data, query]);
  const totalSize = (data ?? []).reduce((s, i) => s + i.size, 0);

  const remove = async (img: ImageSummary) => {
    const name = img.dangling ? img.shortId : `${img.repository}:${img.tag}`;
    const ok = await confirm({ title: "Delete image?", message: <><b>{name}</b> will be removed from this machine.</>, action: "Delete", danger: true });
    if (ok) await run(`${img.id}:remove`, () => api.removeImage(img.id), `${name} deleted`);
  };

  const columns: Column<ImageSummary>[] = [
    { key: "repository", header: "Name", minWidth: 180, sortValue: (i) => i.repository, render: (i) => <span className="font-medium [overflow-wrap:anywhere] text-ink">{i.repository}</span> },
    { key: "tag", header: "Tag", sortValue: (i) => i.tag, render: (i) => <span className="text-13">{i.tag}</span> },
    { key: "id", header: "Image ID", render: (i) => <code className="text-12 text-grey">{i.shortId}</code> },
    { key: "created", header: "Created", sortValue: (i) => i.created, render: (i) => <span className="text-13 whitespace-nowrap">{timeAgo(i.created)}</span> },
    { key: "size", header: "Size", sortValue: (i) => i.size, render: (i) => <span className="text-13 whitespace-nowrap">{formatBytes(i.size)}</span> },
    { key: "status", header: "Status", sortValue: (i) => i.containers, render: (i) => <ImageStatus img={i} /> },
    {
      key: "actions",
      header: "Actions",
      width: 90,
      render: (i) => <IconButton icon={Trash2} label={`Delete ${i.repository}:${i.tag}`} danger onClick={() => remove(i)} disabled={busy !== null} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Images"
        subtitle={data ? `${data.length} images · ${formatBytes(totalSize)}` : undefined}
        actions={
          <>
            <SearchBar value={query} onChange={setQuery} placeholder="Search images" />
            <Button variant="cancel" icon={Eraser} onClick={() => setDialog("prune")} disabled={busy !== null}>
              Clean up
            </Button>
            <Button icon={Download} onClick={() => setDialog("pull")} disabled={busy !== null}>
              Pull image
            </Button>
          </>
        }
      />
      <ErrorBanner error={error} />
      <DataTable
        rows={rows}
        rowKey={(i) => i.id}
        columns={columns}
        loading={loading && !data}
        defaultSort={{ key: "repository", dir: "asc" }}
        empty={<NoItemFound message={query ? "No images match." : "No images yet."} />}
      />

      {dialog === "pull" && (
        <PullDialog
          onClose={() => setDialog(null)}
          onPull={async (image) => {
            await run("pull", () => api.pullImage(image), (r) => `Pulled ${r.image}`);
          }}
        />
      )}
      {dialog === "prune" && (
        <PruneDialog
          onClose={() => setDialog(null)}
          onPrune={async (all) => {
            await run("prune", () => api.pruneImages(all), (r) => `Removed ${r.deleted} image(s), reclaimed ${formatBytes(r.reclaimed)}`);
          }}
        />
      )}
    </>
  );
}
