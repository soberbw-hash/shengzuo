const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");

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

void app
  .whenReady()
  .then(async () => {
    session.defaultSession.setSpellCheckerEnabled(false);
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
    await load(window, "/", "state=ready");
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
    await load(
      window,
      "/dialogue",
      "capture=interaction&state=ready&api=missing",
    );
    const missingDialogueApiState = await window.webContents
      .executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '智能整理脚本',
      );
      const wrapper = button?.closest('.smart-text-help-trigger');
      const tooltip = wrapper?.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(wrapper instanceof HTMLElement) || !(tooltip instanceof HTMLElement)) return false;
      wrapper.focus();
      const style = getComputedStyle(tooltip);
      return button.disabled && Boolean(button.querySelector('.lucide-sparkles')) && style.visibility === 'visible' && tooltip.textContent?.includes('需要先配置 API') && tooltip.textContent?.includes('设置里的“API配置”');
    })()`);
    if (!missingDialogueApiState)
      throw new Error("未配置 API 时智能整理脚本没有禁用或说明原因");
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
    const performanceLabels = () =>
      window.webContents.executeJavaScript(`
        [...document.querySelectorAll('.performance-controls .field-label')]
          .map((item) => item.firstElementChild?.textContent?.trim())
      `);
    let labels = await performanceLabels();
    if (labels.includes("情绪") || !labels.includes("表达要求")) {
      throw new Error(`VoxCPM2 能力控件不正确：${JSON.stringify(labels)}`);
    }
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
    if (labels.length !== 0) {
      throw new Error(
        `CosyVoice 普通话不应显示表演控件：${JSON.stringify(labels)}`,
      );
    }
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
      "document.querySelector('.model-language-select [role=\"listbox\"]')",
      "语言与方言菜单",
    );
    const dialectSelected = await window.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('.model-language-select');
      const option = [...root.querySelectorAll('[role="option"]')].find(
        (item) => item.textContent?.includes('四川话'),
      );
      if (!(option instanceof HTMLButtonElement)) return false;
      option.click();
      return true;
    })()`);
    if (!dialectSelected) throw new Error("无法选择 CosyVoice 四川话");
    await waitFor(
      window,
      "[...document.querySelectorAll('.performance-controls .field-label')].some((item) => item.textContent?.trim() === '表达要求')",
      "CosyVoice 方言表达要求",
    );
    await setGenerationModel("indextts2-5");
    labels = await performanceLabels();
    if (!labels.includes("情绪") || !labels.includes("表达要求")) {
      throw new Error(`IndexTTS 能力控件不正确：${JSON.stringify(labels)}`);
    }
    await setGenerationModel("voxcpm2");
    const smartPrepared = await window.webContents.executeJavaScript(`(() => {
      const field = document.querySelector('#script-text');
      if (!(field instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, ${JSON.stringify("这是 一个 需要 优化 的文稿")});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!smartPrepared) throw new Error("智能文稿测试输入失败");
    const smartTooltipReady = await window.webContents
      .executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '智能处理',
      );
      const tooltip = document.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(tooltip instanceof HTMLElement)) return false;
      button.focus();
      const style = getComputedStyle(tooltip);
      return style.visibility === 'visible' && tooltip.textContent?.includes('润色口语') && tooltip.textContent?.includes('结果会先给你确认');
    })()`);
    if (!smartTooltipReady) throw new Error("智能处理悬停说明没有显示");
    await clickByText(window, "智能处理");
    await waitFor(
      window,
      "document.body.innerText.includes('智能处理文稿') && document.body.innerText.includes('开始处理')",
      "打开智能处理文稿",
    );
    await clickByText(window, "开始处理");
    await waitFor(
      window,
      "document.body.innerText.includes('处理结果（可以修改）') && document.body.innerText.includes('本次处理：自然口语') && document.body.innerText.includes('把书面句改成适合朗读的口语') && document.body.innerText.includes('具体变化：') && document.body.innerText.includes('已保留原意')",
      "智能处理文稿对比结果",
    );
    const unchangedBeforeApply = await window.webContents.executeJavaScript(
      `document.querySelector('#script-text')?.value === ${JSON.stringify("这是 一个 需要 优化 的文稿")}`,
    );
    if (!unchangedBeforeApply) throw new Error("智能处理在确认前修改了原稿");
    await clickByText(window, "替换全文");
    await waitFor(
      window,
      "document.querySelector('#script-text')?.value.includes('已优化')",
      "确认替换智能处理结果",
    );
    const undone = await window.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('button[aria-label="撤销智能修改"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    if (!undone) throw new Error("没有找到智能处理撤销按钮");
    await waitFor(
      window,
      `document.querySelector('#script-text')?.value === ${JSON.stringify("这是 一个 需要 优化 的文稿")}`,
      "撤销智能处理结果",
    );
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
      "document.body.innerText.includes('试听前 30 个字') && document.querySelector('#script-text')?.selectionEnd === 30",
      "30 字试听范围提示与文本选中",
    );
    await waitFor(
      window,
      "document.body.innerText.includes('试听结果')",
      "30 字试听结果",
    );

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
      setter.call(field, '大家好\\n\\n 我是 郑轮');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!autoTitlePrepared) throw new Error("自动命名测试输入失败");
    await clickByText(window, "生成配音");
    await waitFor(
      window,
      "document.body.innerText.includes('已加入任务队列')",
      "自动命名配音入队",
    );
    await clickByText(window, "项目与记录");
    await waitFor(
      window,
      "document.body.innerText.includes('大家好我是郑轮')",
      "文稿开头自动命名",
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
        (item) => item.textContent?.trim() === '智能整理脚本',
      );
      const tooltip = button?.closest('.smart-text-help-trigger')?.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(tooltip instanceof HTMLElement)) return false;
      button.focus();
      const style = getComputedStyle(tooltip);
      return style.visibility === 'visible' && tooltip.textContent?.includes('提取角色与台词') && tooltip.textContent?.includes('删除场景、镜头、动作') && tooltip.textContent?.includes('结果会先给你确认');
    })()`);
    if (!dialogueTooltipReady)
      throw new Error("智能整理脚本的用途说明没有显示");
    const directTooltipReady = await window.webContents
      .executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '直接识别',
      );
      const tooltip = button?.closest('.smart-text-help-trigger')?.querySelector('.smart-text-tooltip');
      if (!(button instanceof HTMLButtonElement) || !(tooltip instanceof HTMLElement)) return false;
      button.focus();
      const style = getComputedStyle(tooltip);
      return style.visibility === 'visible' && tooltip.textContent?.includes('按格式拆分台词') && tooltip.textContent?.includes('不识别场景、动作或小说叙述') && tooltip.textContent?.includes('不调用');
    })()`);
    if (!directTooltipReady) throw new Error("直接识别的用途说明没有显示");
    await clickByText(window, "智能整理脚本");
    await waitFor(
      window,
      "document.body.innerText.includes('确认智能整理结果') && document.body.innerText.includes('已去除') && document.body.innerText.includes('场景描述') && document.body.innerText.includes('小林') && document.body.innerText.includes('我们出发吧。')",
      "多人对话智能整理预览",
    );
    await clickByText(window, "使用整理结果");
    await waitFor(
      window,
      "document.querySelectorAll('.dialogue-line-editor').length === 2 && document.body.innerText.includes('2 个角色，可以继续修改和分配声音') && document.querySelector('#dialogue-script-input')?.value === '小林：我们出发吧。\\n阿宁：好，现在就走。'",
      "应用多人对话智能整理结果",
    );

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
        `1280×720 下字幕页仍未完整显示：${JSON.stringify(subtitleCompactLayout)}`,
      );
    }
    await waitFor(
      window,
      "document.querySelectorAll('.subtitle-segment').length === 3",
      "字幕分句",
    );
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
    if (!edited) throw new Error("字幕编辑操作失败");
    await waitFor(
      window,
      "document.querySelectorAll('.subtitle-segment').length === 2",
      "删除一句",
    );
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
      "location.hash.includes('/projects') && document.body.innerText.includes('字幕配音项目') && !document.body.innerText.includes('任务队列')",
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

    await load(window, "/settings", "state=ready");
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
      "document.body.innerText.includes('API配置') && document.body.innerText.includes('Base URL') && document.body.innerText.includes('Model') && document.body.innerText.includes('API Key') && document.body.innerText.includes('保存并测试') && !document.body.innerText.includes('启用智能文稿') && !document.body.innerText.includes('删除已保存的密钥') && document.querySelector('input[placeholder=\"已保存；如需更换，请输入新的 API Key\"]')",
      "API配置",
    );
    await clickByText(window, "保存并测试");
    await waitFor(
      window,
      "document.body.innerText.includes('API 连接成功')",
      "测试 API配置",
    );
    const smartSettingsClosed = await window.webContents
      .executeJavaScript(`(() => {
      const button = document.querySelector('button[aria-label="关闭弹窗"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    if (!smartSettingsClosed) throw new Error("API配置弹窗无法关闭");
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
      "document.body.innerText.includes('产品介绍_文字配音_2026-08-17.mp3')",
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
    await clickByText(window, "完成");

    if (consoleErrors.length) {
      throw new Error(`界面控制台错误：${consoleErrors.join(" | ")}`);
    }
    console.log(
      "Interaction smoke passed: compact-layout/model-capabilities/expression-presets-custom/smart-text-review-undo/smart-dialogue-review/smart-api-gating/smart-api-settings/30-char-preview/text-limit/auto-title/import/edit/delete/save/generate/cancel/recovery-store/export/export-naming/download-pause-resume/voice-preview/voice-rename/audio-drop-preview/update-check/system-check.",
    );
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
