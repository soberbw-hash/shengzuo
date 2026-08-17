import { mkdirSync } from "node:fs";
import path from "node:path";

import { BrowserWindow, app, session } from "electron";

import { APP_NAME } from "@ai-voice-studio/shared-types";

import { registerAudioScheme } from "./audioProtocol";
import { registerIpcHandlers } from "./ipc";
import { createMainWindow } from "./window";

registerAudioScheme();
app.setName(APP_NAME);
app.setAppUserModelId("com.shengzuo.desktop");
app.disableHardwareAcceleration();

const sessionDataPath = path.join(
  app.getPath("temp"),
  "ShengZuo",
  "browser-session-v2",
);
mkdirSync(sessionDataPath, { recursive: true });
app.setPath("sessionData", sessionDataPath);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

let cleanupIpc: (() => void) | undefined;

void app
  .whenReady()
  .then(async () => {
    if (!hasSingleInstanceLock) return;
    session.defaultSession.setSpellCheckerEnabled(false);
    cleanupIpc = registerIpcHandlers();
    await createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
    });
  })
  .catch((error: unknown) => {
    console.error(`${APP_NAME} 启动失败`, error);
    app.quit();
  });

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  cleanupIpc?.();
});
