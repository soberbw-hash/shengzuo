import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import {
  runAudioTool,
  waitForAudioProcessExit,
  killAudioProcessTree,
} from "../src/main/audioToolProcess";

void test("worker exit checks distinguish a running process from a fully stopped process", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    windowsHide: true,
    stdio: "ignore",
  });
  try {
    assert.equal(await waitForAudioProcessExit(child, 50), false);
    killAudioProcessTree(child);
    assert.equal(await waitForAudioProcessExit(child, 5000), true);
    assert.equal(await waitForAudioProcessExit(child, 50), true);
  } finally {
    killAudioProcessTree(child);
  }
});

void test("reads successful tool output and rejects a nonzero exit", async () => {
  assert.equal(
    await runAudioTool(
      process.execPath,
      ["-e", "process.stdout.write('ok')"],
      process.cwd(),
    ),
    "ok",
  );
  await assert.rejects(
    runAudioTool(process.execPath, ["-e", "process.exit(1)"], process.cwd()),
    /AUDIO_CONVERSION_FAILED/u,
  );
});

void test("cancels an active audio tool and rejects already-canceled work", async () => {
  const controller = new AbortController();
  const operation = runAudioTool(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    process.cwd(),
    controller.signal,
  );
  const timer = setTimeout(() => controller.abort(), 150);
  try {
    await assert.rejects(operation, /AUDIO_TOOL_CANCELED/u);
    assert.throws(() =>
      runAudioTool(process.execPath, [], process.cwd(), controller.signal),
    );
  } finally {
    clearTimeout(timer);
  }
});

void test("times out a stalled audio tool", async () => {
  await assert.rejects(
    runAudioTool(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      process.cwd(),
      undefined,
      150,
    ),
    /AUDIO_TOOL_TIMEOUT/u,
  );
});
