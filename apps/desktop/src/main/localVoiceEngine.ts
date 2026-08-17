import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
} from "node:fs";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import type { Readable } from "node:stream";

import { app } from "electron";

import { validateGenerationRequest } from "@ai-voice-studio/engine-sdk";
import { detectHardware } from "@ai-voice-studio/hardware-detector";
import {
  ENGINE_STATUS_COPY,
  MODEL_CATALOG,
  type AudioResult,
  type BatchGenerationRequest,
  type DownloadSource,
  type EngineCommand,
  type EngineSnapshot,
  type EnqueueTaskRequest,
  type GenerationTask,
  type GenerationRequest,
  type ModelStorageInfo,
  type ModelId,
} from "@ai-voice-studio/shared-types";

import { TaskStore, type StoredGenerationTask } from "./taskStore";
import {
  moveModelLibrary,
  prepareModelLibrary,
  type ModelLibraryMoveResult,
} from "./modelLibrary";
import type { VoiceStore } from "./voiceStore";
import {
  readDownloadCheckpoint,
  removeDownloadCheckpoint,
  writeDownloadCheckpoint,
} from "./downloadCheckpoint";

type SnapshotListener = (snapshot: EngineSnapshot) => void;
type TaskListener = (task: GenerationTask) => void;
type ManagedChild = ChildProcessByStdio<null, Readable, Readable>;

interface ProgressEvent {
  progress: number;
  message: string;
}

interface WorkerConnection {
  process: ManagedChild;
  port: number;
  sessionToken: string;
}

interface WorkerResult {
  ok: boolean;
  fileName?: string;
  durationSeconds?: number;
  sessionToken?: string;
  protocolVersion?: string;
  code?: string;
}

interface PluginConfig {
  modelId: ModelId;
  folder: string;
  dataFolder: string;
  name: string;
  runtimeFlavor: "voxcpm" | "cosyvoice" | "indextts";
  assetDirectories: readonly string[];
  workerWeightsDirectory?: string;
  loadingMessage: string;
  requiredBytes: number;
  minimumCudaVramGb: number;
}

const pluginConfigs: readonly PluginConfig[] = [
  {
    modelId: "voxcpm2",
    folder: "voxcpm2",
    dataFolder: "voxcpm2",
    name: "VoxCPM2",
    runtimeFlavor: "voxcpm",
    assetDirectories: ["weights/VoxCPM2"],
    workerWeightsDirectory: "VoxCPM2",
    loadingMessage: "正在加载 VoxCPM2；第一次可能需要几分钟…",
    requiredBytes: 15 * 1024 ** 3,
    minimumCudaVramGb: 6,
  },
  {
    modelId: "fun-cosyvoice3-0.5b",
    folder: "fun-cosyvoice3",
    dataFolder: "fun-cosyvoice3",
    name: "Fun-CosyVoice3",
    runtimeFlavor: "cosyvoice",
    assetDirectories: [
      "weights/Fun-CosyVoice3-0.5B-2512",
      "sources/CosyVoice",
      "sources/Matcha-TTS",
    ],
    loadingMessage: "正在加载 Fun-CosyVoice3；首次加载需要几分钟…",
    requiredBytes: 16 * 1024 ** 3,
    minimumCudaVramGb: 6,
  },
  {
    modelId: "indextts2-5",
    folder: "indextts2-5",
    dataFolder: "indextts2-5",
    name: "IndexTTS-2.5",
    runtimeFlavor: "indextts",
    assetDirectories: ["weights/IndexTTS-2.5", "sources/index-tts"],
    loadingMessage: "正在加载 IndexTTS-2.5；首次加载需要几分钟…",
    requiredBytes: 18 * 1024 ** 3,
    minimumCudaVramGb: 8,
  },
] as const;

const isProgressEvent = (value: unknown): value is ProgressEvent =>
  typeof value === "object" &&
  value !== null &&
  "progress" in value &&
  typeof value.progress === "number" &&
  "message" in value &&
  typeof value.message === "string";

const runtimeProgressMessages: Record<string, string> = {
  PYTHON_DOWNLOAD: "正在准备独立 Python 运行环境…",
  PYTHON_VERIFIED: "Python 安装包 SHA-256 校验完成。",
  TORCH_INSTALL: "正在安装 GPU 推理组件…",
  ENGINE_DEPENDENCIES: "正在安装模型运行组件与本地 FFmpeg…",
  RUNTIME_READY: "独立运行环境、CUDA 组件与本地 FFmpeg 已安装。",
};

const getFreeLoopbackPort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        server.close();
        reject(new Error("LOOPBACK_PORT_UNAVAILABLE"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });

const friendlyGenerationError = (code?: string): string => {
  switch (code) {
    case "VOICE_SAMPLE_DURATION":
      return "录音需要在 3 到 60 秒之间，请换一段更清晰的单人说话录音。";
    case "VOICE_SAMPLE_NOT_FOUND":
      return "没有找到这条声音的录音，请重新克隆声音。";
    case "MODEL_NOT_INSTALLED":
      return "模型文件不完整，请到模型目录重新准备引擎。";
    case "UNSUPPORTED_LANGUAGE":
      return "当前模型不支持所选语言，请更换语言后重试。";
    case "MODEL_SHA256_MISMATCH":
    case "SOURCE_SHA256_MISMATCH":
      return "官方文件校验失败，没有加载模型；请重新下载安装。";
    case "WORKER_HANDSHAKE_FAILED":
      return "本地模型进程没有正常启动，请重试。";
    case "SYSTEM_MEMORY_LOW":
      return "没有兼容显卡，且系统内存不足 16GB；当前电脑不适合运行这些本地模型。";
    default:
      return "这次没有生成成功。请检查录音和文本后重试；若显存不足，请关闭其他占用显卡的程序。";
  }
};

const initialSnapshot = (
  config: PluginConfig,
  installed: boolean,
  downloadSource: DownloadSource,
): EngineSnapshot => ({
  status: installed ? "ready" : "not-installed",
  modelId: config.modelId,
  progress: installed ? 100 : 0,
  message: installed
    ? `${config.name} 已安装，可以开始配音。`
    : ENGINE_STATUS_COPY["not-installed"].message,
  canRetry: false,
  requiredBytes: config.requiredBytes,
  downloadSource,
});

const directorySize = async (root: string): Promise<number> => {
  if (!existsSync(root)) return 0;
  const entries = await readdir(root, { withFileTypes: true });
  let bytes = 0;
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) bytes += await directorySize(entryPath);
    else if (entry.isFile()) bytes += (await stat(entryPath)).size;
  }
  return bytes;
};

const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(digest.digest("hex")));
  });

