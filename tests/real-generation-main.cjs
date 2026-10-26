// Opt-in REAL-model verification. Never uses the user's project/task store.
// Input documents are test data, not agent instructions. Private scripts stay local.
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} = require("node:fs/promises");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
const { app, net, BrowserWindow } = require("electron");
require("tsx/cjs/api").register();
const {
  registerAudioScheme,
  handleAudioScheme,
} = require("../apps/desktop/src/main/audioProtocol.ts");
registerAudioScheme();
app.on("window-all-closed", () => {});

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const integrationRoot = path.join(root, "artifacts", "integration");
const artifactRoot = option("--reuse-artifacts")
  ? path.resolve(option("--reuse-artifacts"))
  : path.join(
      root,
      "artifacts",
      "integration",
      `release-1.0.1-${randomUUID()}`,
    );
assert.ok(
  artifactRoot.startsWith(integrationRoot + path.sep) &&
    path.basename(artifactRoot).startsWith("release-1.0.1-"),
  "Test data must stay in the integration artifacts folder",
);
app.getAppPath = () => path.join(root, "apps", "desktop");
mkdirSync(artifactRoot, { recursive: true });
app.setPath("userData", artifactRoot);
app.setPath("sessionData", artifactRoot);
let engine;
let cleanupAudio;

