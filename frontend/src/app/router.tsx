import { createBrowserRouter } from "react-router-dom";
import { AppShellLayout } from "./AppShellLayout";

import { DashboardPage } from "../pages/DashboardPage";
import { ConnectionsPage } from "../pages/ConnectionsPage";
import { ApiSourcesPage } from "../pages/ApiSourcesPage";
import { StreamsPage } from "../pages/StreamsPage";
import { PackagesPage } from "../pages/PackagesPage";
import { ModelsPage } from "../pages/ModelsPage";
import { RunsPage } from "../pages/RunsPage";
import { SettingsPage } from "../pages/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShellLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "connections", element: <ConnectionsPage /> },
      { path: "api-sources", element: <ApiSourcesPage /> },
      { path: "streams", element: <StreamsPage /> },
      { path: "packages", element: <PackagesPage /> },
      { path: "models", element: <ModelsPage /> },
      { path: "runs", element: <RunsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
