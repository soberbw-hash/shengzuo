import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { ModelId } from "@ai-voice-studio/shared-types";

export interface DownloadCheckpoint {
  modelId: ModelId;
  state: "active" | "paused" | "failed";
  progress: number;
  downloadedBytes: number;
  requiredBytes: number;
  updatedAt: string;
}

const isDownloadCheckpoint = (value: unknown): value is DownloadCheckpoint =>
  typeof value === "object" &&
  value !== null &&
  "modelId" in value &&
  typeof value.modelId === "string" &&
  "state" in value &&
  (value.state === "active" ||
    value.state === "paused" ||
    value.state === "failed") &&
  "progress" in value &&
  typeof value.progress === "number" &&
  "downloadedBytes" in value &&
  typeof value.downloadedBytes === "number" &&
  "requiredBytes" in value &&
  typeof value.requiredBytes === "number" &&
  "updatedAt" in value &&
  typeof value.updatedAt === "string";

export const readDownloadCheckpoint = (
  checkpointPath: string,
  modelId: ModelId,
): DownloadCheckpoint | undefined => {
  try {
    const value: unknown = JSON.parse(readFileSync(checkpointPath, "utf8"));
    return isDownloadCheckpoint(value) && value.modelId === modelId
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};

export const writeDownloadCheckpoint = (
  checkpointPath: string,
  checkpoint: DownloadCheckpoint,
): void => {
  mkdirSync(path.dirname(checkpointPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(checkpointPath),
    `${path.basename(checkpointPath)}.tmp`,
  );
  writeFileSync(temporaryPath, JSON.stringify(checkpoint, null, 2), "utf8");
  renameSync(temporaryPath, checkpointPath);
};

export const removeDownloadCheckpoint = (checkpointPath: string): void => {
  if (existsSync(checkpointPath)) rmSync(checkpointPath, { force: true });
};
