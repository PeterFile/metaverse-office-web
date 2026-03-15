import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim() || process.env.VITE_DEV_PROXY_TARGET?.trim() || 'http://127.0.0.1:3000';

  return {
    plugins: [react()],
    server: proxyTarget
      ? {
          proxy: {
            '/office': {
              target: proxyTarget,
              changeOrigin: true
            },
            '/agents': {
              target: proxyTarget,
              changeOrigin: true
            },
            '/incidents': {
              target: proxyTarget,
              changeOrigin: true
            },
            '/correlations': {
              target: proxyTarget,
              changeOrigin: true
            }
          }
        }
      : undefined,
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      // Default worker startup is flaky in this environment; keep the web gate on the stable pool.
      pool: 'vmThreads'
    }
  };
});
