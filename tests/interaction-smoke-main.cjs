const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");

const { inspectModelCardsLayout } = require("./model-layout-audit.cjs");
const { inspectTextLayout } = require("./text-layout-audit.cjs");

const root = path.resolve(__dirname, "..");
const rendererFile = path.join(root, "apps", "desktop", "dist", "index.html");
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitFor = async (window, expression, label, timeout = 8_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await delay(100);
  }
  throw new Error(`等待界面超时：${label}`);
};

const clickByText = async (window, text) => {
  const clicked = await window.webContents.executeJavaScript(`(() => {
    const target = [...document.querySelectorAll('button, a')].find(
      (item) => item.textContent?.trim().includes(${JSON.stringify(text)}),
    );
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`没有找到可点击项：${text}`);
};

const load = async (window, route, query) => {
  await window.loadFile(rendererFile, {
    query: Object.fromEntries(new URLSearchParams(query)),
    hash: route,
  });
  await waitFor(
    window,
    "document.querySelector('main') && document.body.innerText.length > 100",
    route,
  );
  await delay(500);
};

const inspectPageVerticalLayout = (window) =>
  window.webContents.executeJavaScript(`(() => {
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

const inspectDynamicCardLayout = (window, cardSelector, requireCompact) =>
  window.webContents.executeJavaScript(`(() => {
    const card = document.querySelector(${JSON.stringify(cardSelector)});
    const actions = card?.querySelector('.batch-generate-actions');
    const preview = card?.querySelector('.preview-scope');
    const players = card
      ? [...card.querySelectorAll('.compact-generation-result, .audio-result-card')]
      : [];
    const player = players.find((item) => {
      if (!(item instanceof HTMLElement)) return false;
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    if (
      !(card instanceof HTMLElement) ||
      !(actions instanceof HTMLElement) ||
      !(preview instanceof HTMLElement) ||
      !(player instanceof HTMLElement)
    ) {
      return {
        ready: false,
        reason: 'missing-card-actions-preview-or-player',
        hasCard: card instanceof HTMLElement,
        hasActions: actions instanceof HTMLElement,
        hasPreview: preview instanceof HTMLElement,
        playerCount: players.length,
      };
    }
    const cardRect = card.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();
    const fullyInside = (child, parent) =>
      child.left >= parent.left - 1 &&
      child.right <= parent.right + 1 &&
      child.top >= parent.top - 1 &&
      child.bottom <= parent.bottom + 1;
    const inViewport = (rect) =>
      rect.left >= 0 &&
      rect.right <= innerWidth &&
      rect.top >= 0 &&
      rect.bottom <= innerHeight;
    const checks = {
      cardInViewport: inViewport(cardRect),
      previewInsideCard: fullyInside(previewRect, cardRect),
      actionsInsideCard: fullyInside(actionsRect, cardRect),
      actionsInViewport: inViewport(actionsRect),
      playerInsideCard: fullyInside(playerRect, cardRect),
      playerInViewport: inViewport(playerRect),
      compactPlayerWhenRequired:
        !${JSON.stringify(requireCompact)} ||
        player.classList.contains('compact-generation-result'),
    };
    return {
      ready: Object.values(checks).every(Boolean),
      checks,
      playerClass: player.className,
      cardOverflow: {
        y: getComputedStyle(card).overflowY,
        range: Math.max(0, card.scrollHeight - card.clientHeight),
      },
      rects: {
        card: { left: cardRect.left, right: cardRect.right, top: cardRect.top, bottom: cardRect.bottom },
        preview: { left: previewRect.left, right: previewRect.right, top: previewRect.top, bottom: previewRect.bottom },
        actions: { left: actionsRect.left, right: actionsRect.right, top: actionsRect.top, bottom: actionsRect.bottom },
        player: { left: playerRect.left, right: playerRect.right, top: playerRect.top, bottom: playerRect.bottom },
      },
      viewport: { width: innerWidth, height: innerHeight },
    };
  })()`);

const assertTextLayoutIntegrity = async (window, label) => {
  const result = await inspectTextLayout(window, label);
  if (!result.ready) {
    throw new Error(
      `${label} 出现文字裁切或无说明的省略：${JSON.stringify(result)}`,
    );
  }
};

const assertModelCardsLayout = async (window, label) => {
  const [modelLayout, pageLayout] = await Promise.all([
    inspectModelCardsLayout(window),
    inspectPageVerticalLayout(window),
  ]);
  if (!modelLayout.ready) {
    throw new Error(
      `${label} 的模型卡片被拉高、内容不完整或高度不一致：${JSON.stringify(modelLayout)}`,
    );
  }
  if (!pageLayout.ready) {
    throw new Error(
      `${label} 的模型页仍需整页滚动：${JSON.stringify(pageLayout)}`,
    );
  }
};

const assertCoreRoutesFit = async (window) => {
  const routes = [
    {
      label: "单段配音",
      route: "/",
      query: "capture=interaction&state=ready",
      text: "这是一段用来检查长稿排版的正式配音文稿，文本输入框可以自己滚动，但整个创作页面不应再需要往下翻。".repeat(
        12,
      ),
    },
    {
      label: "长稿配音",
      route: "/subtitles",
      query: "capture=subtitles&state=ready",
    },
    {
      label: "多人对话",
      route: "/dialogue",
      query: "capture=interaction&state=ready",
    },
    {
      label: "我的声音",
      route: "/voices",
      query: "capture=interaction&state=ready",
    },
    {
      label: "项目与记录",
      route: "/projects",
      query: "capture=records&state=ready",
    },
    { label: "本地模型", route: "/models", query: "state=ready" },
    { label: "设置", route: "/settings", query: "state=ready" },
  ];
  const failures = [];
  for (const entry of routes) {
    await load(window, entry.route, entry.query);
    if (entry.text) {
      const filled = await window.webContents.executeJavaScript(`(() => {
        const target = document.querySelector('#script-text');
        if (!(target instanceof HTMLTextAreaElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        setter?.call(target, ${JSON.stringify(entry.text)});
        target.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      if (!filled) {
        failures.push({
          label: entry.label,
          route: entry.route,
          query: entry.query,
          layout: { ready: false, reason: "setup-failed" },
        });
        continue;
      }
      await delay(120);
    }
    const layout = await inspectPageVerticalLayout(window);
    if (!layout.ready) {
      failures.push({
        label: entry.label,
        route: entry.route,
        query: entry.query,
        layout,
      });
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `1280×720 核心页面仍需整页下滚：${JSON.stringify(failures)}`,
    );
  }
};

void app
  .whenReady()
  .then(async () => {
    session.defaultSession.setSpellCheckerEnabled(false);
    await session.defaultSession.clearStorageData({
      storages: ["localstorage"],
    });
    await session.defaultSession.clearCache();
    const consoleErrors = [];
    const window = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      frame: false,
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

    window.setContentSize(1280, 720, false);
    await assertCoreRoutesFit(window);
    await load(window, "/", "state=ready");
    const sidebarHidesDonate = await window.webContents.executeJavaScript(
      `(() => {
        const sidebar = document.querySelector('.sidebar');
        return sidebar instanceof HTMLElement && !sidebar.textContent?.includes('投喂');
      })()`,
    );
    if (!sidebarHidesDonate) throw new Error("侧栏不应显示投喂入口");
    const compactLayout = await window.webContents.executeJavaScript(`(() => {
      const generate = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.includes('生成配音'),
      );
      const main = document.querySelector('main');
      if (!generate || !main) return { ready: false };
      const rect = generate.getBoundingClientRect();
      const overflow = Math.max(0, main.scrollHeight - main.clientHeight);
      return {
        ready: rect.top >= 0 && rect.bottom <= innerHeight && overflow <= 2,
        buttonTop: Math.round(rect.top),
        buttonBottom: Math.round(rect.bottom),
        innerHeight,
        overflow,
        scrollHeight: main.scrollHeight,
        clientHeight: main.clientHeight,
      };
    })()`);
    if (!compactLayout.ready) {
      throw new Error(
        `1280×720 下创作页仍未完整显示：${JSON.stringify(compactLayout)}`,
      );
    }
    const indexSelected = await window.webContents.executeJavaScript(`(() => {
      const label = [...document.querySelectorAll('label')].find(
        (item) => item.querySelector('.field-label')?.textContent?.trim() === '本地模型',
      );
      const field = label?.querySelector('select');
      if (!(field instanceof HTMLSelectElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(field, 'indextts2-5');
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!indexSelected) throw new Error("1280×720 下无法切换到 IndexTTS-2.5");
    await waitFor(
      window,
      "[...document.querySelectorAll('.performance-controls .field-label')].some((item) => item.textContent?.trim() === '表达要求')",
      "IndexTTS-2.5 表达要求",
    );
    const compactCustomSelected = await window.webContents
      .executeJavaScript(`(() => {
      const label = [...document.querySelectorAll('.performance-controls label')].find(
        (item) => item.querySelector('.field-label')?.textContent?.trim() === '表达要求',
      );
      const field = label?.querySelector('select');
      if (!(field instanceof HTMLSelectElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(field, '__custom__');
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!compactCustomSelected)
      throw new Error("1280×720 下无法选择自定义表达");
    await waitFor(
      window,
      "[...document.querySelectorAll('.performance-controls .field-label')].some((item) => item.textContent?.trim() === '自定义表达')",
      "1280×720 自定义表达输入框",
    );
    const compactCustomLayout = await window.webContents
      .executeJavaScript(`(() => {
      const generate = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.includes('生成配音'),
      );
      const main = document.querySelector('main');
      if (!generate || !main) return { ready: false };
      const rect = generate.getBoundingClientRect();
      const overflow = Math.max(0, main.scrollHeight - main.clientHeight);
      return {
        ready: rect.top >= 0 && rect.bottom <= innerHeight && overflow <= 2,
        overflow,
      };
    })()`);
    if (!compactCustomLayout.ready) {
      throw new Error(
        `1280×720 下自定义表达导致页面溢出：${JSON.stringify(compactCustomLayout)}`,
      );
    }
    window.setContentSize(1280, 800, false);
    await load(window, "/", "capture=interaction&state=ready&api=missing");
    const missingSmartApiState = await window.webContents
      .executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '智能处理',
      );
      const wrapper = button?.closest('.smart-text-help-trigger');
      const tooltip = wrapper?.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(wrapper instanceof HTMLElement) || !(tooltip instanceof HTMLElement)) return false;
      wrapper.focus();
      const style = getComputedStyle(tooltip);
      return button.disabled && Boolean(button.querySelector('.lucide-sparkles')) && style.visibility === 'visible' && tooltip.textContent?.includes('需要先配置 API') && tooltip.textContent?.includes('设置里的“API配置”');
    })()`);
    if (!missingSmartApiState)
      throw new Error("未配置 API 时智能处理没有禁用或说明原因");
    await window.webContents
      .executeJavaScript(`window.dispatchEvent(new CustomEvent('shengzuo:smart-api-config-changed', {
      detail: {
        enabled: true,
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        hasApiKey: true,
        apiKeyStatus: 'ready',
      },
    }))`);
    await waitFor(
      window,
      "[...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '智能处理')?.disabled === false",
      "保存 API配置后立即启用智能处理",
    );
    await load(
      window,
      "/dialogue",
      "capture=interaction&state=ready&api=missing",
    );
    const missingDialogueApiState = await window.webContents
      .executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '智能提取角色',
      );
      const wrapper = button?.closest('.smart-text-help-trigger');
      const tooltip = wrapper?.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(wrapper instanceof HTMLElement) || !(tooltip instanceof HTMLElement)) return false;
      wrapper.focus();
      const style = getComputedStyle(tooltip);
      return button.disabled && Boolean(button.querySelector('.lucide-sparkles')) && style.visibility === 'visible' && tooltip.textContent?.includes('需要先配置 API') && tooltip.textContent?.includes('设置里的“API配置”');
    })()`);
    if (!missingDialogueApiState)
      throw new Error("未配置 API 时智能提取角色没有禁用或说明原因");
    await load(window, "/", "capture=interaction&state=ready");
    const setGenerationModel = async (modelId) => {
      const changed = await window.webContents.executeJavaScript(`(() => {
        const label = [...document.querySelectorAll('label')].find(
          (item) => item.querySelector('.field-label')?.textContent?.trim() === '本地模型',
        );
        const field = label?.querySelector('select');
        if (!(field instanceof HTMLSelectElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(field, ${JSON.stringify(modelId)});
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (!changed) throw new Error(`无法切换模型：${modelId}`);
      await delay(80);
    };
    const layoutWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      show: false,
      frame: false,
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await load(
      layoutWindow,
      "/",
      "capture=interaction&state=ready&layout=vox-modes",
    );
    const captureVoxModeLayout = async (modeLabel) => {
      await clickByText(layoutWindow, modeLabel);
      await waitFor(
        layoutWindow,
        `[...document.querySelectorAll('.vox-mode-picker button')].find((item) => item.textContent?.includes(${JSON.stringify(modeLabel)}))?.getAttribute('aria-selected') === 'true'`,
        `切换到 VoxCPM2 ${modeLabel}`,
      );
      await delay(100);
      return layoutWindow.webContents.executeJavaScript(`(() => {
        const main = document.querySelector('main');
        const modePicker = document.querySelector('.vox-mode-picker');
        const prepareCard = modePicker?.closest('.glass-card');
        const script = document.querySelector('#script-text');
        const inputCard = script?.closest('.glass-card');
        const generate = [...document.querySelectorAll('button')].find(
          (item) => item.textContent?.includes('生成配音'),
        );
        if (!(main instanceof HTMLElement) || !(prepareCard instanceof HTMLElement) || !(inputCard instanceof HTMLElement) || !(script instanceof HTMLElement) || !(generate instanceof HTMLElement)) {
          return { ready: false, reason: 'missing-key-element' };
        }
        const prepareRect = prepareCard.getBoundingClientRect();
        const inputRect = inputCard.getBoundingClientRect();
        const scriptRect = script.getBoundingClientRect();
        const generateRect = generate.getBoundingClientRect();
        const mainOverflowX = Math.max(0, main.scrollWidth - main.clientWidth);
        const mainOverflowY = Math.max(0, main.scrollHeight - main.clientHeight);
        const pageOverflowX = Math.max(
          0,
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        return {
          ready:
            inputRect.top >= 0 &&
            inputRect.bottom <= innerHeight &&
            generateRect.top >= 0 &&
            generateRect.bottom <= innerHeight &&
            mainOverflowX <= 2 &&
            mainOverflowY <= 2 &&
            pageOverflowX <= 2,
          prepareHeight: Math.round(prepareRect.height),
          inputTop: Math.round(inputRect.top),
          inputHeight: Math.round(inputRect.height),
          scriptTop: Math.round(scriptRect.top),
          generateTop: Math.round(generateRect.top),
          generateBottom: Math.round(generateRect.bottom),
          mainOverflowX,
          mainOverflowY,
          pageOverflowX,
          viewport: { width: innerWidth, height: innerHeight },
        };
      })()`);
    };
    const voxModeLayouts = [];
    for (const modeLabel of ["可控克隆", "极致克隆", "描述造声"]) {
      const layout = await captureVoxModeLayout(modeLabel);
      voxModeLayouts.push({ modeLabel, ...layout });
      if (!layout.ready) {
        throw new Error(
          `1280×720 下 ${modeLabel} 布局没有完整显示：${JSON.stringify(layout)}`,
        );
      }
    }
    const voxLayoutBaseline = voxModeLayouts[0];
    const voxLayoutTolerance = 4;
    const unstableVoxModeLayouts = voxModeLayouts
      .slice(1)
      .filter((layout) =>
        [
          "prepareHeight",
          "inputTop",
          "inputHeight",
          "scriptTop",
          "generateTop",
        ].some(
          (metric) =>
            Math.abs(layout[metric] - voxLayoutBaseline[metric]) >
            voxLayoutTolerance,
        ),
      );
    if (unstableVoxModeLayouts.length) {
      throw new Error(
        `切换 VoxCPM2 造声方式导致页面跳动（允许 ${voxLayoutTolerance}px）：${JSON.stringify(voxModeLayouts)}`,
      );
    }
    await captureVoxModeLayout("可控克隆");
    layoutWindow.destroy();
    await clickByText(window, "可控克隆");
    await waitFor(
      window,
      "[...document.querySelectorAll('button')].find((item) => item.textContent?.includes('可控克隆'))?.getAttribute('aria-selected') === 'true'",
      "切换到 VoxCPM2 可控克隆",
    );
    const performanceLabels = () =>
      window.webContents.executeJavaScript(`
        [...document.querySelectorAll('.performance-controls .field-label')]
          .map((item) => item.firstElementChild?.textContent?.trim())
      `);
    let labels = await performanceLabels();
    const voxControls = await window.webContents.executeJavaScript(`(() => {
      const labels = [...document.querySelectorAll('.performance-controls label')];
      const emotion = labels.find((item) => item.querySelector('.field-label')?.firstElementChild?.textContent?.trim() === '情绪');
      const expression = labels.find((item) => item.querySelector('.field-label')?.firstElementChild?.textContent?.trim() === '表达要求');
      return {
        match: emotion?.querySelector('select')?.disabled === true && Boolean(emotion?.querySelector('.lucide-lock-keyhole')) && expression?.querySelector('select')?.disabled === false && !expression?.querySelector('.lucide-lock-keyhole'),
        emotionDisabled: emotion?.querySelector('select')?.disabled,
        emotionLock: Boolean(emotion?.querySelector('.lucide-lock-keyhole')),
        expressionDisabled: expression?.querySelector('select')?.disabled,
        expressionTitle: expression?.querySelector('select')?.title,
        expressionLock: Boolean(expression?.querySelector('.lucide-lock-keyhole')),
        modes: [...document.querySelectorAll('.vox-mode-picker button')].map((item) => ({ text: item.textContent, selected: item.getAttribute('aria-selected') })),
        html: document.querySelector('.performance-controls')?.innerText,
      };
    })()`);
    if (
      !labels.includes("情绪") ||
      !labels.includes("表达要求") ||
      !voxControls.match
    ) {
      throw new Error(
        `VoxCPM2 能力控件不正确：${JSON.stringify({ labels, voxControls })}`,
      );
    }
    const generationChoicesReady = await window.webContents
      .executeJavaScript(`(() => {
      const label = [...document.querySelectorAll('label')].find(
        (item) => item.querySelector('.field-label')?.firstElementChild?.textContent?.trim() === '生成策略',
      );
      const field = label?.querySelector('select');
      if (!(field instanceof HTMLSelectElement)) return false;
      const choices = [...field.options].map((item) => item.textContent?.trim());
      return JSON.stringify(choices) === JSON.stringify(['自然口播', '稳健长稿']);
    })()`);
    if (!generationChoicesReady) throw new Error("生成策略分类仍有重复选项");
    const generationHelpOpened = await window.webContents
      .executeJavaScript(`(() => {
      const help = document.querySelector('.generation-mode-help');
      if (!(help instanceof HTMLElement)) return false;
      help.click();
      return true;
    })()`);
    if (!generationHelpOpened) throw new Error("生成策略说明入口不可点击");
    await waitFor(
      window,
      "document.querySelector('.generation-mode-help__tooltip') instanceof HTMLElement",
      "生成策略说明出现",
    );
    const generationHelpState = await window.webContents
      .executeJavaScript(`(() => {
      const tooltip = document.querySelector('.generation-mode-help__tooltip');
      if (!(tooltip instanceof HTMLElement)) return { ready: false, reason: 'missing' };
      const style = getComputedStyle(tooltip);
      const rect = tooltip.getBoundingClientRect();
      const checks = {
        bodyPortal: tooltip.parentElement === document.body,
        visible: style.visibility === 'visible',
        fixed: style.position === 'fixed',
        inViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        noHorizontalOverflow: tooltip.scrollWidth <= tooltip.clientWidth + 1,
        completeCopy: ['两种策略只能选一种', '自然口播', '稳健长稿', '情绪在下方单独设置'].every((text) => tooltip.textContent?.includes(text)),
      };
      return {
        ready: Object.values(checks).every(Boolean),
        checks,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        viewport: { width: innerWidth, height: innerHeight },
        clientWidth: tooltip.clientWidth,
        scrollWidth: tooltip.scrollWidth,
      };
    })()`);
    if (!generationHelpState.ready) {
      throw new Error(
        `生成策略说明没有完整显示：${JSON.stringify(generationHelpState)}`,
      );
    }
    await clickByText(window, "发音词典");
    await waitFor(
      window,
      "document.querySelector('[role=\"dialog\"][aria-label=\"发音词典\"]')?.textContent?.includes('切换三款模型仍然有效')",
      "打开发音词典",
    );
    await clickByText(window, "添加规则");
    const skipRuleEntered = await window.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="发音词典"]');
      const sourceLabel = [...dialog.querySelectorAll('label')].find(
        (item) => item.querySelector('.field-label')?.textContent?.trim() === '看到这些字',
      );
      const actionLabel = [...dialog.querySelectorAll('label')].find(
        (item) => item.querySelector('.field-label')?.textContent?.trim() === '处理方式',
      );
      const source = sourceLabel?.querySelector('input');
      const action = actionLabel?.querySelector('select');
      if (!(source instanceof HTMLInputElement) || !(action instanceof HTMLSelectElement)) return false;
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      inputSetter.call(source, '（片头备注）');
      source.dispatchEvent(new Event('input', { bubbles: true }));
      const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      selectSetter.call(action, 'skip');
      action.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!skipRuleEntered) throw new Error("无法填写不朗读规则");
    await waitFor(
      window,
      "document.querySelector('[role=\"dialog\"][aria-label=\"发音词典\"]')?.textContent?.includes('不朗读') && ![...document.querySelectorAll('[role=\"dialog\"] button')].find((item) => item.textContent?.trim() === '保存')?.disabled",
      "不朗读规则可以保存",
    );
    const skipRuleSaved = await window.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="发音词典"]');
      const save = [...dialog.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '保存',
      );
      if (!(save instanceof HTMLButtonElement) || save.disabled) return false;
      save.click();
      return true;
    })()`);
    if (!skipRuleSaved) throw new Error("不朗读规则保存按钮不可用");
    await waitFor(
      window,
      "[...document.querySelectorAll('button')].some((item) => item.textContent?.includes('发音词典 1'))",
      "保存不朗读规则",
    );
    for (const modelId of ["voxcpm2", "fun-cosyvoice3-0.5b", "indextts2-5"]) {
      await setGenerationModel(modelId);
      const dictionaryAvailable = await window.webContents
        .executeJavaScript(`(() => {
        const button = [...document.querySelectorAll('button')].find(
          (item) => item.textContent?.includes('发音词典 1'),
        );
        return button instanceof HTMLButtonElement && !button.disabled && !button.querySelector('.lucide-lock-keyhole');
      })()`);
      if (!dictionaryAvailable) {
        throw new Error(`切换 ${modelId} 后朗读规则被错误锁定`);
      }
    }
    await setGenerationModel("voxcpm2");
    await clickByText(window, "发音词典 1");
    await waitFor(
      window,
      "[...document.querySelectorAll('[role=\"dialog\"] select')].some((item) => item.value === 'skip') && [...document.querySelectorAll('[role=\"dialog\"] input')].some((item) => item.value === '（片头备注）')",
      "恢复不朗读规则",
    );
    for (let index = 0; index < 7; index += 1) {
      await clickByText(window, "添加规则");
    }
    const dictionaryLayout = await window.webContents
      .executeJavaScript(`(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="发音词典"]');
      const list = dialog?.querySelector('.pronunciation-rules');
      const save = [...dialog.querySelectorAll('button')].find((item) => item.textContent?.trim() === '保存');
      if (!(dialog instanceof HTMLElement) || !(list instanceof HTMLElement) || !(save instanceof HTMLElement)) return { ready: false };
      const dialogRect = dialog.getBoundingClientRect();
      const saveRect = save.getBoundingClientRect();
      return {
        ready:
          list.scrollHeight > list.clientHeight &&
          list.scrollWidth <= list.clientWidth + 1 &&
          dialogRect.top >= 8 &&
          dialogRect.bottom <= innerHeight - 8 &&
          saveRect.top >= dialogRect.top &&
          saveRect.bottom <= dialogRect.bottom,
        dialogRect: { top: dialogRect.top, bottom: dialogRect.bottom },
        saveRect: { top: saveRect.top, bottom: saveRect.bottom },
        listHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
      };
    })()`);
    if (!dictionaryLayout.ready) {
      throw new Error(
        `发音词典在 1280×720 下没有独立滚动：${JSON.stringify(dictionaryLayout)}`,
      );
    }
    await clickByText(window, "取消");
    await setGenerationModel("indextts2-5");
    const expressionPresetsReady = await window.webContents
      .executeJavaScript(`(() => {
      const label = [...document.querySelectorAll('.performance-controls label')].find(
        (item) => item.querySelector('.field-label')?.textContent?.trim() === '表达要求',
      );
      const field = label?.querySelector('select');
      if (!(field instanceof HTMLSelectElement)) return false;
      const choices = [...field.options].map((item) => item.textContent?.trim());
      if (!['自然清晰', '轻松亲切', '沉稳专业', '温暖柔和', '活泼有感染力', '舒缓克制', '自定义…'].every(
        (item) => choices.includes(item),
      )) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(field, '__custom__');
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!expressionPresetsReady) throw new Error("表达要求预设不完整");
    await waitFor(
      window,
      "[...document.querySelectorAll('.performance-controls .field-label')].some((item) => item.textContent?.trim() === '自定义表达')",
      "展开自定义表达",
    );
    const customExpressionEntered = await window.webContents
      .executeJavaScript(`(() => {
      const label = [...document.querySelectorAll('.performance-controls label')].find(
        (item) => item.querySelector('.field-label')?.textContent?.trim() === '自定义表达',
      );
      const field = label?.querySelector('input');
      if (!(field instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(field, '像朋友聊天，重点处稍作停顿');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!customExpressionEntered) throw new Error("无法填写自定义表达");
    await setGenerationModel("fun-cosyvoice3-0.5b");
    labels = await performanceLabels();
    const cosyControlsLocked = await window.webContents
      .executeJavaScript(`(() => {
      const fields = [...document.querySelectorAll('.performance-controls select')];
      return fields.length === 2 && fields[0].disabled && !fields[1].disabled && document.querySelectorAll('.performance-controls .lucide-lock-keyhole').length === 1;
    })()`);
    if (
      !labels.includes("情绪") ||
      !labels.includes("表达要求") ||
      !cosyControlsLocked
    ) {
      throw new Error(
        `CosyVoice 普通话能力控件不正确：${JSON.stringify(labels)}`,
      );
    }
    const cosyVoiceModeState = await window.webContents
      .executeJavaScript(`(() => {
      const options = [...document.querySelectorAll('.voice-mode-option')];
      const buttons = options.map((item) => item.querySelector('button'));
      const locked = options.filter((item) => item.getAttribute('data-supported') === 'false');
      locked[0]?.focus();
      return {
        optionCount: options.length,
        buttonStates: buttons.map((button) => ({ disabled: button?.disabled, selected: button?.getAttribute('aria-selected') })),
        lockedCount: locked.length,
        lockIcons: locked.map((item) => Boolean(item.querySelector('.lucide-lock-keyhole'))),
      };
    })()`);
    if (
      cosyVoiceModeState.optionCount !== 3 ||
      cosyVoiceModeState.buttonStates[0]?.disabled !== false ||
      cosyVoiceModeState.buttonStates[0]?.selected !== "true" ||
      cosyVoiceModeState.buttonStates[1]?.disabled !== true ||
      cosyVoiceModeState.buttonStates[2]?.disabled !== true ||
      cosyVoiceModeState.lockedCount !== 2 ||
      !cosyVoiceModeState.lockIcons.every(Boolean)
    ) {
      throw new Error(
        `CosyVoice 没有正确锁定极致克隆和描述造声：${JSON.stringify(cosyVoiceModeState)}`,
      );
    }
    await waitFor(
      window,
      "[...document.querySelectorAll('.voice-mode-option__requirement')].some((item) => getComputedStyle(item).visibility === 'visible' && item.textContent?.includes('需要切换到 VoxCPM2'))",
      "克隆方式锁定原因",
    );
    const languageMenuOpened = await window.webContents
      .executeJavaScript(`(() => {
      const root = document.querySelector('.model-language-select');
      const trigger = root?.querySelector('button');
      if (!(trigger instanceof HTMLButtonElement)) return false;
      trigger.click();
      return true;
    })()`);
    if (!languageMenuOpened) throw new Error("无法打开语言与方言菜单");
    await waitFor(
      window,
      "document.querySelector('.model-language-select__menu[role=\"listbox\"]')",
      "语言与方言菜单",
    );
    const languageMenuFits = await window.webContents
      .executeJavaScript(`(() => {
      const menu = document.querySelector('.model-language-select__menu[role="listbox"]');
      if (!(menu instanceof HTMLElement)) return false;
      const rect = menu.getBoundingClientRect();
      const options = [...menu.querySelectorAll('[role="option"]')];
      const unavailable = options.filter((option) => option.getAttribute('aria-disabled') === 'true');
      const locksMatchAvailability = options.every((option) => {
        const locked = Boolean(option.querySelector('.model-language-select__lock'));
        const supported = option.getAttribute('data-supported') === 'true';
        return locked === !supported && (supported || option.textContent?.includes('需要切换到'));
      });
      return rect.top >= 8 && rect.left >= 8 && rect.right <= innerWidth - 8 && rect.bottom <= innerHeight - 8 && menu.scrollHeight > menu.clientHeight && unavailable.length > 0 && locksMatchAvailability && menu.textContent?.includes('没锁可直接用') && menu.textContent?.includes('有锁需切换模型');
    })()`);
    if (!languageMenuFits)
      throw new Error("语言与方言菜单仍被窗口裁切或不能内部滚动");
    const dialectSelected = await window.webContents.executeJavaScript(`(() => {
      const menu = document.querySelector('.model-language-select__menu[role="listbox"]');
      const option = [...menu.querySelectorAll('[role="option"]')].find(
        (item) => item.textContent?.includes('四川话'),
      );
      if (!(option instanceof HTMLButtonElement)) return false;
      option.click();
      return true;
    })()`);
    if (!dialectSelected) throw new Error("无法选择 CosyVoice 四川话");
    await waitFor(
      window,
      "[...document.querySelectorAll('.performance-controls label')].some((item) => item.querySelector('.field-label')?.firstElementChild?.textContent?.trim() === '表达要求' && item.querySelector('select')?.disabled === false)",
      "CosyVoice 方言表达要求",
    );
    await setGenerationModel("indextts2-5");
    labels = await performanceLabels();
    const indexVoiceModesLocked = await window.webContents.executeJavaScript(
      `document.querySelectorAll('.voice-mode-option[data-supported="false"] .lucide-lock-keyhole').length === 2`,
    );
    if (
      !labels.includes("情绪") ||
      !labels.includes("表达要求") ||
      !indexVoiceModesLocked
    ) {
      throw new Error(`IndexTTS 能力控件不正确：${JSON.stringify(labels)}`);
    }
    await setGenerationModel("voxcpm2");
    await clickByText(window, "描述造声");
    await waitFor(
      window,
      "document.querySelector('#voice-description') && document.body.innerText.includes('不用录音，用文字创造声音') && [...document.querySelectorAll('.performance-controls label')].find((item) => item.querySelector('.field-label')?.firstElementChild?.textContent?.trim() === '表达要求')?.querySelector('select')?.disabled === true",
      "VoxCPM2 描述造声入口",
    );
    await clickByText(window, "可控克隆");
    await waitFor(
      window,
      "document.querySelector('#voice-description')?.closest('.voice-source-panel')?.getAttribute('data-active') === 'false' && document.body.innerText.includes('参考录音克隆，可调整语气') && [...document.querySelectorAll('.performance-controls label')].find((item) => item.querySelector('.field-label')?.firstElementChild?.textContent?.trim() === '表达要求')?.querySelector('select')?.disabled === false",
      "VoxCPM2 返回可控克隆",
    );
    const smartPrepared = await window.webContents.executeJavaScript(`(() => {
      const field = document.querySelector('#script-text');
      if (!(field instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, ${JSON.stringify("这是 一个 需要 优化 的文稿")});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!smartPrepared) throw new Error("智能处理测试输入失败");
    const smartTooltipReady = await window.webContents
      .executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '智能处理',
      );
      const tooltip = document.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(tooltip instanceof HTMLElement)) return false;
      button.focus();
      const style = getComputedStyle(tooltip);
      return style.visibility === 'visible' && tooltip.textContent?.includes('不改原文') && tooltip.textContent?.includes('结果会先给你确认');
    })()`);
    if (!smartTooltipReady) throw new Error("智能处理悬停说明没有显示");
    await clickByText(window, "智能处理");
    await waitFor(
      window,
      "document.body.innerText.includes('智能处理停顿与情绪') && document.body.innerText.includes('开始标注')",
      "打开智能处理",
    );
    await clickByText(window, "开始标注");
    await waitFor(
      window,
      "document.body.innerText.includes('原稿未修改') && document.body.innerText.includes('情绪：温暖') && document.body.innerText.includes('短停顿')",
      "智能处理结果",
    );
    const unchangedBeforeApply = await window.webContents.executeJavaScript(
      `document.querySelector('#script-text')?.value === ${JSON.stringify("这是 一个 需要 优化 的文稿")}`,
    );
    if (!unchangedBeforeApply) throw new Error("智能处理修改了原稿");
    await clickByText(window, "使用这些标注");
    await waitFor(
      window,
      `document.body.innerText.includes('已标注 1 段') && document.querySelector('#script-text')?.value === ${JSON.stringify("这是 一个 需要 优化 的文稿")} && document.querySelector('#script-text')?.hidden === true && document.querySelector('.performance-annotated-text')?.textContent?.includes('语气参考：温暖') && document.querySelector('.performance-annotated-text')?.textContent?.includes('停顿：短停顿') && document.querySelector('.performance-annotated-text')?.textContent?.includes('表达：语气温和自然，速度平缓') && document.querySelectorAll('.performance-annotated-text__marks [data-tone]').length === 3`,
      "应用智能处理后显示彩色标注且不修改原稿",
    );
    await clickByText(window, "原文编辑");
    await waitFor(
      window,
      "document.querySelector('#script-text')?.hidden === false && !document.querySelector('.performance-annotated-text')",
      "切回原文编辑",
    );
    await clickByText(window, "标注结果");
    await waitFor(
      window,
      "document.querySelector('#script-text')?.hidden === true && document.querySelector('.performance-annotated-text')",
      "重新查看标注结果",
    );
    await clickByText(window, "原文编辑");
    const singleNarrationPrepared = await window.webContents
      .executeJavaScript(`(() => {
      const field = document.querySelector('#script-text');
      if (!(field instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, '旁白：欢迎收听今天的节目。');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!singleNarrationPrepared) throw new Error("单人台词提取输入失败");
    await clickByText(window, "提取台词");
    await waitFor(
      window,
      `(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="确认角色和台词"]');
        if (!(dialog instanceof HTMLElement)) return false;
        const actions = [...dialog.querySelectorAll('button')].map((button) => button.textContent?.trim());
        return actions.includes('留在单段配音') && actions.includes('转到长稿配音') && !actions.includes('转到多人对话');
      })()`,
      "单人台词提取后的去向选择",
    );
    await clickByText(window, "留在单段配音");
    await waitFor(
      window,
      "location.hash === '#/' && document.querySelector('#script-text')?.value === '欢迎收听今天的节目。' && !document.querySelector('[role=\"dialog\"][aria-label=\"确认角色和台词\"]')",
      "单人台词保留在单段配音",
    );
    const droppedScript = await window.webContents.executeJavaScript(`(() => {
      const dropZone = document.querySelector('.script-file-drop');
      if (!(dropZone instanceof HTMLElement)) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([
        '【夜晚，车站外】\\n镜头推近。\\n小林：我们出发吧。\\n阿宁：好，现在就走。'
      ], '短剧脚本.txt', { type: 'text/plain' }));
      dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return true;
    })()`);
    if (!droppedScript) throw new Error("创作页文字文件拖入失败");
    await waitFor(
      window,
      "document.querySelector('#script-text')?.value.includes('小林：我们出发吧。') && document.body.innerText.includes('已导入 短剧脚本.txt')",
      "文字文件拖入并读取",
    );
    await clickByText(window, "提取台词");
    await waitFor(
      window,
      `(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="确认角色和台词"]');
        if (!(dialog instanceof HTMLElement) || !dialog.textContent?.includes('小林')) return false;
        const actions = [...dialog.querySelectorAll('button')].map((button) => button.textContent?.trim());
        return actions.includes('转到多人对话') && !actions.includes('留在单段配音') && !actions.includes('转到长稿配音');
      })()`,
      "创作页提取角色和台词预览",
    );
    await clickByText(window, "转到多人对话");
    await waitFor(
      window,
      "location.hash === '#/dialogue' && document.querySelectorAll('.dialogue-line-editor').length === 2 && document.querySelector('#dialogue-script-input')?.value === '小林：我们出发吧。\\n阿宁：好，现在就走。'",
      "提取结果转入多人对话",
    );
    await load(window, "/", "capture=interaction&state=ready");
    const previewPrepared = await window.webContents.executeJavaScript(`(() => {
      const field = document.querySelector('#script-text');
      if (!(field instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, '一二三四五六七八九十'.repeat(4));
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!previewPrepared) throw new Error("30 字试听测试输入失败");
    await clickByText(window, "试听 30 字");
    await waitFor(
      window,
      "document.body.innerText.includes('试听内容') && document.querySelector('#script-text')?.selectionEnd === 30",
      "30 字试听范围提示与文本选中",
    );
    await delay(3_000);
    const previewState = await window.webContents.executeJavaScript(`(() => ({
      ready:
        (document.body.innerText.includes('试听好了') || document.body.innerText.includes('试听结果')) &&
        Boolean(document.querySelector('.compact-generation-result, .audio-result-card')),
      status: document.querySelector('.generation-status')?.textContent,
      rightColumn: document.querySelector('.generate-control-column')?.innerText,
    }))()`);
    if (!previewState.ready) {
      throw new Error(`30 字试听结果不正确：${JSON.stringify(previewState)}`);
    }

    const textLimitChecked = await window.webContents
      .executeJavaScript(`(() => {
      const field = document.querySelector('#script-text');
      if (!(field instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, '字'.repeat(2000) + '\\n   字');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!textLimitChecked) throw new Error("单段配音字数测试输入失败");
    await waitFor(
      window,
      "document.body.innerText.includes('2,001 / 2,000 字') && document.body.innerText.includes('已超出 1 字') && [...document.querySelectorAll('button')].some((item) => item.textContent?.includes('生成配音') && item.disabled)",
      "单段配音 2,000 字限制",
    );
    const autoTitlePrepared = await window.webContents
      .executeJavaScript(`(() => {
      const field = document.querySelector('#script-text');
      if (!(field instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, '大家好\\n\\n 我是 小林');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!autoTitlePrepared) throw new Error("自动命名测试输入失败");
    const defaultProjectTitle = await window.webContents.executeJavaScript(`
      document.querySelector('.project-title-field input')?.value ?? ''
    `);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(defaultProjectTitle)) {
      throw new Error(`默认项目名没有包含日期和时间：${defaultProjectTitle}`);
    }
    await clickByText(window, "生成配音");
    await waitFor(
      window,
      "document.body.innerText.includes('已加入任务队列')",
      "自动命名配音入队",
    );
    await waitFor(
      window,
      "document.body.innerText.includes('已经生成') && [...document.querySelectorAll('button')].some((item) => item.textContent?.includes('查看并试听'))",
      "生成完成后的可跳转提醒",
    );
    await clickByText(window, "查看并试听");
    await waitFor(
      window,
      "location.hash.includes('/projects?') && location.hash.includes('result=')",
      "生成完成提醒跳转到对应记录",
    );
    const generatedProjectTitle = await window.webContents.executeJavaScript(`
      document.querySelector('.project-library-item__text strong')?.textContent?.trim() ?? ''
    `);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(generatedProjectTitle)) {
      throw new Error(
        `记录里的默认项目名没有包含日期和时间：${generatedProjectTitle}`,
      );
    }
    await clickByText(window, "单段配音");
    await waitFor(
      window,
      `location.hash === '#/' && document.querySelector('#script-text')?.value === ${JSON.stringify("大家好\n\n 我是 小林")} && !document.body.innerText.includes('继续上次项目')`,
      "生成后返回创作页恢复文稿",
    );
    await delay(3_000);

    await load(window, "/dialogue", "capture=interaction&state=ready");
    const dialogueScriptPrepared = await window.webContents
      .executeJavaScript(`(() => {
      const field = document.querySelector('#dialogue-script-input');
      if (!(field instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, ${JSON.stringify("【夜晚，车站外】\n镜头推近。\n小林（看向远处）：我们出发吧。\n阿宁：好，现在就走。")} );
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!dialogueScriptPrepared) throw new Error("多人对话智能整理输入失败");
    const dialogueTooltipReady = await window.webContents
      .executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '智能提取角色',
      );
      const tooltip = button?.closest('.smart-text-help-trigger')?.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(tooltip instanceof HTMLElement)) return false;
      button.focus();
      const style = getComputedStyle(tooltip);
      return style.visibility === 'visible' && tooltip.textContent?.includes('提取角色与台词') && tooltip.textContent?.includes('删除场景、镜头、动作') && tooltip.textContent?.includes('结果会先给你确认');
    })()`);
    if (!dialogueTooltipReady)
      throw new Error("智能提取角色的用途说明没有显示");
    const directTooltipReady = await window.webContents
      .executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '直接识别',
      );
      const tooltip = button?.closest('.smart-text-help-trigger')?.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(tooltip instanceof HTMLElement)) return false;
      button.focus();
      const style = getComputedStyle(tooltip);
      return style.visibility === 'visible' && tooltip.textContent?.includes('按格式拆分台词') && tooltip.textContent?.includes('不识别场景、动作或其他非台词内容') && tooltip.textContent?.includes('不调用');
    })()`);
    if (!directTooltipReady) throw new Error("直接识别的用途说明没有显示");
    await clickByText(window, "智能提取角色");
    await waitFor(
      window,
      "document.body.innerText.includes('确认角色和台词') && document.body.innerText.includes('已去除') && document.body.innerText.includes('场景描述') && document.body.innerText.includes('小林') && document.body.innerText.includes('我们出发吧。')",
      "多人对话智能整理预览",
    );
    await clickByText(window, "使用这些台词");
    await waitFor(
      window,
      "document.querySelectorAll('.dialogue-line-editor').length === 2 && document.body.innerText.includes('2 个角色，可以继续修改和分配声音') && document.querySelector('#dialogue-script-input')?.value === '小林：我们出发吧。\\n阿宁：好，现在就走。'",
      "应用多人对话智能整理结果",
    );

    const dynamicLayoutFailures = [];
    await clickByText(window, "试听 30 字");
    await waitFor(
      window,
      "Boolean(document.querySelector('.dialogue-role-card .compact-generation-result, .dialogue-role-card .audio-result-card'))",
      "多人对话试听结果",
      8_000,
    );
    const dialogueDynamicLayout = await inspectDynamicCardLayout(
      window,
      ".dialogue-role-card",
      false,
    );
    if (!dialogueDynamicLayout.ready) {
      dynamicLayoutFailures.push({
        page: "多人对话",
        layout: dialogueDynamicLayout,
      });
    }
    await assertTextLayoutIntegrity(window, "多人对话试听结果");

    await load(window, "/subtitles", "capture=interaction&state=ready");
    const subtitleCompactLayout = await window.webContents
      .executeJavaScript(`(() => {
      const action = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.includes('生成完整音轨'),
      );
      const main = document.querySelector('main');
      if (!action || !main) return { ready: false };
      const rect = action.getBoundingClientRect();
      const overflow = Math.max(0, main.scrollHeight - main.clientHeight);
      return {
        ready: rect.top >= 0 && rect.bottom <= innerHeight && overflow <= 2,
        buttonBottom: Math.round(rect.bottom),
        innerHeight,
        overflow,
      };
    })()`);
    if (!subtitleCompactLayout.ready) {
      throw new Error(
        `1280×720 下长稿页仍未完整显示：${JSON.stringify(subtitleCompactLayout)}`,
      );
    }
    await waitFor(
      window,
      "document.querySelectorAll('.subtitle-segment').length === 3",
      "长稿分句",
    );
    await clickByText(window, "提取台词");
    await waitFor(
      window,
      `(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="确认角色和台词"]');
        if (!(dialog instanceof HTMLElement)) return false;
        const actions = [...dialog.querySelectorAll('button')].map((button) => button.textContent?.trim());
        return actions.includes('转到多人对话') && actions.includes('仍用一个声音') && !actions.includes('写入长稿配音');
      })()`,
      "长稿页多人台词提取后的去向选择",
    );
    await clickByText(window, "返回修改");
    await waitFor(
      window,
      "!document.querySelector('[role=\"dialog\"][aria-label=\"确认角色和台词\"]') && document.querySelectorAll('.subtitle-segment').length === 3",
      "关闭长稿页台词提取预览",
    );
    await clickByText(window, "试听 30 字");
    await waitFor(
      window,
      "Boolean(document.querySelector('.subtitle-settings-card .compact-generation-result, .subtitle-settings-card .audio-result-card'))",
      "长稿配音试听结果",
      8_000,
    );
    const subtitleDynamicLayout = await inspectDynamicCardLayout(
      window,
      ".subtitle-settings-card",
      true,
    );
    if (!subtitleDynamicLayout.ready) {
      dynamicLayoutFailures.push({
        page: "长稿配音",
        layout: subtitleDynamicLayout,
      });
    }
    await assertTextLayoutIntegrity(window, "长稿配音试听结果");
    if (dynamicLayoutFailures.length > 0) {
      throw new Error(
        `1280×720 动态生成区域越界：${JSON.stringify(dynamicLayoutFailures)}`,
      );
    }
    const edited = await window.webContents.executeJavaScript(`(() => {
      const field = document.querySelector('textarea[aria-label="第 1 句"]');
      const remove = document.querySelector('button[aria-label="删除第 3 句"]');
      if (!(field instanceof HTMLTextAreaElement) || !(remove instanceof HTMLButtonElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, '自动化修改后的第一句。');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      remove.click();
      return true;
    })()`);
    if (!edited) throw new Error("长稿逐句编辑操作失败");
    await waitFor(
      window,
      "document.querySelectorAll('.subtitle-segment').length === 2",
      "删除一句",
    );
    const subtitleNamed = await window.webContents.executeJavaScript(`(() => {
      const field = document.querySelector('.project-title-field input');
      if (!(field instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(field, '长稿配音项目');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!subtitleNamed) throw new Error("长稿项目命名失败");
    await clickByText(window, "保存项目");
    await waitFor(
      window,
      "document.body.innerText.includes('保存修改')",
      "保存项目",
    );
    await clickByText(window, "生成完整音轨");
    await waitFor(
      window,
      "document.body.innerText.includes('已保存项目并加入队列')",
      "提交任务",
    );
    await clickByText(window, "项目与记录");
    await waitFor(
      window,
      "location.hash.includes('/projects') && document.body.innerText.includes('长稿配音项目') && !document.body.innerText.includes('任务队列')",
      "项目进入记录页且已完成任务不再重复展示",
    );

    await load(window, "/", "capture=interaction&state=generating");
    await clickByText(window, "停止");
    await waitFor(
      window,
      "!document.body.innerText.includes('正在生成配音，请稍候')",
      "取消生成",
    );

    await load(window, "/projects", "capture=records&state=ready");
    window.webContents.focus();
    const creationLauncherFocused = await window.webContents
      .executeJavaScript(`(() => {
      const trigger = [...document.querySelectorAll('button[aria-haspopup="menu"]')]
        .find((button) => button.textContent?.includes('新建配音'));
      if (!(trigger instanceof HTMLButtonElement) || trigger.getAttribute('aria-expanded') !== 'false') return false;
      trigger.focus();
      return document.activeElement === trigger;
    })()`);
    if (!creationLauncherFocused) throw new Error("新建配音菜单无法获得焦点");
    await window.webContents.executeJavaScript(
      "document.activeElement instanceof HTMLButtonElement && document.activeElement.click()",
    );
    await waitFor(
      window,
      `(() => {
        const menu = document.querySelector('.creation-launcher__menu[role="menu"]');
        const trigger = document.querySelector('button[aria-haspopup="menu"][aria-expanded="true"]');
        if (!(menu instanceof HTMLElement) || !(trigger instanceof HTMLButtonElement)) return false;
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        const labels = items.map((item) => item.querySelector('strong')?.textContent?.trim());
        const captions = items.map((item) => item.querySelector('small')?.textContent?.trim());
        return items.length === 3 && labels.join('|') === '单段配音|长稿配音|多人对话' && captions.join('|') === '一段文字 · 一个声音|整篇文稿 · 逐句调整|多个角色 · 分配声音';
      })()`,
      "新建配音三选一菜单",
    );
    await window.webContents.executeJavaScript(
      "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))",
    );
    await waitFor(
      window,
      "!document.querySelector('.creation-launcher__menu') && document.querySelector('button[aria-haspopup=\"menu\"]')?.getAttribute('aria-expanded') === 'false'",
      "键盘关闭新建配音菜单",
    );
    await clickByText(window, "新建配音");
    await waitFor(
      window,
      "Boolean(document.querySelector('.creation-launcher__menu'))",
      "重新打开新建配音菜单",
    );
    await window.webContents.executeJavaScript(
      "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))",
    );
    await waitFor(
      window,
      "!document.querySelector('.creation-launcher__menu')",
      "点击菜单外关闭新建配音菜单",
    );
    await clickByText(window, "新建配音");
    const longformChoiceOpened = await window.webContents
      .executeJavaScript(`(() => {
      const item = [...document.querySelectorAll('.creation-launcher__menu [role="menuitem"]')]
        .find((button) => button.querySelector('strong')?.textContent?.trim() === '长稿配音');
      if (!(item instanceof HTMLButtonElement)) return false;
      item.click();
      return true;
    })()`);
    if (!longformChoiceOpened) throw new Error("新建配音菜单无法选择长稿配音");
    await waitFor(
      window,
      "location.hash === '#/subtitles'",
      "从新建配音菜单进入长稿配音",
    );
    await load(window, "/projects", "capture=records&state=ready");
    const projectFiltered = await window.webContents.executeJavaScript(`(() => {
      const project = document.querySelector('.project-library-item__open');
      if (!(project instanceof HTMLButtonElement)) return false;
      project.click();
      return true;
    })()`);
    if (!projectFiltered) throw new Error("没有找到可选择的项目");
    await waitFor(
      window,
      "document.querySelector('.project-records-header h2')?.textContent?.includes('新品介绍字幕') && document.querySelectorAll('.project-records-grid .history-audio-row').length === 1",
      "按项目筛选录音版本",
    );
    const allRecordsSelected = await window.webContents
      .executeJavaScript(`(() => {
      const allRecords = document.querySelector('.project-library-all');
      if (!(allRecords instanceof HTMLButtonElement)) return false;
      allRecords.click();
      return true;
    })()`);
    if (!allRecordsSelected) throw new Error("没有找到全部录音入口");
    await waitFor(
      window,
      "document.querySelector('.project-records-header h2')?.textContent?.includes('全部生成记录') && document.querySelectorAll('.project-records-grid .history-audio-row').length === 4",
      "恢复查看全部录音",
    );
    await assertTextLayoutIntegrity(window, "项目与生成记录");
    const exported = await window.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('button[aria-label="导出音频"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    if (!exported) throw new Error("没有找到导出按钮");
    await waitFor(
      window,
      "document.body.innerText.includes('音频已导出')",
      "导出音频",
    );

    await load(window, "/projects", "capture=records&state=ready&queue=1");
    const retriedFailedTask = await window.webContents
      .executeJavaScript(`(() => {
      const failedRow = [...document.querySelectorAll('.task-compact-row')]
        .find((row) => row.textContent.includes('未完成'));
      const retry = failedRow
        ? [...failedRow.querySelectorAll('button')]
            .find((button) => button.textContent.includes('重试'))
        : null;
      if (!(retry instanceof HTMLButtonElement)) return false;
      retry.click();
      return true;
    })()`);
    if (!retriedFailedTask) throw new Error("失败任务没有可用的重试入口");
    await waitFor(
      window,
      "document.body.innerText.includes('生成失败') && [...document.querySelectorAll('button')].some((item) => item.textContent?.includes('查看任务'))",
      "失败任务立即显示可跳转提醒",
    );
    await clickByText(window, "查看任务");
    await waitFor(
      window,
      "location.hash.includes('task=task-failed-preview') && document.querySelector('[data-task-id=\"task-failed-preview\"]')?.getAttribute('data-highlighted') === 'true'",
      "失败提醒跳转并定位对应任务",
    );
    const removableTask = await window.webContents.executeJavaScript(`(() => {
      const rows = [...document.querySelectorAll('.task-compact-row')];
      const activeRowsAreProtected = rows
        .filter((row) => row.textContent.includes('生成中') || row.textContent.includes('等待中'))
        .every((row) => ![...row.querySelectorAll('button')].some((button) => button.textContent.includes('移除')));
      const failedRow = rows.find((row) => row.textContent.includes('未完成'));
      const remove = failedRow
        ? [...failedRow.querySelectorAll('button')].find((button) => button.textContent.includes('移除'))
        : null;
      if (!activeRowsAreProtected || !(remove instanceof HTMLButtonElement)) return false;
      remove.click();
      return true;
    })()`);
    if (!removableTask) throw new Error("失败任务没有可用的移除入口");
    await waitFor(
      window,
      "!document.querySelector('[data-task-id=\"task-failed-preview\"]') && document.body.innerText.includes('任务已从队列移除')",
      "移除失败旧任务",
    );

    window.setContentSize(1280, 720, false);
    await load(window, "/models", "state=ready");
    await assertModelCardsLayout(window, "1280×720");
    await assertTextLayoutIntegrity(window, "1280×720 模型卡片");

    for (const modelName of [
      "VoxCPM2",
      "Fun-CosyVoice3 0.5B 2512",
      "IndexTTS-2.5",
    ]) {
      const opened = await window.webContents.executeJavaScript(`(() => {
        const card = [...document.querySelectorAll('.model-card')].find(
          (item) => item.querySelector('h3')?.textContent?.trim() === ${JSON.stringify(modelName)},
        );
        const button = card?.querySelector('.model-license-button');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`);
      if (!opened) throw new Error(`${modelName} 没有可用的许可证入口`);
      await waitFor(
        window,
        `(() => {
          const dialog = document.querySelector('[role="dialog"][aria-label=${JSON.stringify(`${modelName} 许可证`)}]');
          const license = dialog?.querySelector('.model-license-content strong')?.textContent?.trim();
          return dialog instanceof HTMLElement && Boolean(license) && license !== '未找到许可证' && dialog.textContent?.includes('完整许可文件');
        })()`,
        `${modelName} 许可证内容`,
      );
      const closed = await window.webContents.executeJavaScript(`(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label=${JSON.stringify(`${modelName} 许可证`)}]');
        const button = dialog?.querySelector('[aria-label="关闭弹窗"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`);
      if (!closed) throw new Error(`${modelName} 许可证弹窗无法关闭`);
      await waitFor(
        window,
        `!document.querySelector('[role="dialog"][aria-label=${JSON.stringify(`${modelName} 许可证`)}]')`,
        `关闭 ${modelName} 许可证`,
      );
    }

    window.setContentSize(1840, 1024, false);
    await load(window, "/models", "state=ready");
    await assertModelCardsLayout(window, "1840×1024");
    await assertTextLayoutIntegrity(window, "1840×1024 模型卡片");

    window.setContentSize(1280, 800, false);
    await load(window, "/models", "state=downloading");
    await clickByText(window, "暂停");
    await waitFor(
      window,
      "document.body.innerText.includes('继续') && document.body.innerText.includes('已暂停')",
      "暂停模型下载",
    );
    await clickByText(window, "继续");
    await waitFor(
      window,
      "document.body.innerText.includes('暂停') && document.body.innerText.includes('正在下载')",
      "继续模型下载",
    );

    await load(window, "/models", "state=installing");
    await clickByText(window, "暂停");
    await waitFor(
      window,
      "document.body.innerText.includes('继续') && document.body.innerText.includes('已暂停')",
      "暂停模型安装",
    );
    await assertTextLayoutIntegrity(window, "模型下载与安装状态");

    await load(window, "/voices", "capture=interaction&state=ready");
    await clickByText(window, "试听");
    await waitFor(
      window,
      "[...document.querySelectorAll('button')].some((item) => item.textContent?.includes('暂停'))",
      "已创建声音可直接试听",
    );
    await clickByText(window, "暂停");
    const renameStarted = await window.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('button[aria-label="重命名声音 测试声音"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    if (!renameStarted) throw new Error("没有找到声音重命名入口");
    const renamed = await window.webContents.executeJavaScript(`(() => {
      const field = document.querySelector('input[aria-label="修改声音名称 测试声音"]');
      if (!(field instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(field, '旁白声音');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      const save = document.querySelector('button[aria-label="保存声音名称"]');
      if (!(save instanceof HTMLButtonElement)) return false;
      save.click();
      return true;
    })()`);
    if (!renamed) throw new Error("声音重命名操作失败");
    await waitFor(
      window,
      "document.body.innerText.includes('旁白声音') && document.body.innerText.includes('声音名称已修改')",
      "保存声音名称",
    );
    await assertTextLayoutIntegrity(window, "声音重命名提示");
    await clickByText(window, "克隆声音");
    const dropped = await window.webContents.executeJavaScript(`(() => {
      const target = document.querySelector('.clone-upload');
      if (!(target instanceof HTMLDivElement)) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(2048)], '拖入的录音.wav', { type: 'audio/wav' }));
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return true;
    })()`);
    if (!dropped) throw new Error("录音拖入操作失败");
    await waitFor(
      window,
      "document.body.innerText.includes('拖入的录音.wav') && document.body.innerText.includes('时长 8.0 秒') && document.querySelector('.sample-audio-preview audio')",
      "拖入录音、完成检查并显示试听播放器",
    );

    window.setContentSize(1280, 720, false);
    await load(window, "/settings", "state=ready");
    const donateSectionLayout = await window.webContents
      .executeJavaScript(`(() => {
      const page = document.querySelector('.settings-page');
      const grid = document.querySelector('.settings-grid');
      const maintenance = document.querySelector('[data-setting-section="maintenance"]');
      const supportSections = [...document.querySelectorAll('[data-setting-section="support"]')];
      const support = supportSections[0];
      const supportTitle = support?.querySelector('#settings-support-title');
      const supportButton = support?.querySelector('button');
      const main = document.querySelector('main.main-scroll');
      if (
        !(page instanceof HTMLElement) ||
        !(grid instanceof HTMLElement) ||
        !(maintenance instanceof HTMLElement) ||
        !(support instanceof HTMLElement) ||
        !(supportTitle instanceof HTMLElement) ||
        !(supportButton instanceof HTMLButtonElement) ||
        !(main instanceof HTMLElement)
      ) {
        return {
          ready: false,
          reason: 'missing-settings-section',
          supportCount: supportSections.length,
        };
      }
      const supportRect = support.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const maintenanceRect = maintenance.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
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
        donateSectionIsVisible:
          supportRect.top >= mainRect.top - 2 &&
          supportRect.bottom <= mainRect.bottom + 2 &&
          supportRect.width > 0 &&
          supportRect.height > 0,
      };
      return {
        ready: Object.values(checks).every(Boolean),
        checks,
        supportCount: supportSections.length,
        supportRect: {
          top: Math.round(supportRect.top),
          bottom: Math.round(supportRect.bottom),
          height: Math.round(supportRect.height),
        },
        maintenanceRect: {
          top: Math.round(maintenanceRect.top),
          bottom: Math.round(maintenanceRect.bottom),
          height: Math.round(maintenanceRect.height),
        },
        mainRect: {
          top: Math.round(mainRect.top),
          bottom: Math.round(mainRect.bottom),
          height: Math.round(mainRect.height),
        },
      };
    })()`);
    if (!donateSectionLayout.ready) {
      throw new Error(
        `支持作者应是设置主体下方的独立分区：${JSON.stringify(donateSectionLayout)}`,
      );
    }
    const settingsCompactLayout = await inspectPageVerticalLayout(window);
    if (!settingsCompactLayout.ready) {
      throw new Error(
        `1280×720 设置页仍需整页下滚：${JSON.stringify(settingsCompactLayout)}`,
      );
    }
    const donateSettingsOpened = await window.webContents
      .executeJavaScript(`(() => {
      const button = document.querySelector('[data-setting-section="support"] button');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    if (!donateSettingsOpened) throw new Error("设置中没有找到支持作者入口");
    await waitFor(
      window,
      'document.querySelector(\'[role="dialog"][aria-label="支持作者"] .donate-qr-frame img\')?.complete && document.querySelector(\'[role="dialog"][aria-label="支持作者"] .donate-qr-frame img\')?.naturalWidth > 0 && document.body.innerText.includes(\'微信扫码支持\')',
      "设置中的支持作者收款码",
    );
    const donateSettingsClosed = await window.webContents
      .executeJavaScript(`(() => {
      const close = document.querySelector('[role="dialog"][aria-label="支持作者"] [aria-label="关闭弹窗"]');
      if (!(close instanceof HTMLButtonElement)) return false;
      close.click();
      return true;
    })()`);
    if (!donateSettingsClosed) throw new Error("设置中的支持作者弹窗无法关闭");
    await waitFor(
      window,
      '!document.querySelector(\'[role="dialog"][aria-label="支持作者"]\')',
      "关闭设置中的支持作者弹窗",
    );
    window.setContentSize(1280, 800, false);
    await delay(120);
    const smartSettingsOpened = await window.webContents
      .executeJavaScript(`(() => {
      const row = [...document.querySelectorAll('.setting-row')].find(
        (item) => item.querySelector('strong')?.textContent?.trim() === 'API配置',
      );
      const button = row?.querySelector('button');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    if (!smartSettingsOpened) throw new Error("没有找到 API配置入口");
    await waitFor(
      window,
      "document.body.innerText.includes('API配置') && document.body.innerText.includes('Base URL') && document.body.innerText.includes('Model') && document.body.innerText.includes('API Key') && document.body.innerText.includes('保存并验证') && !document.body.innerText.includes('启用智能文稿') && !document.body.innerText.includes('删除已保存的密钥') && document.querySelector('input[placeholder=\"已保存；如需更换，请输入新的 API Key\"]')",
      "API配置",
    );
    await clickByText(window, "保存并验证");
    await waitFor(
      window,
      "document.body.innerText.includes('API配置已保存') && document.body.innerText.includes('API 连接成功') && !document.querySelector('[role=\"dialog\"][aria-label=\"API配置\"]')",
      "测试 API配置",
    );
    await clickByText(window, "修改规则");
    const namingEdited = await window.webContents.executeJavaScript(`(() => {
      const field = document.querySelector('input[aria-label="文件命名规则"]');
      if (!(field instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(field, '{项目}_{类型}_{日期}');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!namingEdited) throw new Error("导出命名规则编辑失败");
    await waitFor(
      window,
      "document.body.innerText.includes('产品介绍_单段配音_2026-08-17.mp3')",
      "导出命名预览",
    );
    await clickByText(window, "保存规则");
    await waitFor(
      window,
      "document.body.innerText.includes('文件命名规则已保存')",
      "保存导出命名规则",
    );
    await clickByText(window, "检查更新");
    await waitFor(
      window,
      "document.body.innerText.includes('当前已是最新版本') && document.body.innerText.includes('最新版本 1.0.0')",
      "检查更新结果",
    );
    await clickByText(window, "知道了");
    await clickByText(window, "一键检查修复");
    await waitFor(
      window,
      "document.querySelector('.system-check-list') && document.body.innerText.includes('检查完成 · 一切正常')",
      "检查与修复结果",
    );
    await assertTextLayoutIntegrity(window, "检查修复弹窗");
    await clickByText(window, "完成");

    if (consoleErrors.length) {
      throw new Error(`界面控制台错误：${consoleErrors.join(" | ")}`);
    }
    console.log(
      "Interaction smoke passed: creation-workflow-menu/workflow-choice-routing/donate-settings-dialog/sidebar-donate-hidden/compact-layout/dynamic-card-containment/model-capabilities/vox-mode-layout-stability/vox-voice-design/language-menu-fit/expression-presets-custom/smart-performance-markers/script-file-drop/dialogue-extraction-transfer/smart-dialogue-review/smart-api-gating/smart-api-live-sync/smart-api-settings/30-char-preview/text-limit/auto-title/draft-return/import/edit/delete/save/generate/cancel/recovery-store/project-filter/export/export-naming/download-pause-resume/voice-preview/voice-rename/audio-drop-preview/update-check/system-check.",
    );
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
