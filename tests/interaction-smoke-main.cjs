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
    const compactLayoutReady = await window.webContents
      .executeJavaScript(`(() => {
      const generate = [...document.querySelectorAll('button')].find(
        (item) => item.textContent?.includes('生成配音'),
      );
      const main = document.querySelector('main');
      if (!generate || !main) return false;
      const rect = generate.getBoundingClientRect();
      const overflow = Math.max(0, main.scrollHeight - main.clientHeight);
      return rect.top >= 0 && rect.bottom <= innerHeight && overflow <= 2;
    })()`);
    if (!compactLayoutReady) {
      throw new Error("1280×720 下创作页仍未完整显示");
    }
    window.setContentSize(1280, 800, false);

    await load(window, "/subtitles", "capture=interaction&state=ready");
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

    await load(window, "/voices", "state=ready");
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
      "document.body.innerText.includes('拖入的录音.wav') && document.body.innerText.includes('时长 8.0 秒')",
      "拖入录音并完成检查",
    );

    await load(window, "/settings", "state=ready");
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
      "Interaction smoke passed: compact-layout/import/edit/delete/save/generate/cancel/recovery-store/export/export-naming/download-pause-resume/audio-drop/system-check.",
    );
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
