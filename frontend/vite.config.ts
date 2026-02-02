import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sentryVitePlugin({
    org: "sentry",
    project: "etl",
    url: "https://sentry.alexfricker.com",
    release: process.env.VITE_SENTRY_RELEASE ? { name: process.env.VITE_SENTRY_RELEASE } : undefined,
  })],

  build: {
    sourcemap: true
  }
});