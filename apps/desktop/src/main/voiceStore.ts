import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { dialog } from "electron";

import type {
  CreateVoiceProfileRequest,
  VoiceProfile,
  VoiceSampleQuality,
  VoiceSampleSelection,
} from "@ai-voice-studio/shared-types";

import { getModelLibraryRoot } from "./modelLibrary";

interface StoredVoiceProfile extends VoiceProfile {
  sampleFile: string;
  referenceText: string;
  sampleSha256: string;
}

interface PendingSample {
  filePath: string;
  fileName: string;
  expiresAt: number;
  quality: VoiceSampleQuality;
}

const allowedExtensions = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav",
]);
const maxSampleBytes = 100 * 1024 * 1024;
const pendingLifetimeMs = 10 * 60 * 1_000;

const findFfmpeg = async (root: string, depth = 0): Promise<string | null> => {
  if (depth > 7 || !existsSync(root)) return null;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (
      entry.isFile() &&
      /^ffmpeg.*\.exe$/iu.test(entry.name) &&
      !entry.name.toLocaleLowerCase().includes("ffprobe")
    ) {
      return entryPath;
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findFfmpeg(path.join(root, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
};

const analyzeSample = async (filePath: string): Promise<VoiceSampleQuality> => {
  const ffmpeg = await findFfmpeg(getModelLibraryRoot());
  if (!ffmpeg) {
    return {
      status: "unavailable",
      checks: [
        {
          code: "ANALYZER_UNAVAILABLE",
          label: "安装任一模型后可检测录音时长、音量和爆音",
          tone: "warning",
        },
      ],
    };
  }
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-i",
        filePath,
        "-af",
        "volumedetect,astats=metadata=1:reset=0",
        "-f",
        "null",
        "NUL",
      ],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 80_000) stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error("VOICE_ANALYSIS_FAILED"));
    });
  });
  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/u.exec(output);
  const averageMatch = /mean_volume:\s*(-?[\d.]+)\s*dB/iu.exec(output);
  const peakMatch = /max_volume:\s*(-?[\d.]+)\s*dB/iu.exec(output);
  const noiseFloorMatch = /Noise floor dB:\s*(-?[\d.]+|-inf)/iu.exec(output);
  const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3])
    : undefined;
  const averageDb = averageMatch ? Number(averageMatch[1]) : undefined;
  const peakDb = peakMatch ? Number(peakMatch[1]) : undefined;
  const noiseFloorDb =
    noiseFloorMatch && noiseFloorMatch[1] !== "-inf"
      ? Number(noiseFloorMatch[1])
      : undefined;
  const checks: VoiceSampleQuality["checks"] = [];
  if (durationSeconds === undefined) {
    checks.push({
      code: "DURATION_UNKNOWN",
      label: "未能读取录音时长",
      tone: "warning",
    });
  } else if (durationSeconds < 3 || durationSeconds > 60) {
    checks.push({
      code: "DURATION_INVALID",
      label: `录音为 ${durationSeconds.toFixed(1)} 秒，需要 3–60 秒`,
      tone: "danger",
    });
  } else {
    checks.push({
      code: "DURATION_GOOD",
      label: `时长 ${durationSeconds.toFixed(1)} 秒`,
      tone: "success",
    });
  }
  if (averageDb !== undefined && averageDb < -35) {
    checks.push({
      code: "LEVEL_LOW",
      label: "人声偏小或底噪明显，建议换一段更清晰的录音",
      tone: "warning",
    });
  } else if (averageDb !== undefined) {
    checks.push({ code: "LEVEL_GOOD", label: "人声音量正常", tone: "success" });
  }
  if (peakDb !== undefined && peakDb > -0.3) {
    checks.push({
      code: "PEAK_HIGH",
      label: "检测到接近爆音的峰值，建议降低录音音量",
      tone: "warning",
    });
  } else if (peakDb !== undefined) {
    checks.push({ code: "PEAK_GOOD", label: "没有明显爆音", tone: "success" });
  }
  if (noiseFloorDb !== undefined && noiseFloorDb > -38) {
    checks.push({
      code: "NOISE_HIGH",
      label: "背景噪声偏大，建议在更安静的环境重录",
      tone: "warning",
    });
  } else {
    checks.push({
      code: "NOISE_GOOD",
      label: "没有检测到明显底噪",
      tone: "success",
    });
  }
  return {
    durationSeconds,
    averageDb,
    peakDb,
    noiseFloorDb,
    status: checks.some((check) => check.tone !== "success")
      ? "warning"
      : "good",
    checks,
  };
};

const atomicWriteJson = async (filePath: string, value: unknown) => {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, filePath);
};

const sha256File = async (filePath: string): Promise<string> => {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
};

const publicProfile = (profile: StoredVoiceProfile): VoiceProfile => ({
  id: profile.id,
  name: profile.name,
  description: profile.description,
  kind: profile.kind,
  modelId: profile.modelId,
  model: "三款模型通用",
  color: profile.color,
  sampleName: profile.sampleName,
  hasReferenceText: profile.hasReferenceText,
  createdAt: profile.createdAt,
});

export class VoiceStore {
  private readonly pending = new Map<string, PendingSample>();

  constructor(private readonly voicesRoot: string) {}

