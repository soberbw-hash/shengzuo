import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { audioFileResponse } from "../src/main/audioFileResponse";

void test("streams complete audio and seeks with bounded, open and suffix ranges", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shengzuo-range-"));
  const file = path.join(root, "take.mp3");
  try {
    await writeFile(file, "0123456789");
    const full = await audioFileResponse(file, "GET", null);
    assert.equal(full.status, 200);
    assert.equal(await full.text(), "0123456789");
    for (const [range, expected] of [
      ["bytes=2-4", "234"],
      ["bytes=7-", "789"],
      ["bytes=-3", "789"],
      ["bytes=8-99", "89"],
    ]) {
      const response = await audioFileResponse(file, "GET", range!);
      assert.equal(response.status, 206);
      assert.equal(
        response.headers.get("Content-Length"),
        String(expected!.length),
      );
      assert.equal(await response.text(), expected);
    }
    const head = await audioFileResponse(file, "HEAD", "bytes=1-3");
    assert.equal(head.status, 206);
    assert.equal(head.headers.get("Content-Range"), "bytes 1-3/10");
    assert.equal(await head.text(), "");
    for (const range of [
      "bytes=10-",
      "bytes=5-2",
      "bytes=-0",
      "bytes=-",
      "bytes=0-1,5-6",
      "nonsense",
      "bytes=999999999999999999999-",
    ]) {
      const invalid = await audioFileResponse(file, "GET", range);
      assert.equal(invalid.status, 416, range);
      assert.equal(invalid.headers.get("Content-Range"), "bytes */10");
    }
    assert.equal((await audioFileResponse(file, "POST", null)).status, 405);
    assert.equal(
      (await audioFileResponse(path.join(root, "missing.mp3"), "GET", null))
        .status,
      404,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
