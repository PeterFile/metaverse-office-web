/// <reference types="vite/client" />

import type { ViewportInspector } from './aitown/viewport';

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

declare global {
  interface Window {
    __AITOWN_VIEWPORT__?: ViewportInspector;
  }
}