const verifyInstallReceipt = async (directory: string): Promise<void> => {
  const receiptPath = path.join(directory, "install-receipt.json");
  const receipt: unknown = JSON.parse(await readFile(receiptPath, "utf8"));
  if (
    typeof receipt !== "object" ||
    receipt === null ||
    !("files" in receipt) ||
    typeof receipt.files !== "object" ||
    receipt.files === null
  ) {
    throw new Error("OFFLINE_RECEIPT_INVALID");
  }
  const entries = Object.entries(receipt.files);
  if (entries.length === 0) throw new Error("OFFLINE_RECEIPT_EMPTY");
  const resolvedDirectory = path.resolve(directory);
  for (const [relativeName, expected] of entries) {
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/u.test(expected)) {
      throw new Error("OFFLINE_RECEIPT_INVALID");
    }
    const filePath = path.resolve(directory, relativeName);
    if (
      !filePath.startsWith(`${resolvedDirectory}${path.sep}`) ||
      !existsSync(filePath) ||
      (await sha256File(filePath)) !== expected
    ) {
      throw new Error(`OFFLINE_SHA256_MISMATCH:${relativeName.slice(0, 80)}`);
    }
  }
};

const batchFingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

interface BatchCacheManifest {
  projectId: string;
  segments: Record<
    string,
    { fingerprint: string; durationSeconds: number; fileId: string }
  >;
}

class ModelEngine {
  private readonly pluginRoot: string;
  private readonly commonRoot: string;
  private readonly engineDataRoot: string;
  private readonly runtimeRoot: string;
  private readonly cacheRoot: string;
  private readonly weightsRoot: string;
  private readonly sourceRoot: string;
  private readonly outputRoot: string;
  private readonly pythonExe: string;
  private readonly downloadCheckpointPath: string;
  private snapshot: EngineSnapshot;
  private activeInstaller: ManagedChild | undefined;
  private activeInstallRun: number | undefined;
  private worker: WorkerConnection | undefined;
  private generationAbort: AbortController | undefined;
  private installRun = 0;
  private disposed = false;

  constructor(
    private readonly config: PluginConfig,
    private readonly voiceStore: VoiceStore,
    private readonly emit: (snapshot: EngineSnapshot) => void,
    private readonly activate: (modelId: ModelId) => Promise<void>,
    private readonly getDownloadSource: () => DownloadSource,
    modelLibraryRoot: string,
  ) {
    const enginesRoot = app.isPackaged
      ? path.join(process.resourcesPath, "engines")
      : path.resolve(app.getAppPath(), "../../engines");
    this.pluginRoot = path.join(enginesRoot, config.folder);
    this.commonRoot = path.join(enginesRoot, "common");
    this.engineDataRoot = path.join(modelLibraryRoot, config.dataFolder);
    this.runtimeRoot = path.join(this.engineDataRoot, "runtime");
    this.cacheRoot = path.join(this.engineDataRoot, "cache");
    this.weightsRoot = path.join(this.engineDataRoot, "weights");
    this.sourceRoot = path.join(this.engineDataRoot, "sources");
    this.downloadCheckpointPath = path.join(
      this.engineDataRoot,
      "download-state.json",
    );
    this.outputRoot = path.join(
      app.getPath("userData"),
      "outputs",
      config.modelId,
    );
    const legacyOutputRoot = path.join(this.engineDataRoot, "outputs");
    if (!existsSync(this.outputRoot) && existsSync(legacyOutputRoot)) {
      mkdirSync(path.dirname(this.outputRoot), { recursive: true });
      renameSync(legacyOutputRoot, this.outputRoot);
    }
    this.pythonExe = path.join(this.runtimeRoot, "python.exe");
    this.snapshot = initialSnapshot(
      config,
      this.isInstalled(),
      this.getDownloadSource(),
    );
    const checkpoint = readDownloadCheckpoint(
      this.downloadCheckpointPath,
      config.modelId,
    );
    if (!this.isInstalled() && checkpoint) {
      this.snapshot = {
        ...this.snapshot,
        status: "download-paused",
        progress: Math.max(2, Math.min(99, checkpoint.progress)),
        message: "上次下载已保留，点击继续下载。",
        canRetry: true,
        downloadedBytes: checkpoint.downloadedBytes,
        requiredBytes: checkpoint.requiredBytes,
      };
    }
  }

  getSnapshot(): EngineSnapshot {
    return structuredClone(this.snapshot);
  }

  refreshInstallationState(): EngineSnapshot {
    if (
      this.activeInstallRun !== undefined ||
      ["downloading", "installing", "loading", "generating"].includes(
        this.snapshot.status,
      )
    ) {
      return this.getSnapshot();
    }
    const installed = this.isInstalled();
    if (
      !installed &&
      !["not-installed", "download-paused", "download-failed"].includes(
        this.snapshot.status,
      )
    ) {
      this.generationAbort?.abort();
      void this.releaseWorker();
      this.snapshot = initialSnapshot(
        this.config,
        false,
        this.getDownloadSource(),
      );
    } else if (
      installed &&
      ["not-installed", "download-paused", "download-failed"].includes(
        this.snapshot.status,
      )
    ) {
      this.snapshot = initialSnapshot(
        this.config,
        true,
        this.getDownloadSource(),
      );
      try {
        removeDownloadCheckpoint(this.downloadCheckpointPath);
      } catch {
        // The complete install receipt takes precedence over stale state.
      }
    }
    return this.getSnapshot();
  }

  isInstalling(): boolean {
    return this.activeInstallRun !== undefined;
  }

  getResultPath(resultId: string): string | undefined {
    const candidate = path.join(this.outputRoot, `${resultId}.mp3`);
    return existsSync(candidate) ? candidate : undefined;
  }

