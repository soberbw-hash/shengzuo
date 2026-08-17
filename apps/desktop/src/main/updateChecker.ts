import { net } from "electron";

import type { AppUpdateCheckResult } from "@ai-voice-studio/shared-types";

import { createUpdateCheckResult, type ReleaseSummary } from "./updateVersion";

export const RELEASES_PAGE_URL =
  "https://github.com/soberbw-hash/shengzuo/releases/latest";
const LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/soberbw-hash/shengzuo/releases/latest";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readRelease = (value: unknown): ReleaseSummary => {
  if (!isRecord(value)) throw new Error("更新信息内容不完整。");
  const tagName = value.tag_name;
  const name = value.name;
  const htmlUrl = value.html_url;
  if (
    typeof tagName !== "string" ||
    typeof htmlUrl !== "string" ||
    !htmlUrl.startsWith("https://github.com/soberbw-hash/shengzuo/releases/")
  ) {
    throw new Error("更新信息内容不完整。");
  }

  const assets = Array.isArray(value.assets)
    ? value.assets.flatMap((asset) => {
        if (!isRecord(asset)) return [];
        const assetName = asset.name;
        const downloadUrl = asset.browser_download_url;
        if (
          typeof assetName !== "string" ||
          typeof downloadUrl !== "string" ||
          !downloadUrl.startsWith(
            "https://github.com/soberbw-hash/shengzuo/releases/download/",
          )
        ) {
          return [];
        }
        return [{ name: assetName, downloadUrl }];
      })
    : [];

  return {
    tagName,
    name: typeof name === "string" ? name : "",
    htmlUrl,
    publishedAt:
      typeof value.published_at === "string" ? value.published_at : undefined,
    assets,
  };
};

export const checkForAppUpdates = async (
  currentVersion: string,
): Promise<AppUpdateCheckResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await net.fetch(LATEST_RELEASE_API_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": `ShengZuo/${currentVersion}`,
      },
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("暂时没有可用的正式版本。");
      }
      throw new Error(`连接更新服务失败（${response.status}）。`);
    }
    const payload: unknown = await response.json();
    return createUpdateCheckResult(currentVersion, readRelease(payload));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("检查更新超时，请稍后重试。");
    }
    if (error instanceof Error) throw error;
    throw new Error("检查更新失败，请确认网络后重试。");
  } finally {
    clearTimeout(timeout);
  }
};
