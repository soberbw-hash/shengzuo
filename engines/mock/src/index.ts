import {
  canTransition,
  validateGenerationRequest,
} from "@ai-voice-studio/engine-sdk";
import {
  ENGINE_STATUS_COPY,
  type AudioResult,
  type EngineCommand,
  type EngineSnapshot,
  type EngineStatus,
  type ModelId,
} from "@ai-voice-studio/shared-types";

type SnapshotListener = (snapshot: EngineSnapshot) => void;

const initialSnapshot = (): EngineSnapshot => ({
  status: "not-installed",
  modelId: "voxcpm2",
  progress: 0,
  message: ENGINE_STATUS_COPY["not-installed"].message,
  canRetry: false,
});

const createJobId = (): string =>
  `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class MockEngine {
  private snapshot: EngineSnapshot = initialSnapshot();
  private listeners = new Set<SnapshotListener>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private installStep: "download" | "install" | "load" = "download";

  getSnapshot(): EngineSnapshot {
    return structuredClone(this.snapshot);
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  command(command: EngineCommand): EngineSnapshot {
    switch (command.type) {
      case "install":
        this.startInstall(command.modelId, 2);
        break;
      case "pause-download":
        this.ensureModel(command.modelId);
        this.clearTimer();
        this.transition("download-paused", this.snapshot.progress);
        break;
      case "resume-download":
        this.ensureModel(command.modelId);
        this.startInstall(command.modelId, Math.max(2, this.snapshot.progress));
        break;
      case "retry":
        this.ensureModel(command.modelId);
        if (this.snapshot.status === "download-failed") {
          this.startInstall(
            command.modelId,
            Math.max(2, this.snapshot.progress),
          );
        } else {
          this.transition("ready", 100, true);
        }
        break;
      case "prepare":
        this.ensureModel(command.modelId);
        this.clearTimer();
        this.transition("loading", 72, true);
        this.startProgressTimer(12);
        break;
      case "generate":
        this.startGeneration(command.request);
        break;
      case "cancel":
        if (
          this.snapshot.jobId === command.jobId &&
          this.snapshot.status === "generating"
        ) {
          this.clearTimer();
          this.transition("stopped", this.snapshot.progress);
        }
        break;
      case "set-mock-state":
        this.setMockState(command.status, command.modelId);
        break;
    }
    return this.getSnapshot();
  }

  dispose(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  private startInstall(modelId: ModelId, progress: number): void {
    this.clearTimer();
    this.installStep = "download";
    this.snapshot = { ...this.snapshot, modelId };
    this.transition("downloading", progress, true);
    this.startProgressTimer(8);
  }

  private startGeneration(
    request: Extract<EngineCommand, { type: "generate" }>["request"],
  ): void {
    const errors = validateGenerationRequest(request);
    if (errors.length > 0) {
      this.clearTimer();
      this.snapshot = {
        ...this.snapshot,
        status: "generation-failed",
        modelId: request.modelId,
        progress: 0,
        message: errors[0] ?? ENGINE_STATUS_COPY["generation-failed"].message,
        errorCode: "INVALID_GENERATION_REQUEST",
        canRetry: true,
        result: undefined,
      };
      this.emit();
      return;
    }

    this.clearTimer();
    this.snapshot = {
      status: "generating",
      modelId: request.modelId,
      progress: 3,
      message: "正在分析文字与表达要求…",
      jobId: createJobId(),
      canRetry: false,
    };
    this.emit();
    this.startProgressTimer(7, request.format, {
      title: request.title,
      kind: "single",
      preview: request.preview,
    });
  }

  private startProgressTimer(
    step: number,
    format: "mp3" = "mp3",
    resultDetails: Pick<AudioResult, "title" | "kind" | "preview"> = {},
  ): void {
    this.clearTimer();
    this.timer = setInterval(() => {
      const next = Math.min(100, this.snapshot.progress + step);

      if (this.snapshot.status === "downloading") {
        if (next >= 100) {
          this.installStep = "install";
          this.transition("installing", 6, true);
          return;
        }
        this.updateProgress(next, `正在下载 Mock 运行文件… ${next}%`);
        return;
      }

      if (
        this.snapshot.status === "installing" &&
        this.installStep === "install"
      ) {
        if (next >= 100) {
          this.installStep = "load";
          this.transition("loading", 14, true);
          return;
        }
        this.updateProgress(next, `正在校验并安装… ${next}%`);
        return;
      }

      if (this.snapshot.status === "loading") {
        if (next >= 100) {
          this.clearTimer();
          this.transition("ready", 100, true);
          return;
        }
        this.updateProgress(next, "正在准备 Mock Engine…");
        return;
      }

      if (this.snapshot.status === "generating") {
        if (next >= 100) {
          this.clearTimer();
          this.snapshot = {
            ...this.snapshot,
            status: "success",
            progress: 100,
            message: ENGINE_STATUS_COPY.success.message,
            canRetry: false,
            result: {
              id: `result-${Date.now().toString(36)}`,
              url: "./mock-audio/preview.mp3",
              durationSeconds: 2,
              format,
              createdAt: new Date().toISOString(),
              ...resultDetails,
            },
          };
          this.emit();
          return;
        }
        const message =
          next < 34
            ? "正在理解文字节奏…"
            : next < 72
              ? "正在合成 Mock 音频…"
              : "正在整理并检查音频…";
        this.updateProgress(next, message);
      }
    }, 160);
  }

  private setMockState(status: EngineStatus, modelId?: ModelId): void {
    this.clearTimer();
    const progressByStatus: Record<EngineStatus, number> = {
      "not-installed": 0,
      downloading: 42,
      "download-paused": 42,
      "download-failed": 38,
      installing: 68,
      loading: 82,
      ready: 100,
      generating: 56,
      success: 100,
      "generation-failed": 64,
      stopped: 47,
    };
    this.snapshot = {
      status,
      modelId: modelId ?? this.snapshot.modelId,
      progress: progressByStatus[status],
      message: ENGINE_STATUS_COPY[status].message,
      canRetry: status === "download-failed" || status === "generation-failed",
      jobId: status === "generating" ? createJobId() : undefined,
      result:
        status === "success"
          ? {
              id: `result-${Date.now().toString(36)}`,
              url: "./mock-audio/preview.mp3",
              durationSeconds: 2,
              format: "mp3",
              createdAt: new Date().toISOString(),
            }
          : undefined,
      errorCode:
        status === "download-failed"
          ? "MOCK_DOWNLOAD_INTERRUPTED"
          : status === "generation-failed"
            ? "MOCK_GENERATION_FAILED"
            : undefined,
    };
    this.emit();
  }

  private transition(
    status: EngineStatus,
    progress: number,
    allowForced = false,
  ): void {
    if (!allowForced && !canTransition(this.snapshot.status, status)) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      status,
      progress,
      message: ENGINE_STATUS_COPY[status].message,
      canRetry: status === "download-failed" || status === "generation-failed",
      errorCode: undefined,
      result: status === "success" ? this.snapshot.result : undefined,
    };
    this.emit();
  }

  private updateProgress(progress: number, message: string): void {
    this.snapshot = { ...this.snapshot, progress, message };
    this.emit();
  }

  private ensureModel(modelId: ModelId): void {
    if (this.snapshot.modelId !== modelId) {
      this.snapshot = { ...this.snapshot, modelId };
    }
  }

  private emit(): void {
    const next = this.getSnapshot();
    for (const listener of this.listeners) listener(next);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
