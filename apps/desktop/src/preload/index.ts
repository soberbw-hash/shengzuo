import { contextBridge, ipcRenderer, webUtils } from "electron";

import {
  IPC_CHANNELS,
  type DesktopApi,
  type EngineSnapshot,
} from "@ai-voice-studio/shared-types";

const desktopApi: DesktopApi = {
  app: {
    getRuntimeInfo: () => ipcRenderer.invoke(IPC_CHANNELS.app.runtimeInfo),
    getModelsPath: () => ipcRenderer.invoke(IPC_CHANNELS.app.modelsPath),
    openModelsFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.app.openModelsFolder),
    changeModelsPath: () =>
      ipcRenderer.invoke(IPC_CHANNELS.app.changeModelsPath),
    checkAndRepair: () => ipcRenderer.invoke(IPC_CHANNELS.app.checkAndRepair),
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.app.checkForUpdates),
    openUpdatesPage: () => ipcRenderer.invoke(IPC_CHANNELS.app.openUpdatesPage),
    exportDiagnostics: () =>
      ipcRenderer.invoke(IPC_CHANNELS.app.exportDiagnostics),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.window.minimize),
    toggleMaximize: () =>
      ipcRenderer.invoke(IPC_CHANNELS.window.toggleMaximize),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.window.close),
  },
  engine: {
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.engine.getSnapshot),
    listSnapshots: () => ipcRenderer.invoke(IPC_CHANNELS.engine.listSnapshots),
    command: (command) =>
      ipcRenderer.invoke(IPC_CHANNELS.engine.command, command),
    onSnapshot: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        snapshot: EngineSnapshot,
      ) => listener(snapshot);
      ipcRenderer.on(IPC_CHANNELS.engine.snapshot, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.engine.snapshot, handler);
    },
  },
  models: {
    getStorageInfo: (modelId) =>
      ipcRenderer.invoke(IPC_CHANNELS.models.storageInfo, modelId),
    getDownloadSource: () =>
      ipcRenderer.invoke(IPC_CHANNELS.models.getDownloadSource),
    setDownloadSource: (source) =>
      ipcRenderer.invoke(IPC_CHANNELS.models.setDownloadSource, source),
    importOffline: (modelId) =>
      ipcRenderer.invoke(IPC_CHANNELS.models.importOffline, modelId),
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projects.list),
    get: (projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.projects.get, projectId),
    save: (request) => ipcRenderer.invoke(IPC_CHANNELS.projects.save, request),
    remove: (projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.projects.remove, projectId),
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.tasks.list),
    enqueue: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.tasks.enqueue, request),
    retry: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.tasks.retry, taskId),
    cancel: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.tasks.cancel, taskId),
    onChanged: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        task: Parameters<typeof listener>[0],
      ) => listener(task);
      ipcRenderer.on(IPC_CHANNELS.tasks.changed, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.tasks.changed, handler);
    },
  },
  voices: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.voices.list),
    selectSample: () => ipcRenderer.invoke(IPC_CHANNELS.voices.selectSample),
    selectDroppedSample: (file) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.voices.selectDroppedSample,
        webUtils.getPathForFile(file),
      ),
    create: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.voices.create, request),
    rename: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.voices.rename, request),
    addSample: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.voices.addSample, request),
    selectSampleForVoice: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.voices.selectSampleForVoice, request),
    removeSample: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.voices.removeSample, request),
    remove: (voiceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.voices.remove, voiceId),
  },
  audio: {
    listResults: () => ipcRenderer.invoke(IPC_CHANNELS.audio.listResults),
    getExportNamingSettings: () =>
      ipcRenderer.invoke(IPC_CHANNELS.audio.getExportNamingSettings),
    updateExportNamingSettings: (request) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.audio.updateExportNamingSettings,
        request,
      ),
    setFavorite: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.audio.setFavorite, request),
    removeResult: (resultId) =>
      ipcRenderer.invoke(IPC_CHANNELS.audio.removeResult, resultId),
    exportResult: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.audio.exportResult, request),
    openExportFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.audio.openExportFolder),
  },
  smart: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.smart.getConfig),
    updateConfig: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.smart.updateConfig, request),
    testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.smart.testConnection),
    processText: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.smart.processText, request),
    processDialogue: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.smart.processDialogue, request),
  },
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
