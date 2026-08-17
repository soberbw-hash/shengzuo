import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import {
  cp,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

export const MODEL_LIBRARY_FOLDER = "声作模型库";
export const MODEL_DATA_FOLDERS = [
  "voxcpm2",
  "fun-cosyvoice3",
  "indextts2-5",
] as const;

export interface ModelLibraryMoveResult {
  path: string;
  moved: boolean;
  movedBytes: number;
  cleanupRequired: boolean;
}

const safeRoot = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.trim() || !path.isAbsolute(value)) {
    return undefined;
  }
  const resolved = path.resolve(value.trim());
  return resolved === path.parse(resolved).root ? undefined : resolved;
};

const settingsPath = (): string =>
  path.join(app.getPath("userData"), "workspace", "model-library.json");

const configuredRoot = (): string | undefined => {
  try {
    const value: unknown = JSON.parse(readFileSync(settingsPath(), "utf8"));
    if (typeof value !== "object" || value === null || !("path" in value)) {
      return undefined;
    }
    return safeRoot(value.path);
  } catch {
    return undefined;
  }
};

const environmentRoot = (): string | undefined =>
  safeRoot(process.env.SHENGZUO_MODEL_LIBRARY);

const defaultRoot = (): string => {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  return path.join(
    localAppData || app.getPath("appData"),
    MODEL_LIBRARY_FOLDER,
  );
};

export const getModelLibraryRoot = (): string =>
  configuredRoot() ?? environmentRoot() ?? defaultRoot();

export const resolveModelLibrarySelection = (selectedPath: string): string => {
  const selected = safeRoot(selectedPath);
  if (!selected) {
    throw new Error("请选择普通文件夹，不能直接使用磁盘根目录。");
  }
  return path.basename(selected).toLocaleLowerCase() ===
    MODEL_LIBRARY_FOLDER.toLocaleLowerCase()
    ? selected
    : path.join(selected, MODEL_LIBRARY_FOLDER);
};

