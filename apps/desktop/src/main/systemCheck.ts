import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import type { HardwareProfile } from "@ai-voice-studio/hardware-detector";
import type {
  EngineSnapshot,
  ModelId,
  SystemCheckItem,
  SystemCheckResult,
} from "@ai-voice-studio/shared-types";

interface SystemCheckContext {
  modelLibraryRoot: string;
  userDataRoot: string;
  enginePluginsRoot: string;
  hardware: HardwareProfile;
  snapshots: EngineSnapshot[];
  guideWasMissing: boolean;
}

interface ModelCheckConfig {
  id: ModelId;
  name: string;
  folder: string;
  receipts: readonly string[];
}

const modelChecks: readonly ModelCheckConfig[] = [
  {
    id: "voxcpm2",
    name: "VoxCPM2",
    folder: "voxcpm2",
    receipts: ["weights/VoxCPM2/install-receipt.json"],
  },
  {
    id: "fun-cosyvoice3-0.5b",
    name: "Fun-CosyVoice3",
    folder: "fun-cosyvoice3",
    receipts: [
      "weights/Fun-CosyVoice3-0.5B-2512/install-receipt.json",
      "sources/CosyVoice/install-receipt.json",
      "sources/Matcha-TTS/install-receipt.json",
    ],
  },
  {
    id: "indextts2-5",
    name: "IndexTTS-2.5",
    folder: "indextts2-5",
    receipts: [
      "weights/IndexTTS-2.5/install-receipt.json",
      "sources/index-tts/install-receipt.json",
    ],
  },
] as const;

const workerFiles = [
  "common/runtime/install-runtime.ps1",
  "common/worker/server_core.py",
  "common/worker/install_assets.py",
  "common/worker/merge_audio.py",
  "voxcpm2/worker/server.py",
  "voxcpm2/model-manifest.json",
  "fun-cosyvoice3/worker/server.py",
  "fun-cosyvoice3/model-manifest.json",
  "indextts2-5/worker/server.py",
  "indextts2-5/model-manifest.json",
] as const;

const canBindLoopback = async (): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(0, "127.0.0.1", () => {
      server.close((error) => resolve(error === undefined));
    });
  });

const ensureWritableDirectory = async (
  directory: string,
): Promise<{ created: boolean; writable: boolean }> => {
  const created = !existsSync(directory);
  try {
    await mkdir(directory, { recursive: true });
    const probe = path.join(directory, `.shengzuo-check-${randomUUID()}.tmp`);
    await writeFile(probe, "ok", { encoding: "utf8", flag: "wx" });
    await rm(probe, { force: true });
    return { created, writable: true };
  } catch {
    return { created, writable: false };
  }
};

const hasFfmpeg = async (modelRoot: string): Promise<boolean> => {
  if (existsSync(path.join(modelRoot, "runtime", "Scripts", "ffmpeg.exe"))) {
    return true;
  }
  const binaryRoot = path.join(
    modelRoot,
    "runtime",
    "Lib",
    "site-packages",
    "imageio_ffmpeg",
    "binaries",
  );
  try {
    const entries = await readdir(binaryRoot, { withFileTypes: true });
    return entries.some(
      (entry) => entry.isFile() && /^ffmpeg.*\.exe$/iu.test(entry.name),
    );
  } catch {
    return false;
  }
};

