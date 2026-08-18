import { MockEngine } from "@ai-voice-studio/mock-engine";
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_EXPORT_NAMING_TEMPLATE,
  MODEL_CATALOG,
  type DesktopApi,
  type ExportAudioRequest,
  type GenerationProject,
  type GenerationTask,
  type SmartApiConfig,
} from "@ai-voice-studio/shared-types";

const browserEngine = new MockEngine();
let browserProjects: GenerationProject[] = [];
let browserTasks: GenerationTask[] = [];
let browserExportNamingTemplate = DEFAULT_EXPORT_NAMING_TEMPLATE;
let browserSmartConfig: SmartApiConfig = {
  enabled: true,
  baseUrl: "https://api.example.com/v1",
  model: "preview-model",
  hasApiKey: true,
};
const browserTaskListeners = new Set<(task: GenerationTask) => void>();

const browserCaptureMode = (): string | null =>
  new URLSearchParams(window.location.search).get("capture");

const browserSmartConfigForPage = (): SmartApiConfig =>
  new URLSearchParams(window.location.search).get("api") === "missing"
    ? {
        enabled: false,
        baseUrl: "",
        model: "",
        hasApiKey: false,
      }
    : browserSmartConfig;

const browserPreviewProjects = (): GenerationProject[] => {
  if (browserCaptureMode() !== "records") return [];
  const now = new Date().toISOString();
  return [
    {
      id: "project-12345678-preview",
      title: "新品介绍字幕",
      kind: "subtitles",
      modelId: "voxcpm2",
      language: "auto",
      emotion: "自然",
      speed: 1,
      volume: 100,
      pauseMs: 420,
      expression: "自然、清晰",
      sourceText: "欢迎收看新品介绍。",
      segments: [
        {
          id: "subtitle-1",
          text: "欢迎收看新品介绍。",
          voiceId: "voice-preview",
        },
        {
          id: "subtitle-2",
          text: "接下来介绍主要功能。",
          voiceId: "voice-preview",
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "project-87654321-preview",
      title: "播客双人对话",
      kind: "dialogue",
      modelId: "fun-cosyvoice3-0.5b",
      language: "dialect-sichuan",
      emotion: "自然",
      speed: 1,
      volume: 100,
      pauseMs: 260,
      expression: "按角色自然对话",
      sourceText: "主持人：欢迎。",
      segments: [{ id: "line-1", text: "欢迎。", voiceId: "voice-preview" }],
      createdAt: now,
      updatedAt: now,
    },
  ];
};

const browserPreviewTasks = (): GenerationTask[] => {
  if (browserCaptureMode() !== "records") return [];
  const now = new Date().toISOString();
  return [
    {
      id: "task-completed-preview-1",
      title: "新品介绍字幕",
      kind: "subtitles",
      modelId: "voxcpm2",
      status: "completed",
      progress: 100,
      message: "生成完成",
      currentSegment: 50,
      totalSegments: 50,
      projectId: "project-12345678-preview",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "task-completed-preview-2",
      title: "播客双人对话",
      kind: "dialogue",
      modelId: "fun-cosyvoice3-0.5b",
      status: "completed",
      progress: 100,
      message: "生成完成",
      currentSegment: 12,
      totalSegments: 12,
      createdAt: now,
      updatedAt: now,
    },
  ];
};

const browserPreviewResults = () => {
  if (
    new URLSearchParams(window.location.search).get("capture") !== "records"
  ) {
    return [];
  }
  const createdAt = (daysAgo: number, hour: number, minute: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  return [
    {
      id: "preview-today-1",
      url: "./mock-audio/preview.mp3",
      durationSeconds: 82,
      format: "mp3" as const,
      createdAt: createdAt(0, 14, 26),
      favorite: true,
      modelId: "voxcpm2" as const,
      title: "产品介绍旁白",
      kind: "single" as const,
      projectId: "project-12345678-preview",
      takeNumber: 2,
    },
    {
      id: "preview-today-2",
      url: "./mock-audio/preview.mp3",
      durationSeconds: 46,
      format: "mp3" as const,
      createdAt: createdAt(0, 10, 8),
      modelId: "fun-cosyvoice3-0.5b" as const,
      title: "四川话短视频",
      kind: "single" as const,
    },
    {
      id: "preview-yesterday-1",
      url: "./mock-audio/preview.mp3",
      durationSeconds: 138,
      format: "mp3" as const,
      createdAt: createdAt(1, 17, 42),
      modelId: "voxcpm2" as const,
      title: "三人对话完整版",
      kind: "dialogue" as const,
    },
    {
      id: "preview-older-1",
      url: "./mock-audio/preview.mp3",
      durationSeconds: 205,
      format: "mp3" as const,
      createdAt: createdAt(4, 9, 15),
      favorite: true,
      modelId: "fun-cosyvoice3-0.5b" as const,
      title: "字幕批量配音",
      kind: "subtitles" as const,
    },
  ];
};

const exportInBrowser = async (request: ExportAudioRequest) => {
  const response = await fetch("./mock-audio/preview.mp3");
  if (!response.ok) {
    throw new Error(`Mock 音频加载失败（HTTP ${response.status}）。`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = request.suggestedName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1_000);
  return { canceled: false, filePath: request.suggestedName };
};

const browserApi: DesktopApi = {
  app: {
    getRuntimeInfo: () =>
      Promise.resolve({
        name: APP_NAME,
        version: APP_VERSION,
        platform: "browser-preview",
        isPackaged: false,
        mockOnly: true,
        hardware: {
          computeMode: "cuda",
          gpuName: "NVIDIA GeForce RTX 4070",
          nvidiaDriver: "preview",
          vramGb: 12,
          systemMemoryGb: 32,
          summary:
            "NVIDIA GeForce RTX 4070 · 12GB 显存，将自动使用 CUDA 加速。",
        },
      }),
    getModelsPath: () => Promise.resolve("浏览器预览不使用本地模型文件夹"),
    openModelsFolder: () => Promise.resolve(false),
    changeModelsPath: () =>
      Promise.resolve({
        canceled: false,
        path: "D:\\声作模型库",
        moved: true,
        movedBytes: 0,
        cleanupRequired: false,
      }),
    checkAndRepair: () =>
      Promise.resolve({
        checkedAt: new Date().toISOString(),
        overall: "healthy",
        repairedCount: 0,
        attentionCount: 0,
        readyModelCount: 3,
        items: [
          {
            id: "backend",
            label: "软件运行",
            status: "ok",
            detail: "软件可以正常连接本地模型。",
          },
          {
            id: "storage",
            label: "文件保存",
            status: "ok",
            detail: "模型、项目、声音和音频都可以正常保存。",
          },
          {
            id: "hardware",
            label: "硬件加速",
            status: "ok",
            detail:
              "NVIDIA GeForce RTX 4070 · 12GB 显存，将自动使用 CUDA 加速。",
          },
          ...MODEL_CATALOG.map((model) => ({
            id: `model-${model.id}`,
            label: model.name,
            status: "ok" as const,
            detail: "需要的文件都已准备好。",
          })),
        ],
      }),
    checkForUpdates: () =>
      Promise.resolve({
        checkedAt: new Date().toISOString(),
        status: "up-to-date",
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        releaseName: `声作 ${APP_VERSION}`,
        releaseUrl: "https://github.com/soberbw-hash/shengzuo/releases/latest",
      }),
    openUpdatesPage: () => Promise.resolve(true),
    exportDiagnostics: () => Promise.resolve({ canceled: true }),
  },
  window: {
    minimize: () => Promise.resolve(),
    toggleMaximize: () => Promise.resolve(),
    close: () => Promise.resolve(),
  },
  engine: {
    getSnapshot: () => Promise.resolve(browserEngine.getSnapshot()),
    listSnapshots: () => Promise.resolve([browserEngine.getSnapshot()]),
    command: (command) => Promise.resolve(browserEngine.command(command)),
    onSnapshot: (listener) => browserEngine.subscribe(listener),
  },
  models: {
    getStorageInfo: (modelId) =>
      Promise.resolve({
        modelId,
        installed: true,
        requiredBytes: 15 * 1024 ** 3,
        currentBytes: 15 * 1024 ** 3,
        freeBytes: 80 * 1024 ** 3,
        downloadSource: "official",
      }),
    getDownloadSource: () => Promise.resolve("official"),
    setDownloadSource: (source) => Promise.resolve(source),
    importOffline: () => Promise.resolve({ canceled: true }),
  },
  projects: {
    list: () =>
      Promise.resolve(
        browserProjects.length ? browserProjects : browserPreviewProjects(),
      ),
    get: (projectId) =>
      Promise.resolve(
        browserProjects.find((project) => project.id === projectId) ?? null,
      ),
    save: (request) => {
      const existing = request.id
        ? browserProjects.find((project) => project.id === request.id)
        : undefined;
      const now = new Date().toISOString();
      const project: GenerationProject = {
        ...request,
        id: request.id ?? `project-${crypto.randomUUID()}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      browserProjects = [
        project,
        ...browserProjects.filter((item) => item.id !== project.id),
      ];
      return Promise.resolve(project);
    },
    remove: (projectId) => {
      const found = browserProjects.some((project) => project.id === projectId);
      browserProjects = browserProjects.filter(
        (project) => project.id !== projectId,
      );
      return Promise.resolve(found);
    },
  },
  tasks: {
    list: () =>
      Promise.resolve(
        browserTasks.length ? browserTasks : browserPreviewTasks(),
      ),
    enqueue: (request) => {
      const id = `task-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      browserEngine.command(
        request.type === "generate"
          ? { type: "generate", request: { ...request.request, requestId: id } }
          : {
              type: "generate-batch",
              request: { ...request.request, requestId: id },
            },
      );
      const task: GenerationTask = {
        id,
        title: request.request.title,
        kind:
          request.type === "generate-batch" ? request.request.kind : "single",
        modelId: request.request.modelId,
        status: "completed",
        progress: 100,
        message: "生成完成",
        currentSegment:
          request.type === "generate-batch"
            ? request.request.segments.length
            : 1,
        totalSegments:
          request.type === "generate-batch"
            ? request.request.segments.length
            : 1,
        projectId: request.projectId,
        resultId: id,
        createdAt: now,
        updatedAt: now,
      };
      browserTasks = [task, ...browserTasks];
      for (const listener of browserTaskListeners) listener(task);
      return Promise.resolve(task);
    },
    retry: (taskId) => {
      const task = browserTasks.find((item) => item.id === taskId);
      if (!task) return Promise.reject(new Error("任务不存在。"));
      return Promise.resolve(task);
    },
    cancel: (taskId) => {
      const task = browserTasks.find((item) => item.id === taskId);
      if (!task) return Promise.reject(new Error("任务不存在。"));
      task.status = "canceled";
      return Promise.resolve(task);
    },
    onChanged: (listener) => {
      browserTaskListeners.add(listener);
      return () => browserTaskListeners.delete(listener);
    },
  },
  voices: {
    list: () =>
      Promise.resolve(
        browserCaptureMode() === "interaction"
          ? [
              {
                id: "voice-preview",
                name: "测试声音",
                description: "自动化测试声音",
                kind: "cloned" as const,
                modelId: "voxcpm2" as const,
                model: "VoxCPM2",
                color: "blue",
                sampleName: "test.wav",
                hasReferenceText: true,
                createdAt: new Date().toISOString(),
                referenceSamples: [
                  {
                    id: "sample-preview-1",
                    name: "test.wav",
                    createdAt: new Date().toISOString(),
                    active: true,
                  },
                ],
                previewUrl: "./mock-audio/preview.mp3",
              },
            ]
          : [],
      ),
    selectSample: () => Promise.resolve({ canceled: true }),
    selectDroppedSample: (file) =>
      Promise.resolve({
        canceled: false,
        sampleToken: `preview-${file.name}`,
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        quality: {
          status: "good" as const,
          durationSeconds: 8,
          checks: [
            {
              code: "DURATION_GOOD",
              label: "时长 8.0 秒",
              tone: "success" as const,
            },
          ],
        },
      }),
    create: () => Promise.reject(new Error("浏览器预览不能读取本地录音。")),
    rename: (request) =>
      Promise.resolve({
        id: request.voiceId,
        name: request.name.trim(),
        description: "高保真声音克隆",
        kind: "cloned",
        modelId: "voxcpm2",
        model: "三款模型通用",
        color: "#54a8ef",
        sampleName: "preview.wav",
        hasReferenceText: true,
        createdAt: new Date().toISOString(),
      }),
    addSample: () =>
      Promise.reject(new Error("浏览器预览不能写入真实参考录音。")),
    selectSampleForVoice: () =>
      Promise.reject(new Error("浏览器预览不能切换真实参考录音。")),
    removeSample: () =>
      Promise.reject(new Error("浏览器预览不能删除真实参考录音。")),
    remove: () => Promise.resolve(false),
  },
  audio: {
    listResults: () => Promise.resolve(browserPreviewResults()),
    getExportNamingSettings: () =>
      Promise.resolve({ template: browserExportNamingTemplate }),
    updateExportNamingSettings: (request) => {
      browserExportNamingTemplate = request.template;
      return Promise.resolve({ template: browserExportNamingTemplate });
    },
    setFavorite: (request) =>
      Promise.resolve({
        id: request.resultId,
        url: "./mock-audio/preview.mp3",
        durationSeconds: 2,
        format: "mp3",
        createdAt: new Date().toISOString(),
        favorite: request.favorite,
      }),
    removeResult: () => Promise.resolve(true),
    exportResult: exportInBrowser,
    openExportFolder: () => Promise.resolve(false),
  },
  smart: {
    getConfig: () => Promise.resolve(browserSmartConfigForPage()),
    updateConfig: (request) => {
      browserSmartConfig = {
        enabled: request.enabled,
        baseUrl: request.baseUrl.trim().replace(/\/+$/u, ""),
        model: request.model.trim(),
        hasApiKey:
          request.clearApiKey === true
            ? false
            : Boolean(request.apiKey?.trim()) || browserSmartConfig.hasApiKey,
      };
      return Promise.resolve(browserSmartConfig);
    },
    testConnection: () =>
      Promise.resolve({
        ok: true,
        message: "API 连接成功。",
        model: browserSmartConfig.model,
      }),
    processText: (request) =>
      Promise.resolve({
        revisedText:
          request.action === "pause"
            ? request.text.replaceAll("，", "， ")
            : `${request.text.replace(/\s+/gu, " ").trim()}（已优化）`,
        summary: "已保留原意，并让文字更适合朗读。",
        pronunciations: request.text.includes("AI")
          ? [{ source: "AI", replacement: "A I" }]
          : [],
        expressionSuggestion:
          request.modelId === "fun-cosyvoice3-0.5b" && request.language === "zh"
            ? undefined
            : "自然清晰，重点处稍作停顿",
        emotionSuggestion:
          request.modelId === "indextts2-5" ? ("温暖" as const) : undefined,
      }),
    processDialogue: () =>
      Promise.resolve({
        lines: [
          { role: "小林", text: "我们出发吧。" },
          { role: "阿宁", text: "好，现在就走。" },
        ],
        roles: ["小林", "阿宁"],
        summary: "已整理出 2 个角色、2 句台词。",
        removedContent: ["场景描述", "动作说明"],
      }),
  },
};

export const desktopApi: DesktopApi = window.desktopApi ?? browserApi;
export const isBrowserPreview = window.desktopApi === undefined;
