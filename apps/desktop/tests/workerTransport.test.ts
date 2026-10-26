import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { requestLocalWorker } from "../src/main/workerTransport";

void test("worker transport waits for delayed headers, keeps authorization and reports invalid JSON", async () => {
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer test-token");
    assert.equal(req.method, "POST");
    req.resume();
    if (req.url === "/invalid") {
      res.end("not json");
      return;
    }
    setTimeout(
      () => res.end(JSON.stringify({ ok: true, durationSeconds: 9 })),
      100,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    assert.deepEqual(
      await requestLocalWorker(
        address.port,
        "test-token",
        "/generate",
        { text: "local test" },
        2000,
      ),
      { ok: true, durationSeconds: 9 },
    );
    await assert.rejects(
      requestLocalWorker(address.port, "test-token", "/invalid", {}, 2000),
      /INVALID_WORKER_RESPONSE/u,
    );
    await assert.rejects(
      requestLocalWorker(address.port, "test-token", "/generate", {}, 20),
      /WORKER_TIMEOUT/u,
    );
    const controller = new AbortController();
    const pending = requestLocalWorker(
      address.port,
      "test-token",
      "/generate",
      {},
      2000,
      controller.signal,
    );
    controller.abort();
    await assert.rejects(pending, /GENERATION_STOPPED/u);
    await assert.rejects(
      requestLocalWorker(
        address.port,
        "test-token",
        "/generate",
        {},
        2000,
        controller.signal,
      ),
      /GENERATION_STOPPED/u,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
