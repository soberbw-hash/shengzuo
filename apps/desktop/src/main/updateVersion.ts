import type { AppUpdateCheckResult } from "@ai-voice-studio/shared-types";

export interface ReleaseSummary {
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt?: string;
  assets: Array<{ name: string; downloadUrl: string }>;
}

type VersionParts = readonly [major: number, minor: number, patch: number];

export const parseVersion = (value: string): VersionParts | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[^\d].*)?$/u.exec(value.trim());
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    return null;
  }
  return parts as unknown as VersionParts;
};

export const compareVersions = (left: string, right: string): number => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) {
    throw new Error("版本号格式不正确。");
  }
  for (const index of [0, 1, 2] as const) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
};

export const createUpdateCheckResult = (
  currentVersion: string,
  release: ReleaseSummary,
  checkedAt = new Date().toISOString(),
): AppUpdateCheckResult => {
  const latestParts = parseVersion(release.tagName);
  if (!latestParts) throw new Error("最新版本信息无法识别。");
  const latestVersion = latestParts.join(".");
  const preferredAsset =
    release.assets.find((asset) =>
      /windows.*portable.*\.zip$/iu.test(asset.name),
    ) ?? release.assets.find((asset) => /\.zip$/iu.test(asset.name));

  return {
    checkedAt,
    status:
      compareVersions(latestVersion, currentVersion) > 0
        ? "available"
        : "up-to-date",
    currentVersion,
    latestVersion,
    releaseName: release.name || `声作 ${latestVersion}`,
    releaseUrl: release.htmlUrl,
    downloadUrl: preferredAsset?.downloadUrl,
    publishedAt: release.publishedAt,
  };
};
