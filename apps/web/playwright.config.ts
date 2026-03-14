import { defineConfig } from '@playwright/test';

const backendPort = 3210;
const defaultBackendUrl = `http://127.0.0.1:${backendPort}`;
const proxyTarget = process.env.VITE_DEV_PROXY_TARGET?.trim() || defaultBackendUrl;
const devServerPort = 4173;
const baseURL = `http://127.0.0.1:${devServerPort}`;

const webServers = [
  {
    command: `pnpm dev --host 127.0.0.1 --port ${devServerPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_DEV_PROXY_TARGET: proxyTarget
    }
  }
];

if (!process.env.VITE_DEV_PROXY_TARGET?.trim()) {
  webServers.unshift({
    command: 'node ./scripts/browser-smoke-backend.mjs',
    url: `${defaultBackendUrl}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(backendPort)
    }
  });
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    headless: true,
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 }
  },
  webServer: webServers
});
