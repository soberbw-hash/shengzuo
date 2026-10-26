import { request } from "node:http";

// A model can take more than five minutes before sending its first byte.
// Node fetch's independent headers timeout must not override the task timeout.
export const requestLocalWorker = (
  port: number,
  token: string,
  route: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> => {
  if (signal?.aborted) return Promise.reject(new Error("GENERATION_STOPPED"));
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const connection = request({
      hostname: "127.0.0.1",
      port,
      path: route,
      method: "POST",
      agent: false,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    });
    const timeout = setTimeout(
      () => connection.destroy(new Error("WORKER_TIMEOUT")),
      timeoutMs,
    );
    const abort = () => connection.destroy(new Error("GENERATION_STOPPED"));
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (code: string) => {
      cleanup();
      reject(new Error(code));
    };
    connection.once("error", (error) =>
      fail(
        [
          "WORKER_TIMEOUT",
          "GENERATION_STOPPED",
          "INVALID_WORKER_RESPONSE",
        ].includes(error.message)
          ? error.message
          : "WORKER_CONNECTION_LOST",
      ),
    );
    connection.once("response", (response) => {
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 512 * 1024)
          connection.destroy(new Error("INVALID_WORKER_RESPONSE"));
        else chunks.push(chunk);
      });
      response.once("error", () => fail("WORKER_CONNECTION_LOST"));
      response.once("end", () => {
        cleanup();
        try {
          const value: unknown = JSON.parse(
            Buffer.concat(chunks).toString("utf8"),
          );
          if (
            typeof value !== "object" ||
            value === null ||
            !("ok" in value) ||
            typeof value.ok !== "boolean"
          ) {
            fail("INVALID_WORKER_RESPONSE");
          } else {
            resolve(value);
          }
        } catch {
          fail("INVALID_WORKER_RESPONSE");
        }
      });
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    connection.end(body);
  });
};
