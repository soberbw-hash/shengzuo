import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const modelId = process.argv[2];
const language = process.argv[3] ?? "zh";
const smokeText =
  process.env.SHENGZUO_SMOKE_TEXT ??
  "这是声作的真实模型配音测试。声音清楚、自然，并且只在本机生成。";
const smokeExpression = process.env.SHENGZUO_SMOKE_EXPRESSION ?? "自然、清晰";
const smokeLongForm = process.env.SHENGZUO_SMOKE_LONG_FORM === "1";
const smokeGenerationSeed = process.env.SHENGZUO_SMOKE_GENERATION_SEED?.trim();
const requestedVoiceName = process.env.SHENGZUO_SMOKE_VOICE_NAME?.trim();
const voxMode = process.env.SHENGZUO_SMOKE_VOX_MODE?.trim() ?? "controlled";
const voiceDescription =
  process.env.SHENGZUO_SMOKE_VOICE_DESCRIPTION?.trim() ??
  "30岁左右的沉稳男声，音色温暖，吐字清楚，语速自然";
const expectedErrorCode = process.env.SHENGZUO_SMOKE_EXPECT_CODE?.trim();
const configs = {
  voxcpm2: {
    folder: "voxcpm2",
    dataFolder: "voxcpm2",
    weightsDirectory: "VoxCPM2",
  },
  "fun-cosyvoice3-0.5b": {
    folder: "fun-cosyvoice3",
    dataFolder: "fun-cosyvoice3",
  },
  "indextts2-5": {
    folder: "indextts2-5",
    dataFolder: "indextts2-5",
  },
};
const config = configs[modelId];
if (!config)
  throw new Error("用法：node scripts/smoke-local-model.mjs <model-id>");

const workspace = process.cwd();
const userData = path.join(process.env.APPDATA, "声作");
const modelLibrary =
  process.env.SHENGZUO_MODEL_LIBRARY ??
  path.join(
    process.env.LOCALAPPDATA ?? process.env.APPDATA ?? userData,
    "声作模型库",
  );
const dataRoot = path.join(modelLibrary, config.dataFolder);
const pluginLibrary =
  process.env.SHENGZUO_PLUGIN_ROOT ?? path.join(workspace, "engines");
const pluginRoot = path.join(pluginLibrary, config.folder);
const python = path.join(dataRoot, "runtime", "python.exe");
if (!existsSync(python)) throw new Error("MODEL_RUNTIME_NOT_INSTALLED");

const getPort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("NO_PORT"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const isVoxVoiceDesign = modelId === "voxcpm2" && voxMode === "design";
const voiceRoot =
  process.env.SHENGZUO_VOICE_LIBRARY?.trim() || path.join(userData, "voices");
const voiceProfiles = [];
if (!isVoxVoiceDesign) {
  const voiceDirectories = await readdir(voiceRoot, { withFileTypes: true });
  for (const entry of voiceDirectories) {
    if (!entry.isDirectory()) continue;
    const profileRoot = path.join(voiceRoot, entry.name);
    const profile = JSON.parse(
      await readFile(path.join(profileRoot, "profile.json"), "utf8"),
    );
    voiceProfiles.push({ profileRoot, profile });
  }
}
const selectedVoice = requestedVoiceName
  ? voiceProfiles.find(({ profile }) => profile.name === requestedVoiceName)
  : voiceProfiles[0];
if (!selectedVoice && !isVoxVoiceDesign) throw new Error("NO_VOICE_PROFILE");
const profile = selectedVoice?.profile;
const referenceAudio = selectedVoice
  ? path.join(selectedVoice.profileRoot, selectedVoice.profile.sampleFile)
  : undefined;

const outputRoot = path.join(workspace, "artifacts", "integration", modelId);
await mkdir(outputRoot, { recursive: true });
const port = await getPort();
const bootToken = `t_${randomBytes(32).toString("base64url")}`;
const jobId = `smoke-${randomUUID()}`;
const args = [
  path.join(pluginRoot, "worker", "server.py"),
  "--port",
  String(port),
  "--boot-token",
  bootToken,
];
if (config.weightsDirectory) {
  args.push(
    "--weights",
    path.join(dataRoot, "weights", config.weightsDirectory),
  );
} else {
  args.push(
    "--weights-root",
    path.join(dataRoot, "weights"),
    "--source-root",
    path.join(dataRoot, "sources"),
  );
}
args.push("--voice-root", voiceRoot, "--output-root", outputRoot);
const child = spawn(python, args, {
  cwd: pluginRoot,
  windowsHide: true,
  env: {
    ...process.env,
    HF_HUB_OFFLINE: "1",
    HF_HUB_DISABLE_TELEMETRY: "1",
    PYTHONUTF8: "1",
    SHENGZUO_WORKER_DEBUG: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let errorTail = "";
child.stdout.resume();
child.stderr.on("data", (chunk) => {
  errorTail = `${errorTail}${String(chunk)}`.slice(-8_000);
});

const post = async (route, token, payload, timeoutMs) => {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return response.json();
};

try {
  let handshake;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      handshake = await post("/handshake", bootToken, {}, 1_000);
      if (handshake.ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!handshake?.ok) throw new Error(`HANDSHAKE_FAILED\n${errorTail}`);
  const loaded = await post(
    "/load",
    handshake.sessionToken,
    {},
    60 * 60 * 1_000,
  );
  if (!loaded.ok) throw new Error(`LOAD_FAILED:${loaded.code}\n${errorTail}`);
  const generated = await post(
    "/generate",
    handshake.sessionToken,
    {
      jobId,
      text: smokeText,
      expression: smokeExpression,
      language,
      speed: 1,
      volume: 100,
      referenceAudio,
      referenceText: profile?.referenceText ?? "",
      voxMode: modelId === "voxcpm2" ? voxMode : undefined,
      voiceDescription: isVoxVoiceDesign ? voiceDescription : undefined,
      longForm: modelId === "voxcpm2" ? smokeLongForm : undefined,
      generationSeed:
        modelId === "voxcpm2" && smokeGenerationSeed
          ? Number.parseInt(smokeGenerationSeed, 10)
          : undefined,
    },
    2 * 60 * 60 * 1_000,
  );
  if (!generated.ok) {
    if (expectedErrorCode && generated.code === expectedErrorCode) {
      process.stdout.write(
        `${JSON.stringify({
          modelId,
          language,
          voxMode: modelId === "voxcpm2" ? voxMode : undefined,
          ok: true,
          rejectedAsExpected: generated.code,
        })}\n`,
      );
    } else {
      throw new Error(`GENERATION_FAILED:${generated.code}\n${errorTail}`);
    }
  } else {
    process.stdout.write(
      `${JSON.stringify({ modelId, language, voxMode: modelId === "voxcpm2" ? voxMode : undefined, ...generated, output: path.join(outputRoot, generated.fileName) })}\n`,
    );
  }
  await post("/shutdown", handshake.sessionToken, {}, 3_000).catch(
    () => undefined,
  );
} finally {
  if (child.exitCode === null) child.kill();
}
