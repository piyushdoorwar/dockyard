import { useState } from "react";
import type { ContainerInspect } from "../../lib/api";
import { Card } from "../Page";
import { Toggle } from "../SearchBar";

export function InspectView({ info }: { info: ContainerInspect }) {
  const [raw, setRaw] = useState(false);
  const env = info.Config.Env ?? [];
  const mounts = info.Mounts ?? [];

  return (
    <div className="space-y-6">
      <Toggle checked={raw} onChange={setRaw} label="Show raw JSON" />
      {raw ? (
        <pre className="max-h-[60vh] overflow-auto rounded-lg border border-line bg-surface p-4 text-12 leading-relaxed text-body">
          {JSON.stringify(info, null, 2)}
        </pre>
      ) : (
        <>
          <Card title={`Environment (${env.length})`}>
            {env.length === 0 ? (
              <p className="text-13 text-muted">No environment variables.</p>
            ) : (
              <table className="w-full font-mono text-12">
                <tbody>
                  {env.map((e) => {
                    const i = e.indexOf("=");
                    return (
                      <tr key={e} className="border-b border-line-soft last:border-0">
                        <td className="py-2 pr-6 align-top font-medium whitespace-nowrap text-ink">{i === -1 ? e : e.slice(0, i)}</td>
                        <td className="py-2 break-all text-body">{i === -1 ? "" : e.slice(i + 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
          <Card title={`Mounts (${mounts.length})`}>
            {mounts.length === 0 ? (
              <p className="text-13 text-muted">No mounts.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-13">
                  <thead>
                    <tr className="text-left text-grey">
                      <th className="pb-2 font-normal">Type</th>
                      <th className="pb-2 font-normal">Source</th>
                      <th className="pb-2 font-normal">Destination</th>
                      <th className="pb-2 font-normal">Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mounts.map((m) => (
                      <tr key={m.Destination} className="border-t border-line-soft text-body">
                        <td className="py-2 pr-4">{m.Type}</td>
                        <td className="py-2 pr-4 break-all">{m.Name ?? m.Source}</td>
                        <td className="py-2 pr-4 break-all">{m.Destination}</td>
                        <td className="py-2">{m.RW ? "read-write" : "read-only"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
