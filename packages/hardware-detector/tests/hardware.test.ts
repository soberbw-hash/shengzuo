import assert from "node:assert/strict";
import test from "node:test";

import { createCpuProfile, parseNvidiaLine } from "../src/index";

void test("parses nvidia-smi output into a CUDA hardware profile", () => {
  const profile = parseNvidiaLine(
    "NVIDIA GeForce RTX 4070, 591.74, 12282",
    31.8,
  );
  assert.equal(profile.computeMode, "cuda");
  assert.equal(profile.gpuName, "NVIDIA GeForce RTX 4070");
  assert.equal(profile.nvidiaDriver, "591.74");
  assert.equal(profile.vramGb, 12);
  assert.match(profile.summary, /CUDA/u);
});

void test("falls back to an explicit CPU profile without a compatible GPU", () => {
  const profile = createCpuProfile(16);
  assert.equal(profile.computeMode, "cpu");
  assert.match(profile.gpuName, /未检测到/u);
  assert.match(profile.summary, /能够运行.*变慢/u);
});
