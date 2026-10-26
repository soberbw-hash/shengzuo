import { spawn, type ChildProcess } from "node:child_process";

export const killAudioProcessTree = (child: ChildProcess): void => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.once("error", () => child.kill());
    killer.once("exit", (code) => {
      if (code !== 0) child.kill();
    });
  } else {
    child.kill();
  }
};

export const waitForAudioProcessExit = (
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve(true);
  return new Promise((resolve) => {
    const closed = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.removeListener("close", closed);
      resolve(false);
    }, timeoutMs);
    child.once("close", closed);
  });
};

export const runAudioTool = (
  executable: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
  timeoutMs = 300_000,
): Promise<string> => {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      cwd,
      env: { ...process.env, PYTHONUTF8: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let failure: Error | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      // FFmpeg can be a grandchild of Python; cancel the whole tool tree.
      killAudioProcessTree(child);
    };
    const abort = () => stop(new Error("AUDIO_TOOL_CANCELED"));
    const timeout = setTimeout(
      () => stop(new Error("AUDIO_TOOL_TIMEOUT")),
      timeoutMs,
    );
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length + chunk.length > 32_000) {
        stop(new Error("INVALID_AUDIO_TOOL_OUTPUT"));
      } else {
        stdout += chunk;
      }
    });
    child.stderr.resume();
    child.once("error", () => {
      cleanup();
      reject(new Error("AUDIO_TOOL_START_FAILED"));
    });
    child.once("close", (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error("AUDIO_CONVERSION_FAILED"));
      else resolve(stdout.trim());
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
};