  async listResults(): Promise<AudioResult[]> {
    if (!existsSync(this.outputRoot)) return [];
    const files = await readdir(this.outputRoot, { withFileTypes: true });
    const results = await Promise.all(
      files
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry): Promise<AudioResult | null> => {
          try {
            const value: unknown = JSON.parse(
              await readFile(path.join(this.outputRoot, entry.name), "utf8"),
            );
            if (
              typeof value !== "object" ||
              value === null ||
              !("id" in value) ||
              typeof value.id !== "string" ||
              !("createdAt" in value) ||
              typeof value.createdAt !== "string" ||
              Number.isNaN(Date.parse(value.createdAt)) ||
              !existsSync(path.join(this.outputRoot, `${value.id}.mp3`))
            ) {
              return null;
            }
            const result = value as AudioResult;
            return {
              ...result,
              url: `shengzuo-audio://result/${encodeURIComponent(result.id)}`,
            };
          } catch {
            return null;
          }
        }),
    );
    return results.filter((value): value is AudioResult => value !== null);
  }

  async setResultFavorite(
    resultId: string,
    favorite: boolean,
  ): Promise<AudioResult | undefined> {
    const metadataPath = path.join(this.outputRoot, `${resultId}.json`);
    if (!existsSync(metadataPath) || !this.getResultPath(resultId)) {
      return undefined;
    }
    const value: unknown = JSON.parse(await readFile(metadataPath, "utf8"));
    if (
      typeof value !== "object" ||
      value === null ||
      !("id" in value) ||
      value.id !== resultId
    ) {
      return undefined;
    }
    const result = { ...(value as AudioResult), favorite };
    await this.writeResultMetadata(result);
    return {
      ...result,
      url: `shengzuo-audio://result/${encodeURIComponent(result.id)}`,
    };
  }

  async removeResult(resultId: string): Promise<boolean> {
    if (!this.getResultPath(resultId)) return false;
    await Promise.all([
      rm(path.join(this.outputRoot, `${resultId}.mp3`), { force: true }),
      rm(path.join(this.outputRoot, `${resultId}.json`), { force: true }),
    ]);
    return true;
  }

  async getStorageInfo(): Promise<ModelStorageInfo> {
    await mkdir(this.engineDataRoot, { recursive: true });
    const disk = await statfs(this.engineDataRoot);
    return {
      modelId: this.config.modelId,
      installed: this.isInstalled(),
      requiredBytes: this.config.requiredBytes,
      currentBytes: await directorySize(this.engineDataRoot),
      freeBytes: disk.bavail * disk.bsize,
      downloadSource: this.getDownloadSource(),
    };
  }

  async importOffline(sourceDirectory: string): Promise<void> {
    if (this.activeInstaller) throw new Error("请先暂停当前下载。");
    await this.releaseWorker();
    const nested = path.join(sourceDirectory, this.config.dataFolder);
    const sourceRoot = this.isInstalledAt(sourceDirectory)
      ? sourceDirectory
      : nested;
    if (!this.isInstalledAt(sourceRoot)) {
      throw new Error("所选文件夹不是完整的声作模型目录。");
    }
    await mkdir(path.dirname(this.engineDataRoot), { recursive: true });
    const sourceBytes = await directorySize(sourceRoot);
    const disk = await statfs(path.dirname(this.engineDataRoot));
    if (disk.bavail * disk.bsize < sourceBytes + 1024 ** 3) {
      throw new Error("磁盘空间不足，无法导入这个模型。");
    }
    const staging = `${this.engineDataRoot}.offline-${randomUUID()}`;
    const backup = `${this.engineDataRoot}.replaced-${randomUUID()}`;
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: false });
    try {
      for (const folder of ["runtime", "weights", "sources"] as const) {
        const source = path.join(sourceRoot, folder);
        if (existsSync(source)) {
          await cp(source, path.join(staging, folder), {
            recursive: true,
            errorOnExist: true,
          });
        }
      }
      if (!this.isInstalledAt(staging)) {
        throw new Error("模型复制后校验失败，没有替换当前文件。");
      }
      for (const relativeDirectory of this.config.assetDirectories) {
        await verifyInstallReceipt(path.join(staging, relativeDirectory));
      }
      if (existsSync(this.engineDataRoot)) {
        await rename(this.engineDataRoot, backup);
      }
      try {
        await rename(staging, this.engineDataRoot);
      } catch (error) {
        if (existsSync(backup)) await rename(backup, this.engineDataRoot);
        throw error;
      }
      await rm(backup, { recursive: true, force: true });
      this.updateSnapshot({
        status: "ready",
        progress: 100,
        message: `${this.config.name} 已从本地文件夹导入，可以使用。`,
        canRetry: false,
        errorCode: undefined,
        downloadedBytes: sourceBytes,
        requiredBytes: this.config.requiredBytes,
        downloadSource: this.getDownloadSource(),
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("OFFLINE_")) {
        throw new Error("离线模型文件校验未通过，请重新复制完整模型文件夹。");
      }
      throw error;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  install(): void {
    if (this.disposed) return;
    if (this.activeInstallRun !== undefined) return;
    if (this.isInstalled()) {
      this.updateSnapshot({
        status: "ready",
        progress: 100,
        message: `${this.config.name} 已安装，可以开始配音。`,
        canRetry: false,
        errorCode: undefined,
      });
      void this.prepareModel();
      return;
    }
    const run = ++this.installRun;
    this.activeInstallRun = run;
    this.updateSnapshot({
      status: "downloading",
      progress: 2,
      message: `正在准备 ${this.config.name} 的独立运行环境…`,
      canRetry: false,
      errorCode: undefined,
      result: undefined,
    });
    void this.runInstall(run);
  }

  pauseInstall(): void {
    if (
      this.activeInstallRun === undefined &&
      !["downloading", "installing"].includes(this.snapshot.status)
    ) {
      return;
    }
    this.installRun += 1;
    this.stopInstallerProcess();
    this.activeInstaller = undefined;
    this.activeInstallRun = undefined;
    this.updateSnapshot({
      status: "download-paused",
      message: "已暂停，点击继续会从已下载的位置接着下。",
      canRetry: true,
    });
  }

  prepare(): void {
    if (this.disposed) return;
    void this.prepareModel();
  }

  generate(request: GenerationRequest): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.generateSingle(request);
  }

  generateBatch(request: BatchGenerationRequest): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.generateMany(request);
  }

  async cancel(jobId: string): Promise<void> {
    if (
      this.snapshot.jobId !== jobId ||
      !["loading", "generating"].includes(this.snapshot.status)
    ) {
      return;
    }
    this.generationAbort?.abort();
    await this.releaseWorker();
    this.updateSnapshot({
      status: "stopped",
      progress: 0,
      message: "已停止生成，文本和声音设置仍然保留。",
      canRetry: true,
      result: undefined,
    });
  }

  async releaseWorker(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    if (!worker || worker.process.exitCode !== null) return;
    try {
      await this.workerRequest(worker, "/shutdown", {}, 2_000);
    } catch {
      worker.process.kill();
    }
  }

  async dispose(): Promise<void> {
    if (this.activeInstallRun !== undefined) this.pauseInstall();
    this.disposed = true;
    this.installRun += 1;
    this.stopInstallerProcess();
    this.generationAbort?.abort();
    await this.releaseWorker();
  }

  private setSnapshot(next: EngineSnapshot): void {
    this.snapshot = next;
    this.emit(this.getSnapshot());
  }

  private updateSnapshot(update: Partial<EngineSnapshot>): void {
    const next = { ...this.snapshot, ...update };
    this.setSnapshot(next);
    if (
      [
        "downloading",
        "installing",
        "download-paused",
        "download-failed",
      ].includes(next.status)
    ) {
      try {
        writeDownloadCheckpoint(this.downloadCheckpointPath, {
          modelId: this.config.modelId,
          state:
            next.status === "download-paused"
              ? "paused"
              : next.status === "download-failed"
                ? "failed"
                : "active",
          progress: next.progress,
          downloadedBytes: next.downloadedBytes ?? 0,
          requiredBytes: next.requiredBytes ?? this.config.requiredBytes,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // A failed checkpoint must not terminate an otherwise usable download.
      }
    } else if (next.status === "ready") {
      try {
        removeDownloadCheckpoint(this.downloadCheckpointPath);
      } catch {
        // A stale checkpoint is ignored when the install receipt is complete.
      }
    }
  }

  private stopInstallerProcess(): void {
    const child = this.activeInstaller;
    if (!child || child.exitCode !== null) return;
    if (process.platform === "win32" && child.pid) {
      const terminator = spawn(
        "taskkill.exe",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true, stdio: "ignore" },
      );
      terminator.unref();
      return;
    }
    child.kill();
  }

  private isInstalled(): boolean {
    return this.isInstalledAt(this.engineDataRoot);
  }

  private isInstalledAt(root: string): boolean {
    if (
      !existsSync(path.join(root, "runtime", "runtime-receipt.json")) ||
      !existsSync(path.join(root, "runtime", "python.exe"))
    ) {
      return false;
    }
    return this.config.assetDirectories.every((relativeDirectory) =>
      existsSync(path.join(root, relativeDirectory, "install-receipt.json")),
    );
  }

  private async runInstall(run: number): Promise<void> {
    let monitor: ReturnType<typeof setInterval> | undefined;
    try {
      await mkdir(this.engineDataRoot, { recursive: true });
      if (run !== this.installRun) return;
      const currentBytes = await directorySize(this.engineDataRoot);
      if (run !== this.installRun) return;
      const disk = await statfs(this.engineDataRoot);
      if (run !== this.installRun) return;
      const freeBytes = disk.bavail * disk.bsize;
      const remainingBytes = Math.max(
        2 * 1024 ** 3,
        this.config.requiredBytes - currentBytes,
      );
      if (freeBytes < remainingBytes + 1024 ** 3) {
        throw new Error("DISK_SPACE_LOW");
      }
      let previousBytes = currentBytes;
      let previousAt = Date.now();
      let measuring = false;
      this.updateSnapshot({
        downloadedBytes: currentBytes,
        requiredBytes: this.config.requiredBytes,
        freeBytes,
        bytesPerSecond: undefined,
        etaSeconds: undefined,
        downloadSource: this.getDownloadSource(),
      });
      monitor = setInterval(() => {
        if (measuring || run !== this.installRun) return;
        measuring = true;
        void directorySize(this.engineDataRoot)
          .then((bytes) => {
            if (run !== this.installRun) return;
            const now = Date.now();
            const elapsed = Math.max(1, (now - previousAt) / 1_000);
            const speed = Math.max(0, (bytes - previousBytes) / elapsed);
            const remaining = Math.max(0, this.config.requiredBytes - bytes);
            this.updateSnapshot({
              downloadedBytes: bytes,
              bytesPerSecond: speed > 0 ? Math.round(speed) : undefined,
              etaSeconds:
                speed > 0
                  ? Math.max(0, Math.round(remaining / speed))
                  : undefined,
            });
            previousBytes = bytes;
            previousAt = now;
          })
          .finally(() => {
            measuring = false;
          });
      }, 3_000);
      const powershell = process.env.SystemRoot
        ? path.join(
            process.env.SystemRoot,
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          )
        : "powershell.exe";
      const runtimeScript = path.join(
        this.commonRoot,
        "runtime",
        "install-runtime.ps1",
      );
      const runtimeArgs = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        runtimeScript,
      ];
      const hardware = await detectHardware();
      if (run !== this.installRun) return;
      if (hardware.computeMode === "cpu" && hardware.systemMemoryGb < 16) {
        throw new Error("SYSTEM_MEMORY_LOW");
      }
      const computeMode =
        hardware.computeMode === "cuda" &&
        (hardware.vramGb ?? 0) >= this.config.minimumCudaVramGb
          ? "cuda"
          : "cpu";
      this.updateSnapshot({
        message:
          computeMode === "cuda"
            ? hardware.summary
            : hardware.computeMode === "cuda"
              ? `检测到 ${hardware.vramGb ?? 0}GB 显存，低于当前模型的稳定运行要求，将使用 CPU。`
              : hardware.summary,
      });
      runtimeArgs.push("-Flavor", this.config.runtimeFlavor);
      runtimeArgs.push("-Compute", computeMode);
      runtimeArgs.push(
        "-RuntimeRoot",
        this.runtimeRoot,
        "-CacheRoot",
        this.cacheRoot,
      );
      if (run !== this.installRun) return;
      await this.runChild(powershell, runtimeArgs, run);
      if (run !== this.installRun) return;

      await mkdir(this.weightsRoot, { recursive: true });
      await this.runChild(
        this.pythonExe,
        [
          path.join(this.commonRoot, "worker", "install_assets.py"),
          "--weights-root",
          this.weightsRoot,
          "--source-root",
          this.sourceRoot,
          "--cache-root",
          this.cacheRoot,
          "--manifest",
          path.join(this.pluginRoot, "model-manifest.json"),
        ],
        run,
        {
          HF_HOME: path.join(this.cacheRoot, "huggingface"),
          HF_HUB_DISABLE_TELEMETRY: "1",
          ...(this.getDownloadSource() === "mirror"
            ? { HF_ENDPOINT: "https://hf-mirror.com" }
            : {}),
        },
      );
      if (run !== this.installRun) return;
      if (!this.isInstalled()) throw new Error("INSTALL_RECEIPT_MISSING");
      this.updateSnapshot({
        status: "ready",
        progress: 100,
        message: `${this.config.name} 已安装，可以克隆声音并生成配音。`,
        canRetry: false,
        errorCode: undefined,
        downloadedBytes: this.config.requiredBytes,
        bytesPerSecond: undefined,
        etaSeconds: 0,
      });
      void this.prepareModel();
    } catch (error) {
      if (run !== this.installRun) return;
      const errorCode =
        error instanceof Error ? error.message.slice(0, 80) : "INSTALL_FAILED";
      this.updateSnapshot({
        status: "download-failed",
        message: errorCode.includes("DISK_SPACE_LOW")
          ? "磁盘空间不足，请清理空间或把模型文件夹迁移后重试。"
          : errorCode.includes("SYSTEM_MEMORY_LOW")
            ? "没有兼容显卡，且系统内存不足 16GB；当前电脑不适合运行这些本地模型。"
            : errorCode.includes("SHA256")
              ? "文件校验失败，没有安装模型。请重试。"
              : "本地引擎没有安装完成，请检查网络和磁盘空间后重试。",
        canRetry: true,
        errorCode,
      });
    } finally {
      if (monitor) clearInterval(monitor);
      if (run === this.installRun) {
        this.activeInstaller = undefined;
        this.activeInstallRun = undefined;
      }
    }
  }

  private async runChild(
    executable: string,
    args: string[],
    run: number,
    extraEnv: NodeJS.ProcessEnv = {},
  ): Promise<void> {
    if (run !== this.installRun) return;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: this.pluginRoot,
        windowsHide: true,
        env: { ...process.env, ...extraEnv, PYTHONUTF8: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.activeInstaller = child;
      child.stderr.resume();
      const lines = readline.createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        if (run !== this.installRun) return;
        try {
          const parsed: unknown = JSON.parse(line);
          if (isProgressEvent(parsed)) {
            this.updateSnapshot({
              status:
                parsed.progress < 44 || parsed.progress >= 90
                  ? "installing"
                  : "downloading",
              progress: Math.max(0, Math.min(99, parsed.progress)),
              message:
                runtimeProgressMessages[parsed.message] ??
                parsed.message.slice(0, 180),
            });
          }
        } catch {
          // Package manager output is discarded to avoid leaking local paths.
        }
      });
      child.once("error", reject);
      child.once("exit", (code) => {
        lines.close();
        if (run !== this.installRun || code === 0) resolve();
        else reject(new Error(`INSTALL_PROCESS_${code ?? "STOPPED"}`));
      });
    });
  }

  private async prepareModel(): Promise<void> {
    if (!this.isInstalled()) {
      this.install();
      return;
    }
    this.updateSnapshot({
      status: "loading",
      progress: 10,
      message: this.config.loadingMessage,
      canRetry: false,
      result: undefined,
    });
    try {
      const worker = await this.ensureWorker();
      const result = await this.workerRequest(
        worker,
        "/load",
        {},
        60 * 60 * 1_000,
      );
      if (!result.ok) throw new Error(result.code ?? "WORKER_LOAD_FAILED");
      this.updateSnapshot({
        status: "ready",
        progress: 100,
        message: `${this.config.name} 已加载，可以开始配音。`,
        canRetry: false,
      });
    } catch (error) {
      await this.releaseWorker();
      const code = error instanceof Error ? error.message : undefined;
      this.updateSnapshot({
        status: "generation-failed",
        progress: 0,
        message: friendlyGenerationError(code),
        canRetry: true,
        errorCode: code?.slice(0, 80) ?? "LOAD_FAILED",
      });
    }
  }

  private async generateSingle(request: GenerationRequest): Promise<void> {
    const errors = validateGenerationRequest(request);
    if (errors.length > 0) {
      this.updateSnapshot({
        status: "generation-failed",
        message: errors[0],
        canRetry: true,
        errorCode: "INVALID_GENERATION_REQUEST",
      });
      return;
    }
    if (!this.isInstalled()) {
      this.install();
      return;
    }
    const jobId = request.requestId;
    this.generationAbort = new AbortController();
    try {
      this.updateSnapshot({
        status: "loading",
        progress: 5,
        message: this.config.loadingMessage,
        jobId,
        result: undefined,
        canRetry: false,
        errorCode: undefined,
      });
      const worker = await this.ensureWorker();
      const loaded = await this.workerRequest(
        worker,
        "/load",
        {},
        60 * 60 * 1_000,
      );
      if (!loaded.ok) throw new Error(loaded.code ?? "WORKER_LOAD_FAILED");
      const voice = await this.voiceStore.getGenerationSource(request.voiceId);
      this.updateSnapshot({
        status: "generating",
        progress: 35,
        message: `正在用 ${this.config.name} 生成配音，请稍候…`,
      });
      const generated = await this.generateWithWorker(
        worker,
        jobId,
        request,
        voice,
      );
      const result: AudioResult = {
        id: jobId,
        url: `shengzuo-audio://result/${encodeURIComponent(jobId)}`,
        durationSeconds: generated.durationSeconds,
        format: "mp3",
        createdAt: new Date().toISOString(),
        modelId: this.config.modelId,
        title: "单段配音",
        kind: "single",
      };
      await this.recordResult(result);
      this.updateSnapshot({
        status: "success",
        progress: 100,
        message: "配音已生成，可以试听或导出 MP3。",
        jobId,
        result,
        canRetry: false,
      });
    } catch (error) {
      this.handleGenerationFailure(error);
    } finally {
      this.generationAbort = undefined;
    }
  }

  private async generateMany(request: BatchGenerationRequest): Promise<void> {
    if (!this.isInstalled()) {
      this.install();
      return;
    }
    const jobId = request.requestId;
    const segmentIds: string[] = [];
    const cacheKey = request.projectId ?? jobId;
    const cachePrefix = `batch-${batchFingerprint(cacheKey).slice(0, 20)}`;
    const cache = await this.readBatchCache(cacheKey);
    let completedSegments = 0;
    this.generationAbort = new AbortController();
    try {
      this.updateSnapshot({
        status: "loading",
        progress: 4,
        message: this.config.loadingMessage,
        jobId,
        result: undefined,
        canRetry: false,
        errorCode: undefined,
      });
      const worker = await this.ensureWorker();
      const loaded = await this.workerRequest(
        worker,
        "/load",
        {},
        60 * 60 * 1_000,
      );
      if (!loaded.ok) throw new Error(loaded.code ?? "WORKER_LOAD_FAILED");
      let durationSeconds = 0;
      for (const [index, segment] of request.segments.entries()) {
        const cacheId = segment.id;
        const segmentId = `${cachePrefix}-part-${batchFingerprint(segment.id).slice(0, 16)}`;
        segmentIds.push(segmentId);
        const fingerprint = batchFingerprint({
          modelId: request.modelId,
          voiceId: segment.voiceId,
          text: segment.text,
          label: segment.label ?? "自然、清晰",
          language: request.language,
          emotion: request.emotion,
          speed: request.speed,
          volume: request.volume,
        });
        const cached = cache.segments[cacheId];
        if (
          cached?.fingerprint === fingerprint &&
          cached.fileId === segmentId &&
          existsSync(path.join(this.outputRoot, `${segmentId}.mp3`))
        ) {
          durationSeconds += cached.durationSeconds;
          completedSegments += 1;
          this.updateSnapshot({
            status: "generating",
            progress:
              15 +
              Math.round((completedSegments / request.segments.length) * 70),
            message: `已复用第 ${index + 1} / ${request.segments.length} 句缓存…`,
          });
          continue;
        }
        await rm(path.join(this.outputRoot, `${segmentId}.mp3`), {
          force: true,
        });
        const voice = await this.voiceStore.getGenerationSource(
          segment.voiceId,
        );
        this.updateSnapshot({
          status: "generating",
          progress: 15 + Math.round((index / request.segments.length) * 70),
          message: `正在生成第 ${index + 1} / ${request.segments.length} 句…`,
        });
        const generated = await this.generateWithWorker(
          worker,
          segmentId,
          {
            requestId: segmentId,
            modelId: request.modelId,
            voiceId: segment.voiceId,
            text: segment.text,
            expression: segment.label ?? "自然、清晰",
            language: request.language,
            emotion: request.emotion,
            speed: request.speed,
            volume: request.volume,
            format: request.format,
          },
          voice,
        );
        durationSeconds += generated.durationSeconds;
        completedSegments += 1;
        cache.segments[cacheId] = {
          fingerprint,
          durationSeconds: generated.durationSeconds,
          fileId: segmentId,
        };
        await this.writeBatchCache(cache);
      }
      this.updateSnapshot({
        status: "generating",
        progress: 90,
        message: "正在合并并整理完整 MP3…",
      });
      await this.mergeSegments(segmentIds, jobId, request.pauseMs);
      durationSeconds +=
        ((request.segments.length - 1) * request.pauseMs) / 1_000;
      const result: AudioResult = {
        id: jobId,
        url: `shengzuo-audio://result/${encodeURIComponent(jobId)}`,
        durationSeconds: Math.round(durationSeconds * 1_000) / 1_000,
        format: "mp3",
        createdAt: new Date().toISOString(),
        modelId: request.modelId,
        title: request.title,
        kind: request.kind,
      };
      await this.recordResult(result);
      if (!request.projectId) {
        await Promise.all(
          segmentIds.map((segmentId) =>
            rm(path.join(this.outputRoot, `${segmentId}.mp3`), { force: true }),
          ),
        );
        await rm(this.batchCachePath(cacheKey), { force: true });
      }
      this.updateSnapshot({
        status: "success",
        progress: 100,
        message: "完整 MP3 已生成，可以试听或导出。",
        jobId,
        result,
        canRetry: false,
      });
    } catch (error) {
      this.handleGenerationFailure(
        error,
        completedSegments > 0
          ? `已保存 ${completedSegments} / ${request.segments.length} 句；重试时会从未完成处继续。`
          : undefined,
      );
    } finally {
      this.generationAbort = undefined;
    }
  }

  private async generateWithWorker(
    worker: WorkerConnection,
    jobId: string,
    request: GenerationRequest,
    voice: { audioPath: string; referenceText: string },
  ): Promise<{ durationSeconds: number }> {
    const generated = await this.workerRequest(
      worker,
      "/generate",
      {
        jobId,
        text: request.text,
        expression: request.expression,
        emotion: request.emotion,
        language: request.language,
        speed: request.speed,
        volume: request.volume,
        referenceAudio: voice.audioPath,
        referenceText: voice.referenceText,
      },
      2 * 60 * 60 * 1_000,
      this.generationAbort?.signal,
    );
    if (
      !generated.ok ||
      generated.fileName !== `${jobId}.mp3` ||
      typeof generated.durationSeconds !== "number"
    ) {
      throw new Error(generated.code ?? "INVALID_WORKER_RESULT");
    }
    return { durationSeconds: generated.durationSeconds };
  }

  private handleGenerationFailure(error: unknown, detail?: string): void {
    if (this.snapshot.status === "stopped") return;
    const code =
      error instanceof Error ? error.message.slice(0, 80) : undefined;
    this.updateSnapshot({
      status: "generation-failed",
      progress: 0,
      message: detail ?? friendlyGenerationError(code),
      canRetry: true,
      errorCode: code ?? "GENERATION_FAILED",
    });
  }

  private async recordResult(result: AudioResult): Promise<void> {
    await this.writeResultMetadata(result);
  }

  private async writeResultMetadata(result: AudioResult): Promise<void> {
    await mkdir(this.outputRoot, { recursive: true });
    const target = path.join(this.outputRoot, `${result.id}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(result, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    try {
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private batchCachePath(projectId: string): string {
    return path.join(
      this.outputRoot,
      `batch-cache-${batchFingerprint(projectId).slice(0, 24)}.json`,
    );
  }

  private async readBatchCache(projectId: string): Promise<BatchCacheManifest> {
    const filePath = this.batchCachePath(projectId);
    try {
      const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
      if (
        typeof value === "object" &&
        value !== null &&
        "projectId" in value &&
        value.projectId === projectId &&
        "segments" in value &&
        typeof value.segments === "object" &&
        value.segments !== null
      ) {
        return value as BatchCacheManifest;
      }
    } catch {
      // A missing or invalid cache starts clean; generated result files are untouched.
    }
    return { projectId, segments: {} };
  }

  private async writeBatchCache(cache: BatchCacheManifest): Promise<void> {
    await mkdir(this.outputRoot, { recursive: true });
    const target = this.batchCachePath(cache.projectId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(cache, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    try {
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async mergeSegments(
    segmentIds: string[],
    resultId: string,
    pauseMs: number,
  ): Promise<void> {
    const requestPath = path.join(this.outputRoot, `${resultId}.merge.json`);
    const value = {
      outputRoot: this.outputRoot,
      inputs: segmentIds.map((id) => path.join(this.outputRoot, `${id}.mp3`)),
      output: path.join(this.outputRoot, `${resultId}.mp3`),
      pauseMs,
    };
    await writeFile(requestPath, JSON.stringify(value), "utf8");
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          this.pythonExe,
          [
            path.join(this.commonRoot, "worker", "merge_audio.py"),
            "--request",
            requestPath,
          ],
          {
            windowsHide: true,
            cwd: this.pluginRoot,
            env: { ...process.env, PYTHONUTF8: "1" },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        child.stdout.resume();
        child.stderr.resume();
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`AUDIO_MERGE_${code ?? "STOPPED"}`));
        });
      });
    } finally {
      await rm(requestPath, { force: true });
    }
  }

  private async ensureWorker(): Promise<WorkerConnection> {
    if (this.worker && this.worker.process.exitCode === null)
      return this.worker;
    await this.activate(this.config.modelId);
    await mkdir(this.outputRoot, { recursive: true });
    const port = await getFreeLoopbackPort();
    const bootToken = `t_${randomBytes(32).toString("base64url")}`;
    const hardware = await detectHardware();
    if (hardware.computeMode === "cpu" && hardware.systemMemoryGb < 16) {
      throw new Error("SYSTEM_MEMORY_LOW");
    }
    const forceCpu =
      hardware.computeMode === "cpu" ||
      (hardware.vramGb ?? 0) < this.config.minimumCudaVramGb;
    const workerArgs = [
      path.join(this.pluginRoot, "worker", "server.py"),
      "--port",
      String(port),
      "--boot-token",
      bootToken,
    ];
    if (this.config.workerWeightsDirectory) {
      workerArgs.push(
        "--weights",
        path.join(this.weightsRoot, this.config.workerWeightsDirectory),
      );
    } else {
      workerArgs.push(
        "--weights-root",
        this.weightsRoot,
        "--source-root",
        this.sourceRoot,
      );
    }
    workerArgs.push(
      "--voice-root",
      path.join(app.getPath("userData"), "voices"),
      "--output-root",
      this.outputRoot,
    );
    const child = spawn(this.pythonExe, workerArgs, {
      cwd: this.pluginRoot,
      windowsHide: true,
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        HF_HUB_DISABLE_TELEMETRY: "1",
        ...(forceCpu ? { SHENGZUO_FORCE_CPU: "1" } : {}),
        PYTHONUTF8: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.resume();
    child.stderr.resume();
    let exited = false;
    child.once("exit", () => {
      exited = true;
      if (this.worker?.process === child) this.worker = undefined;
    });

    let handshake: WorkerResult | undefined;
    for (let attempt = 0; attempt < 120 && !exited; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/handshake`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bootToken}`,
            "Content-Type": "application/json",
          },
          body: "{}",
          signal: AbortSignal.timeout(1_000),
        });
        if (response.ok) {
          handshake = (await response.json()) as WorkerResult;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (
      !handshake?.ok ||
      typeof handshake.sessionToken !== "string" ||
      handshake.protocolVersion !== "1.0"
    ) {
      child.kill();
      throw new Error("WORKER_HANDSHAKE_FAILED");
    }
    this.worker = {
      process: child,
      port,
      sessionToken: handshake.sessionToken,
    };
    return this.worker;
  }

  private async workerRequest(
    worker: WorkerConnection,
    route: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
    parentSignal?: AbortSignal,
  ): Promise<WorkerResult> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, timeout])
      : timeout;
    const response = await fetch(`http://127.0.0.1:${worker.port}${route}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${worker.sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || !("ok" in value)) {
      throw new Error("INVALID_WORKER_RESPONSE");
    }
    return value as WorkerResult;
  }
}

