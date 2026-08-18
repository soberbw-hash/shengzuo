import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  isProjectId,
  isSaveProjectRequest,
  type GenerationProject,
  type SaveProjectRequest,
} from "@ai-voice-studio/shared-types";
import { readResilientJson, writeResilientJson } from "./resilientJsonStore";

export class ProjectStore {
  constructor(private readonly root: string) {}

  async list(): Promise<GenerationProject[]> {
    await mkdir(this.root, { recursive: true });
    const files = await readdir(this.root, { withFileTypes: true });
    const projects = await Promise.all(
      files
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.readFile(path.join(this.root, entry.name))),
    );
    return projects
      .filter((project): project is GenerationProject => project !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(projectId: string): Promise<GenerationProject | null> {
    if (!isProjectId(projectId)) return null;
    return this.readFile(path.join(this.root, `${projectId}.json`));
  }

  async save(request: SaveProjectRequest): Promise<GenerationProject> {
    if (!isSaveProjectRequest(request)) {
      throw new Error("项目没有保存，请检查稿件和配音设置。");
    }
    await mkdir(this.root, { recursive: true });
    const id = request.id ?? `project-${randomUUID()}`;
    const existing = request.id ? await this.get(request.id) : null;
    const now = new Date().toISOString();
    const project: GenerationProject = {
      ...request,
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await writeResilientJson(path.join(this.root, `${id}.json`), project);
    return structuredClone(project);
  }

  async remove(projectId: string): Promise<boolean> {
    if (!isProjectId(projectId)) return false;
    const project = await this.get(projectId);
    if (!project) return false;
    await rm(path.join(this.root, `${projectId}.json`), { force: false });
    await rm(path.join(this.root, `${projectId}.json.bak`), { force: true });
    return true;
  }

  private async readFile(filePath: string): Promise<GenerationProject | null> {
    return readResilientJson(filePath, (value): value is GenerationProject => {
      if (
        typeof value !== "object" ||
        value === null ||
        !("id" in value) ||
        !isProjectId(value.id) ||
        !("createdAt" in value) ||
        typeof value.createdAt !== "string" ||
        Number.isNaN(Date.parse(value.createdAt)) ||
        !("updatedAt" in value) ||
        typeof value.updatedAt !== "string" ||
        Number.isNaN(Date.parse(value.updatedAt))
      ) {
        return false;
      }
      const request = { ...value };
      Reflect.deleteProperty(request, "id");
      Reflect.deleteProperty(request, "createdAt");
      Reflect.deleteProperty(request, "updatedAt");
      return isSaveProjectRequest({ ...request, id: value.id });
    });
  }
}
