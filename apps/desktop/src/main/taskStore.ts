import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  isEnqueueTaskRequest,
  isVoiceId,
  isModelId,
  type EnqueueTaskRequest,
  type GenerationTask,
} from "@ai-voice-studio/shared-types";
import { readResilientJson, writeResilientJson } from "./resilientJsonStore";

export interface StoredGenerationTask extends GenerationTask {
  command: EnqueueTaskRequest;
}

const isStoredTask = (value: unknown): value is StoredGenerationTask => {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Partial<StoredGenerationTask>;
  return (
    isVoiceId(task.id) &&
    typeof task.title === "string" &&
    ["single", "subtitles", "dialogue"].includes(task.kind ?? "") &&
    isModelId(task.modelId) &&
    ["queued", "running", "completed", "failed", "canceled"].includes(
      task.status ?? "",
    ) &&
    typeof task.progress === "number" &&
    Number.isFinite(task.progress) &&
    typeof task.message === "string" &&
    typeof task.currentSegment === "number" &&
    Number.isInteger(task.currentSegment) &&
    task.currentSegment >= 0 &&
    typeof task.totalSegments === "number" &&
    Number.isInteger(task.totalSegments) &&
    task.totalSegments >= 1 &&
    typeof task.createdAt === "string" &&
    typeof task.updatedAt === "string" &&
    (task.errorCode === undefined || typeof task.errorCode === "string") &&
    (task.preview === undefined || typeof task.preview === "boolean") &&
    isEnqueueTaskRequest(task.command)
  );
};

export class TaskStore {
  private readonly filePath: string;

  constructor(root: string) {
    this.filePath = path.join(root, "generation-tasks.json");
  }

  async load(): Promise<StoredGenerationTask[]> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const value = await readResilientJson(
      this.filePath,
      (candidate): candidate is StoredGenerationTask[] =>
        Array.isArray(candidate) && candidate.every(isStoredTask),
    );
    return (value ?? []).map((task) =>
      task.status === "running"
        ? {
            ...task,
            status: "queued",
            message: "上次生成被中断，已经重新排队。",
            updatedAt: new Date().toISOString(),
          }
        : task,
    );
  }

  async save(tasks: StoredGenerationTask[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeResilientJson(this.filePath, tasks);
  }
}
