import assert from "node:assert/strict";
import test from "node:test";

import {
  compareVersions,
  createUpdateCheckResult,
  parseVersion,
} from "../src/main/updateVersion";

void test("release versions accept GitHub tags and portable suffixes", () => {
  assert.deepEqual(parseVersion("v1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseVersion("v1.2.3-portable"), [1, 2, 3]);
  assert.equal(parseVersion("latest"), null);
  assert.equal(compareVersions("1.1.0", "1.0.9"), 1);
  assert.equal(compareVersions("1.0.1", "1.0.1"), 0);
});

void test("update result prefers the Windows portable ZIP", () => {
  const result = createUpdateCheckResult(
    "1.0.0",
    {
      tagName: "v1.0.1",
      name: "声作 1.0.1",
      htmlUrl: "https://github.com/soberbw-hash/shengzuo/releases/tag/v1.0.1",
      assets: [
        { name: "source.zip", downloadUrl: "https://example.test/source.zip" },
        {
          name: "ShengZuo-Windows-Portable-1.0.1.zip",
          downloadUrl: "https://example.test/windows.zip",
        },
      ],
    },
    "2026-08-18T00:00:00.000Z",
  );
  assert.equal(result.status, "available");
  assert.equal(result.latestVersion, "1.0.1");
  assert.equal(result.downloadUrl, "https://example.test/windows.zip");
});
