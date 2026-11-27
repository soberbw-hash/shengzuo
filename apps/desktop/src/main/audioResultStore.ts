import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { AudioResult } from "@ai-voice-studio/shared-types";

export class AudioResultStore {
  constructor(private readonly outputRoot: string) {}

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
    return results
      .filter((value): value is AudioResult => value !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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

  async writeResultMetadata(result: AudioResult): Promise<void> {
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
}
