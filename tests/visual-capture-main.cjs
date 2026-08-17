const { mkdir, rm, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(
  root,
  "artifacts",
  "visual-regression",
  "baseline",
);
const rendererFile = path.join(root, "apps", "desktop", "dist", "index.html");
const scaleArg = process.argv.find((value) => value.startsWith("--scale="));
const groupArg = process.argv.find((value) => value.startsWith("--group="));
const scale = Number(scaleArg?.split("=")[1] || "1");
const group = groupArg?.split("=")[1] || "standard";

app.commandLine.appendSwitch("force-device-scale-factor", String(scale));
app.commandLine.appendSwitch("disable-gpu-sandbox");

const standardScenarios = [
  {
    name: "01-generate-ready",
    route: "/",
    query: "state=ready",
    width: 1440,
    height: 900,
  },
  {
    name: "02-subtitles",
    route: "/subtitles",
    query: "capture=subtitles&state=ready",
    width: 1280,
    height: 800,
  },
  {
    name: "02b-generate-compact",
    route: "/",
    query: "state=ready",
    width: 1280,
    height: 720,
    requireVisibleText: "生成配音",
    requireNoVerticalScroll: true,
  },
  {
    name: "03-dialogue",
    route: "/dialogue",
    query: "state=ready",
    width: 1440,
    height: 900,
  },
  {
    name: "04-voices",
    route: "/voices",
    query: "state=ready",
    width: 1920,
    height: 1080,
  },
  {
    name: "04b-voice-drag",
    route: "/voices?clone=1",
    query: "state=ready",
    width: 1280,
    height: 800,
    requireVisibleText: "选择音频",
  },
  {
    name: "05-projects",
    route: "/projects",
    query: "capture=records&state=ready",
    width: 1280,
    height: 720,
  },
  {
    name: "06-models",
    route: "/models",
    query: "state=ready",
    width: 1440,
    height: 900,
  },
  {
    name: "07-settings",
    route: "/settings",
    query: "state=ready",
    width: 1280,
    height: 800,
    requireVisibleText: "一键检查修复",
  },
  {
    name: "07b-export-naming",
    route: "/settings",
    query: "state=ready&naming=1",
    width: 1280,
    height: 800,
    requireVisibleText: "保存规则",
  },
  {
    name: "07c-check-update",
    route: "/settings",
    query: "state=ready&update=1",
    width: 1280,
    height: 800,
    requireVisibleText: "知道了",
  },
  {
    name: "08-help",
    route: "/help",
    query: "state=ready",
    width: 1280,
    height: 800,
  },
  {
    name: "09-downloading",
    route: "/models",
    query: "state=downloading",
    width: 1280,
    height: 720,
    requireVisibleText: "暂停",
  },
  {
    name: "09b-installing",
    route: "/models",
    query: "state=installing",
    width: 1280,
    height: 720,
    requireVisibleText: "暂停",
  },
  {
    name: "09c-download-paused",
    route: "/models",
    query: "state=download-paused",
    width: 1280,
    height: 720,
    requireVisibleText: "继续",
  },
  {
    name: "09d-download-location",
    route: "/models",
    query: "state=not-installed&download=voxcpm2",
    width: 1280,
    height: 720,
    requireVisibleText: "下载到这里",
  },
  {
    name: "10-generating",
    route: "/",
    query: "state=generating",
    width: 1440,
    height: 900,
  },
  {
    name: "11-error",
    route: "/",
    query: "state=generation-failed",
    width: 1280,
    height: 800,
  },
  {
    name: "12-empty",
    route: "/projects",
    query: "capture=empty&state=ready",
    width: 1280,
    height: 800,
  },
];

const dpiScenarios = [
  {
    name: "14-generate-150-percent",
    route: "/",
    query: "state=ready",
    width: 1280,
    height: 800,
  },
];

const scenarios = group === "dpi" ? dpiScenarios : standardScenarios;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

void app
  .whenReady()
  .then(async () => {
    session.defaultSession.setSpellCheckerEnabled(false);
    if (group === "standard") {
      await rm(outputRoot, { recursive: true, force: true });
    }
    await mkdir(outputRoot, { recursive: true });
    const report = [];
    const consoleErrors = [];
    const window = new BrowserWindow({
      width: scenarios[0]?.width ?? 1280,
      height: scenarios[0]?.height ?? 800,
      show: false,
      frame: false,
      focusable: false,
      skipTaskbar: true,
      useContentSize: true,
      backgroundColor: "#edf5ff",
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) consoleErrors.push(message);
    });
    window.setPosition(-10_000, -10_000, false);
    window.showInactive();

    for (const scenario of scenarios) {
      consoleErrors.length = 0;
      window.setContentSize(scenario.width, scenario.height, false);
      await window.loadFile(rendererFile, {
        query: Object.fromEntries(new URLSearchParams(scenario.query)),
        hash: scenario.route,
      });
      await delay(700);
      let mainOpacity = 0;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        mainOpacity = Number(
          await window.webContents.executeJavaScript(
            "Number.parseFloat(getComputedStyle(document.querySelector('main')).opacity)",
          ),
        );
        if (mainOpacity >= 0.99) break;
        await delay(100);
      }
      const hasContent = await window.webContents.executeJavaScript(
        "document.body.innerText.trim().length > 100",
      );
      if (!hasContent)
        throw new Error(`${scenario.name} rendered blank content`);
      if (mainOpacity < 0.99)
        throw new Error(
          `${scenario.name} page animation did not settle (${mainOpacity})`,
        );
      if (consoleErrors.length > 0) {
        throw new Error(
          `${scenario.name} console errors: ${consoleErrors.join(" | ")}`,
        );
      }
      if (scenario.requireVisibleText) {
        const visible = await window.webContents.executeJavaScript(`(() => {
          const target = [...document.querySelectorAll('button, a')].find(
            (item) => item.textContent?.trim().includes(${JSON.stringify(scenario.requireVisibleText)}),
          );
          if (!target) return false;
          const rect = target.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight && rect.width > 0 && rect.height > 0;
        })()`);
        if (!visible) {
          throw new Error(
            `${scenario.name} did not keep ${scenario.requireVisibleText} visible`,
          );
        }
      }
      if (scenario.requireNoVerticalScroll) {
        const verticalOverflow = await window.webContents.executeJavaScript(
          "Math.max(0, document.querySelector('main').scrollHeight - document.querySelector('main').clientHeight)",
        );
        if (verticalOverflow > 2) {
          throw new Error(
            `${scenario.name} still needs ${verticalOverflow}px of vertical scrolling`,
          );
        }
      }
      const image = await window.webContents.capturePage();
      const fileName = `${scenario.name}-${scenario.width}x${scenario.height}@${scale}x.png`;
      await writeFile(path.join(outputRoot, fileName), image.toPNG());
      report.push({
        name: scenario.name,
        route: scenario.route,
        width: scenario.width,
        height: scenario.height,
        scale,
        fileName,
        hasContent,
        mainOpacity,
        consoleErrors: [...consoleErrors],
      });
      await delay(100);
    }

    await writeFile(
      path.join(outputRoot, `report-${group}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    console.log(
      `Captured ${report.length} ${group} visual baselines at ${scale}x scale.`,
    );
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