const verifyAudioPlayback = async (result) => {
  const response = await net.fetch(result.url, {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 32);
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  window.webContents.setAudioMuted(true);
  try {
    await window.loadURL(
      `data:text/html,${encodeURIComponent(`<audio src="${result.url}" preload="metadata"></audio>`)}`,
    );
    const started = Date.now();
    let ready = false;
    while (Date.now() - started < 15_000) {
      ready = await window.webContents.executeJavaScript(
        "Number.isFinite(document.querySelector('audio').duration) && document.querySelector('audio').duration > 0",
      );
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Production audio protocol failed to load metadata");
    await window.webContents.executeJavaScript(
      "const audio = document.querySelector('audio'); audio.currentTime = audio.duration / 2; audio.play()",
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.ok(
      await window.webContents.executeJavaScript(
        "!audio.paused && audio.currentTime >= audio.duration / 2 && !audio.error",
      ),
      "Production audio playback/seek failed",
    );
  } finally {
    window.destroy();
  }
};

const checksum = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const waitForTask = async (id) => {
  const started = Date.now();
  let lastProgress = -1;
  while (Date.now() - started < 90 * 60 * 1000) {
    const task = (await engine.listTasks()).find((item) => item.id === id);
    assert.ok(task);
    const progress = Math.floor(task.progress / 10);
    if (progress !== lastProgress) {
      process.stdout.write(
        `${JSON.stringify({ taskId: id, status: task.status, progress: task.progress, segment: task.currentSegment, total: task.totalSegments })}\n`,
      );
      lastProgress = progress;
    }
    if (["completed", "failed", "canceled"].includes(task.status)) {
      assert.equal(task.status, "completed", task.message);
      return (await engine.listResults()).find(
        (result) => result.id === task.resultId,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("REAL_GENERATION_TIMEOUT");
};

app
  .whenReady()
  .then(async () => {
    const {
      LocalVoiceEngine,
    } = require("../apps/desktop/src/main/localVoiceEngine.ts");
    const { VoiceStore } = require("../apps/desktop/src/main/voiceStore.ts");
    const {
      readImportedDocument,
    } = require("../apps/desktop/src/main/documentImport.ts");
    await mkdir(artifactRoot, { recursive: true });
    const voicesRoot =
      option("--voices") || path.join(process.env.APPDATA, "声作", "voices");
    const voices = new VoiceStore(voicesRoot);
    const profile = (await voices.list()).find(
      (voice) => voice.name === (option("--voice") || "豆包"),
    );
    assert.ok(profile, "Test voice not found");
    engine = new LocalVoiceEngine(voices);
    cleanupAudio = handleAudioScheme(
      (id) => engine.getResultPath(id),
      () => undefined,
    );
    const base = {
      requestId: `real-${randomUUID()}`,
      modelId: "voxcpm2",
      voiceId: profile.id,
      language: "auto",
      emotion: "自然",
      speed: Number(option("--speed") || 1),
      volume: 100,
      format: "mp3",
      expression: "自然、清晰",
      presetId: "longform",
      voxMode: "controlled",
    };
    const reports = [];
    if (args.includes("--record")) {
      const previous = JSON.parse(await readFile(option("--record"), "utf8"));
      assert.ok(previous.sourceText && previous.sourceText.length > 200);
      const task = await engine.enqueueTask({
        type: "generate",
        request: {
          ...base,
          title: "重复与尾段回归",
          text: previous.sourceText,
        },
      });
      const result = await waitForTask(task.id);
      assert.ok(result && result.durationSeconds > 20);
      await verifyAudioPlayback(result);
      reports.push({ test: "original-problem-script", result });
    }
    if (args.includes("--xlsx")) {
      const document = await readImportedDocument(option("--xlsx"));
      const narrationColumn = Number(option("--column") || 5);
      // This fixture has numbered shots and a dedicated spoken-text column.
      const captions = require("./workbook-narration-fixture.cjs")(
        await readFile(option("--xlsx")),
        narrationColumn,
      );
      assert.ok(
        captions.length >= 50,
        "Workbook narration extraction incomplete",
      );
      for (const caption of captions) {
        assert.ok(
          document.text
            .replace(/\s/gu, "")
            .includes(caption.replace(/\s/gu, "")),
          "Narration must be present in the application's imported document",
        );
      }
      const previousProject =
        option("--project-id") ||
        (args.includes("--reuse-artifacts")
          ? (await engine.listResults()).find(
              (result) =>
                result.title === "用户完整长稿回归" && result.projectId,
            )?.projectId
          : undefined);
      const projectId = previousProject ?? `project-real-${randomUUID()}`;
      const request = {
        ...base,
        title: "用户完整长稿回归",
        kind: "subtitles",
        projectId,
        sourceText: captions.join("\n"),
        pauseMs: 300,
        segments: captions.map((text, index) => ({
          id: `fixture-${index}`,
          text,
          voiceId: profile.id,
          pauseAfterMs: index === 0 ? 900 : 300,
        })),
      };
      const task = await engine.enqueueTask({
        type: "generate-batch",
        projectId,
        request,
      });
      // Exercise canceling queued work without disturbing the active generation.
      const waiting = await engine.enqueueTask({
        type: "generate",
        request: {
          ...base,
          title: "取消等待任务测试",
          text: "这个等待任务不应该生成。",
        },
      });
      await engine.cancelTask(waiting.id);
      assert.equal(
        (await engine.listTasks()).find((item) => item.id === waiting.id)
          ?.status,
        "canceled",
      );
      const result = await waitForTask(task.id);
      assert.ok(result && result.durationSeconds > 200);
      assert.equal(result.quality.checkedSegments, captions.length);
      const outputRoot = path.join(artifactRoot, "outputs", "voxcpm2");
      let cacheFile;
      let before;
      for (const name of await readdir(outputRoot)) {
        if (!name.startsWith("batch-cache-") || !name.endsWith(".json"))
          continue;
        const candidate = JSON.parse(
          await readFile(path.join(outputRoot, name), "utf8"),
        );
        if (candidate.projectId === projectId) {
          cacheFile = name;
          before = candidate;
          break;
        }
      }
      assert.ok(cacheFile && before, "Current project's cache must exist");
      assert.equal(Object.keys(before.segments).length, captions.length);
      const segmentTimes = async (segments) =>
        Promise.all(
          Object.values(segments).map(async (segment) => [
            segment.fileId,
            (await stat(path.join(outputRoot, `${segment.fileId}.mp3`)))
              .mtimeMs,
          ]),
        );
      const beforeTimes = await segmentTimes(before.segments);
      const retry = await engine.enqueueTask({
        type: "generate-batch",
        projectId,
        request,
      });
      const cachedResult = await waitForTask(retry.id);
      const after = JSON.parse(
        await readFile(path.join(outputRoot, cacheFile), "utf8"),
      );
      assert.deepEqual(
        after.segments,
        before.segments,
        "A cache-only rerun must not regenerate segments",
      );
      assert.deepEqual(
        await segmentTimes(after.segments),
        beforeTimes,
        "Cache replay must leave the generated audio files untouched",
      );
      assert.equal(
        await checksum(engine.getResultPath(result.id)),
        await checksum(engine.getResultPath(cachedResult.id)),
      );
      reports.push({
        test: "full-workbook-and-cache",
        captions: captions.length,
        meaningfulCharacters: captions.join("").replace(/\s/gu, "").length,
        result,
        cachedResult,
      });
    }
    assert.ok(reports.length, "Specify --record or --xlsx");
    await writeFile(
      path.join(artifactRoot, "verification.json"),
      JSON.stringify({ reports }, null, 2),
    );
    process.stdout.write(
      `${JSON.stringify({ ok: true, artifactRoot, reports: reports.map(({ test, result }) => ({ test, durationSeconds: result.durationSeconds, quality: result.quality, path: engine.getResultPath(result.id) })) })}\n`,
    );
  })
  .then(async () => {
    cleanupAudio?.();
    await engine?.dispose();
    app.exit(0);
  })
  .catch(async (error) => {
    cleanupAudio?.();
    process.stderr.write(
      `${error instanceof Error ? error.message : "REAL_GENERATION_FAILED"}\n`,
    );
    await engine?.dispose();
    app.exit(1);
  });
