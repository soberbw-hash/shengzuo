import { spawn } from "node:child_process";
import os from "node:os";

export type ComputeMode = "cuda" | "cpu";

export interface HardwareProfile {
  computeMode: ComputeMode;
  gpuName: string;
  nvidiaDriver?: string;
  vramGb?: number;
  systemMemoryGb: number;
  summary: string;
}

const queryNvidia = async (): Promise<string | null> =>
  new Promise((resolve) => {
    const child = spawn(
      "nvidia-smi.exe",
      [
        "--query-gpu=name,driver_version,memory.total",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (output.length < 4_000) output += chunk.toString("utf8");
    });
    child.once("error", () => resolve(null));
    child.once("exit", (code) =>
      resolve(code === 0 ? (output.trim().split(/\r?\n/u)[0] ?? null) : null),
    );
  });

let cachedProfile: Promise<HardwareProfile> | undefined;

export const parseNvidiaLine = (
  nvidia: string,
  systemMemoryGb: number,
): HardwareProfile => {
  const [rawName = "NVIDIA GPU", rawDriver, rawMemory] = nvidia
    .split(",")
    .map((value) => value.trim());
  const memoryMb = Number(rawMemory);
  const vramGb = Number.isFinite(memoryMb)
    ? Math.round((memoryMb / 1024) * 10) / 10
    : undefined;
  return {
    computeMode: "cuda",
    gpuName: rawName,
    nvidiaDriver: rawDriver || undefined,
    vramGb,
    systemMemoryGb,
    summary: `${rawName}${vramGb ? ` · ${vramGb}GB 显存` : ""}，将自动使用 CUDA 加速。`,
  };
};

export const createCpuProfile = (systemMemoryGb: number): HardwareProfile => ({
  computeMode: "cpu",
  gpuName: "未检测到兼容的 NVIDIA 显卡",
  systemMemoryGb,
  summary: "将自动使用 CPU；能够运行，但生成速度会明显变慢。",
});

export const detectHardware = (): Promise<HardwareProfile> => {
  cachedProfile ??= (async () => {
    const systemMemoryGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
    const nvidia = await queryNvidia();
    if (!nvidia) {
      return createCpuProfile(systemMemoryGb);
    }
    return parseNvidiaLine(nvidia, systemMemoryGb);
  })();
  return cachedProfile;
};
