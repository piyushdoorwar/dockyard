import { Navigate, Route, Routes } from "react-router";
import { ConfirmProvider } from "./components/Confirm";
import { Layout } from "./components/Layout";
import { NoItemFound } from "./components/Page";
import { ToastProvider } from "./components/Toast";
import { ContainerDetailPage } from "./pages/ContainerDetailPage";
import { ContainersPage } from "./pages/ContainersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ImagesPage } from "./pages/ImagesPage";
import { StacksPage } from "./pages/StacksPage";
import { VolumesPage } from "./pages/VolumesPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ComposePage } from "./pages/ComposePage";
import { NetworkingPage } from "./pages/NetworkingPage";

import { SettingsProvider, useSettings } from "./lib/settings";
import { SettingsPage } from "./pages/SettingsPage";

function DiscoveryPage({ feature, children }: { feature: "agents" | "compose"; children: React.ReactNode }) {
  const { settings } = useSettings();
  return settings[feature] ? children : <Navigate to="/settings" replace />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <SettingsProvider><ConfirmProvider>{children}</ConfirmProvider></SettingsProvider>
    </ToastProvider>
  );
}

export function App() {
  return (
    <Providers>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="containers" element={<ContainersPage />} />
          <Route path="containers/:id" element={<ContainerDetailPage />} />
          <Route path="stacks" element={<StacksPage />} />
          <Route path="compose" element={<DiscoveryPage feature="compose"><ComposePage /></DiscoveryPage>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="networking" element={<NetworkingPage />} />
          <Route path="images" element={<ImagesPage />} />
          <Route path="volumes" element={<VolumesPage />} />
          <Route path="agents" element={<DiscoveryPage feature="agents"><AgentsPage /></DiscoveryPage>} />
          <Route path="*" element={<NoItemFound message="Page not found." />} />
        </Route>
      </Routes>
    </Providers>
  );
}
