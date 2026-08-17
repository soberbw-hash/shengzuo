import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  isEnqueueTaskRequest,
  isVoiceId,
  type EnqueueTaskRequest,
  type GenerationTask,
} from "@ai-voice-studio/shared-types";

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
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!Array.isArray(value)) return [];
      return value.filter(isStoredTask).map((task) =>
        task.status === "running"
          ? {
              ...task,
              status: "queued",
              message: "上次运行中断，已恢复到队列。",
              updatedAt: new Date().toISOString(),
            }
          : task,
      );
    } catch {
      return [];
    }
  }

  async save(tasks: StoredGenerationTask[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(tasks.slice(0, 100), null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    try {
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
