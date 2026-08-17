/// <reference types="vite/client" />

import type { DesktopApi } from "@ai-voice-studio/shared-types";

declare global {
  interface Window {
    desktopApi?: DesktopApi;
  }
}

export {};
