import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { BrowserWindow, app, dialog, ipcMain, shell } from "electron";

import { detectHardware } from "@ai-voice-studio/hardware-detector";

import {
  APP_NAME,
  APP_VERSION,
  IPC_CHANNELS,
  isCreateVoiceProfileRequest,
  isDownloadSource,
  isEngineCommand,
  isEnqueueTaskRequest,
  isExportAudioRequest,
  isModelId,
  isProjectId,
  isSaveProjectRequest,
  isSetAudioFavoriteRequest,
  isUpdateExportNamingSettingsRequest,
  isVoiceId,
} from "@ai-voice-studio/shared-types";

import { handleAudioScheme } from "./audioProtocol";
import { DiagnosticsService } from "./diagnostics";
import { ExportPreferencesStore } from "./exportPreferences";
import { LocalVoiceEngine } from "./localVoiceEngine";
import {
  getModelLibraryRoot,
  prepareModelLibrary,
  resolveModelLibrarySelection,
} from "./modelLibrary";
import { ProjectStore } from "./projectStore";
import { checkAndRepairSystem } from "./systemCheck";
import { checkForAppUpdates, RELEASES_PAGE_URL } from "./updateChecker";
import { VoiceStore } from "./voiceStore";

const invalidFileNameCharacters = new Set('<>:"/\\|?*');

const sanitizeFileStem = (value: string): string =>
  [...value]
    .map((character) =>
      character.charCodeAt(0) < 32 || invalidFileNameCharacters.has(character)
        ? "-"
        : character,
    )
    .join("")
    .slice(0, 120) || APP_NAME;

