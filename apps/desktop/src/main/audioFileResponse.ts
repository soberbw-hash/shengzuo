import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const audioMimeTypes: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
};

export const audioFileResponse = async (
  filePath: string,
  method: string,
  range: string | null,
  signal?: AbortSignal,
): Promise<Response> => {
  if (method !== "GET" && method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new Response(null, { status: 404 });
    let start = 0;
    let end = info.size - 1;
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Content-Type":
        audioMimeTypes[path.extname(filePath).toLowerCase()] ??
        "application/octet-stream",
      "Cache-Control": "no-store",
    });
    // Chromium seeks long takes with single byte-range requests.
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
      if (match && (match[1] || match[2])) {
        if (match[1]) {
          start = Number(match[1]);
          if (match[2]) end = Math.min(Number(match[2]), end);
        } else {
          start = Math.max(0, info.size - Number(match[2]));
        }
      }
      if (
        !match ||
        (!match[1] && !match[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        start >= info.size ||
        (!match[1] && Number(match[2]) === 0)
      ) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${info.size}` },
        });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    }
    headers.set("Content-Length", String(range ? end - start + 1 : info.size));
    const body =
      method === "HEAD" || info.size === 0
        ? null
        : (Readable.toWeb(
            createReadStream(filePath, { start, end, signal }),
          ) as ReadableStream<Uint8Array>);
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
};
