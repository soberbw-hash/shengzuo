import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(
  root,
  "apps",
  "desktop",
  "public",
  "mock-audio",
  "preview.mp3",
);
const buffer = await readFile(input);
const hasId3Header = buffer.subarray(0, 3).toString("ascii") === "ID3";
const hasFrameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;

assert.ok(hasId3Header || hasFrameSync, "Expected an MP3 header or frame sync");
assert.ok(buffer.length > 10_000);

console.log(`Verified MP3 test audio: ${buffer.length} bytes`);
