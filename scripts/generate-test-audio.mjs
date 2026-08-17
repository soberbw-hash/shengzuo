import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Mp3Encoder } from "@breezystack/lamejs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "apps",
  "desktop",
  "public",
  "mock-audio",
  "preview.mp3",
);
const sampleRate = 44_100;
const durationSeconds = 2;
const sampleCount = sampleRate * durationSeconds;
const samples = new Int16Array(sampleCount);

// This short confirmation tone is used only by deterministic visual/test states.
// Normal UI paths never present it as cloned speech.
for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const active = (time > 0.2 && time < 0.48) || (time > 0.72 && time < 1.08);
  if (!active) continue;
  const localTime = time < 0.48 ? time - 0.2 : time - 0.72;
  const duration = time < 0.48 ? 0.28 : 0.36;
  const frequency = time < 0.48 ? 523.25 : 659.25;
  const envelope = Math.sin((Math.PI * localTime) / duration) ** 2;
  samples[index] = Math.round(
    Math.sin(2 * Math.PI * frequency * time) * envelope * 7_500,
  );
}

const encoder = new Mp3Encoder(1, sampleRate, 128);
const chunks = [];
for (let offset = 0; offset < samples.length; offset += 1_152) {
  const encoded = encoder.encodeBuffer(
    samples.subarray(offset, offset + 1_152),
  );
  if (encoded.length > 0) chunks.push(Buffer.from(encoded));
}
const flushed = encoder.flush();
if (flushed.length > 0) chunks.push(Buffer.from(flushed));
const buffer = Buffer.concat(chunks);

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, buffer);
console.log(`Generated ${output} (${durationSeconds}s MP3 test tone)`);
