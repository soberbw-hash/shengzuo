import path from "node:path";

import { BrowserWindow, app, shell } from "electron";

import { APP_NAME } from "@ai-voice-studio/shared-types";

const devServerUrl =
  process.env.VITE_DEV_SERVER_URL?.trim() || "http://127.0.0.1:5173";

const isTrustedRendererUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (!app.isPackaged) {
      return url.origin === new URL(devServerUrl).origin;
    }
    return url.protocol === "file:";
  } catch {
    return false;
  }
};

export const createMainWindow = async (): Promise<BrowserWindow> => {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "build", "icon.png")
    : path.join(app.getAppPath(), "build", "icon.png");
  const window = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    center: true,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    title: APP_NAME,
    backgroundColor: "#edf5ff",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setMenuBarVisibility(false);
  window.setAutoHideMenuBar(true);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });

  window.once("ready-to-show", () => window.show());

  if (app.isPackaged || process.env.AVS_USE_DIST === "1") {
    await window.loadFile(path.join(__dirname, "../../dist/index.html"));
  } else {
    await window.loadURL(devServerUrl);
  }

  return window;
};
