import { defineConfig } from '@playwright/test';
import {
  BROWSER_SMOKE_BASE_URL_ENV,
  resolveBrowserSmokePorts
} from './scripts/browser-smoke-ports.mjs';

const explicitBaseURL = process.env[BROWSER_SMOKE_BASE_URL_ENV]?.trim();
const { backendPort, devServerPort } = resolveBrowserSmokePorts(process.env);
const defaultBackendUrl = `http://127.0.0.1:${backendPort}`;
const proxyTarget = process.env.VITE_DEV_PROXY_TARGET?.trim() || defaultBackendUrl;
const baseURL = explicitBaseURL || `http://127.0.0.1:${devServerPort}`;

const webServers = explicitBaseURL
  ? undefined
  : [
      {
        command: `pnpm dev --host 127.0.0.1 --port ${devServerPort} --strictPort`,
        url: `http://127.0.0.1:${devServerPort}`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          VITE_DEV_PROXY_TARGET: proxyTarget
        }
      }
    ];

if (webServers && !process.env.VITE_DEV_PROXY_TARGET?.trim()) {
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
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium'
      }
    }
  ],
  ...(webServers ? { webServer: webServers } : {})
});
