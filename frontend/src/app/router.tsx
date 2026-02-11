import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShellLayout } from "./AppShellLayout";
import { LoginPage } from "../pages/LoginPage";
import { useAuthStore } from "../store/useAuthStore";

import { DashboardPage } from "../pages/DashboardPage";
import { DataSourcesPage } from "../pages/DataSourcesPage";
import { StreamsPage } from "../pages/StreamsPage";
import { TopicsPage } from "../pages/TopicsPage";
import { TopicDetailPage } from "../pages/TopicDetailPage";
import { ModelsPage } from "../pages/ModelsPage";
import { ModelDetailPage } from "../pages/ModelDetailPage";
import { RunsPage } from "../pages/RunsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SentryTestPage } from "../pages/SentryTestPage";

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShellLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "data-sources", element: <DataSourcesPage /> },
      { path: "streams", element: <StreamsPage /> },
      { path: "topics", element: <TopicsPage /> },
      { path: "topics/:id", element: <TopicDetailPage /> },
      { path: "models", element: <ModelsPage /> },
      { path: "models/:id", element: <ModelDetailPage /> },
      { path: "runs", element: <RunsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "sentry-test", element: <SentryTestPage /> },
    ],
  },
]);
