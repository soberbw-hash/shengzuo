import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  isProjectId,
  isSaveProjectRequest,
  type GenerationProject,
  type SaveProjectRequest,
} from "@ai-voice-studio/shared-types";

const atomicWriteJson = async (filePath: string, value: unknown) => {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    flag: "wx",
  });
  try {
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
};

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
      throw new Error("项目内容无效，请检查稿件和设置。");
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
    await atomicWriteJson(path.join(this.root, `${id}.json`), project);
    return structuredClone(project);
  }

  async remove(projectId: string): Promise<boolean> {
    if (!isProjectId(projectId)) return false;
    const project = await this.get(projectId);
    if (!project) return false;
    await rm(path.join(this.root, `${projectId}.json`), { force: false });
    return true;
  }

  private async readFile(filePath: string): Promise<GenerationProject | null> {
    try {
      const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
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
        return null;
      }
      const request = { ...value };
      Reflect.deleteProperty(request, "id");
      Reflect.deleteProperty(request, "createdAt");
      Reflect.deleteProperty(request, "updatedAt");
      if (!isSaveProjectRequest({ ...request, id: value.id })) return null;
      return value as GenerationProject;
    } catch {
      return null;
    }
  }
}
