import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim() || process.env.VITE_DEV_PROXY_TARGET?.trim() || 'http://127.0.0.1:3000';
  const proxy = proxyTarget
    ? {
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
        '/timeline': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/accountability': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/collectors': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/memory': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/runtime': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/peer-watch': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/correlations': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/evidence-records': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    : undefined;

  return {
    plugins: [react()],
    server: proxy ? { proxy } : undefined,
    preview: proxy ? { proxy } : undefined,
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