export class LocalVoiceEngine {
  private readonly listeners = new Set<SnapshotListener>();
  private readonly taskListeners = new Set<TaskListener>();
  private readonly engines = new Map<ModelId, ModelEngine>();
  private readonly taskStore: TaskStore;
  private readonly preferencesPath: string;
  private readonly voiceStore: VoiceStore;
  private tasks: StoredGenerationTask[] = [];
  private tasksLoaded = false;
  private taskSaveChain: Promise<void> = Promise.resolve();
  private processingQueue = false;
  private currentTaskId: string | undefined;
  private downloadSource: DownloadSource = "official";
  private currentModelId: ModelId = "voxcpm2";
  private activeModelId: ModelId | undefined;
  private modelLibraryRoot: string;
  private libraryChanging = false;
  private disposed = false;

  constructor(voiceStore: VoiceStore) {
    this.voiceStore = voiceStore;
    this.modelLibraryRoot = prepareModelLibrary();
    const workspaceRoot = path.join(app.getPath("userData"), "workspace");
    this.taskStore = new TaskStore(workspaceRoot);
    this.preferencesPath = path.join(workspaceRoot, "preferences.json");
    try {
      const preferences: unknown = JSON.parse(
        readFileSync(this.preferencesPath, "utf8"),
      );
      if (
        typeof preferences === "object" &&
        preferences !== null &&
        "downloadSource" in preferences &&
        (preferences.downloadSource === "official" ||
          preferences.downloadSource === "mirror")
      ) {
        this.downloadSource = preferences.downloadSource;
      }
    } catch {
      this.downloadSource = "official";
    }
    this.createEngines(this.modelLibraryRoot);
  }

