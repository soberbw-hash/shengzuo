import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const localAppData = process.env.LOCALAPPDATA;
const modelLibrary =
  process.env.SHENGZUO_MODEL_LIBRARY ??
  (localAppData ? path.join(localAppData, "声作模型库") : undefined);
const bundledPython = modelLibrary
  ? path.join(modelLibrary, "voxcpm2", "runtime", "python.exe")
  : undefined;
const python =
  process.env.SHENGZUO_TEST_PYTHON?.trim() ||
  (bundledPython && existsSync(bundledPython)
    ? bundledPython
    : process.platform === "win32"
      ? "python"
      : "python3");
const server = path.resolve("engines/voxcpm2/worker/server.py");

if (!existsSync(server)) throw new Error(`Missing prerequisite: ${server}`);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const startupTimeoutMilliseconds = 20_000;
const probeTimeoutMilliseconds = 1_500;
const probeIntervalMilliseconds = 150;

const acquireLoopbackPort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not allocate a loopback port."));
        return;
      }
      probe.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });

const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "shengzuo-worker-security-"),
);
const weights = path.join(temporaryRoot, "weights");
const voiceRoot = path.join(temporaryRoot, "voices");
const outputRoot = path.join(temporaryRoot, "output");
await Promise.all(
  [weights, voiceRoot, outputRoot].map((directory) =>
    mkdir(directory, { recursive: true }),
  ),
);

const port = await acquireLoopbackPort();
const bootToken = randomBytes(32).toString("base64url");
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(
  python,
  [
    server,
    "--port",
    String(port),
    "--boot-token",
    bootToken,
    "--weights",
    weights,
    "--voice-root",
    voiceRoot,
    "--output-root",
    outputRoot,
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);

let spawnError;
let stdout = "";
let stderr = "";
child.once("error", (error) => {
  spawnError = error;
});
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout = `${stdout}${chunk}`.slice(-32_000);
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-32_000);
});

const workerFailure = (message) => {
  const processStatus = [
    `executable=${path.basename(python)}`,
    `pid=${child.pid ?? "unavailable"}`,
    `exit=${child.exitCode ?? "running"}`,
    `signal=${child.signalCode ?? "none"}`,
    `killed=${child.killed ? "yes" : "no"}`,
  ].join(", ");
  return new Error(
    [
      message,
      `Worker process: ${processStatus}`,
      `Worker stdout:\n${stdout.trim() || "(empty)"}`,
      `Worker stderr:\n${stderr.trim() || "(empty)"}`,
    ].join("\n"),
  );
};

const describeError = (error) => {
  if (!(error instanceof Error)) return String(error);
  const cause =
    error.cause instanceof Error
      ? `; cause=${error.cause.name}: ${error.cause.message}`
      : "";
  return `${error.name}: ${error.message}${cause}`;
};

const post = (route, token, extraHeaders = {}, signal = undefined) =>
  fetch(`${baseUrl}${route}`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: "{}",
  });

const waitUntilReady = async () => {
  const deadline = Date.now() + startupTimeoutMilliseconds;
  let attempts = 0;
  let lastProbeError = "none";
  while (Date.now() < deadline) {
    if (spawnError) {
      throw workerFailure(
        `Could not start Python worker: ${spawnError.message}`,
      );
    }
    if (child.exitCode !== null) {
      throw workerFailure(
        `Worker exited before accepting connections (code ${child.exitCode}).`,
      );
    }
    attempts += 1;
    try {
      const remaining = Math.max(1, deadline - Date.now());
      return await post(
        "/shutdown",
        "not-authorized",
        {},
        AbortSignal.timeout(Math.min(probeTimeoutMilliseconds, remaining)),
      );
    } catch (error) {
      lastProbeError = describeError(error);
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        await delay(Math.min(probeIntervalMilliseconds, remaining));
      }
    }
  }
  throw workerFailure(
    `Worker did not accept loopback connections within ${startupTimeoutMilliseconds / 1_000} seconds after ${attempts} probes. Last probe: ${lastProbeError}`,
  );
};

const waitForExit = (requireSuccess = true) =>
  new Promise((resolve, reject) => {
    const finish = (code) => {
      if (!requireSuccess || code === 0) resolve();
      else
        reject(workerFailure(`Worker exited with code ${code ?? "unknown"}.`));
    };
    if (child.exitCode !== null) {
      finish(child.exitCode);
      return;
    }
    const timeout = setTimeout(
      () => reject(workerFailure("Worker did not shut down.")),
      10_000,
    );
    child.once("exit", (code) => {
      clearTimeout(timeout);
      finish(code);
    });
  });

try {
  const unauthorized = await waitUntilReady();
  const foreignOrigin = await post("/handshake", bootToken, {
    Origin: "http://example.test",
  });
  const handshake = await post("/handshake", bootToken);
  const handshakeBody = await handshake.json();
  const reusedBootToken = await post("/handshake", bootToken);
  const invalidSession = await post("/shutdown", "invalid-session");
  const shutdown = await post("/shutdown", handshakeBody.sessionToken);

  const checks = {
    unauthorized: unauthorized.status === 401,
    foreignOrigin: foreignOrigin.status === 401,
    handshake: handshake.status === 200 && handshakeBody.ok === true,
    reusedBootToken: reusedBootToken.status === 401,
    invalidSession: invalidSession.status === 401,
    shutdown: shutdown.status === 200,
  };
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error(`Worker security check failed: ${JSON.stringify(checks)}`);
  }
  await waitForExit();
  console.log(
    "Worker loopback, origin, one-time token and session checks passed.",
  );
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill();
    await Promise.race([waitForExit(false), delay(5_000)]).catch(
      () => undefined,
    );
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
