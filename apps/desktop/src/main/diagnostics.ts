import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { app } from "electron";

import { APP_NAME, APP_VERSION } from "@ai-voice-studio/shared-types";
import { detectHardware } from "@ai-voice-studio/hardware-detector";

import { getModelLibraryRoot } from "./modelLibrary";

const redact = (value: string, limit = 500): string =>
  value
    .replaceAll(os.homedir(), "<用户目录>")
    .replaceAll(app.getPath("userData"), "<声作数据目录>")
    .replaceAll(getModelLibraryRoot(), "<声作模型库>")
    .replace(/[A-Za-z]:\\[^\s"']+/gu, "<本机路径>")
    .slice(0, limit);

const run = async (executable: string, args: string[]): Promise<string> =>
  new Promise((resolve) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (output.length < 20_000) output += chunk.toString("utf8");
    });
    child.once("error", () => resolve("不可用"));
    child.once("exit", (code) =>
      resolve(code === 0 ? output.trim() : "不可用"),
    );
  });

export class DiagnosticsService {
  private readonly logPath: string;

  constructor(private readonly root: string) {
    this.logPath = path.join(root, "recent.log");
  }

  async record(category: string, message: string): Promise<void> {
    await mkdir(this.root, { recursive: true });
    try {
      if ((await stat(this.logPath)).size > 2 * 1024 * 1024) {
        await writeFile(this.logPath, "", "utf8");
      }
    } catch {
      // The first event creates the file.
    }
    await appendFile(
      this.logPath,
      `${new Date().toISOString()} [${redact(category)}] ${redact(message)}\n`,
      "utf8",
    );
  }

  async exportZip(
    destination: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const staging = path.join(
      os.tmpdir(),
      `shengzuo-diagnostics-${randomUUID()}`,
    );
    await mkdir(staging, { recursive: false });
    try {
      const hardware = await detectHardware();
      const report = {
        product: APP_NAME,
        version: APP_VERSION,
        createdAt: new Date().toISOString(),
        system: {
          platform: process.platform,
          architecture: process.arch,
          windows: os.release(),
          memoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
          cpu: os.cpus()[0]?.model ?? "未知",
          gpu: redact(hardware.summary),
          computeMode: hardware.computeMode,
          packaged: app.isPackaged,
        },
        ...details,
      };
      await writeFile(
        path.join(staging, "environment.json"),
        JSON.stringify(report, null, 2),
        "utf8",
      );
      const log = await readFile(this.logPath, "utf8").catch(
        () => "暂无日志。\n",
      );
      await writeFile(
        path.join(staging, "recent.log"),
        redact(log, 200_000),
        "utf8",
      );
      await writeFile(
        path.join(staging, "说明.txt"),
        "此诊断包不包含稿件全文、录音、生成音频、访问令牌或完整本机路径。\r\n",
        "utf8",
      );
      const powershell = process.env.SystemRoot
        ? path.join(
            process.env.SystemRoot,
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          )
        : "powershell.exe";
      const script = [
        "$ErrorActionPreference='Stop'",
        `Compress-Archive -Path '${staging.replaceAll("'", "''")}\\*' -DestinationPath '${destination.replaceAll("'", "''")}' -CompressionLevel Optimal -Force`,
      ].join("; ");
      const result = await run(powershell, [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ]);
      if (result === "不可用") throw new Error("诊断包压缩失败。");
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
}
