import { Route, Routes } from "react-router";
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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
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
          <Route path="images" element={<ImagesPage />} />
          <Route path="volumes" element={<VolumesPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="*" element={<NoItemFound message="Page not found." />} />
        </Route>
      </Routes>
    </Providers>
  );
}
