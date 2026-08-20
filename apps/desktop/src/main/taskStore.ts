import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  isEnqueueTaskRequest,
  isVoiceId,
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
    typeof task.kind === "string" &&
    typeof task.modelId === "string" &&
    typeof task.status === "string" &&
    typeof task.progress === "number" &&
    typeof task.message === "string" &&
    typeof task.currentSegment === "number" &&
    typeof task.totalSegments === "number" &&
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
    await writeResilientJson(this.filePath, tasks.slice(0, 100));
  }
}
