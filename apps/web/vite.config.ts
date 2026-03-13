import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim();

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
      // Default worker startup is flaky in this environment; keep the web gate on the stable pool.
      pool: 'vmThreads'
    }
  };
});
