import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error("LOCALAPPDATA is unavailable.");

const modelLibrary =
  process.env.SHENGZUO_MODEL_LIBRARY ?? path.join(localAppData, "声作模型库");
const runtimeRoot = path.join(modelLibrary, "voxcpm2");
const python = path.join(runtimeRoot, "runtime", "python.exe");
const weights = path.join(runtimeRoot, "weights", "VoxCPM2");
const server = path.resolve("engines/voxcpm2/worker/server.py");
const integrationRoot = path.resolve("artifacts/integration/voxcpm2");

for (const required of [python, weights, server, integrationRoot]) {
  if (!existsSync(required))
    throw new Error(`Missing prerequisite: ${required}`);
}

const port = 48_766;
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
    integrationRoot,
    "--output-root",
    integrationRoot,
  ],
  { windowsHide: true, stdio: "ignore" },
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const post = (route, token, extraHeaders = {}) =>
  fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: "{}",
  });

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await post("/shutdown", "not-authorized");
    } catch {
      await delay(100);
    }
  }
  throw new Error("Worker did not accept loopback connections.");
};

const waitForExit = () =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Worker did not shut down.")),
      10_000,
    );
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Worker exited with code ${code ?? "unknown"}.`));
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
} catch (error) {
  child.kill();
  throw error;
}
