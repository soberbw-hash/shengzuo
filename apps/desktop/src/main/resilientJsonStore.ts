import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const parseJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, "utf8")) as unknown;

export const writeResilientJson = async (
  filePath: string,
  value: unknown,
): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    flag: "wx",
  });
  try {
    try {
      await copyFile(filePath, `${filePath}.bak`);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
};

export const readResilientJson = async <T>(
  filePath: string,
  validate: (value: unknown) => value is T,
): Promise<T | null> => {
  try {
    const value = await parseJson(filePath);
    if (validate(value)) return value;
    throw new Error("INVALID_JSON_SHAPE");
  } catch (primaryError) {
    if (!isMissingFile(primaryError)) {
      const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
      await rename(filePath, `${filePath}.corrupt-${stamp}`).catch(() => {});
    }
    try {
      const backup = await parseJson(`${filePath}.bak`);
      if (!validate(backup)) return null;
      await writeResilientJson(filePath, backup);
      return backup;
    } catch {
      return null;
    }
  }
};