export const registerIpcHandlers = (): (() => void) => {
  const voiceStore = new VoiceStore(
    path.join(app.getPath("userData"), "voices"),
  );
  const engine = new LocalVoiceEngine(voiceStore);
  const workspaceRoot = path.join(app.getPath("userData"), "workspace");
  const projectStore = new ProjectStore(path.join(workspaceRoot, "projects"));
  const exportPreferences = new ExportPreferencesStore(
    path.join(workspaceRoot, "export-preferences.json"),
  );
  const diagnostics = new DiagnosticsService(
    path.join(workspaceRoot, "diagnostics"),
  );
  const stopAudioScheme = handleAudioScheme((resultId) =>
    engine.getResultPath(resultId),
  );
  const unsubscribe = engine.subscribe((snapshot) => {
    void diagnostics.record(
      `engine:${snapshot.modelId}`,
      `${snapshot.status} ${snapshot.message}`,
    );
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.engine.snapshot, snapshot);
      }
    }
  });
  const unsubscribeTasks = engine.subscribeTasks((task) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.tasks.changed, task);
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.app.runtimeInfo, async () => ({
    name: APP_NAME,
    version: APP_VERSION,
    platform: process.platform,
    isPackaged: app.isPackaged,
    mockOnly: false,
    hardware: await detectHardware(),
  }));
  ipcMain.handle(IPC_CHANNELS.app.modelsPath, () => getModelLibraryRoot());
  ipcMain.handle(IPC_CHANNELS.app.openModelsFolder, async () => {
    const modelsPath = getModelLibraryRoot();
    await mkdir(modelsPath, { recursive: true });
    await writeFile(
      path.join(modelsPath, "模型文件夹说明.txt"),
      [
        "声作的三款本地模型都保存在这里。",
        "",
        "voxcpm2          VoxCPM2（综合最推荐）",
        "fun-cosyvoice3   Fun-CosyVoice3（更多中文方言）",
        "indextts2-5      IndexTTS-2.5（情绪与发音控制）",
        "",
        "需要删除模型时：先退出声作，再删除对应的整个文件夹。",
        "重新打开声作后，软件会自动识别；需要时可以再次一键下载。",
        "程序升级不会删除这个模型库。",
      ].join("\r\n"),
      { encoding: "utf8" },
    );
    const error = await shell.openPath(modelsPath);
    return error.length === 0;
  });
  ipcMain.handle(IPC_CHANNELS.app.changeModelsPath, async () => {
    const currentPath = getModelLibraryRoot();
    const selected = await dialog.showOpenDialog({
      title: "选择模型保存位置",
      buttonLabel: "选择这里",
      defaultPath: path.dirname(currentPath),
      properties: ["openDirectory", "createDirectory"],
    });
    const selectedPath = selected.filePaths[0];
    if (selected.canceled || !selectedPath) {
      return { canceled: true, path: currentPath };
    }
    const destination = resolveModelLibrarySelection(selectedPath);
    const result = await engine.relocateModelLibrary(destination);
    await diagnostics.record(
      "models",
      result.moved ? "模型库已迁移" : "模型库位置已更新",
    );
    return { canceled: false, ...result };
  });
  ipcMain.handle(IPC_CHANNELS.app.checkAndRepair, async () => {
    const modelLibraryRoot = getModelLibraryRoot();
    const guideWasMissing = !existsSync(
      path.join(modelLibraryRoot, "模型库说明.txt"),
    );
    prepareModelLibrary();
    const enginePluginsRoot = app.isPackaged
      ? path.join(process.resourcesPath, "engines")
      : path.resolve(app.getAppPath(), "../../engines");
    const report = await checkAndRepairSystem({
      modelLibraryRoot,
      userDataRoot: app.getPath("userData"),
      enginePluginsRoot,
      hardware: await detectHardware(),
      snapshots: engine.listSnapshots(),
      guideWasMissing,
    });
    await diagnostics.record(
      "system-check",
      `检查完成：${report.attentionCount} 项需处理，${report.repairedCount} 项已修复`,
    );
    return report;
  });
  ipcMain.handle(IPC_CHANNELS.app.checkForUpdates, () =>
    checkForAppUpdates(app.getVersion()),
  );
  ipcMain.handle(IPC_CHANNELS.app.openUpdatesPage, async () => {
    await shell.openExternal(RELEASES_PAGE_URL);
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.app.exportDiagnostics, async () => {
    const result = await dialog.showSaveDialog({
      title: "导出声作诊断包",
      defaultPath: `声作诊断包-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const [tasks, projects, voices, outputs] = await Promise.all([
      engine.listTasks(),
      projectStore.list(),
      voiceStore.list(),
      engine.listResults(),
    ]);
    await diagnostics.exportZip(result.filePath, {
      engines: engine.listSnapshots().map((snapshot) => ({
        modelId: snapshot.modelId,
        status: snapshot.status,
        progress: snapshot.progress,
        errorCode: snapshot.errorCode,
      })),
      counts: {
        tasks: tasks.length,
        failedTasks: tasks.filter((task) => task.status === "failed").length,
        projects: projects.length,
        voices: voices.length,
        outputs: outputs.length,
      },
    });
    await diagnostics.record("diagnostics", "诊断包已导出");
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle(IPC_CHANNELS.window.minimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle(IPC_CHANNELS.window.toggleMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle(IPC_CHANNELS.window.close, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(IPC_CHANNELS.engine.getSnapshot, () => engine.getSnapshot());
  ipcMain.handle(IPC_CHANNELS.engine.listSnapshots, () =>
    engine.listSnapshots(),
  );
  ipcMain.handle(IPC_CHANNELS.engine.command, (_event, command: unknown) => {
    if (!isEngineCommand(command)) {
      throw new Error("收到无效的本地引擎请求。");
    }
    return engine.command(command);
  });
  ipcMain.handle(
    IPC_CHANNELS.models.storageInfo,
    (_event, modelId: unknown) => {
      if (!isModelId(modelId)) throw new Error("模型编号无效。");
      return engine.getStorageInfo(modelId);
    },
  );
  ipcMain.handle(IPC_CHANNELS.models.getDownloadSource, () =>
    engine.getDownloadSource(),
  );
  ipcMain.handle(
    IPC_CHANNELS.models.setDownloadSource,
    (_event, source: unknown) => {
      if (!isDownloadSource(source)) throw new Error("下载源无效。");
      return engine.setDownloadSource(source);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.models.importOffline,
    async (_event, modelId: unknown) => {
      if (!isModelId(modelId)) throw new Error("模型编号无效。");
      const selected = await dialog.showOpenDialog({
        title: "选择已准备好的模型文件夹",
        properties: ["openDirectory"],
      });
      const source = selected.filePaths[0];
      if (selected.canceled || !source) return { canceled: true };
      await engine.importOffline(modelId, source);
      await diagnostics.record("models", `${modelId} 离线导入完成`);
      return {
        canceled: false,
        imported: true,
        message: "模型已导入，可以直接使用。",
      };
    },
  );
  ipcMain.handle(IPC_CHANNELS.projects.list, () => projectStore.list());
  ipcMain.handle(IPC_CHANNELS.projects.get, (_event, projectId: unknown) => {
    if (!isProjectId(projectId)) throw new Error("项目编号无效。");
    return projectStore.get(projectId);
  });
  ipcMain.handle(IPC_CHANNELS.projects.save, (_event, request: unknown) => {
    if (!isSaveProjectRequest(request)) {
      throw new Error("项目内容无效，请检查稿件和设置。");
    }
    return projectStore.save(request);
  });
  ipcMain.handle(IPC_CHANNELS.projects.remove, (_event, projectId: unknown) => {
    if (!isProjectId(projectId)) throw new Error("项目编号无效。");
    return projectStore.remove(projectId);
  });
  ipcMain.handle(IPC_CHANNELS.tasks.list, () => engine.listTasks());
  ipcMain.handle(IPC_CHANNELS.tasks.enqueue, (_event, request: unknown) => {
    if (!isEnqueueTaskRequest(request)) throw new Error("生成任务无效。");
    return engine.enqueueTask(request);
  });
  ipcMain.handle(IPC_CHANNELS.tasks.retry, (_event, taskId: unknown) => {
    if (!isVoiceId(taskId)) throw new Error("任务编号无效。");
    return engine.retryTask(taskId);
  });
  ipcMain.handle(IPC_CHANNELS.tasks.cancel, (_event, taskId: unknown) => {
    if (!isVoiceId(taskId)) throw new Error("任务编号无效。");
    return engine.cancelTask(taskId);
  });
  ipcMain.handle(IPC_CHANNELS.voices.list, () => voiceStore.list());
  ipcMain.handle(IPC_CHANNELS.voices.selectSample, () =>
    voiceStore.selectSample(),
  );
  ipcMain.handle(
    IPC_CHANNELS.voices.selectDroppedSample,
    (_event, filePath: unknown) => {
      if (typeof filePath !== "string") {
        throw new Error("拖入的音频无效。");
      }
      return voiceStore.selectDroppedSample(filePath);
    },
  );
  ipcMain.handle(IPC_CHANNELS.voices.create, (_event, request: unknown) => {
    if (!isCreateVoiceProfileRequest(request)) {
      throw new Error("录音、声音名称或录音原文无效。");
    }
    return voiceStore.create(request);
  });
  ipcMain.handle(IPC_CHANNELS.voices.remove, (_event, voiceId: unknown) => {
    if (!isVoiceId(voiceId)) throw new Error("声音编号无效。");
    return voiceStore.remove(voiceId);
  });
  ipcMain.handle(IPC_CHANNELS.audio.listResults, () => engine.listResults());
  ipcMain.handle(IPC_CHANNELS.audio.getExportNamingSettings, () =>
    exportPreferences.getSettings(),
  );
  ipcMain.handle(
    IPC_CHANNELS.audio.updateExportNamingSettings,
    (_event, request: unknown) => {
      if (!isUpdateExportNamingSettingsRequest(request)) {
        throw new Error("命名规则无效，请重新设置。");
      }
      return exportPreferences.updateNamingTemplate(request.template);
    },
  );
  ipcMain.handle(IPC_CHANNELS.audio.setFavorite, (_event, request: unknown) => {
    if (!isSetAudioFavoriteRequest(request)) {
      throw new Error("收藏设置无效。");
    }
    return engine.setResultFavorite(request.resultId, request.favorite);
  });
  ipcMain.handle(
    IPC_CHANNELS.audio.removeResult,
    (_event, resultId: unknown) => {
      if (!isVoiceId(resultId)) throw new Error("生成记录编号无效。");
      return engine.removeResult(resultId);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.audio.exportResult,
    async (_event, request: unknown) => {
      if (!isExportAudioRequest(request)) {
        throw new Error("收到无效的音频导出请求。");
      }
      const sourcePath = engine.getResultPath(request.resultId);
      if (!sourcePath) {
        throw new Error("生成的音频已不存在，请重新生成一次。");
      }
      const safeStem = sanitizeFileStem(
        path.basename(
          request.suggestedName,
          path.extname(request.suggestedName),
        ),
      );
      const safeName = `${safeStem}.mp3`;
      const lastExportDirectory = await exportPreferences.getLastDirectory();
      const result = await dialog.showSaveDialog({
        title: "导出 MP3 · 可直接修改文件名",
        defaultPath: lastExportDirectory
          ? path.join(lastExportDirectory, safeName)
          : safeName,
        filters: [{ name: "MP3 音频", extensions: ["mp3"] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };

      await mkdir(path.dirname(result.filePath), { recursive: true });
      await copyFile(sourcePath, result.filePath);
      await exportPreferences.rememberDirectory(path.dirname(result.filePath));
      return { canceled: false, filePath: result.filePath };
    },
  );
  ipcMain.handle(IPC_CHANNELS.audio.openExportFolder, async () => {
    const lastExportDirectory = await exportPreferences.getLastDirectory();
    if (!lastExportDirectory) return false;
    const error = await shell.openPath(lastExportDirectory);
    return error.length === 0;
  });

  return () => {
    unsubscribe();
    unsubscribeTasks();
    stopAudioScheme();
    void engine.dispose();
    ipcMain.removeHandler(IPC_CHANNELS.app.runtimeInfo);
    ipcMain.removeHandler(IPC_CHANNELS.app.modelsPath);
    ipcMain.removeHandler(IPC_CHANNELS.app.openModelsFolder);
    ipcMain.removeHandler(IPC_CHANNELS.app.changeModelsPath);
    ipcMain.removeHandler(IPC_CHANNELS.app.checkAndRepair);
    ipcMain.removeHandler(IPC_CHANNELS.app.checkForUpdates);
    ipcMain.removeHandler(IPC_CHANNELS.app.openUpdatesPage);
    ipcMain.removeHandler(IPC_CHANNELS.app.exportDiagnostics);
    ipcMain.removeHandler(IPC_CHANNELS.window.minimize);
    ipcMain.removeHandler(IPC_CHANNELS.window.toggleMaximize);
    ipcMain.removeHandler(IPC_CHANNELS.window.close);
    ipcMain.removeHandler(IPC_CHANNELS.engine.getSnapshot);
    ipcMain.removeHandler(IPC_CHANNELS.engine.listSnapshots);
    ipcMain.removeHandler(IPC_CHANNELS.engine.command);
    ipcMain.removeHandler(IPC_CHANNELS.models.storageInfo);
    ipcMain.removeHandler(IPC_CHANNELS.models.getDownloadSource);
    ipcMain.removeHandler(IPC_CHANNELS.models.setDownloadSource);
    ipcMain.removeHandler(IPC_CHANNELS.models.importOffline);
    ipcMain.removeHandler(IPC_CHANNELS.projects.list);
    ipcMain.removeHandler(IPC_CHANNELS.projects.get);
    ipcMain.removeHandler(IPC_CHANNELS.projects.save);
    ipcMain.removeHandler(IPC_CHANNELS.projects.remove);
    ipcMain.removeHandler(IPC_CHANNELS.tasks.list);
    ipcMain.removeHandler(IPC_CHANNELS.tasks.enqueue);
    ipcMain.removeHandler(IPC_CHANNELS.tasks.retry);
    ipcMain.removeHandler(IPC_CHANNELS.tasks.cancel);
    ipcMain.removeHandler(IPC_CHANNELS.voices.list);
    ipcMain.removeHandler(IPC_CHANNELS.voices.selectSample);
    ipcMain.removeHandler(IPC_CHANNELS.voices.selectDroppedSample);
    ipcMain.removeHandler(IPC_CHANNELS.voices.create);
    ipcMain.removeHandler(IPC_CHANNELS.voices.remove);
    ipcMain.removeHandler(IPC_CHANNELS.audio.exportResult);
    ipcMain.removeHandler(IPC_CHANNELS.audio.listResults);
    ipcMain.removeHandler(IPC_CHANNELS.audio.getExportNamingSettings);
    ipcMain.removeHandler(IPC_CHANNELS.audio.updateExportNamingSettings);
    ipcMain.removeHandler(IPC_CHANNELS.audio.setFavorite);
    ipcMain.removeHandler(IPC_CHANNELS.audio.removeResult);
    ipcMain.removeHandler(IPC_CHANNELS.audio.openExportFolder);
  };
};