  async list(): Promise<VoiceProfile[]> {
    await mkdir(this.voicesRoot, { recursive: true });
    const entries = await readdir(this.voicesRoot, { withFileTypes: true });
    const profiles = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry): Promise<VoiceProfile | null> => {
          try {
            const stored = await this.readStored(entry.name);
            return publicProfile(stored);
          } catch {
            return null;
          }
        }),
    );
    return profiles
      .filter((profile): profile is VoiceProfile => profile !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async selectSample(): Promise<VoiceSampleSelection> {
    this.prunePending();
    const result = await dialog.showOpenDialog({
      title: "选择用于克隆的本人录音",
      properties: ["openFile"],
      filters: [
        {
          name: "音频文件",
          extensions: [...allowedExtensions].map((extension) =>
            extension.slice(1),
          ),
        },
      ],
    });
    const [filePath] = result.filePaths;
    if (result.canceled || result.filePaths.length !== 1 || !filePath) {
      return { canceled: true };
    }

    return this.registerSample(filePath);
  }

  async selectDroppedSample(filePath: string): Promise<VoiceSampleSelection> {
    this.prunePending();
    if (!path.isAbsolute(filePath) || filePath.includes("\0")) {
      throw new Error("拖入的音频路径无效。");
    }
    return this.registerSample(path.resolve(filePath));
  }

  private async registerSample(
    filePath: string,
  ): Promise<VoiceSampleSelection> {
    const extension = path.extname(filePath).toLowerCase();
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || !allowedExtensions.has(extension)) {
      throw new Error("请选择 WAV、MP3、M4A、FLAC、OGG、OPUS 或 AAC 录音。");
    }
    if (fileStat.size === 0 || fileStat.size > maxSampleBytes) {
      throw new Error("录音文件需要小于 100 MB，且内容不能为空。");
    }

    const sampleToken = randomUUID();
    const fileName = path.basename(filePath);
    const quality = await analyzeSample(filePath).catch(
      (): VoiceSampleQuality => ({
        status: "unavailable",
        checks: [
          {
            code: "ANALYSIS_FAILED",
            label: "录音可以使用，但质量检测没有完成",
            tone: "warning",
          },
        ],
      }),
    );
    this.pending.set(sampleToken, {
      filePath,
      fileName,
      expiresAt: Date.now() + pendingLifetimeMs,
      quality,
    });
    return { canceled: false, sampleToken, fileName, quality };
  }

  async create(request: CreateVoiceProfileRequest): Promise<VoiceProfile> {
    this.prunePending();
    const pending = this.pending.get(request.sampleToken);
    if (!pending) {
      throw new Error("录音选择已过期，请重新选择一次。");
    }
    this.pending.delete(request.sampleToken);

    const voiceId = `voice-${randomUUID()}`;
    const extension = path.extname(pending.filePath).toLowerCase();
    const voiceDirectory = path.join(this.voicesRoot, voiceId);
    const temporaryDirectory = `${voiceDirectory}.installing`;
    const sampleFile = `sample${extension}`;
    const samplePath = path.join(temporaryDirectory, sampleFile);
    await mkdir(this.voicesRoot, { recursive: true });
    await mkdir(temporaryDirectory, { recursive: false });

    try {
      await copyFile(pending.filePath, samplePath);
      const profile: StoredVoiceProfile = {
        id: voiceId,
        name: request.name.trim(),
        description: request.referenceText.trim()
          ? "高保真声音克隆"
          : "声音克隆（未填写录音文字）",
        kind: "cloned",
        modelId: "voxcpm2",
        model: "三款模型通用",
        color: "#54a8ef",
        sampleName: pending.fileName,
        hasReferenceText: request.referenceText.trim().length > 0,
        createdAt: new Date().toISOString(),
        sampleFile,
        referenceText: request.referenceText.trim(),
        sampleSha256: await sha256File(samplePath),
      };
      await atomicWriteJson(
        path.join(temporaryDirectory, "profile.json"),
        profile,
      );
      await rename(temporaryDirectory, voiceDirectory);
      return publicProfile(profile);
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async remove(voiceId: string): Promise<boolean> {
    const voiceDirectory = path.join(this.voicesRoot, voiceId);
    const stored = await this.readStored(voiceId).catch(() => null);
    if (!stored) return false;
    await rm(voiceDirectory, { recursive: true, force: false });
    return true;
  }

  async getGenerationSource(voiceId: string): Promise<{
    audioPath: string;
    referenceText: string;
  }> {
    const stored = await this.readStored(voiceId);
    const audioPath = path.join(this.voicesRoot, voiceId, stored.sampleFile);
    if ((await sha256File(audioPath)) !== stored.sampleSha256) {
      throw new Error("声音录音校验失败，请重新克隆这个声音。");
    }
    return {
      audioPath,
      referenceText: stored.referenceText,
    };
  }

  private async readStored(voiceId: string): Promise<StoredVoiceProfile> {
    if (!/^voice-[a-f0-9-]+$/u.test(voiceId)) {
      throw new Error("声音编号无效。");
    }
    const profilePath = path.join(this.voicesRoot, voiceId, "profile.json");
    const value: unknown = JSON.parse(await readFile(profilePath, "utf8"));
    if (
      typeof value !== "object" ||
      value === null ||
      !("id" in value) ||
      value.id !== voiceId ||
      !("sampleFile" in value) ||
      typeof value.sampleFile !== "string" ||
      path.basename(value.sampleFile) !== value.sampleFile ||
      !("referenceText" in value) ||
      typeof value.referenceText !== "string"
    ) {
      throw new Error("声音配置文件无效。");
    }
    return value as StoredVoiceProfile;
  }

  private prunePending(): void {
    const now = Date.now();
    for (const [token, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(token);
    }
  }
}