const writeGuide = (root: string): void => {
  mkdirSync(root, { recursive: true });
  const guide = path.join(root, "模型库说明.txt");
  const temporary = `${guide}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    [
      "声作模型库",
      "",
      "voxcpm2          VoxCPM2（综合最推荐）",
      "fun-cosyvoice3   Fun-CosyVoice3（更多中文方言）",
      "indextts2-5      IndexTTS-2.5（情绪与发音控制）",
      "",
      "每个模型内的 runtime、sources、weights 是一套完整环境，请不要拆开。",
      "程序升级不会删除本目录。需要释放空间时，退出声作后删除整个模型文件夹。",
      "生成音频和个人声音不保存在这里，复制模型库不会带走个人内容。",
    ].join("\r\n"),
    "utf8",
  );
  renameSync(temporary, guide);
};

export const prepareModelLibraryAt = (root: string): string => {
  writeGuide(root);
  return root;
};

export const prepareModelLibrary = (): string => {
  const root = getModelLibraryRoot();
  mkdirSync(root, { recursive: true });
  if (!configuredRoot() && !environmentRoot()) {
    const legacyRoot = path.join(app.getPath("userData"), "engines");
    for (const folder of MODEL_DATA_FOLDERS) {
      const source = path.join(legacyRoot, folder);
      const destination = path.join(root, folder);
      if (!existsSync(destination) && existsSync(source)) {
        renameSync(source, destination);
      }
    }
  }
  writeGuide(root);
  return root;
};

const directoryManifest = async (
  root: string,
  relativeRoot = "",
): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  if (!existsSync(root)) return result;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeRoot, entry.name);
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await directoryManifest(entryPath, relativePath);
      for (const [name, size] of nested) result.set(name, size);
    } else if (entry.isFile()) {
      result.set(relativePath, (await stat(entryPath)).size);
    }
  }
  return result;
};

const manifestsMatch = (
  source: Map<string, number>,
  destination: Map<string, number>,
): boolean => {
  if (source.size !== destination.size) return false;
  for (const [name, size] of source) {
    if (destination.get(name) !== size) return false;
  }
  return true;
};

const hasModelData = (root: string): boolean =>
  MODEL_DATA_FOLDERS.some((folder) => existsSync(path.join(root, folder)));

const hasUnexpectedFiles = async (root: string): Promise<boolean> => {
  if (!existsSync(root)) return false;
  const allowed = new Set(["模型库说明.txt", "模型文件夹说明.txt"]);
  const entries = await readdir(root);
  return entries.some((entry) => !allowed.has(entry));
};

const saveConfiguredRoot = async (
  root: string,
  configurationPath = settingsPath(),
): Promise<void> => {
  const destination = configurationPath;
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify({ path: root, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

const isNestedPath = (parent: string, candidate: string): boolean => {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

export const moveModelLibrary = async (
  sourcePath: string,
  destinationPath: string,
  configurationPath?: string,
): Promise<ModelLibraryMoveResult> => {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationPath);
  if (source === destination) {
    await saveConfiguredRoot(destination, configurationPath);
    return {
      path: destination,
      moved: false,
      movedBytes: 0,
      cleanupRequired: false,
    };
  }
  if (isNestedPath(source, destination) || isNestedPath(destination, source)) {
    throw new Error("新位置不能放在当前模型文件夹内部。");
  }
  prepareModelLibraryAt(source);
  const sourceHasData = hasModelData(source);
  const destinationHasData = hasModelData(destination);
  if (sourceHasData && destinationHasData) {
    throw new Error("所选位置已有另一套模型，为避免覆盖，请选择空位置。");
  }
  if (destinationHasData && !sourceHasData) {
    await saveConfiguredRoot(destination, configurationPath);
    let cleanupRequired = false;
    try {
      await rm(source, { recursive: true, force: true });
    } catch {
      cleanupRequired = true;
    }
    writeGuide(destination);
    return {
      path: destination,
      moved: false,
      movedBytes: 0,
      cleanupRequired,
    };
  }
  if (await hasUnexpectedFiles(destination)) {
    throw new Error("所选位置不是空文件夹，请换一个位置。");
  }

  const sourceManifest = await directoryManifest(source);
  const movedBytes = [...sourceManifest.values()].reduce(
    (total, size) => total + size,
    0,
  );
  await mkdir(path.dirname(destination), { recursive: true });
  const sameVolume =
    path.parse(source).root.toLocaleLowerCase() ===
    path.parse(destination).root.toLocaleLowerCase();
  if (existsSync(destination)) {
    await rm(destination, { recursive: true, force: true });
  }

  if (sameVolume) {
    await rename(source, destination);
    try {
      await saveConfiguredRoot(destination, configurationPath);
    } catch (error) {
      await rename(destination, source);
      throw error;
    }
    writeGuide(destination);
    return {
      path: destination,
      moved: true,
      movedBytes,
      cleanupRequired: false,
    };
  }

  const disk = await statfs(path.dirname(destination));
  if (disk.bavail * disk.bsize < movedBytes + 1024 ** 3) {
    throw new Error("新位置空间不足，请至少再留 1GB 空余空间。");
  }
  const staging = `${destination}.migrating-${randomUUID()}`;
  await rm(staging, { recursive: true, force: true });
  try {
    await cp(source, staging, { recursive: true, errorOnExist: true });
    const copiedManifest = await directoryManifest(staging);
    if (!manifestsMatch(sourceManifest, copiedManifest)) {
      throw new Error("模型文件复制不完整，原位置未删除。");
    }
    await rename(staging, destination);
    try {
      await saveConfiguredRoot(destination, configurationPath);
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
    let cleanupRequired = false;
    try {
      await rm(source, { recursive: true, force: true });
    } catch {
      cleanupRequired = true;
    }
    writeGuide(destination);
    return {
      path: destination,
      moved: true,
      movedBytes,
      cleanupRequired,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};