  getSnapshot(modelId: ModelId = this.currentModelId): EngineSnapshot {
    return this.requireEngine(modelId).getSnapshot();
  }

  listSnapshots(): EngineSnapshot[] {
    return pluginConfigs.map((config) =>
      this.requireEngine(config.modelId).refreshInstallationState(),
    );
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    for (const snapshot of this.listSnapshots()) listener(snapshot);
    return () => this.listeners.delete(listener);
  }

  subscribeTasks(listener: TaskListener): () => void {
    this.taskListeners.add(listener);
    return () => this.taskListeners.delete(listener);
  }

  async listTasks(): Promise<GenerationTask[]> {
    await this.ensureTasksLoaded();
    void this.processTasks();
    return this.tasks.map((task) => this.publicTask(task));
  }

  async enqueueTask(request: EnqueueTaskRequest): Promise<GenerationTask> {
    await this.ensureTasksLoaded();
    const id = `task-${randomUUID()}`;
    const now = new Date().toISOString();
    const command: EnqueueTaskRequest =
      request.type === "generate"
        ? {
            ...request,
            request: { ...request.request, requestId: id },
          }
        : {
            ...request,
            request: {
              ...request.request,
              requestId: id,
              projectId: request.projectId ?? request.request.projectId,
            },
          };
    const totalSegments =
      command.type === "generate-batch" ? command.request.segments.length : 1;
    const task: StoredGenerationTask = {
      id,
      title:
        command.type === "generate-batch" ? command.request.title : "单段配音",
      kind: command.type === "generate-batch" ? command.request.kind : "single",
      modelId: command.request.modelId,
      status: "queued",
      progress: 0,
      message: `已加入队列，前面还有 ${this.tasks.filter((item) => item.status === "queued" || item.status === "running").length} 个任务。`,
      currentSegment: 0,
      totalSegments,
      projectId: request.projectId,
      createdAt: now,
      updatedAt: now,
      command,
    };
    this.tasks.unshift(task);
    await this.saveTasks();
    this.emitTask(task);
    void this.processTasks();
    return this.publicTask(task);
  }

