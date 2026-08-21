const { mkdir, rm, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");

const { inspectModelCardsLayout } = require("./model-layout-audit.cjs");
const { inspectTextLayout } = require("./text-layout-audit.cjs");

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
const scenarioArg = process.argv.find((value) =>
  value.startsWith("--scenario="),
);
const scale = Number(scaleArg?.split("=")[1] || "1");
const group = groupArg?.split("=")[1] || "standard";

app.commandLine.appendSwitch("force-device-scale-factor", String(scale));
app.commandLine.appendSwitch("disable-gpu-sandbox");

const standardScenarios = [
  {
    name: "00-product-preview",
    route: "/",
    query: "capture=interaction&state=ready",
    width: 1600,
    height: 900,
    fillInput: {
      selector: ".project-title-field--header input",
      text: "声作产品介绍",
    },
    fillTextArea: {
      id: "script-text",
      text: "欢迎使用声作。这是一款把声音克隆、长稿配音和多人对话放在同一个工作台里的本地创作工具。选择声音和模型，先试听一小段，满意后再生成完整音频。所有录音、文稿和结果默认保存在自己的电脑里。",
    },
    clickText: "试听 30 字",
    waitForSelector: ".compact-generation-result",
    blurAfterActions: true,
    requireVisibleSelector: ".compact-generation-result",
    requireNoVerticalScroll: true,
  },
  {
    name: "01-generate-ready",
    route: "/",
    query: "state=ready",
    width: 1440,
    height: 900,
    fillTextArea: {
      id: "script-text",
      text: "这是一段用来检查常规窗口长稿排版的正式配音文稿。".repeat(32),
    },
    requireNoVerticalScroll: true,
  },
  {
    name: "02-subtitles",
    route: "/subtitles",
    query: "capture=subtitles&state=ready",
    width: 1280,
    height: 720,
    requireVisibleText: "生成完整音轨",
    requireNoVerticalScroll: true,
  },
  {
    name: "02a-pronunciation-dictionary",
    route: "/",
    query: "capture=interaction&state=ready",
    width: 1280,
    height: 720,
    clickSequence: ["发音词典", "添加规则"],
    requireVisibleSelector: ".pronunciation-rule select",
  },
  {
    name: "02c-smart-text",
    route: "/",
    query: "capture=interaction&state=ready",
    width: 1280,
    height: 720,
    closeExistingModals: true,
    fillTextArea: {
      id: "script-text",
      text: "欢迎使用声作，这是一段已经定稿、只需要标注停顿和情绪的配音稿。",
    },
    clickText: "智能处理",
    requireVisibleText: "开始标注",
  },
  {
    name: "02ca-smart-text-applied",
    route: "/",
    query: "capture=interaction&state=ready",
    width: 1280,
    height: 720,
    closeExistingModals: true,
    fillTextArea: {
      id: "script-text",
      text: "欢迎使用声作。这是一段已经定稿的配音稿，请保持自然。",
    },
    clickSequence: ["智能处理", "开始标注", "使用这些标注"],
    requireVisibleSelector: ".performance-annotated-text",
    requireNoVerticalScroll: true,
  },
  {
    name: "02e-dialogue-extraction",
    route: "/",
    query: "capture=interaction&state=ready",
    width: 1280,
    height: 720,
    fillTextArea: {
      id: "script-text",
      text: "【夜晚，车站外】镜头推近。小林：我们出发吧。阿宁：好，现在就走。",
    },
    clickText: "提取台词",
    requireVisibleText: "转到多人对话",
  },
  {
    name: "02f-language-menu",
    route: "/",
    query: "capture=language-menu&state=ready",
    width: 1280,
    height: 720,
    clickAriaLabel: "语言与方言",
    requireVisibleText: "粤语",
  },
  {
    name: "02g-generation-mode-help",
    route: "/subtitles",
    query: "capture=subtitles&state=ready",
    width: 1280,
    height: 720,
    clickAriaLabel: "查看生成策略说明",
    requireVisibleText: "生成完整音轨",
    requireVisibleSelector: ".generation-mode-help__tooltip",
    requireNoVerticalScroll: true,
  },
  {
    name: "02d-api-missing",
    route: "/",
    query: "capture=interaction&state=ready&api=missing",
    width: 1280,
    height: 720,
    focusText: "智能处理",
    requireVisibleText: "智能处理",
  },
  {
    name: "02b-generate-compact",
    route: "/",
    query: "state=ready",
    width: 1280,
    height: 720,
    fillTextArea: {
      id: "script-text",
      text: "这是一段用来检查长稿排版的正式配音文稿。".repeat(24),
    },
    requireVisibleText: "生成配音",
    requireNoVerticalScroll: true,
  },
  {
    name: "02h-vox-voice-design",
    route: "/",
    query: "state=ready",
    width: 1280,
    height: 720,
    fillTextArea: {
      id: "voice-description",
      text: "三十岁左右的沉稳男声，音色温暖可靠，吐字清楚自然，节奏舒缓但不拖沓，适合作为长篇内容的旁白声音。",
    },
    clickText: "描述造声",
    requireVisibleText: "年轻女声",
    requireNoVerticalScroll: true,
  },
  {
    name: "03-dialogue",
    route: "/dialogue",
    query: "capture=interaction&state=ready",
    width: 1280,
    height: 720,
    requireVisibleText: "生成整段对话",
    requireNoVerticalScroll: true,
  },
  {
    name: "03a-dialogue-smart-review",
    route: "/dialogue",
    query: "capture=interaction&state=ready",
    width: 1280,
    height: 720,
    fillTextArea: {
      id: "dialogue-script-input",
      text: "【夜晚，车站外】镜头推近。小林：我们出发吧。阿宁：好，现在就走。",
    },
    clickText: "智能提取角色",
    requireVisibleText: "使用这些台词",
  },
  {
    name: "03b-dialogue-api-missing",
    route: "/dialogue",
    query: "capture=interaction&state=ready&api=missing",
    width: 1280,
    height: 720,
    focusText: "智能提取角色",
    requireVisibleText: "智能提取角色",
  },
  {
    name: "04-voices",
    route: "/voices",
    query: "capture=interaction&state=ready",
    width: 1920,
    height: 1080,
    requireNoVerticalScroll: true,
  },
  {
    name: "04a-voices-compact",
    route: "/voices",
    query: "capture=interaction&state=ready",
    width: 1280,
    height: 720,
    requireNoVerticalScroll: true,
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
    name: "04c-voice-samples",
    route: "/voices",
    query: "capture=interaction&state=ready",
    width: 1280,
    height: 800,
    clickAriaLabel: "管理 测试声音 的参考录音",
    requireVisibleText: "添加并选中",
  },
  {
    name: "05-projects",
    route: "/projects",
    query: "capture=records&state=ready",
    width: 1280,
    height: 720,
    requireVisibleSelector: ".project-records-header",
    requireNoVerticalScroll: true,
  },
  {
    name: "05b-projects-wide",
    route: "/projects",
    query: "capture=records&state=ready",
    width: 1600,
    height: 960,
    requireVisibleSelector: ".project-records-grid .history-audio-row",
    requireNoVerticalScroll: true,
  },
  {
    name: "05c-projects-queue",
    route: "/projects",
    query: "capture=records&state=ready&queue=1",
    width: 1600,
    height: 960,
    requireVisibleSelector: ".project-task-section .task-compact-row",
    requireNoVerticalScroll: true,
  },
  {
    name: "06-models",
    route: "/models",
    query: "state=ready",
    width: 1440,
    height: 900,
    requireCompactModelCards: true,
    requireNoVerticalScroll: true,
  },
  {
    name: "06a-models-compact",
    route: "/models",
    query: "state=ready",
    width: 1280,
    height: 720,
    requireCompactModelCards: true,
    requireNoVerticalScroll: true,
  },
  {
    name: "06b-models-wide",
    route: "/models",
    query: "state=ready",
    width: 1840,
    height: 1024,
    requireCompactModelCards: true,
    requireNoVerticalScroll: true,
  },
  {
    name: "07-settings",
    route: "/settings",
    query: "state=ready",
    width: 1280,
    height: 800,
    requireVisibleText: "一键检查修复",
    requireNoVerticalScroll: true,
  },
  {
    name: "07e-settings-compact",
    route: "/settings",
    query: "state=ready",
    width: 1280,
    height: 720,
    requireVisibleSelector: '[data-setting-section="support"]',
    requireIndependentDonateSection: true,
    requireNoVerticalScroll: true,
  },
  {
    name: "07a-donate",
    route: "/settings",
    query: "state=ready",
    width: 1280,
    height: 720,
    clickText: "支持一下",
    requireVisibleSelector:
      '[role="dialog"][aria-label="支持作者"] .donate-qr-frame img',
    requireIndependentDonateSection: true,
    requireNoVerticalScroll: true,
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
    name: "07d-smart-api",
    route: "/settings",
    query: "state=ready&smart=1",
    width: 1280,
    height: 800,
    requireVisibleText: "保存并验证",
    requireVisibleSelector: '[role="dialog"][aria-label="API配置"]',
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

const selectedScenarioName = scenarioArg?.split("=")[1] || "";
const scenarioGroup = group === "dpi" ? dpiScenarios : standardScenarios;
const scenarios = selectedScenarioName
  ? scenarioGroup.filter((scenario) => scenario.name === selectedScenarioName)
  : scenarioGroup;

if (selectedScenarioName && scenarios.length === 0) {
  throw new Error(`Unknown visual scenario: ${selectedScenarioName}`);
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

void app
  .whenReady()
  .then(async () => {
    session.defaultSession.setSpellCheckerEnabled(false);
    await session.defaultSession.clearStorageData({
      storages: ["localstorage"],
    });
    await session.defaultSession.clearCache();
    if (group === "standard" && !selectedScenarioName) {
      await rm(outputRoot, { recursive: true, force: true });
    }
    await mkdir(outputRoot, { recursive: true });
    const report = [];
    const textLayoutFailures = [];
    const textCoverage = {
      buttons: 0,
      headings: 0,
      descriptions: 0,
      selects: 0,
      modelCards: 0,
      tooltips: 0,
      modals: 0,
      toasts: 0,
    };
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
      if (scenario.closeExistingModals) {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const closed = await window.webContents.executeJavaScript(`(() => {
            const buttons = [...document.querySelectorAll('button[aria-label="关闭弹窗"]')];
            const target = buttons.at(-1);
            if (!(target instanceof HTMLButtonElement)) return false;
            target.click();
            return true;
          })()`);
          if (!closed) break;
          await delay(240);
        }
      }
      if (scenario.clickAriaLabel) {
        const clicked = await window.webContents.executeJavaScript(`(() => {
          const target = [...document.querySelectorAll("[aria-label]")].find(
            (item) => item.getAttribute("aria-label") === ${JSON.stringify(
              scenario.clickAriaLabel,
            )},
          );
          if (!(target instanceof HTMLElement)) return false;
          target.click();
          return true;
        })()`);
        if (!clicked) {
          throw new Error(
            `${scenario.name} could not click ${scenario.clickAriaLabel}`,
          );
        }
        await delay(180);
      }
      if (scenario.fillTextArea) {
        const filled = await window.webContents.executeJavaScript(`(() => {
          const target = document.getElementById(${JSON.stringify(
            scenario.fillTextArea.id,
          )});
          if (!(target instanceof HTMLTextAreaElement)) return false;
          const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          )?.set;
          setter?.call(target, ${JSON.stringify(scenario.fillTextArea.text)});
          target.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        })()`);
        if (!filled) {
          throw new Error(
            `${scenario.name} could not fill ${scenario.fillTextArea.id}`,
          );
        }
        await delay(100);
      }
      if (scenario.fillInput) {
        const filled = await window.webContents.executeJavaScript(`(() => {
          const target = document.querySelector(${JSON.stringify(
            scenario.fillInput.selector,
          )});
          if (!(target instanceof HTMLInputElement)) return false;
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set;
          setter?.call(target, ${JSON.stringify(scenario.fillInput.text)});
          target.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        })()`);
        if (!filled) {
          throw new Error(
            `${scenario.name} could not fill ${scenario.fillInput.selector}`,
          );
        }
        await delay(100);
      }
      if (scenario.focusText) {
        const focused = await window.webContents.executeJavaScript(`(() => {
          const target = [...document.querySelectorAll("button, a")].find(
            (item) => item.textContent?.trim().includes(${JSON.stringify(
              scenario.focusText,
            )}),
          );
          if (!(target instanceof HTMLElement)) return false;
          const focusTarget = target.matches(":disabled")
            ? target.closest(".smart-text-help-trigger")
            : target;
          if (!(focusTarget instanceof HTMLElement)) return false;
          focusTarget.focus();
          return true;
        })()`);
        if (!focused) {
          throw new Error(
            `${scenario.name} could not focus ${scenario.focusText}`,
          );
        }
        await delay(180);
      }
      if (scenario.clickSequence) {
        for (const text of scenario.clickSequence) {
          let clicked = false;
          for (let attempt = 0; attempt < 20 && !clicked; attempt += 1) {
            clicked = await window.webContents.executeJavaScript(`(() => {
              const target = [...document.querySelectorAll("button, a")].find(
                (item) => item.textContent?.trim().includes(${JSON.stringify(text)}),
              );
              if (!(target instanceof HTMLElement)) return false;
              target.click();
              return true;
            })()`);
            if (!clicked) await delay(100);
          }
          if (!clicked) {
            throw new Error(`${scenario.name} could not click ${text}`);
          }
          await delay(220);
        }
      }
      if (scenario.clickSettingRow) {
        const clicked = await window.webContents.executeJavaScript(`(() => {
          const row = [...document.querySelectorAll('.setting-row')].find(
            (item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(
              scenario.clickSettingRow,
            )},
          );
          const target = row?.querySelector('button');
          if (!(target instanceof HTMLButtonElement)) return false;
          target.click();
          return true;
        })()`);
        if (!clicked) {
          throw new Error(
            `${scenario.name} could not click setting row ${scenario.clickSettingRow}`,
          );
        }
        await delay(180);
      }
      if (scenario.clickText) {
        const clicked = await window.webContents.executeJavaScript(`(() => {
          const target = [...document.querySelectorAll("button, a")].find(
            (item) => item.textContent?.trim().includes(${JSON.stringify(
              scenario.clickText,
            )}),
          );
          if (!(target instanceof HTMLElement)) return false;
          target.click();
          return true;
        })()`);
        if (!clicked) {
          throw new Error(
            `${scenario.name} could not click ${scenario.clickText}`,
          );
        }
        await delay(180);
      }
      if (scenario.waitForSelector) {
        let visible = false;
        for (let attempt = 0; attempt < 40 && !visible; attempt += 1) {
          visible = await window.webContents.executeJavaScript(`(() => {
            const target = document.querySelector(${JSON.stringify(
              scenario.waitForSelector,
            )});
            if (!(target instanceof HTMLElement)) return false;
            const rect = target.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })()`);
          if (!visible) await delay(100);
        }
        if (!visible) {
          throw new Error(
            `${scenario.name} did not render ${scenario.waitForSelector}`,
          );
        }
      }
      if (scenario.blurAfterActions) {
        await window.webContents.executeJavaScript(
          "document.activeElement instanceof HTMLElement && document.activeElement.blur()",
        );
        await delay(100);
      }
      const harmonyFontReady = await window.webContents
        .executeJavaScript(`(async () => {
        await document.fonts.ready;
        const family = getComputedStyle(document.documentElement).fontFamily;
        return family.includes("Shengzuo HarmonyOS Sans") &&
          document.fonts.check('12px "Shengzuo HarmonyOS Sans"', "声作鸿蒙字体");
      })()`);
      if (!harmonyFontReady) {
        throw new Error(
          `${scenario.name} did not load the bundled HarmonyOS Sans font`,
        );
      }
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
      if (scenario.requireVisibleSelector) {
        const visible = await window.webContents.executeJavaScript(`(() => {
          const target = document.querySelector(${JSON.stringify(scenario.requireVisibleSelector)});
          if (!(target instanceof HTMLElement)) return false;
          const rect = target.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && rect.width > 0 && rect.height > 0 && target.scrollWidth <= target.clientWidth + 1;
        })()`);
        if (!visible) {
          throw new Error(
            `${scenario.name} did not keep ${scenario.requireVisibleSelector} visible`,
          );
        }
      }
      if (scenario.requireIndependentDonateSection) {
        const donateSection = await window.webContents
          .executeJavaScript(`(() => {
          const page = document.querySelector('.settings-page');
          const grid = document.querySelector('.settings-grid');
          const maintenance = document.querySelector('[data-setting-section="maintenance"]');
          const supportSections = [...document.querySelectorAll('[data-setting-section="support"]')];
          const support = supportSections[0];
          const supportTitle = support?.querySelector('#settings-support-title');
          const supportButton = support?.querySelector('button');
          if (
            !(page instanceof HTMLElement) ||
            !(grid instanceof HTMLElement) ||
            !(maintenance instanceof HTMLElement) ||
            !(support instanceof HTMLElement) ||
            !(supportTitle instanceof HTMLElement) ||
            !(supportButton instanceof HTMLButtonElement)
          ) {
            return {
              ready: false,
              reason: 'missing-settings-section',
              supportCount: supportSections.length,
            };
          }
          const supportRect = support.getBoundingClientRect();
          const gridRect = grid.getBoundingClientRect();
          const checks = {
            oneSupportSection: supportSections.length === 1,
            supportIsOwnPanel: support.matches('.settings-support-panel'),
            supportIsOutsideSettingsGrid: !grid.contains(support),
            supportFollowsSettingsGrid:
              grid.compareDocumentPosition(support) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            panelHasVisibleGap: supportRect.top - gridRect.bottom >= 8,
            panelSpansSettingsWidth:
              Math.abs(supportRect.left - gridRect.left) <= 2 &&
              Math.abs(supportRect.right - gridRect.right) <= 2,
            supportTitleIsClear: supportTitle.textContent?.trim() === '支持作者',
            supportActionIsClear: supportButton.textContent?.includes('支持一下'),
            supportDoesNotBelongToMaintenance: !maintenance.contains(support),
          };
          return {
            ready: Object.values(checks).every(Boolean),
            checks,
            supportCount: supportSections.length,
            verticalGap: Math.round(supportRect.top - gridRect.bottom),
          };
        })()`);
        if (!donateSection.ready) {
          throw new Error(
            `${scenario.name} did not keep author support below the settings grid: ${JSON.stringify(donateSection)}`,
          );
        }
      }
      if (scenario.requireNoVerticalScroll) {
        const verticalLayout = await window.webContents
          .executeJavaScript(`(() => {
          const main = document.querySelector('main.main-scroll');
          const route = main?.querySelector(':scope > .route-content');
          const page = route?.querySelector(':scope > .page-content');
          if (
            !(main instanceof HTMLElement) ||
            !(route instanceof HTMLElement) ||
            !(page instanceof HTMLElement)
          ) {
            return {
              ready: false,
              reason: 'missing-main-route-or-page',
              hasMain: main instanceof HTMLElement,
              hasRoute: route instanceof HTMLElement,
              hasPage: page instanceof HTMLElement,
            };
          }
          const mainRect = main.getBoundingClientRect();
          const routeRect = route.getBoundingClientRect();
          const pageRect = page.getBoundingClientRect();
          const mainOverflow = Math.max(0, main.scrollHeight - main.clientHeight);
          const routeOverflow = Math.max(0, route.scrollHeight - route.clientHeight);
          const pageOverflow = Math.max(0, page.scrollHeight - page.clientHeight);
          const documentOverflow = Math.max(
            0,
            document.documentElement.scrollHeight - document.documentElement.clientHeight,
          );
          const bodyOverflow = Math.max(
            0,
            document.body.scrollHeight - document.body.clientHeight,
          );
          const routeScrolls = /auto|scroll/.test(getComputedStyle(route).overflowY);
          const pageScrolls = /auto|scroll/.test(getComputedStyle(page).overflowY);
          const scrollHintVisible = (() => {
            const hint = document.querySelector('.scroll-more-button');
            if (!(hint instanceof HTMLElement)) return false;
            const rect = hint.getBoundingClientRect();
            const style = getComputedStyle(hint);
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.height > 0;
          })();
          const checks = {
            mainHasNoScrollRange: mainOverflow <= 2,
            routeRootFitsMain:
              routeRect.top >= mainRect.top - 2 && routeRect.bottom <= mainRect.bottom + 2,
            pageRootFitsMain:
              pageRect.top >= mainRect.top - 2 && pageRect.bottom <= mainRect.bottom + 2,
            routeIsNotPageScroller: !routeScrolls || routeOverflow <= 2,
            pageIsNotPageScroller: !pageScrolls || pageOverflow <= 2,
            documentHasNoScrollRange: documentOverflow <= 2,
            bodyHasNoScrollRange: bodyOverflow <= 2,
            noScrollMoreHint: !scrollHintVisible,
          };
          return {
            ready: Object.values(checks).every(Boolean),
            checks,
            overflow: {
              main: mainOverflow,
              route: routeOverflow,
              page: pageOverflow,
              document: documentOverflow,
              body: bodyOverflow,
            },
            rects: {
              main: { top: mainRect.top, bottom: mainRect.bottom, height: mainRect.height },
              route: { top: routeRect.top, bottom: routeRect.bottom, height: routeRect.height },
              page: { top: pageRect.top, bottom: pageRect.bottom, height: pageRect.height },
            },
            viewport: { width: innerWidth, height: innerHeight },
          };
        })()`);
        if (!verticalLayout.ready) {
          throw new Error(
            `${scenario.name} still needs page-level vertical scrolling: ${JSON.stringify(verticalLayout)}`,
          );
        }
      }
      if (scenario.requireCompactModelCards) {
        const modelLayout = await inspectModelCardsLayout(window);
        if (!modelLayout.ready) {
          throw new Error(
            `${scenario.name} model cards are not compact and complete: ${JSON.stringify(modelLayout)}`,
          );
        }
      }
      const textLayout = await inspectTextLayout(window, scenario.name, {
        checkFontPolicy: report.length === 0,
      });
      for (const key of Object.keys(textCoverage)) {
        textCoverage[key] += textLayout.coverage[key] || 0;
      }
      if (!textLayout.ready) {
        textLayoutFailures.push(textLayout);
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

    const missingTextCoverage =
      group === "standard" && !selectedScenarioName
        ? Object.entries(textCoverage)
            .filter(([, count]) => count === 0)
            .map(([surface]) => surface)
        : [];

    await writeFile(
      path.join(outputRoot, `report-${group}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(outputRoot, `text-layout-report-${group}.json`),
      `${JSON.stringify(
        {
          ready:
            missingTextCoverage.length === 0 && textLayoutFailures.length === 0,
          coverage: textCoverage,
          missingCoverage: missingTextCoverage,
          scenarios: textLayoutFailures,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    if (missingTextCoverage.length > 0 || textLayoutFailures.length > 0) {
      throw new Error(
        `Text layout audit failed: ${JSON.stringify({
          missingCoverage: missingTextCoverage,
          coverage: textCoverage,
          scenarios: textLayoutFailures,
        })}`,
      );
    }
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
