import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_EXPORT_NAMING_TEMPLATE,
  isExportNamingTemplate,
  type ExportNamingSettings,
} from "@ai-voice-studio/shared-types";

interface StoredExportPreferences {
  namingTemplate: string;
  lastDirectory?: string;
}

export class ExportPreferencesStore {
  private loaded = false;
  private preferences: StoredExportPreferences = {
    namingTemplate: DEFAULT_EXPORT_NAMING_TEMPLATE,
  };
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async getSettings(): Promise<ExportNamingSettings> {
    await this.ensureLoaded();
    return { template: this.preferences.namingTemplate };
  }

  async updateNamingTemplate(template: string): Promise<ExportNamingSettings> {
    await this.ensureLoaded();
    if (!isExportNamingTemplate(template)) {
      throw new Error("文件命名规则无法使用，请选择名称、日期等内容后重试。");
    }
    this.preferences.namingTemplate = template.trim();
    await this.persist();
    return { template: this.preferences.namingTemplate };
  }

  async getLastDirectory(): Promise<string | undefined> {
    await this.ensureLoaded();
    return this.preferences.lastDirectory;
  }

  async rememberDirectory(directory: string): Promise<void> {
    await this.ensureLoaded();
    if (!path.isAbsolute(directory)) return;
    this.preferences.lastDirectory = path.normalize(directory);
    await this.persist();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const value: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (typeof value !== "object" || value === null) return;
      if (
        "namingTemplate" in value &&
        isExportNamingTemplate(value.namingTemplate)
      ) {
        this.preferences.namingTemplate = value.namingTemplate.trim();
      }
      if (
        "lastDirectory" in value &&
        typeof value.lastDirectory === "string" &&
        path.isAbsolute(value.lastDirectory)
      ) {
        this.preferences.lastDirectory = path.normalize(value.lastDirectory);
      }
    } catch {
      // A missing or damaged preference file safely falls back to defaults.
    }
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.preferences, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, snapshot, { encoding: "utf8", flag: "wx" });
      try {
        await rename(temporary, this.filePath);
      } finally {
        await rm(temporary, { force: true });
      }
    });
    await this.writeQueue;
  }
}