const checkModel = async (
  config: ModelCheckConfig,
  context: SystemCheckContext,
): Promise<SystemCheckItem> => {
  const modelRoot = path.join(context.modelLibraryRoot, config.folder);
  const snapshot = context.snapshots.find((item) => item.modelId === config.id);
  if (!existsSync(modelRoot)) {
    return {
      id: `model-${config.id}`,
      label: config.name,
      status: "notice",
      detail: "尚未下载，需要时可在“本地引擎”一键安装。",
    };
  }
  if (
    snapshot &&
    ["downloading", "download-paused", "installing"].includes(snapshot.status)
  ) {
    return {
      id: `model-${config.id}`,
      label: config.name,
      status: "notice",
      detail: "模型正在准备或已暂停，已下载的文件会保留并支持续传。",
    };
  }
  const requiredFiles = [
    "runtime/python.exe",
    "runtime/runtime-receipt.json",
    ...config.receipts,
  ];
  const missingFiles = requiredFiles.filter(
    (relativePath) => !existsSync(path.join(modelRoot, relativePath)),
  );
  if (missingFiles.length > 0) {
    return {
      id: `model-${config.id}`,
      label: config.name,
      status: "attention",
      detail: `模型不完整（缺少 ${missingFiles.length} 项运行文件），已刷新为未安装；请到“本地引擎”重新下载。`,
    };
  }
  if (!(await hasFfmpeg(modelRoot))) {
    return {
      id: `model-${config.id}`,
      label: config.name,
      status: "attention",
      detail: "模型主体完整，但没有找到 FFmpeg；请到“本地引擎”重新准备该模型。",
    };
  }
  return {
    id: `model-${config.id}`,
    label: config.name,
    status: "ok",
    detail: "Python、模型文件、安装收据与 FFmpeg 均完整。",
  };
};

export const checkAndRepairSystem = async (
  context: SystemCheckContext,
): Promise<SystemCheckResult> => {
  const items: SystemCheckItem[] = [];
  const missingWorkerFiles = workerFiles.filter(
    (relativePath) =>
      !existsSync(path.join(context.enginePluginsRoot, relativePath)),
  );
  const loopbackReady = await canBindLoopback();
  items.push(
    missingWorkerFiles.length === 0 && loopbackReady
      ? {
          id: "backend",
          label: "本地后台",
          status: "ok",
          detail: "后台通信、Worker 文件和本机环回端口正常。",
        }
      : {
          id: "backend",
          label: "本地后台",
          status: "attention",
          detail:
            missingWorkerFiles.length > 0
              ? `程序文件不完整（缺少 ${missingWorkerFiles.length} 项），请重新复制完整 app 文件夹。`
              : "本机环回端口暂时不可用，请关闭拦截本地连接的软件后重试。",
        },
  );

  const storageDirectories = [
    context.modelLibraryRoot,
    path.join(context.userDataRoot, "workspace"),
    path.join(context.userDataRoot, "outputs"),
    path.join(context.userDataRoot, "voices"),
  ];
  const storageResults = await Promise.all(
    storageDirectories.map(ensureWritableDirectory),
  );
  const storageWritable = storageResults.every((result) => result.writable);
  const repairedStorage =
    context.guideWasMissing || storageResults.some((result) => result.created);
  items.push(
    !storageWritable
      ? {
          id: "storage",
          label: "文件与权限",
          status: "attention",
          detail: "模型库或数据目录不可写，请把软件和模型放到本机可写位置。",
        }
      : repairedStorage
        ? {
            id: "storage",
            label: "文件与权限",
            status: "repaired",
            detail: "缺少的目录或模型库说明已自动补齐，读写测试通过。",
          }
        : {
            id: "storage",
            label: "文件与权限",
            status: "ok",
            detail: "模型库、项目、声音和输出目录均可正常读写。",
          },
  );

  if (context.hardware.computeMode === "cuda") {
    items.push({
      id: "hardware",
      label: "硬件加速",
      status: "ok",
      detail: context.hardware.summary,
    });
  } else if (context.hardware.systemMemoryGb >= 16) {
    items.push({
      id: "hardware",
      label: "硬件加速",
      status: "notice",
      detail: `${context.hardware.summary} CPU 模式可以使用，但生成会慢一些。`,
    });
  } else {
    items.push({
      id: "hardware",
      label: "硬件加速",
      status: "attention",
      detail: "没有兼容 NVIDIA 显卡且系统内存不足 16GB，不建议运行本地大模型。",
    });
  }

  items.push(
    ...(await Promise.all(
      modelChecks.map((config) => checkModel(config, context)),
    )),
  );
  const attentionCount = items.filter(
    (item) => item.status === "attention",
  ).length;
  return {
    checkedAt: new Date().toISOString(),
    overall: attentionCount > 0 ? "attention" : "healthy",
    repairedCount: items.filter((item) => item.status === "repaired").length,
    attentionCount,
    readyModelCount: items.filter(
      (item) => item.id.startsWith("model-") && item.status === "ok",
    ).length,
    items,
  };
};
