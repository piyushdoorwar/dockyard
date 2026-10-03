import { PageHeader } from "../components/Page";
import { Toggle } from "../components/SearchBar";
import { ThemeToggle } from "../components/ThemeToggle";
import { useSettings } from "../lib/settings";

export function SettingsPage() {
  const { settings, setEnabled } = useSettings();
  return (
    <>
      <PageHeader title="Settings" subtitle="Preferences are saved in this browser." />
      <div className="grid max-w-3xl gap-5">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Appearance</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-13 text-grey">Choose light or dark mode.</p>
            <ThemeToggle />
          </div>
        </section>
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Workspace discovery</h2>
          <p className="mt-2 text-13 text-grey">Enable the pages you need. Discovery is off by default.</p>
          <div className="mt-5 grid gap-5">
            <div>
              <Toggle label="Agent instructions" checked={settings.agents} onChange={(enabled) => setEnabled("agents", enabled)} />
              <p className="mt-2 text-12 text-muted">Show Agents in the sidebar and scan for AGENTS.md files when opened.</p>
            </div>
            <div>
              <Toggle label="Compose stack discovery" checked={settings.compose} onChange={(enabled) => setEnabled("compose", enabled)} />
              <p className="mt-2 text-12 text-muted">Show Compose in the sidebar and discover workspace Compose files when opened. Existing Docker stacks remain available under Stacks.</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