  async retryTask(taskId: string): Promise<GenerationTask> {
    await this.ensureTasksLoaded();
    const task = this.requireTask(taskId);
    if (task.status === "running" || task.status === "queued")
      return this.publicTask(task);
    Object.assign(task, {
      status: "queued" as const,
      progress: task.currentSegment > 0 ? task.progress : 0,
      message: "已重新加入队列；完成的字幕片段会直接复用。",
      resultId: undefined,
      updatedAt: new Date().toISOString(),
    });
    await this.saveTasks();
    this.emitTask(task);
    void this.processTasks();
    return this.publicTask(task);
  }

  async cancelTask(taskId: string): Promise<GenerationTask> {
    await this.ensureTasksLoaded();
    const task = this.requireTask(taskId);
    if (task.status === "queued") {
      Object.assign(task, {
        status: "canceled" as const,
        message: "任务已取消，项目稿件仍然保留。",
        updatedAt: new Date().toISOString(),
      });
      await this.saveTasks();
      this.emitTask(task);
    } else if (task.status === "running") {
      await this.requireEngine(task.modelId).cancel(task.id);
    }
    return this.publicTask(task);
  }

  getDownloadSource(): DownloadSource {
    return this.downloadSource;
  }

  async setDownloadSource(source: DownloadSource): Promise<DownloadSource> {
    this.downloadSource = source;
    await mkdir(path.dirname(this.preferencesPath), { recursive: true });
    const temporary = `${this.preferencesPath}.${randomUUID()}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify({ downloadSource: source }, null, 2),
      "utf8",
    );
    try {
      await rename(temporary, this.preferencesPath);
    } finally {
      await rm(temporary, { force: true });
    }
    return source;
  }

  getStorageInfo(modelId: ModelId): Promise<ModelStorageInfo> {
    return this.requireEngine(modelId).getStorageInfo();
  }

  importOffline(modelId: ModelId, sourceDirectory: string): Promise<void> {
    return this.requireEngine(modelId).importOffline(sourceDirectory);
  }

  async relocateModelLibrary(
    destination: string,
  ): Promise<ModelLibraryMoveResult> {
    if (this.libraryChanging) throw new Error("模型文件正在迁移。");
    if (this.processingQueue || this.currentTaskId) {
      throw new Error("请等待当前配音完成，再迁移模型。");
    }
    this.libraryChanging = true;
    const source = this.modelLibraryRoot;
    await Promise.all(
      [...this.engines.values()].map((engine) => engine.dispose()),
    );
    try {
      const result = await moveModelLibrary(source, destination);
      this.recreateEngines(result.path);
      return result;
    } catch (error) {
      this.recreateEngines(source);
      throw error;
    } finally {
      this.libraryChanging = false;
    }
  }

  async command(command: EngineCommand): Promise<EngineSnapshot> {
    if (this.disposed) throw new Error("本地引擎已关闭。");
    if (this.libraryChanging) throw new Error("模型文件正在迁移，请稍候。");
    if (command.type === "set-mock-state") {
      throw new Error("正式引擎不接受测试状态命令。");
    }
    if (command.type === "cancel") {
      for (const engine of this.engines.values())
        await engine.cancel(command.jobId);
      return this.getSnapshot();
    }
    if (command.type === "generate" || command.type === "generate-batch") {
      await this.enqueueTask(command);
      return this.getSnapshot(command.request.modelId);
    }
    const modelId = command.modelId;
    this.currentModelId = modelId;
    const engine = this.requireEngine(modelId);
    switch (command.type) {
      case "install":
      case "resume-download":
      case "retry":
        for (const [otherId, other] of this.engines) {
          if (otherId !== modelId && other.isInstalling()) other.pauseInstall();
        }
        engine.install();
        break;
      case "pause-download":
        engine.pauseInstall();
        break;
      case "prepare":
        engine.prepare();
        break;
    }
    return engine.getSnapshot();
  }

  getResultPath(resultId: string): string | undefined {
    for (const engine of this.engines.values()) {
      const result = engine.getResultPath(resultId);
      if (result) return result;
    }
    return undefined;
  }

  async listResults(): Promise<AudioResult[]> {
    const groups = await Promise.all(
      [...this.engines.values()].map((engine) => engine.listResults()),
    );
    return groups
      .flat()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async setResultFavorite(
    resultId: string,
    favorite: boolean,
  ): Promise<AudioResult> {
    for (const engine of this.engines.values()) {
      const result = await engine.setResultFavorite(resultId, favorite);
      if (result) return result;
    }
    throw new Error("这条生成记录已经不存在。");
  }

  async removeResult(resultId: string): Promise<boolean> {
    for (const engine of this.engines.values()) {
      if (await engine.removeResult(resultId)) return true;
    }
    return false;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all(
      [...this.engines.values()].map((engine) => engine.dispose()),
    );
    this.listeners.clear();
    this.taskListeners.clear();
  }

  private requireEngine(modelId: ModelId): ModelEngine {
    const engine = this.engines.get(modelId);
    if (!engine) throw new Error("模型编号无效。");
    return engine;
  }

  private createEngines(modelLibraryRoot: string): void {
    for (const config of pluginConfigs) {
      this.engines.set(
        config.modelId,
        new ModelEngine(
          config,
          this.voiceStore,
          (snapshot) => this.emit(snapshot),
          (modelId) => this.activate(modelId),
          () => this.downloadSource,
          modelLibraryRoot,
        ),
      );
    }
  }

  private recreateEngines(modelLibraryRoot: string): void {
    this.engines.clear();
    this.activeModelId = undefined;
    this.modelLibraryRoot = modelLibraryRoot;
    this.createEngines(modelLibraryRoot);
    for (const snapshot of this.listSnapshots()) this.emit(snapshot);
  }

  private requireTask(taskId: string): StoredGenerationTask {
    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("任务已经不存在。");
    return task;
  }

  private publicTask(task: StoredGenerationTask): GenerationTask {
    const value = structuredClone(task);
    Reflect.deleteProperty(value, "command");
    return value;
  }

  private async ensureTasksLoaded(): Promise<void> {
    if (this.tasksLoaded) return;
    this.tasks = await this.taskStore.load();
    this.tasksLoaded = true;
    await this.saveTasks();
  }

  private async saveTasks(): Promise<void> {
    if (!this.tasksLoaded) return;
    const tasks = structuredClone(this.tasks);
    this.taskSaveChain = this.taskSaveChain
      .catch(() => undefined)
      .then(() => this.taskStore.save(tasks));
    await this.taskSaveChain;
  }

  private emitTask(task: StoredGenerationTask): void {
    const value = this.publicTask(task);
    for (const listener of this.taskListeners) listener(value);
  }

  private async processTasks(): Promise<void> {
    if (this.processingQueue || this.disposed) return;
    this.processingQueue = true;
    try {
      await this.ensureTasksLoaded();
      while (!this.disposed) {
        const task = [...this.tasks]
          .reverse()
          .find((item) => item.status === "queued");
        if (!task) break;
        this.currentTaskId = task.id;
        Object.assign(task, {
          status: "running" as const,
          message: "正在准备本地模型…",
          updatedAt: new Date().toISOString(),
        });
        await this.saveTasks();
        this.emitTask(task);
        this.currentModelId = task.modelId;
        const model = this.requireEngine(task.modelId);
        if (task.command.type === "generate") {
          await model.generate(task.command.request);
        } else {
          await model.generateBatch(task.command.request);
        }
        const snapshot = model.getSnapshot();
        if (snapshot.status === "success" && snapshot.result) {
          Object.assign(task, {
            status: "completed" as const,
            progress: 100,
            currentSegment: task.totalSegments,
            message: "生成完成，可以到生成记录试听或导出。",
            resultId: snapshot.result.id,
            updatedAt: new Date().toISOString(),
          });
        } else if (snapshot.status === "stopped") {
          Object.assign(task, {
            status: "canceled" as const,
            message: "任务已取消；已完成片段和项目稿件仍然保留。",
            updatedAt: new Date().toISOString(),
          });
        } else {
          Object.assign(task, {
            status: "failed" as const,
            message: snapshot.message,
            updatedAt: new Date().toISOString(),
          });
        }
        await this.saveTasks();
        this.emitTask(task);
        this.currentTaskId = undefined;
      }
    } finally {
      this.currentTaskId = undefined;
      this.processingQueue = false;
    }
  }

  private emit(snapshot: EngineSnapshot): void {
    const copy = structuredClone(snapshot);
    for (const listener of this.listeners) listener(copy);
    if (this.currentTaskId && snapshot.jobId === this.currentTaskId) {
      const task = this.tasks.find((item) => item.id === this.currentTaskId);
      if (task?.status === "running") {
        const segment = /第\s*(\d+)\s*\/\s*(\d+)\s*句/u.exec(snapshot.message);
        task.progress = snapshot.progress;
        task.message = snapshot.message;
        task.currentSegment = segment
          ? Number(segment[1])
          : task.currentSegment;
        task.updatedAt = new Date().toISOString();
        void this.saveTasks();
        this.emitTask(task);
      }
    }
  }

  private async activate(modelId: ModelId): Promise<void> {
    if (this.activeModelId === modelId) return;
    if (this.activeModelId) {
      await this.requireEngine(this.activeModelId).releaseWorker();
    }
    this.activeModelId = modelId;
  }
}

export const availableModelIds = MODEL_CATALOG.map((model) => model.id);
